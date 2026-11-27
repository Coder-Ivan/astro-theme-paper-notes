import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { parse, TEXT_NODE } from 'ultrahtml';
import { querySelector, querySelectorAll } from 'ultrahtml/selector';
import { decodeString } from 'micromark-util-decode-string';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { buildReader } from '../server/files.mjs';
import { openStore } from '../server/storage.mjs';

const exec = promisify(execFile);
const project = fileURLToPath(new URL('../', import.meta.url));

const pythonSample = [
  'from dataclasses import dataclass',
  '@dataclass',
  'class Sample:',
  '    score: int',
  '    def describe(self):',
  '        return "<sample> &amp;" if self.score < 12 else "high"',
].join('\n');
const codeExamples = [
  '`inlineExample`', '```python', pythonSample, '```', '',
  '```', pythonSample, '```', '',
  '```unknown-example', pythonSample, '```', '',
  pythonSample.split('\n').map(line => '    ' + line).join('\n'), '',
  '```mermaid', 'flowchart TD', 'A --> B', '```',
].join('\n');

function codeText(node) {
  if (node.type === TEXT_NODE) return node.value.replace(/&(?:#[0-9]+|#x[\da-f]+|[a-z][\da-z]+);/gi, entity => decodeString(entity));
  return node.children.map(codeText).join('');
}

function assertCodeExamples(html, searchText) {
  const tree = parse(html);
  const blocks = querySelectorAll(tree,'[data-code-block]');
  assert.equal(blocks.length,4);
  assert.equal(new Set(blocks.map(block => block.attributes['data-code-block'])).size,4);
  assert.ok(blocks.every(block => block.attributes['data-language'] === 'python'));
  assert.deepEqual(blocks.map(block => block.attributes['data-source']),['explicit','auto','auto','auto']);
  const explicitCode = querySelector(blocks[0],'pre code');
  assert.ok(querySelector(explicitCode,'.hljs-keyword'));
  assert.ok(querySelector(explicitCode,'.hljs-string'));
  for (const block of blocks) {
    const child = querySelector(block,'pre code');
    assert.equal(codeText(child),pythonSample + '\n');
    assert.ok(!querySelector(child,'sample'));
  }
  assert.equal(codeText(querySelector(tree,'pre.mermaid')),'flowchart TD\nA --> B\n');
  assert.ok(html.includes('<code>inlineExample</code>'));
  assert.ok(searchText.includes(pythonSample.replace(/\s+/g,' ')));
}

test('hidden articles leave the public build and pinned articles move ahead of pagination', async t => {
  const site = await mkdtemp(join(tmpdir(), 'paper-notes-articles-'));
  t.after(() => rm(site, {recursive:true, force:true}));
  for (const name of ['astro.config.mjs','tsconfig.json','package.json','scripts','src','server','public','theme.config.mjs']) {
    await cp(join(project,name),join(site,name),{recursive:true});
  }
  await symlink(join(project,'node_modules'),join(site,'node_modules'),'dir');
  const options = {cwd:site, env:{...process.env, ASTRO_TELEMETRY_DISABLED:'1', PAPER_NOTES_DATA_DIR:join(site,'.paper-notes')}};
  const build = () => exec(process.execPath,[join(site,'node_modules/astro/bin/astro.mjs'),'build'],options);
  const contents = async (base, name) => readFile(join(site,base,name),'utf8');
  const category = join(site,'content/Field');
  await mkdir(category,{recursive:true});
  const nested = join(category,'Plants','Buds');
  await mkdir(nested,{recursive:true});
  await mkdir(join(site,'content/Journal'));
  await writeFile(join(site,'content/Journal/diary.md'),'---\ntitle: Private diary\nslug: diary-sample\npinned: true\nhidden: true\n---\nDiary sample body\n\n' + codeExamples);
  await writeFile(join(category,'early.md'),'---\ntitle: Early observation\nslug: early\ndate: 2001-01-01\npinned: true\n---\nEarly observation body.\n\n' + codeExamples);
  for (let i=1; i<=10; i++) {
    const day = String(i).padStart(2,'0');
    await writeFile(join(i === 1 || i === 10 ? nested : category,'entry-'+day+'.md'),'---\ntitle: Entry '+day+'\nslug: entry-'+day+'\ndate: 2024-05-'+day+'\n---\n' +
      '[Secret label](/posts/hidden-sample/) and [another private label](/posts/%68idden-sample/index.html?test=1#part).');
  }
  const imported = join(site,'export');
  await mkdir(join(imported,'Notebook/_resources'),{recursive:true});
  const secretId = 'b'.repeat(32);
  await writeFile(join(imported,'Notebook/secret.md'),'---\ntitle: Secret title\nslug: hidden-sample\nid: '+secretId+'\nhidden: true\ntags: [PrivateTag]\n---\nConfidential body [download](_resources/sample.pdf).');
  await writeFile(join(imported,'Notebook/reference.md'),'---\ntitle: Linked observation\nslug: linked-observation\n---\n' +
    '[Classified local link](secret.md#part) and <a href=":/'+secretId+'#part">Private HTML label</a>.');
  const media = 'fixture PDF for hidden entry';
  await writeFile(join(imported,'Notebook/_resources/sample.pdf'),media);
  const asset = 'media/'+createHash('sha256').update(media).digest('hex')+'.pdf';
  const importNotes = () => exec(process.execPath,['scripts/import-joplin.mjs',imported],options);
  await importNotes();
  await build();

  const search = JSON.parse(await contents('dist','assets/search.json'));
  assertCodeExamples(await contents('dist','posts/early/index.html'), search.find(post => post.url === '/posts/early/').text);
  const categories = parse(await contents('dist','categories/index.html'));
  const controls = querySelector(categories, '.notebook-controls[hidden]');
  assert.ok(controls);
  assert.deepEqual(querySelectorAll(controls, 'button[type="button"][aria-controls="notebook-tree"]').map(codeText),
    ['全部展开', '全部折叠', '恢复默认']);
  assert.ok(querySelector(categories, 'ul#notebook-tree'));
  const categoryNode = (...path) => querySelector(categories,
    'details#book-' + Buffer.from(JSON.stringify(path)).toString('base64url'));
  for (const path of [['Field'], ['Notebook'], ['Field','Plants'], ['Field','Plants','Buds']]) {
    const node = categoryNode(...path);
    assert.ok(node, path.join('/'));
    assert.equal(Object.hasOwn(node.attributes,'open'), path.length === 1, path.join('/'));
  }
  const nestedPost = 'a[href="/posts/entry-01/"]';
  assert.ok(querySelector(categoryNode('Field','Plants','Buds'), nestedPost));
  assert.equal(querySelectorAll(categories, nestedPost).length, 1);
  const home = await contents('dist','index.html');
  const secondPage = await contents('dist','page/2/index.html');
  for (const [html, slug, path] of [
    [home, 'early', ['Field']],
    [home, 'entry-10', ['Field', 'Plants', 'Buds']],
    [secondPage, 'entry-01', ['Field', 'Plants', 'Buds']],
  ]) {
    const card = querySelectorAll(parse(html), '.post-card').find(card => querySelector(card, `h3 a[href="/posts/${slug}/"]`));
    assert.ok(card, slug);
    const detail = parse(await contents('dist', `posts/${slug}/index.html`));
    for (const meta of [querySelector(card, '.meta'), querySelector(detail, '.hero-copy .meta')]) {
      const links = querySelectorAll(meta, '.notebook-path a');
      assert.deepEqual(links.map(codeText), path);
      assert.deepEqual(links.map(link => link.attributes.href),
        path.map((_, i) => '/categories/#' + categoryNode(...path.slice(0, i + 1)).attributes.id));
    }
  }
  assert.match(home,/href="\/posts\/early\/"/);
  assert.ok(home.indexOf('/posts/early/') < home.indexOf('/posts/entry-10/'));
  assert.match(home,/<strong>置顶<\/strong>/);
  assert.doesNotMatch(secondPage,/href="\/posts\/early\/"/);
  const archive = await contents('dist','archives/index.html');
  assert.match(archive,/href="\/posts\/entry-10\/"/);
  assert.ok(archive.indexOf('/posts/entry-10/') < archive.indexOf('/posts/early/'));
  const files = await readdir(join(site,'dist'),{recursive:true});
  assert.ok(!files.includes(asset));
  assert.ok(!files.some(name=>name.includes('hidden-sample') || name.startsWith('diary/') || name==='threads.json'));
  for (const name of files.filter(name=>name.endsWith('.html') || name.endsWith('.json'))) {
    assert.doesNotMatch(await contents('dist',name),/Secret title|hidden-sample|Secret label|another private label|Classified local link|Private HTML label|PrivateTag|Confidential body|Private diary/);
  }
  assert.match(await contents('dist','posts/linked-observation/index.html'),/未公开文章/);

  // The account service receives the full ordinary-article list privately.
  const config = await readFile(join(site,'theme.config.mjs'),'utf8');
  await writeFile(join(site,'theme.config.mjs'),config.replace('services: false','services: true'));
  await build();
  const diarySearch = JSON.parse(await contents('dist-private','diary/search.json'));
  assertCodeExamples(await contents('dist-private','diary/posts/diary-sample/index.html'),diarySearch[0].text);
  const privateIndex = JSON.parse(await contents('dist-private','threads.json'));
  const hidden = privateIndex.articles.find(note=>note.id===secretId);
  assert.deepEqual(hidden,{id:secretId,slug:'hidden-sample',title:'Secret title',category:'Notebook',notebookPath:['Notebook'],hidden:true,pinned:false});
  assert.deepEqual(privateIndex.articles.find(note=>note.slug==='entry-01').notebookPath,['Field','Plants','Buds']);
  assert.ok(privateIndex.articles.find(note=>note.slug==='early').pinned);
  assert.ok(!privateIndex.articles.some(note=>note.slug==='diary-sample'));
  assert.ok(!Object.hasOwn(privateIndex.public,'hidden-sample'));
  assert.ok(Object.hasOwn(privateIndex.diary,'diary-sample'));
  const manifest = join(site,'dist-private','threads.json');
  const reader = buildReader(join(site,'dist'),join(site,'dist-private'));
  const writeCatalog = articles => writeFile(manifest, JSON.stringify({...privateIndex,articles}));
  const visible = privateIndex.articles.filter(note => note.id !== secretId);
  const {notebookPath, ...legacy} = hidden;
  await writeCatalog([...visible,{...legacy,category:'Root / literal slash'}]);
  assert.deepEqual(reader.threads().articles.at(-1).notebookPath,['Root / literal slash']);
  for (const path of [null,['Wrong root'],['Notebook',42],['Notebook','']]) {
    await writeCatalog([...visible,{...hidden,notebookPath:path}]);
    assert.throws(() => reader.threads(), /notebook path/i);
  }
  await writeCatalog(privateIndex.articles);

  const store = openStore(options.env.PAPER_NOTES_DATA_DIR);
  try {
    store.put('auth/article-settings/'+secretId+'/hidden',Buffer.from('false'));
    store.put('auth/article-settings/'+privateIndex.public.early+'/pinned',Buffer.from('false'));
  } finally { store.close(); }
  await build();
  assert.match(await contents('dist','posts/hidden-sample/index.html'),/Confidential body/);
  assert.equal(await contents('dist',asset),media);
  assert.doesNotMatch(await contents('dist','index.html'),/<strong>置顶<\/strong>/);
  assert.match(await contents('dist','page/2/index.html'),/href="\/posts\/early\/"/);
  assert.ok(JSON.parse(await contents('dist','assets/search.json')).some(post=>post.url==='/posts/hidden-sample/'));
  // A static-only build honors the front matter even with a service database nearby.
  await writeFile(join(site,'theme.config.mjs'),config);
  await build();
  assert.ok(!(await readdir(join(site,'dist','posts'))).includes('hidden-sample'));
  assert.match(await contents('dist','index.html'),/<strong>置顶<\/strong>/);
});

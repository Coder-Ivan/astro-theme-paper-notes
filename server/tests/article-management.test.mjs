import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import { newAccount } from '../service.mjs';
import { editAccounts, openStore } from '../storage.mjs';

const exec = promisify(execFile);
const project = fileURLToPath(new URL('../../',import.meta.url));

async function waitFor(check, description) {
  const deadline = Date.now() + 90_000;
  while (!await check()) {
    if (Date.now() >= deadline) assert.fail('Timed out waiting for '+description);
    await wait(150);
  }
}

test('a site owner controls grouped articles through the live server and automatic builds', async t => {
  const site = await mkdtemp(join(tmpdir(),'paper-notes-server-'));
  let app;
  t.after(async () => {
    if (app && app.exitCode === null && app.signalCode === null) {
      const done = once(app,'exit');
      app.kill(); await done;
    }
    await rm(site,{recursive:true,force:true});
  });
  for (const file of ['astro.config.mjs','theme.config.mjs','package.json','tsconfig.json','scripts','src','server','public']) {
    await cp(join(project,file),join(site,file),{recursive:true});
  }
  // Astro writes its Vite cache under node_modules/.astro. Keep that path
  // private to this fixture while sharing the installed dependency packages.
  const modules = join(site,'node_modules');
  await mkdir(modules);
  for (const pkg of await readdir(join(project,'node_modules'))) {
    if (!pkg.startsWith('.')) await symlink(join(project,'node_modules',pkg),join(modules,pkg),'dir');
  }
  const config = join(site,'theme.config.mjs');
  await writeFile(config,(await readFile(config,'utf8')).replace('services: false','services: true'));
  await mkdir(join(site,'content/Field/Nested'),{recursive:true});
  const id = 'a'.repeat(32);
  const laterId = 'b'.repeat(32);
  await writeFile(join(site,'content/early.md'),'---\ntitle: Early\nslug: early\ndate: 2001-01-01\nid: '+id+'\n---\nEarly sample.');
  await writeFile(join(site,'content/Field/Nested/later.md'),'---\ntitle: Later\nslug: later\ndate: 2024-01-01\nid: '+laterId+'\n---\nLater sample.');
  const data = join(site,'state');
  const password = randomUUID();
  const store = openStore(data);
  try {
    const account = await newAccount('gardener',password,'reader',true);
    await editAccounts(store,() => account);
  }
  finally { store.close(); }
  const env = {...process.env,ASTRO_TELEMETRY_DISABLED:'1',PAPER_NOTES_DATA_DIR:data};
  await exec(process.execPath,[join(site,'node_modules/astro/bin/astro.mjs'),'build'],{cwd:site,env});
  const socket = createServer();
  socket.listen(0,'127.0.0.1');
  await once(socket,'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const origin = 'http://127.0.0.1:'+port;
  app = spawn(process.execPath,['server/index.mjs'],{cwd:site,env:{...env,HOST:'127.0.0.1',PORT:String(port),PUBLIC_ORIGIN:origin},stdio:['ignore','pipe','pipe']});
  let logs = '';
  app.stdout.on('data',chunk=>{logs+=chunk;});
  app.stderr.on('data',chunk=>{logs+=chunk;});
  await waitFor(() => {
    assert.equal(app.exitCode,null,logs);
    return logs.includes('Paper Notes: '+origin);
  },'the service to listen');
  function request(path, cookie = '', fields) {
    return fetch(origin+path,{method:fields ? 'POST' : 'GET',redirect:'manual',
      headers:{cookie,...(fields ? {origin} : {})},body:fields ? new URLSearchParams(fields) : undefined});
  }
  async function login(path,fields) {
    const res = await request(path,'',fields);
    assert.equal(res.status,303);
    return res.headers.getSetCookie()[0].split(';')[0];
  }
  const csrf = async cookie => (await (await request('/account/',cookie)).text()).match(/name="csrf" value="([^"]+)"/)[1];
  const path = '/account/posts';
  assert.equal((await request(path)).status,303);
  const owner = await login('/account/login',{username:'gardener',password});
  const reader = await login('/account/register',{username:'reader',password:randomUUID(),avatar:'moon'});
  const ownerCsrf = await csrf(owner), readerCsrf = await csrf(reader);
  assert.equal((await request(path,reader)).status,403);
  assert.equal((await request(path,reader,{action:'hide',id,csrf:readerCsrf})).status,403);
  assert.equal((await request(path,owner,{action:'hide',id,csrf:''})).status,403);
  const admin = async (query='') => (await request(path+query,owner)).text();
  const initial = await admin();
  assert.match(initial,/<details class="post-group" open><summary><strong>未分类<\/strong>/);
  assert.match(initial,/<details class="post-group" open><summary><strong>Field<\/strong>/);
  assert.match(initial,/<details class="post-group"><summary><strong>Nested<\/strong>/);
  const nested = await admin('?q=' + encodeURIComponent('Field / Nested'));
  for (const name of ['Field','Nested']) {
    assert.ok(nested.includes('<details class="post-group" open><summary><strong>' + name + '</strong>'));
  }
  assert.ok(nested.includes('id="post-' + laterId + '"'));
  assert.ok(!nested.includes('id="post-' + id + '"'));
  const matching = await admin('?q=Early');
  assert.match(matching,/<details class="post-group" open><summary><strong>未分类<\/strong>/);
  assert.doesNotMatch(matching,/<strong>Field<\/strong>/);
  async function change(action) {
    const res = await request(path,owner,{action,id,csrf:ownerCsrf});
    assert.equal(res.status,303);
    return res.headers.get('location');
  }
  const thread = '/account/comments/article/early?view=threads';
  const first = await request(thread,reader,{action:'create',body:'Persistent comment',requestId:randomUUID(),csrf:readerCsrf});
  assert.equal(first.status,201);

  const homepage = async () => (await request('/')).text();
  const homeBefore = await homepage();
  assert.ok(homeBefore.indexOf('/posts/later/') < homeBefore.indexOf('/posts/early/'));
  const pinnedLocation = await change('pin');
  assert.match(await (await request(pinnedLocation,owner)).text(),/<details class="post-group" open><summary><strong>未分类<\/strong>/);
  await waitFor(async () => {
    const home = await homepage();
    return home.includes('<strong>置顶</strong>') && home.indexOf('/posts/early/') < home.indexOf('/posts/later/');
  },'the pinned homepage');
  const published = await homepage();
  const badNote = join(site,'content/broken.md');
  await writeFile(badNote,'---\ntitle: Broken\nhidden: invalid\n---\nBody.');
  await change('hide');
  await waitFor(async ()=>(await admin()).includes('value="retry"'),'the failed build');
  assert.equal(await homepage(),published);
  assert.equal((await request('/posts/early/')).status,200);
  assert.equal((await request(thread,reader)).status,404);
  await rm(badNote);
  await change('retry');
  await waitFor(async ()=>(await request('/posts/early/')).status===404,'the hidden article to be removed');
  const search = async () => (await (await request('/assets/search.json')).json()).map(post=>post.url);
  assert.deepEqual(await search(),['/posts/later/']);
  assert.doesNotMatch(await homepage(),/href="\/posts\/early\/"/);
  assert.equal((await request(thread,reader)).status,404);
  await change('show');
  await waitFor(async ()=>(await request('/posts/early/')).status===200,'the original article to return');
  assert.ok((await search()).includes('/posts/early/'));
  assert.match(await homepage(),/<strong>置顶<\/strong>/);
  const restored = await (await request(thread,reader)).json();
  assert.equal(restored.total,1);
  assert.equal(restored.comments[0].body,'Persistent comment');

  async function bulk(action) {
    const fields = new URLSearchParams({csrf:ownerCsrf,mode:'bulk',action});
    fields.append('id',id);
    fields.append('id',laterId);
    const res = await request(path,owner,fields);
    assert.equal(res.status,303);
    assert.equal(new URL(res.headers.get('location'),origin).searchParams.get('selected'),'2');
  }
  await bulk('hide');
  await waitFor(async ()=>(await search()).length === 0,'both selected articles to leave the public search');
  for (const slug of ['early','later']) assert.equal((await request('/posts/'+slug+'/')).status,404);
  await bulk('show');
  await waitFor(async ()=>(await search()).length === 2,'both selected articles to be published again');
  assert.equal((await (await request(thread,reader)).json()).total,1);
});

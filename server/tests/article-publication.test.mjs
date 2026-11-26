import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { articlePublisher, recoverArticleBuild } from '../publish-articles.mjs';

test('a later edit during a build supersedes that build and publishes the latest settings once', async () => {
  const waiting = Promise.withResolvers();
  const outcomes = [];
  const publisher = articlePublisher(async isCurrent => {
    if (!outcomes.length) await waiting.promise;
    outcomes.push(isCurrent());
  });
  const publication = publisher.schedule();
  publisher.schedule();
  publisher.schedule();
  assert.equal(publisher.status,'building');
  waiting.resolve();
  await publication;
  assert.deepEqual(outcomes,[false,true]);
  assert.equal(publisher.status,'ready');
});

test('an interrupted two-directory release restores both parts before the server starts', async t => {
  const root = await mkdtemp(join(tmpdir(),'paper-recover-'));
  t.after(() => rm(root,{recursive:true,force:true}));
  const backups = join(root,'.astro/article-publication/previous');
  await mkdir(backups,{recursive:true});
  for (const name of ['dist','dist-private']) {
    await mkdir(join(root,name));
    await writeFile(join(root,name,'version'),'previous');
    await rename(join(root,name),join(backups,name));
  }
  await mkdir(join(root,'dist'));
  await writeFile(join(root,'dist/version'),'incomplete');
  recoverArticleBuild(root);
  for (const name of ['dist','dist-private']) {
    assert.equal(await readFile(join(root,name,'version'),'utf8'),'previous');
  }
});

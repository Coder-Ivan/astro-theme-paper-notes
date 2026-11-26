import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createBlogServer } from '../index.mjs';
import { editAccounts, openStore } from '../storage.mjs';
import { newAccount } from '../service.mjs';

test('bulk article forms validate the complete selection and commit one publication per change', async t => {
  const folder = await mkdtemp(join(tmpdir(),'paper-bulk-'));
  const articles = Array.from({length:520}, (_, index) => ({
    id:index.toString(16).padStart(32,'0'), title:'Test '+index, slug:'test-'+index,
    category:index % 2 ? 'A' : 'B', hidden:false, pinned:index === 0,
  }));
  const release = {public:Object.fromEntries(articles.map(row => [row.slug,row.id])), diary:{}, articles};
  const store = openStore(folder,{threads:() => release});
  const first = articles[0].id, second = articles[1].id;
  const unknown = 'f'.repeat(32);
  const password = 'example-only-test-password';
  const owner = await newAccount('gardener',password,'reader',true);
  await editAccounts(store,() => owner);
  let builds = 0;
  const publisher = {status:'ready',schedule() { builds++; this.status = 'building'; }};
  const origin = 'http://localhost:4321';
  const server = createBlogServer({origin,store,publicDir:folder,publisher});
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    store.close();
    await rm(folder,{recursive:true,force:true});
  });
  function post(path, fields, cookie='') {
    const body = new URLSearchParams(fields).toString();
    return new Promise((resolve,reject) => {
      const req = request({host:'127.0.0.1',port:server.address().port,path,method:fields ? 'POST':'GET',
        headers:{host:new URL(origin).host,origin,cookie,'content-type':'application/x-www-form-urlencoded'}}, res => {
        const chunks = [];
        res.on('data',chunk => chunks.push(chunk));
        res.on('end',() => resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString()}));
      });
      req.on('error',reject).end(body);
    });
  }
  async function signIn(route,fields) {
    const res = await post('/account/'+route,fields);
    assert.equal(res.status,303);
    const cookie = res.headers['set-cookie'][0].split(';')[0];
    const account = await post('/account/',undefined,cookie);
    return {cookie,csrf:account.body.match(/name="csrf" value="([^"]+)"/)[1]};
  }
  const admin = await signIn('login',{username:'gardener',password});
  const member = await signIn('register',{username:'reader',password,avatar:'moon'});
  const path = '/account/posts';
  const page = await post(path,undefined,admin.cookie);
  const script = page.body.match(/<script>([\s\S]+?)<\/script>/)[1];
  const scriptSource = "'sha256-" + createHash('sha256').update(script).digest('base64') + "'";
  assert.ok(page.headers['content-security-policy'].includes('script-src ' + scriptSource));
  assert.equal((await post('/account/',undefined,admin.cookie)).headers['content-security-policy'].includes('script-src'),false);
  const select = (ids,action,session=admin) => {
    const fields = new URLSearchParams({mode:'bulk',action,csrf:session.csrf,q:'Test'});
    for (const id of ids) fields.append('id',id);
    return post(path,fields,session.cookie);
  };
  assert.equal((await select([first,second],'hide',{cookie:'',csrf:''})).status,401);
  assert.equal((await select([first,second],'hide',member)).status,403);
  assert.equal((await select([first,second],'hide',{...admin,csrf:'expired'})).status,403);
  assert.equal((await select([],'pin')).status,400);
  assert.equal((await select([first,second],'retry')).status,400);
  assert.equal((await select([first,unknown],'hide')).status,404);
  const tooLarge = new URLSearchParams({mode:'bulk',action:'hide',csrf:admin.csrf,id:first,unused:'x'.repeat(1024*1024)});
  assert.equal((await post(path,tooLarge,admin.cookie)).status,413);
  assert.deepEqual(store.articleSettings(),{});
  assert.equal(builds,0);

  // Fail the second SQLite row to exercise rollback after the first write.
  const db = new DatabaseSync(join(folder,'accounts.sqlite'));
  try {
    db.exec(`CREATE TRIGGER fail_batch BEFORE INSERT ON records
      WHEN NEW.key = 'auth/article-settings/${second}/hidden'
      BEGIN SELECT RAISE(ABORT,'fixture failure'); END;`);
    assert.equal((await select([first,second],'hide')).status,503);
    assert.deepEqual(store.articleSettings(),{});
    assert.equal(builds,0);
    db.exec('DROP TRIGGER fail_batch');
  } finally { db.close(); }

  function receipt(res,selected,changed) {
    assert.equal(res.status,303);
    const location = new URL(res.headers.location,origin);
    assert.equal(location.pathname,path);
    assert.equal(location.searchParams.get('q'),'Test');
    assert.equal(location.searchParams.get('selected'),String(selected));
    assert.equal(location.searchParams.get('changed'),String(changed));
  }
  receipt(await select([first,second,second],'pin'),2,1);
  assert.deepEqual(store.articleSettings(),{[second]:{pinned:true}});
  assert.equal(builds,1);
  receipt(await select([first,second],'pin'),2,0);
  assert.equal(builds,1);

  // A full category can carry more than the old 4 KiB form and 16 KiB HTTP limits.
  const all = articles.map(row => row.id);
  receipt(await select(all,'hide'),all.length,all.length);
  assert.equal(builds,2);
  const hidden = store.articleSettings();
  assert.ok(all.every(id => hidden[id].hidden));
  receipt(await select([first,second],'show'),2,2);
  receipt(await select([first,second],'unpin'),2,2);
  assert.equal(builds,4);
  const restored = store.articleSettings();
  assert.deepEqual(restored[first],{hidden:false,pinned:false});
  assert.deepEqual(restored[second],{hidden:false,pinned:false});
  assert.deepEqual(restored[all.at(-1)],{hidden:true});
});

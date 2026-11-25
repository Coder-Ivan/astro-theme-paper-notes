import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { request } from 'node:http';
import { buildReader } from '../files.mjs';
import { createBlogServer } from '../index.mjs';
import { openStore, editAccounts } from '../storage.mjs';
import { newAccount } from '../service.mjs';

test('self-hosted site enforces diary access and keeps or purges nested comments across releases', async t => {
  const folder = await mkdtemp(join(tmpdir(),'paper-notes-'));
  const publicDir = join(folder,'dist'), privateDir = join(folder,'dist-private');
  const dbDir = join(folder,'state');
  const publicId = 'a'.repeat(32), diaryId = 'b'.repeat(32);
  const png = 'c'.repeat(64) + '.png';
  const privateText = 'private sample';
  async function file(root, path, body) {
    const target = join(root,path);
    await mkdir(join(target,'..'),{recursive:true});
    await writeFile(target,body);
  }
  const manifest = (index={story:publicId}) => file(privateDir,'threads.json',JSON.stringify({public:index,diary:{entry:diaryId}}));
  await file(publicDir,'index.html','Welcome');
  await file(publicDir,'posts/story/index.html','Story');
  await file(privateDir,'diary/index.html',privateText);
  await file(privateDir,'diary/posts/entry/index.html',privateText);
  await file(privateDir,'diary/search.json',JSON.stringify({privateText}));
  await file(privateDir,'diary/media/'+png,privateText);
  await manifest();

  const origin = 'http://127.0.0.1:4321';
  let store = openStore(dbDir,buildReader(publicDir,privateDir));
  const adminPassword = randomUUID(), readerPassword = randomUUID();
  const admin = await newAccount('gardener',adminPassword,'reader',true);
  await editAccounts(store, () => admin);
  let server = createBlogServer({origin, store, publicDir});
  async function listen() { server.listen(0,'127.0.0.1'); await once(server,'listening'); }
  async function close() { await new Promise(done=>server.close(done)); store.close(); }
  await listen();
  t.after(async () => {await close();await rm(folder,{recursive:true,force:true});});
  function fetchPage(path, cookie = '', form, extraHeaders = {}) {
    const body = form && new URLSearchParams(form).toString();
    return new Promise((done, fail) => {
      const req = request({host:'127.0.0.1',port:server.address().port,path,method:body ? 'POST' : 'GET',
        headers:{Host:'127.0.0.1:4321',Cookie:cookie,...(body ? {Origin:origin,'Content-Type':'application/x-www-form-urlencoded'} : {}),...extraHeaders}},
      response => {
        const chunks = [];
        response.on('data',chunk=>chunks.push(chunk));
        response.on('end',()=>done({status:response.statusCode,headers:response.headers,body:Buffer.concat(chunks).toString()}));
      });
      req.on('error',fail).end(body);
    });
  }
  const csrf = async cookie => (await fetchPage('/account/', cookie)).body.match(/name="csrf" value="([^"]+)"/)[1];
  const readCookie = reply => {
    assert.equal(reply.status,303); const value=reply.headers['set-cookie'][0];
    assert.match(value,/HttpOnly/); return value.split(';')[0];
  };
  assert.equal((await fetchPage('/')).body,'Welcome');
  for (const path of ['/diary/','/diary/posts/entry/','/diary/search.json','/diary/media/'+png]) {
    const reply = await fetchPage(path); assert.ok([303,401].includes(reply.status));assert.match(reply.headers['cache-control'],/no-store/);assert.ok(!reply.body.includes(privateText));
  }
  const owner=readCookie(await fetchPage('/account/login','',{username:'gardener',password:adminPassword}));
  const reader=readCookie(await fetchPage('/account/register','',{username:'reader',password:readerPassword,avatar:'moon'}));
  const ownerToken=await csrf(owner), readerToken=await csrf(reader);
  assert.equal(JSON.parse((await fetchPage('/account/session',reader)).body).avatar,'moon');
  assert.equal((await fetchPage('/account/users',reader)).status,403);
  assert.equal((await fetchPage('/diary/search.json',reader)).status,403);
  const changeLevel = level => fetchPage('/account/users',owner,{action:'access',username:'reader',level,csrf:ownerToken});
  assert.equal((await changeLevel('reader')).status,303);
  for (const path of ['/diary/','/diary/posts/entry/','/diary/search.json','/diary/media/'+png]) {
    const reply=await fetchPage(path,reader);assert.equal(reply.status,200);assert.ok(reply.body.includes(privateText));
  }
  assert.equal((await changeLevel('member')).status,303);
  assert.equal((await fetchPage('/diary/media/'+png,reader)).status,403);
  const thread='/account/comments/article/story?view=threads';
  const root={action:'create',body:'First comment',requestId:randomUUID(),csrf:readerToken};
  assert.equal((await fetchPage(thread,'',root)).status,401);
  assert.equal((await fetchPage(thread,reader,{...root,csrf:''})).status,403);
  assert.equal((await fetchPage(thread,reader,root,{Origin:'https://other.example'})).status,403);
  const first=await fetchPage(thread,reader,root); assert.equal(first.status,201);
  const id=JSON.parse(first.body).affectedId;
  assert.equal((await fetchPage(thread,reader,root)).status,200);
  const child=await fetchPage(thread,owner,{action:'create',body:'A reply',requestId:randomUUID(),parentId:id,csrf:ownerToken});
  assert.equal(child.status,201);
  assert.equal(JSON.parse((await fetchPage(thread)).body).comments[0].replies.length,1);
  await close();
  store = openStore(dbDir,buildReader(publicDir,privateDir)); server = createBlogServer({origin,store,publicDir});await listen();
  assert.equal(JSON.parse((await fetchPage(thread,reader)).body).total,2);
  await rename(join(publicDir,'posts/story'),join(publicDir,'posts/updated'));
  await manifest({updated:publicId});
  const moved='/account/comments/article/updated?view=threads';
  assert.equal(JSON.parse((await fetchPage(moved,reader)).body).total,2);
  await rm(join(publicDir,'posts/updated'),{recursive:true});
  await manifest({});
  assert.equal((await fetchPage(moved)).status,404);
  assert.equal(store.read('auth/comments/threads/article/'+publicId+'.ndjson'),null);
  await file(publicDir,'posts/updated/index.html','Restored');
  await manifest({updated:publicId});
  assert.equal(JSON.parse((await fetchPage(moved)).body).total,0);
  assert.equal((await fetchPage('/account/logout',reader,{csrf:readerToken})).status,303);
  assert.equal(JSON.parse((await fetchPage('/account/session',reader)).body).authenticated,false);
});

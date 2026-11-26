import { digest } from './storage.mjs';

const pageSize = 20;
const replyPreviewSize = 3;
const maxBody = 500;
const commentIdPattern = /^[0-9a-f]{32}$/;
const requestIdPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const rateWindow = 15 * 60 * 1000;
const displayName = session => session.name.split('@',1)[0] || '读者';

async function publishedNoteId(store, audience, slug) {
  const threads = store.threads();
  const index = audience === 'diary' ? threads.diary : threads.public;
  if (!Object.hasOwn(index,slug) || (audience === 'article' && Object.hasOwn(threads.diary,slug))) return null;
  if (typeof index[slug] !== 'string' || !/^[0-9a-f]{32}$/.test(index[slug])) throw new Error('Invalid comment note ID');
  if (audience === 'article' && store.articleSettings()[index[slug]]?.hidden) return null;
  return index[slug];
}

// An append contains one complete event. Retain tombstones in the projection so
// deleting a cursor or retrying an old create cannot shift or resurrect a reply.
async function readThread(store, key) {
  const bytes = await store.read(key);
  const entries = new Map();
  for (const line of (bytes?.toString('utf8').trimEnd() || '').split('\n')) {
    if (!line) continue;
    const event = JSON.parse(line);
    if (event.deleted) entries.get(event.id).deleted = true;
    else entries.set(event.id,event);
  }
  return {position:bytes?.length || 0, entries};
}

function canDelete(entry, session) {
  return !!session && (session.isAdmin || session.accountId === entry.authorId);
}

function viewer(session) {
  return {
    authenticated:!!session,canPost:!!session,csrf:session?.csrf ?? null,
    name:session ? displayName(session) : null,avatar:session?.avatar ?? null,
  };
}

function flatPage(entries, before, session) {
  const comments = [];
  let total = 0;
  let pastCursor = !before;
  let nextCursor = null;
  for (const item of [...entries.values()].reverse()) {
    if (!item.deleted) {
      total++;
      if (pastCursor && comments.length < pageSize) {
        const {id, author, avatar, body, createdAt} = item;
        comments.push({id, author, avatar, body, createdAt, canDelete:canDelete(item,session)});
      } else if (pastCursor && !nextCursor) nextCursor = comments[comments.length - 1].id;
    }
    if (item.id === before) pastCursor = true;
  }
  return {comments, total, nextCursor, viewer:viewer(session)};
}

// Every parent is an earlier append in this note's log. Project into one level
// of conversations without recursively walking unbounded reply chains.
function conversations(entries) {
  const roots = [];
  const byComment = new Map();
  const visible = new Set();
  let total = 0;
  for (const item of entries.values()) {
    let thread;
    if (item.parentId) {
      thread = byComment.get(item.parentId);
      thread.replies.push(item);
      if (!item.deleted) thread.replyCount++;
    } else {
      thread = {root:item, replies:[], replyCount:0};
      roots.push(item);
    }
    byComment.set(item.id,thread);
    if (!item.deleted) { visible.add(item.id); total++; }
  }
  // A deleted ancestor gets a placeholder only while a descendant is visible.
  for (const item of [...entries.values()].reverse()) {
    if (item.parentId && visible.has(item.id)) visible.add(item.parentId);
  }
  return {roots,byComment,visible,total};
}

// Keep deleted items as pagination anchors, including ones whose last child
// disappeared between requests. Never return their deleted text or metadata.
function windowBefore(items, before, limit, visible) {
  const end = before ? items.findIndex(item => item.id === before) : items.length;
  if (end < 0) return null;
  const rows = [];
  for (let index = end - 1; index >= 0; index--) {
    const item = items[index];
    if (!visible.has(item.id)) continue;
    if (rows.length === limit) return {rows, cursor:rows.at(-1).id};
    rows.push(item);
  }
  return {rows, cursor:null};
}

function threadedPage(entries, session, {before, threadId, focusId, affectedId}, json, status = 200) {
  const model = conversations(entries);
  function row(item) {
    const parentId = item.parentId || null;
    if (item.deleted) return {id:item.id,parentId,deleted:true,author:null,avatar:null,body:null,createdAt:null,
      canDelete:false,replyToAuthor:null};
    const {id,author,avatar,body,createdAt} = item;
    const parent = entries.get(parentId);
    return {id,parentId,deleted:false,author,avatar,body,createdAt,canDelete:canDelete(item,session),
      replyToAuthor:parent && !parent.deleted ? parent.author : null};
  }
  function rootRow(thread, limit, cursor = null) {
    const window = windowBefore(thread.replies,cursor,limit,model.visible);
    if (!window) return null;
    return {...row(thread.root),replyCount:thread.replyCount,
      replies:window.rows.reverse().map(row),replyCursor:window.cursor};
  }
  const result = {comments:[],total:model.total,nextCursor:null,viewer:viewer(session)};
  if (threadId) {
    const thread = model.byComment.get(threadId);
    if (thread?.root.id !== threadId || !model.visible.has(threadId)) return json(404,{error:'这段讨论已不存在。'});
    const root = rootRow(thread,pageSize,before);
    if (!root) return json(400,{error:'回复翻页位置无效。'});
    result.comments.push(root);
    if (focusId) {
      const focus = entries.get(focusId);
      if (!focus || focus.deleted || model.byComment.get(focusId) !== thread) return json(404,{error:'要回复的评论已不存在。'});
      result.focusComment = row(focus);
    }
  } else {
    const window = windowBefore(model.roots,before,pageSize,model.visible);
    if (!window) return json(400,{error:'评论翻页位置无效。'});
    result.comments = window.rows.map(item => rootRow(model.byComment.get(item.id),replyPreviewSize));
    result.nextCursor = window.cursor;
  }
  if (affectedId) {
    const thread = model.byComment.get(affectedId);
    result.affectedId = affectedId;
    result.affectedThread = model.visible.has(thread.root.id) ? rootRow(thread,replyPreviewSize) : null;
  }
  return json(status,result);
}

// Reserve a slot by comment ID, so an interrupted append and a retry use the
// same per-account allowance. SQLite compares the current byte length inside a write transaction.
async function reservePost(store, accountId, id, time) {
  const key = 'auth/comments/limits/' + Math.floor(time / rateWindow) + '/' + accountId;
  for (let attempt = 0; attempt < 8; attempt++) {
    const bytes = await store.read(key);
    const ids = (bytes?.toString().trim() || '').split('\n').filter(Boolean);
    if (ids.includes(id)) return true;
    if (ids.length >= 15) return false;
    if (await store.append(key,bytes?.length || 0,Buffer.from(id + '\n'))) return true;
  }
  throw new Error('Comment rate limit busy');
}

export function createComments(store, now, json) {
  const error = (status, message, headers) => json(status,{error:message},headers);
  return async (method, url, form, session) => {
    const route = /^\/account\/comments\/(article|diary)\/([a-z0-9-]+)\/?$/.exec(url.pathname);
    if (!route) return error(404,'文章不存在或已移动。');
    const [,audience,slug] = route;
    if ((audience === 'diary' || method === 'POST') && !session) return error(401,'请先登录。');
    if (audience === 'diary' && !session.canReadDiary) return error(403,'需要日记阅读权限。');
    const noteId = await publishedNoteId(store,audience,slug);
    if (!noteId) return error(404,'文章不存在或已移动。');
    // A new note can reuse a former slug. Keep its discussion keyed to the
    // stable content ID and keep diaries separate when their audience changes.
    const key = 'auth/comments/threads/' + audience + '/' + noteId + '.ndjson';
    const threaded = url.searchParams.get('view') === 'threads';
    if (method !== 'POST') {
      const before = url.searchParams.get('before');
      if (before && !commentIdPattern.test(before)) return error(400,'评论翻页位置无效。');
      const {entries} = await readThread(store,key);
      if (threaded) {
        const threadId = url.searchParams.get('thread');
        const focusId = url.searchParams.get('focus');
        if ((threadId !== null && !commentIdPattern.test(threadId)) ||
            (focusId !== null && (!threadId || !commentIdPattern.test(focusId)))) return error(400,'讨论位置无效。');
        return threadedPage(entries,session,{before,threadId,focusId},json);
      }
      if (before && !entries.has(before)) return error(400,'评论翻页位置无效。');
      return json(200,flatPage(entries,before,session));
    }

    const action = form.get('action');
    if (action !== 'create' && action !== 'delete') return error(400,'无效的评论操作。');
    const creating = action === 'create';
    const parentId = form.get('parentId');
    if (creating && parentId !== null && !commentIdPattern.test(parentId)) return error(400,'回复对象无效。');
    const requestId = form.get('requestId') || '';
    const body = (form.get('body') || '').replace(/\r\n?/g,'\n').trim();
    if (creating && (!requestIdPattern.test(requestId) || !body || Array.from(body).length > maxBody
        || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(body))) {
      return error(400,'请填写 1 至 500 字的评论，并从本页提交。');
    }
    const id = creating ? digest([session.accountId,key,requestId.toLowerCase()].join('\n')).slice(0,32) : form.get('id');
    if (!commentIdPattern.test(id || '')) return error(400,'无效的评论编号。');
    const timestamp = now();
    let reserved = false;
    function changed(status, entries) {
      return threaded ? threadedPage(entries,session,{affectedId:id},json,status) : json(status,flatPage(entries,null,session));
    }
    for (let attempt = 0; attempt < 8; attempt++) {
      const {entries,position} = await readThread(store,key);
      const existing = entries.get(id);
      let event;
      if (creating) {
        if (existing) {
          if (existing.body !== body || (existing.parentId || null) !== parentId) return error(409,'此提交编号已用于另一条评论。');
          return changed(200,entries);
        }
        if (parentId && (!entries.has(parentId) || entries.get(parentId).deleted)) return error(404,'要回复的评论已不存在。');
        if (!reserved) {
          reserved = await reservePost(store,session.accountId,id,timestamp);
          if (!reserved) return error(429,'评论发布得太快，请稍后再试。',{'Retry-After':String(Math.ceil((rateWindow - timestamp % rateWindow) / 1000))});
        }
        event = {id,authorId:session.accountId,author:displayName(session),avatar:session.avatar,body,createdAt:new Date(timestamp).toISOString()};
        if (parentId) event.parentId = parentId;
      } else {
        if (!existing) return error(404,'评论不存在。');
        if (!canDelete(existing,session)) return error(403,'只有作者或站主可以删除这条评论。');
        if (existing.deleted) return changed(200,entries);
        event = {id,deleted:true};
      }
      // Publication can change during a thread read, rate-limit reservation, or append retry.
      if (await publishedNoteId(store,audience,slug) !== noteId) return error(404,'文章不存在或已移动。');
      if (await store.append(key,position,Buffer.from(JSON.stringify(event) + '\n'))) {
        if (creating) entries.set(id,event);
        else existing.deleted = true;
        return changed(creating ? 201 : 200,entries);
      }
    }
    return error(503,'评论正在更新，请再试一次。');
  };
}

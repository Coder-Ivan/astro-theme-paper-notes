interface PostComment {
  id: string;
  author: string | null;
  avatar: string | null;
  body: string | null;
  createdAt: string | null;
  canDelete: boolean;
  deleted: boolean;
}
interface Reply extends PostComment {
  parentId: string | null;
  replyToAuthor: string | null;
}
interface Thread extends PostComment {
  replies: Reply[];
  replyCount: number;
  replyCursor: string | null;
}
interface CommentPage {
  comments: Thread[];
  total: number;
  nextCursor: string | null;
  viewer: {authenticated: boolean; canPost: boolean; csrf: string | null; name: string | null; avatar: string | null};
  affectedThread?: Thread | null;
  affectedId?: string;
  focusComment?: Reply;
}
interface Target { thread: string; id: string; author: string }
class CommentError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message); }
}
function missingTarget(error: unknown) {
  return error instanceof CommentError && error.status === 404 &&
    (error.code === 'reply_target_missing' || ['这段讨论已不存在。','要回复的评论已不存在。'].includes(error.message));
}

const dateFormat = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Shanghai',
});
const root = document.querySelector<HTMLElement>('#comments[data-endpoint]');
if (root) setup(root);

function avatarUrl(id: string | null) {
  return '/account/avatars/' + (id && /^[a-z]{1,24}$/.test(id) ? id : 'mountain') + '.svg';
}

function setup(root: HTMLElement) {
  function get<T extends HTMLElement>(selector: string) { return root.querySelector<T>(selector)!; }
  const form = get<HTMLFormElement>('form');
  const home = get('[data-form-home]');
  const input = get<HTMLTextAreaElement>('textarea');
  const label = get<HTMLLabelElement>('label[for="comment-body"]');
  const submit = get<HTMLButtonElement>('[type="submit"]');
  const cancel = get<HTMLButtonElement>('[data-cancel-reply]');
  const guest = get('.comments-guest');
  const list = get<HTMLOListElement>('.comment-list');
  const more = get<HTMLButtonElement>('[data-more]');
  const retry = get<HTMLButtonElement>('[data-retry]');
  const count = get('[data-count]');
  const empty = get('[data-empty]');
  const counter = get('#comment-length');
  const status = get('[data-status]');
  const replyStatus = get('[data-reply-status]');
  const threads = new Map<string, Thread>();
  const drafts = new Map<string, string>();
  let viewer: CommentPage['viewer'] | null = null;
  let cursor: string | null = null;
  let target: Target | null = null;
  const pinned = new Map<string, Reply>();
  const requestIds = new Map<string, {body: string; id: string}>();
  let unavailable = false;
  let active = false;
  let writing = false;
  let revision = 0;
  const hashTarget = /^#reply-([0-9a-f]{32})-([0-9a-f]{32})$/.exec(location.hash);
  let loginTarget = hashTarget ? {thread: hashTarget[1], id: hashTarget[2]} : null;

  function say(message = '', error = false) {
    const visible = target && !form.hidden ? replyStatus : status;
    (visible === status ? replyStatus : status).textContent = '';
    visible.classList.toggle('is-error', error);
    visible.textContent = message;
  }

  function checkText() {
    const length = Array.from(input.value.trim()).length;
    counter.textContent = length + ' / 500';
    counter.classList.toggle('over-limit', length > 500);
    input.setAttribute('aria-invalid', String(length > 500));
    submit.disabled = writing || unavailable || !length || length > 500;
  }

  function button(text: string, action: string) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'comment-inline';
    el.dataset.action = action;
    el.textContent = text;
    return el;
  }

  function rowById(id: string) {
    return list.querySelector<HTMLElement>('[data-comment-id="' + CSS.escape(id) + '"]');
  }

  function positionForm() {
    const recipient = target && rowById(target.id)?.querySelector('.comment-content');
    const position = recipient || home;
    if (form.parentElement !== position) position.append(form);
    form.hidden = !viewer?.canPost || Boolean(target && !recipient && !unavailable);
    form.classList.toggle('reply-form', !!target);
    label.textContent = unavailable ? '未发表的回复' : target ? '回复 ' + target.author : '写评论';
    input.placeholder = target ? '写下你的回复…' : '写下你的看法…';
    submit.textContent = target ? '发表回复' : '发表评论';
    cancel.hidden = !target;
  }

  function changeTarget(next: Target | null) {
    const previous = target?.id || '';
    if (input.value) drafts.set(previous, input.value);
    else drafts.delete(previous);
    target = next;
    unavailable = false;
    say();
    input.value = drafts.get(next?.id || '') || '';
    positionForm();
    checkText();
  }

  function resetIdentity() {
    drafts.clear();
    input.value = '';
    target = null;
    unavailable = false;
    pinned.clear();
    requestIds.clear();
    home.append(form);
    positionForm();
  }

  function row(comment: PostComment, threadId: string, reply?: Reply) {
    const el = document.createElement('div');
    el.className = 'comment-item';
    el.dataset.commentId = comment.id;
    const content = document.createElement('div');
    content.className = 'comment-content';
    const body = document.createElement('p');
    body.className = 'comment-text';
    if (comment.deleted) {
      el.classList.add('removed-comment');
      body.textContent = reply ? '这条回复已删除。' : '这条评论已删除。';
      content.append(body);
      el.append(content);
      return el;
    }
    const image = document.createElement('img');
    image.src = avatarUrl(comment.avatar);
    image.alt = '';
    image.loading = 'lazy';
    image.width = image.height = reply ? 28 : 36;
    const byline = document.createElement('div');
    byline.className = 'comment-byline';
    const author = document.createElement('strong');
    author.textContent = comment.author;
    byline.append(author);
    if (reply) {
      const who = document.createElement('span');
      who.className = 'comment-recipient';
      who.textContent = '回复 ' + (reply.replyToAuthor ?? '已删除的留言');
      byline.append(who);
    }
    if (comment.createdAt) {
      const date = document.createElement('time');
      date.dateTime = comment.createdAt;
      date.textContent = dateFormat.format(new Date(comment.createdAt));
      byline.append(date);
    }
    body.textContent = comment.body;
    const actions = document.createElement('div');
    actions.className = 'comment-actions';
    if (viewer?.canPost) actions.append(button('回复', 'reply'));
    else {
      const login = document.createElement('a');
      login.className = 'comment-inline';
      login.textContent = '登录后回复';
      const anchor = '#reply-' + threadId + '-' + comment.id;
      login.href = '/account/login?next=' + encodeURIComponent(location.pathname + anchor);
      actions.append(login);
    }
    if (comment.canDelete) {
      const controls = document.createElement('div');
      controls.className = 'comment-controls';
      controls.append(button('删除', 'ask'));
      actions.append(controls);
    }
    content.append(byline, body, actions);
    el.append(image, content);
    return el;
  }

  function drawThread(thread: Thread, prepend = false) {
    threads.set(thread.id,thread);
    const selector = '[data-thread-id="' + CSS.escape(thread.id) + '"]';
    let group = list.querySelector<HTMLLIElement>(selector);
    if (!group) {
      group = document.createElement('li');
      group.dataset.threadId = thread.id;
      group.className = 'comment-thread';
      if (prepend) list.prepend(group);
      else list.append(group);
    }
    if (group.contains(form)) home.append(form);
    group.replaceChildren(row(thread,thread.id));
    if (thread.replies.length) {
      const branch = document.createElement('div');
      branch.className = 'comment-branch';
      const heading = document.createElement('div');
      heading.className = 'comment-branch-head';
      const number = document.createElement('span');
      number.textContent = thread.replyCount + ' 条回复';
      heading.append(number);
      if (thread.replyCursor) heading.append(button('查看更早的回复','older'));
      const replies = document.createElement('ol');
      replies.className = 'comment-replies';
      replies.setAttribute('aria-label','回复列表');
      const extra = pinned.get(thread.id);
      const items = extra && !thread.replies.some(r => r.id === extra.id) ? [extra, ...thread.replies] : thread.replies;
      for (const reply of items) {
        const li = document.createElement('li');
        li.append(row(reply,thread.id,reply));
        replies.append(li);
      }
      branch.append(heading,replies);
      group.append(branch);
    }
    positionForm();
  }

  async function fetchPage(query: Record<string,string> = {}, fields?: URLSearchParams): Promise<CommentPage> {
    const url = new URL(root.dataset.endpoint!,location.origin);
    url.search = new URLSearchParams({view:'threads',...query}).toString();
    const response = await fetch(url, {
      method: fields ? 'POST' : 'GET', credentials:'same-origin', cache:'no-store', redirect:'error',
      headers:{Accept:'application/json'}, body:fields, signal:AbortSignal.timeout(18000),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new CommentError(typeof data?.error === 'string' ? data.error : '暂时无法处理评论。',response.status,data?.code);
    if (!data?.viewer || !Array.isArray(data.comments)) throw new Error('评论服务未返回有效数据。');
    return data;
  }

  function account(data: CommentPage) {
    viewer = data.viewer;
    count.textContent = data.total + ' 条';
    count.hidden = false;
    empty.hidden = data.total !== 0;
    retry.hidden = true;
    guest.hidden = viewer.authenticated;
    form.hidden = !viewer.canPost;
    if (viewer.canPost) {
      get('[data-viewer-name]').textContent = '以 ' + viewer.name + ' 的身份评论';
      get<HTMLImageElement>('[data-viewer-avatar]').src = avatarUrl(viewer.avatar);
    }
    checkText();
  }

  function failure(error: unknown, fallback: string) {
    if (error instanceof CommentError && [401,403,404].includes(error.status)) {
      resetIdentity();
      list.replaceChildren(); threads.clear(); cursor = null;
      viewer = null;
      form.hidden = more.hidden = empty.hidden = count.hidden = true;
      guest.hidden = error.status !== 401;
    }
    say(error instanceof CommentError ? error.message : fallback,true);
    retry.hidden = false;
  }

  function explainMissing(focus: boolean) {
    if (target) {
      unavailable = true;
      positionForm(); checkText();
      say('回复对象已删除。你可以复制草稿，或取消这条回复。',true);
      if (focus) input.focus();
    } else {
      say('要回复的留言已删除或不可用。',true);
      if (focus) status.focus();
    }
  }

  async function locate(next: {thread:string; id:string}, ticket: number, focus: boolean) {
    const previous = target;
    let thread = threads.get(next.thread);
    let comment: PostComment | undefined = thread?.id === next.id ? thread : thread?.replies.find(r => r.id === next.id);
    if (!comment) {
      const data = await fetchPage({thread:next.thread,focus:next.id});
      if (revision !== ticket || target !== previous || !data.viewer.canPost || data.viewer.csrf !== viewer?.csrf) return;
      thread = data.comments[0];
      comment = data.focusComment;
      if (thread && data.focusComment && comment?.id !== thread.id) pinned.set(thread.id,data.focusComment);
    }
    if (!comment?.author || comment.deleted || !thread) {
      explainMissing(focus);
      return;
    }
    changeTarget({...next,author:comment.author});
    drawThread(thread);
    if (focus) input.focus();
  }

  async function load(append = false) {
    if (writing || (append && !cursor)) return;
    const ticket = ++revision;
    more.disabled = retry.disabled = true;
    if (!list.childElementCount && !viewer) say('正在加载评论…');
    try {
      const data = await fetchPage(append && cursor ? {before:cursor} : {});
      if (ticket !== revision) return;
      if (viewer && viewer.csrf !== data.viewer.csrf) { resetIdentity(); if (append) return void load(); }
      const wasTyping = document.activeElement === input;
      account(data);
      if (!append) { home.append(form); list.replaceChildren(); threads.clear(); pinned.clear(); }
      for (const thread of data.comments) if (!threads.has(thread.id)) drawThread(thread);
      cursor = data.nextCursor;
      more.hidden = !cursor;
      positionForm();
      say();
      const next = loginTarget || (!append && target);
      if (next && viewer?.canPost) {
        const previous = target;
        const focus = Boolean(loginTarget || wasTyping);
        try {
          await locate(next,ticket,focus);
          if (ticket === revision) loginTarget = null;
        } catch (e) {
          if (ticket !== revision || previous !== target) return;
          if (!missingTarget(e)) throw e;
          loginTarget = null; explainMissing(focus);
        }
      }
    } catch (error) {
      if (ticket === revision) failure(error,'评论加载失败，请重试。');
    } finally {
      if (ticket === revision) more.disabled = retry.disabled = false;
    }
  }

  async function older(thread: Thread, control: HTMLButtonElement) {
    if (!thread.replyCursor) return;
    const ticket = revision;
    control.disabled = true;
    try {
      const data = await fetchPage({thread:thread.id,before:thread.replyCursor});
      if (ticket !== revision || threads.get(thread.id) !== thread) return;
      if (!viewer || data.viewer.csrf !== viewer.csrf) return void load();
      const page = data.comments[0];
      if (!page) return void load();
      const known = new Set(thread.replies.map(r => r.id));
      const fresh = page.replies.filter(r => !known.has(r.id));
      page.replies = [...fresh,...thread.replies];
      drawThread(page);
      if (fresh.length) {
        const item = rowById(fresh[0].id);
        if (item) { item.tabIndex = -1; item.focus(); }
      }
      say();
    } catch (error) {
      if (ticket === revision) failure(error,'更早的回复加载失败，请重试。');
    } finally { control.disabled = false; }
  }

  function stopReply() {
    const previous = target;
    if (previous) { input.value = ''; drafts.delete(previous.id); requestIds.delete(previous.id); }
    changeTarget(null);
    return previous;
  }

  async function write(fields: Record<string,string>, success: string) {
    if (writing || !viewer?.csrf) return;
    writing = true; ++revision;
    input.readOnly = true; cancel.disabled = more.disabled = retry.disabled = true;
    checkText();
    say(fields.action === 'create' ? '正在发表…' : '正在删除…');
    let restoreRecipient = false;
    try {
      const data = await fetchPage({},new URLSearchParams({...fields,csrf:viewer.csrf}));
      if (fields.action === 'create') {
        input.value = ''; requestIds.delete(target?.id || '');
        drafts.delete(target?.id || '');
        if (target) stopReply();
      } else if (fields.id === target?.id) stopReply();
      if (viewer.csrf !== data.viewer.csrf) { resetIdentity(); writing = false; return void load(); }
      account(data);
      if (data.affectedThread) {
        pinned.delete(data.affectedThread.id);
        drawThread(data.affectedThread,true);
      } else if (fields.action === 'delete') {
        const threadId = rowById(fields.id)?.closest<HTMLElement>('[data-thread-id]')?.dataset.threadId;
        if (threadId) {
          const group = list.querySelector('[data-thread-id="' + CSS.escape(threadId) + '"]');
          if (group?.contains(form)) home.append(form);
          group?.remove(); threads.delete(threadId);
        }
      }
      positionForm();
      restoreRecipient = !!target && !rowById(target.id)?.querySelector('[data-action="reply"]');
      say(success);
      if (fields.action === 'delete') get('#comments-title').focus({preventScroll:true});
      else {
        const posted = data.affectedId && rowById(data.affectedId);
        if (posted) { posted.tabIndex = -1; posted.focus(); }
      }
    } catch (error) {
      if (fields.parentId && missingTarget(error)) explainMissing(true);
      else failure(error,'未收到操作结果，请重试。');
    } finally {
      writing = false; input.readOnly = false;
      cancel.disabled = more.disabled = retry.disabled = false;
      checkText();
      if (restoreRecipient) void load();
    }
  }

  input.addEventListener('input',checkText);
  form.addEventListener('submit',event => {
    event.preventDefault();
    const body = input.value.trim();
    if (submit.disabled || !viewer?.canPost || !body || Array.from(body).length > 500) return;
    const parent = target?.id || '';
    let requestId = requestIds.get(parent);
    if (!requestId || requestId.body !== body) {
      requestId = {body,id:crypto.randomUUID()};
      requestIds.set(parent,requestId);
    }
    void write({action:'create',body,requestId:requestId.id,...(parent ? {parentId:parent} : {})},parent ? '回复已发表。' : '评论已发表。');
  });
  cancel.addEventListener('click', () => {
    const previous = stopReply();
    const control = previous && rowById(previous.id)?.querySelector<HTMLButtonElement>('[data-action="reply"]');
    (control || input).focus();
  });
  list.addEventListener('click',event => {
    if (writing || !(event.target instanceof Element)) return;
    const control = event.target.closest<HTMLButtonElement>('button[data-action]');
    const threadId = control?.closest<HTMLElement>('[data-thread-id]')?.dataset.threadId;
    const thread = threadId && threads.get(threadId);
    if (!control || !thread) return;
    if (control.dataset.action === 'older') return void older(thread,control);
    const id = control.closest<HTMLElement>('[data-comment-id]')?.dataset.commentId;
    if (!id) return;
    if (control.dataset.action === 'reply') {
      const extra = pinned.get(thread.id);
      const recipient = id === thread.id ? thread : thread.replies.find(r => r.id === id) ?? (extra?.id === id ? extra : null);
      if (recipient?.author && !recipient.deleted) { changeTarget({id,thread:thread.id,author:recipient.author}); input.focus(); }
      return;
    }
    const controls = control.closest<HTMLElement>('.comment-controls');
    if (!controls) return;
    if (control.dataset.action === 'delete') return void write({action:'delete',id},'评论已删除。');
    const ask = control.dataset.action === 'ask';
    controls.classList.toggle('comment-confirm',ask);
    if (ask) {
      const confirm = button('确认删除','delete');
      confirm.classList.add('comment-remove-confirm');
      const dismiss = button('取消','cancel');
      controls.replaceChildren(confirm,dismiss); dismiss.focus();
    } else {
      const askButton = button('删除','ask');
      controls.replaceChildren(askButton); askButton.focus();
    }
  });
  more.addEventListener('click',() => { void load(true); });
  retry.addEventListener('click',() => { void load(); });
  function activate() {
    if (!active) { active = true; void load(); }
  }
  if (loginTarget || location.hash === '#comments' || !('IntersectionObserver' in window)) activate();
  else {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); activate(); }
    }, {rootMargin:'350px'});
    observer.observe(root);
  }
  window.addEventListener('pagehide',() => {
    ++revision; home.append(form); list.replaceChildren(); threads.clear();
    form.hidden = guest.hidden = more.hidden = count.hidden = empty.hidden = true;
    say();
  });
  window.addEventListener('pageshow',event => { if (active && event.persisted) void load(); });
  document.addEventListener('visibilitychange',() => { if (active && !document.hidden) void load(); });
}

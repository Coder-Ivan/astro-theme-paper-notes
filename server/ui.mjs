import config from '../theme.config.mjs';
import { avatarCss, avatarMarkup, avatarPicker, defaultAvatar } from './avatars.mjs';

export const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const field = (name, value) => '<input type="hidden" name="' + name + '" value="' + escape(value) + '">';
const token = session => field('csrf', session.csrf);
const accent = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(config.accent) ? config.accent : '#285e65';
const css = `
:root{--accent:${accent}}
*{box-sizing:border-box}html{color-scheme:light}body{margin:0;color:#23393c;background:#f2f5f4;font:16px/1.55 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}
header{background:linear-gradient(100deg,color-mix(in srgb,var(--accent) 55%,#102327),color-mix(in srgb,var(--accent) 55%,#929989));color:#fff}
.bar,main{max-width:64rem;margin:auto;padding:1.2rem clamp(1rem,4vw,2.5rem)}.bar{display:flex;align-items:center;justify-content:space-between;gap:1rem}
header a{color:inherit;text-decoration:none}.brand,h1,h2{font-family:Georgia,"Songti SC","Noto Serif CJK SC",serif}.brand{font-size:1.4rem;letter-spacing:.09em;font-weight:650}
nav,.actions{display:flex;align-items:center;gap:.8rem;flex-wrap:wrap}nav{font-size:.94rem}main{padding-block:clamp(2rem,5vw,4.25rem)}
section{background:#fff;border:1px solid #dae6e2;border-radius:13px;padding:clamp(1.25rem,3.8vw,2.4rem);box-shadow:0 6px 24px #233e470b;margin-bottom:1.15rem}
.narrow{max-width:31rem;margin-inline:auto}h1,h2{color:#203d40;line-height:1.25;margin:0 0 1.4rem}h1{font-size:clamp(1.75rem,4vw,2.25rem)}h2{font-size:1.35rem}
p{margin:0 0 1rem}section>:last-child{margin-bottom:0}a{color:var(--accent);text-underline-offset:.2em}label{display:grid;gap:.4rem;margin-bottom:1rem;font-weight:570}
input,select,button,.button{font:inherit;border-radius:.42rem}input,select{border:1px solid #aebfbc;padding:.65rem .8rem;background:#fff;color:#23393c;width:100%}
button,.button{display:inline-block;cursor:pointer;text-decoration:none;border:1px solid var(--accent);background:var(--accent);color:white;padding:.58rem .92rem;line-height:1.5}
button.secondary,.button.secondary{color:#255850;background:#f7faf8;border-color:#aec2bb}button.danger{color:#873e32;background:#fff;border-color:#d6b9b4}button:hover,.button:hover{filter:brightness(.94)}
:focus-visible{outline:3px solid #438980;outline-offset:3px}.notice,.error,.credential{padding:.85rem 1rem;border-radius:.45rem;margin-bottom:1rem}.notice,.credential{background:#edf5f0;color:#244f44}.error{background:#faeee9;color:#803c32}
.credential code{font:1rem/1.5 ui-monospace,monospace;overflow-wrap:anywhere;user-select:all}.credential p:last-child{margin:0}.muted{color:#566b69}.list{display:grid;gap:.9rem}.user{border-top:1px solid #dce5e2;padding-top:1rem}.user form{display:flex;align-items:end;gap:.5rem;flex-wrap:wrap}.user label{margin:0}.user-name{font-weight:700;margin-bottom:.35rem;overflow-wrap:anywhere}
.identity{display:flex;align-items:center;gap:.8rem;margin-bottom:1.15rem}.identity p{margin:0;overflow-wrap:anywhere}.form-foot{margin-top:1.25rem}.user .identity{margin-bottom:.65rem}
.post-search{display:flex;align-items:end;flex-wrap:wrap;gap:.65rem}.post-search label{flex:1 1 16rem;min-width:0;margin:0}.post-search .actions{min-height:2.75rem}
.post-group{border-block-start:1px solid #dce5e2}.post-group>summary{padding:.85rem .25rem;cursor:pointer;color:var(--accent);overflow-wrap:anywhere}.post-group>summary::marker{color:#59827a}.post-group>summary strong{margin-inline-start:.3rem}.post-group>summary small{display:inline-block;margin-inline-start:.7rem;color:#566b69}.post-group[open]>summary{margin-block-end:.25rem}
.notebook-children{border-inline-start:1px solid #d4e1dc;margin-inline-start:1rem;padding-inline-start:.65rem}.notebook-children.deep{margin-inline-start:0;padding-inline-start:0;border:0}
.managed-posts{list-style:none;margin:0;padding:0 0 .65rem clamp(.35rem,2vw,1.5rem)}.managed-post{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.75rem 1.25rem;padding:1rem 0;border-top:1px solid #dce5e2;scroll-margin-block:1rem}.post-details{flex:1 1 17rem;min-width:0;overflow-wrap:anywhere}.post-title{font-size:1.08rem;line-height:1.4;margin:0 0 .25rem}.post-detail{margin:0;color:#566b69;font-size:.92rem}.managed-post .actions{gap:.5rem}.managed-post button{padding:.45rem .8rem}
.bulk-posts{margin:0 0 1rem;padding:.8rem 1rem;border:1px solid #d1dfda;border-radius:.55rem;background:#f3f7f5}.bulk-heading,.bulk-actions{display:flex;align-items:center;flex-wrap:wrap;gap:.45rem .7rem}.bulk-heading output,.bulk-scope{font-size:.9rem;color:#466663}.bulk-heading .bulk-clear{margin-inline-start:auto}.bulk-actions{margin-top:.65rem}.bulk-posts button{font-size:.94rem;padding:.37rem .7rem}.bulk-posts button:disabled{color:#677774;background:#f3f5f4;border-color:#ced7d3;cursor:default;filter:none}.bulk-posts .bulk-scope{margin:.25rem 0 0}.bulk-heading [hidden],.category-choice[hidden]{display:none}
.post-choice-group{position:relative;min-width:0}.post-choice-group.has-group-toggle>.post-group>summary{padding-inline-start:2.9rem}.category-choice{position:absolute;top:.13rem;inset-inline-start:0;display:grid;place-items:center;width:2.6rem;height:2.6rem;margin:0;cursor:pointer}.category-choice input,.post-choice input{width:1.15rem;height:1.15rem;margin:0;accent-color:var(--accent);cursor:pointer}.post-choice{display:flex;align-items:flex-start;gap:.65rem;margin:0;min-height:1.6rem;cursor:pointer;font-weight:inherit}.post-choice input{flex:none;margin-top:.16rem}.post-choice span{min-width:0}.managed-post .post-detail{margin-inline-start:1.8rem}
@media(max-width:38rem){main{padding-inline:.8rem}.bar{padding-inline:1rem}.brand{font-size:1.15rem}.actions{gap:.5rem}nav{gap:.6rem}.user select{max-width:12rem}}
@media(max-width:32rem){.bar{flex-wrap:wrap}.post-search label{flex-basis:100%}.notebook-children{margin-inline-start:.4rem;padding-inline-start:.35rem}}
` + avatarCss;
function shell(title, content, session) {
  const nav = (session?.canReadDiary ? '<a href="/diary/">日记</a>' : '') + (session?.isAdmin ? '<a href="/account/posts">文章管理</a><a href="/account/users">用户管理</a>' : '');
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>' + escape(title) + ' · ' + escape(config.title) + '</title><style>' + css + '</style></head><body class="field-paper"><header><div class="bar"><a class="brand" href="/">' + escape(config.title) + '</a><nav aria-label="主导航"><a href="/">首页</a>' + nav + '</nav></div></header><main>' + content + '</main></body></html>';
}
const message = (text, error = false) => text ? '<p role="status" class="' + (error ? 'error' : 'notice') + '">' + escape(text) + '</p>' : '';
const nextQuery = next => next && next !== '/account/' ? '?next=' + encodeURIComponent(next) : '';
export function login(next, error = '', registered = false) {
  return shell('登录', '<section class="narrow"><h1>登录' + escape(config.title) + '</h1>' +
    (registered ? message('账户已创建，请登录。') : '') + message(error,true) +
    '<form method="post" action="/account/login">' + field('next', next) +
    '<label>用户名<input name="username" required maxlength="40" autocomplete="username" autocapitalize="none" spellcheck="false" autofocus></label><label>密码<input name="password" type="password" required maxlength="256" autocomplete="current-password"></label><button>登录</button></form>' +
    '<p class="form-foot">还没有账户？ <a href="/account/register' + nextQuery(next) + '">注册账户</a></p></section>');
}
export function register(name = '', avatar = defaultAvatar, error = '', next = '/account/') {
  return shell('注册账户', '<section class="narrow"><h1>注册账户</h1>' + message(error,true) +
    '<form method="post" action="/account/register">' + field('next', next) +
    '<label>用户名<input name="username" value="' + escape(name) + '" required minlength="3" maxlength="40" pattern="[a-zA-Z0-9][a-zA-Z0-9._@\\-]{2,39}" autocomplete="username" autocapitalize="none" spellcheck="false" aria-describedby="name-help"></label>' +
    '<p id="name-help" class="muted">使用 3 至 40 位字母、数字或 . _ @ -，以字母或数字开头。</p>' +
    '<label>密码（至少 12 个字符）<input name="password" type="password" required minlength="12" maxlength="256" autocomplete="new-password"></label>' +
    avatarPicker(avatar) + '<p class="muted">注册后可浏览公开文章，日记阅读权限由站主开通。</p>' +
    '<button>注册并登录</button></form><p class="form-foot">已有账户？ <a href="/account/login' + nextQuery(next) + '">登录</a></p></section>');
}
export function home(session, info = '', error = false) {
  const role = session.isAdmin ? '管理员' : session.canReadDiary ? '日记读者' : '普通用户';
  return shell('我的账户','<section class="narrow"><h1>我的账户</h1>' + message(info,error) +
    '<div class="identity"><span class="profile-avatar">' + avatarMarkup(session.avatar) + '</span><div><p><strong>' + escape(session.name) + '</strong></p><p class="muted">' + role + '</p></div></div>' +
    '<div class="actions">' + (session.canReadDiary ? '<a class="button" href="/diary/">阅读日记</a>' : '') + (session.isAdmin ? '<a class="button secondary" href="/account/posts">文章管理</a><a class="button secondary" href="/account/users">用户管理</a>' : '') +
    '<form method="post" action="/account/logout">' + token(session) + '<button class="secondary">退出登录</button></form></div></section>' +
    '<section class="narrow"><h2>我的头像</h2><form method="post" action="/account/avatar">' + token(session) + avatarPicker(session.avatar) + '<button>保存头像</button></form></section>' +
    '<section class="narrow"><h2>修改密码</h2><form method="post" action="/account/password">' + token(session) + '<label>当前密码<input name="current" type="password" required maxlength="256" autocomplete="current-password"></label><label>新密码（至少 12 个字符）<input name="password" type="password" required minlength="12" maxlength="256" autocomplete="new-password"></label><button>保存新密码</button></form></section>',session);
}
function options(value, items) {
  return items.map(([v,name]) => '<option value="' + v + '"' + (v === value ? ' selected' : '') + '>' + name + '</option>').join('');
}
const levels = [['member','普通用户'],['reader','日记读者'],['disabled','停用']];
const registrationDate = new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',dateStyle:'long'});
export function users(session, accounts, info = '', credential = null, error = false) {
  let intro = message(info,error);
  if (credential) intro += '<div class="credential"><p><strong>' + escape(credential.name) + ' 的新密码</strong></p><p><code>' + escape(credential.password) + '</code></p><p>密码仅在此处显示一次。请私下交给本人，对方可登录后修改。</p></div>';
  const rows = Array.from(accounts.values()).sort((a,b) => Number(b.isAdmin) - Number(a.isAdmin) || a.name.localeCompare(b.name)).map(account => {
    const created = Date.parse(account.createdAt);
    const detail = account.isAdmin ? '站点管理员' : Number.isFinite(created) ? '注册于 ' + registrationDate.format(created) : '';
    const head = '<div class="user"><div class="identity"><span class="list-avatar">' + avatarMarkup(account.avatar) + '</span>' +
      '<div><p class="user-name">' + escape(account.name) + '</p>' + (detail ? '<p class="muted">' + detail + '</p>' : '') + '</div></div>';
    if (account.isAdmin) return head + '</div>';
    return head + '<form method="post" action="/account/users">' + token(session) + field('username',account.name) + '<label>访问权限<select name="level">' + options(account.level,levels) + '</select></label><button name="action" value="access">保存权限</button><button name="action" value="reset" class="secondary">重置密码</button><button name="action" value="confirm-delete" class="danger">删除用户</button></form></div>';
  }).join('');
  return shell('用户管理','<section><h1>用户管理</h1>' + intro + '<form method="post" action="/account/users">' + token(session) + field('action','create') + '<label>新用户名<input name="username" required minlength="3" maxlength="40" pattern="[a-zA-Z0-9][a-zA-Z0-9._@\\-]{2,39}" autocomplete="off" autocapitalize="none" placeholder="3–40 位字母、数字或 . _ @ -"></label><label>访问权限<select name="level">' + options('member',levels.slice(0,2)) + '</select></label><button>创建用户并生成密码</button></form></section><section><h2>现有用户</h2><div class="list">' + rows + '</div></section><a href="/account/">返回我的账户</a>',session);
}
export function confirmDelete(session, name) {
  return shell('删除用户','<section class="narrow"><h1>删除用户</h1><p>删除 ' + escape(name) + ' 后，该账号会立即失去访问权限。</p><form method="post" action="/account/users" class="actions">' + token(session) + field('action','delete') + field('username',name) + '<button class="danger">确认删除</button><a href="/account/users">取消</a></form></section>',session);
}
function managePostSelection() {
  const form = document.getElementById('bulk-posts');
  if (!form) return;
  const allRows = Array.from(document.querySelectorAll('input[form="bulk-posts"]'));
  const groups = Array.from(document.querySelectorAll('.post-choice-group'), group => ({
    toggle: group.querySelector(':scope > .category-choice input'),
    rows: Array.from(group.querySelectorAll('input[form="bulk-posts"]')),
  }));
  const counter = form.querySelector('output');
  const clear = form.querySelector('.bulk-clear');
  const actions = form.querySelectorAll('button[type="submit"]');

  function update() {
    for (const {toggle,rows} of groups) {
      const count = rows.filter(row => row.checked).length;
      toggle.checked = count === rows.length;
      toggle.indeterminate = count > 0 && count < rows.length;
    }
    const total = allRows.filter(row => row.checked).length;
    counter.textContent = '已选 ' + total + ' 篇';
    clear.disabled = total === 0;
    actions.forEach(button => { button.disabled = total === 0; });
  }

  for (const {toggle,rows} of groups) {
    toggle.closest('label').hidden = false;
    toggle.closest('.post-choice-group').classList.add('has-group-toggle');
    toggle.addEventListener('change', () => {
      rows.forEach(row => { row.checked = toggle.checked; });
      update();
    });
  }
  allRows.forEach(row => row.addEventListener('change',update));
  clear.hidden = false;
  counter.hidden = false;
  clear.addEventListener('click', () => {
    allRows.forEach(row => { row.checked = false; });
    update();
  });
  window.addEventListener('pageshow',update);
  update();
}

// Hash this exact, fixed script in the article-management page's CSP.
export const postSelectionScript = '(' + managePostSelection.toString() + ')();';

function bulkPostForm(session, query) {
  const actions = [['show','批量显示'],['hide','批量隐藏'],['pin','批量置顶'],['unpin','批量取消置顶']];
  const buttons = actions.map(([value,label]) =>
    '<button type="submit" class="secondary" name="action" value="' + value + '">' + label + '</button>').join('');
  return '<form id="bulk-posts" method="post" action="/account/posts" class="bulk-posts" aria-label="批量操作">' +
    token(session) + field('mode','bulk') + field('q',query) +
    '<div class="bulk-heading"><strong>批量操作</strong><output hidden aria-live="polite" aria-atomic="true">已选 0 篇</output>' +
    '<button type="button" class="secondary bulk-clear" hidden>清空选择</button></div>' +
    (query.trim() ? '<p class="bulk-scope">分类全选仅选中当前搜索结果。</p>' : '') +
    '<div class="bulk-actions">' + buttons + '</div></form>';
}

const postOrder = new Intl.Collator('zh-CN', {numeric:true});
export function posts(session, entries, query = '', status = 'ready', savedId = '', bulkSaved = null) {
  const term = query.trim().toLowerCase();
  const pathTerm = term.replace(/\s*\/\s*/g,'/');
  const notebooks = new Map();
  let count = 0;
  for (const post of entries) {
    const path = Array.isArray(post.notebookPath) && post.notebookPath.length ? post.notebookPath : [post.category || '未分类'];
    if (term && !post.title.toLowerCase().includes(term) && !path.join('/').toLowerCase().replace(/\s*\/\s*/g,'/').includes(pathTerm)) continue;
    let siblings = notebooks;
    let node;
    for (const name of path) {
      node = siblings.get(name);
      if (!node) {
        node = {name, children:new Map(), articles:[], count:0, open:false};
        siblings.set(name,node);
      }
      node.count++;
      if (term || post.id === savedId) node.open = true;
      siblings = node.children;
    }
    node.articles.push(post);
    count++;
  }
  const search = '<form method="get" action="/account/posts" role="search" class="post-search">' +
    '<label>查找文章<input type="search" name="q" maxlength="100" placeholder="文章标题或笔记本路径" value="' + escape(query) + '"></label>' +
    '<div class="actions"><button>查找</button>' + (term ? '<a href="/account/posts">清除搜索</a>' : '') + '</div></form>';
  function row(post) {
    const title = escape(post.title);
    const visibility = post.hidden ? '显示' : '隐藏';
    const pin = post.pinned ? '取消置顶' : '置顶';
    const status = [post.hidden ? '隐藏' : '显示', post.pinned && (post.hidden ? '恢复显示后置顶' : '已置顶')].filter(Boolean).join(' · ');
    return '<li class="managed-post" id="post-' + escape(post.id) + '" tabindex="-1"><div class="post-details"><h3 class="post-title"><label class="post-choice">' +
      '<input type="checkbox" name="id" value="' + escape(post.id) + '" form="bulk-posts" aria-label="选择《' + title + '》"><span>' +
      title + '</span></label></h3><p class="post-detail">' + status + '</p></div>' +
      '<form method="post" action="/account/posts" class="actions">' + token(session) + field('id',post.id) + field('q',query) +
      '<button name="action" value="' + (post.hidden ? 'show' : 'hide') + '" class="secondary" aria-label="' + visibility + '《' + title + '》">' + visibility + '</button>' +
      '<button name="action" value="' + (post.pinned ? 'unpin' : 'pin') + '" class="secondary" aria-label="' + pin + '《' + title + '》">' + pin + '</button></form></li>';
  }
  function notebookSections(siblings, ancestors) {
    return [...siblings.values()].sort((a,b) => postOrder.compare(a.name,b.name)).map(node => {
      const path = [...ancestors,node.name];
      const articles = node.articles.sort((a,b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || postOrder.compare(a.title,b.title));
      const rows = articles.length ? '<ul class="managed-posts">' + articles.map(row).join('') + '</ul>' : '';
      const children = node.children.size ? '<div class="notebook-children' + (path.length >= 5 ? ' deep' : '') + '">' + notebookSections(node.children,path) + '</div>' : '';
      const selection = '选择「' + escape(path.join(' / ')) + '」分类' + (term ? '中匹配的文章' : '的全部文章');
      return '<div class="post-choice-group"><label class="category-choice" hidden title="' + selection + '">' +
        '<input type="checkbox" aria-label="' + selection + '"></label><details class="post-group"' + (node.open ? ' open' : '') + '><summary><strong>' + escape(node.name) + '</strong><small>' +
        node.count + ' 篇</small></summary>' + rows + children + '</details></div>';
    }).join('');
  }
  const sections = notebookSections(notebooks,[]);
  const result = sections || '<p class="muted">' + (term ? '没有找到匹配的文章。请换个标题或分类关键词。' : '当前没有可管理的文章。') + '</p>';
  const failed = status === 'failed';
  const receipt = bulkSaved ? '已处理 ' + bulkSaved.selected + ' 篇，实际更改 ' + bulkSaved.changed + ' 篇。' : '';
  const info = failed ? '上次构建失败，访客仍会看到上次成功发布的版本。请查看服务日志后重试。' :
    status === 'building' ? '设置已保存，正在更新公开博客。刷新本页可查看进度。' : savedId ? '文章设置已生效。' : '';
  const retry = failed ? '<form method="post" action="/account/posts">' + token(session) + field('q',query) +
    '<button name="action" value="retry">重新构建</button></form>' : '';
  return shell('文章管理', '<section><h1>文章管理</h1>' + message(receipt) + message(info,failed) + retry +
    '<p>隐藏文章会从公开博客移除，置顶文章会排在首页列表前面。</p><p class="muted">保存后服务会自动构建，完成后即可查看。</p>' +
    search + '</section><section><h2>' + (term ? '搜索结果' : '全部文章') + '（' + count + '）</h2>' + (count ? bulkPostForm(session,query) : '') + result +
    '</section><a href="/account/">返回我的账户</a>' + (count ? '<script>' + postSelectionScript + '</script>' : ''),session);
}
export function statusPage(title, detail, session) {
  return shell(title,'<section class="narrow"><h1>' + escape(title) + '</h1><p>' + escape(detail) + '</p><div class="actions"><a href="/account/">我的账户</a><a href="/">返回首页</a></div></section>',session);
}

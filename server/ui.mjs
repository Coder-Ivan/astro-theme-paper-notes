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
@media(max-width:38rem){main{padding-inline:.8rem}.bar{padding-inline:1rem}.brand{font-size:1.15rem}.actions{gap:.5rem}nav{gap:.6rem}.user select{max-width:12rem}}
` + avatarCss;
function shell(title, content, session) {
  const nav = (session?.canReadDiary ? '<a href="/diary/">日记</a>' : '') + (session?.isAdmin ? '<a href="/account/users">用户管理</a>' : '');
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
    '<div class="actions">' + (session.canReadDiary ? '<a class="button" href="/diary/">阅读日记</a>' : '') + (session.isAdmin ? '<a class="button secondary" href="/account/users">用户管理</a>' : '') +
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
export function statusPage(title, detail, session) {
  return shell(title,'<section class="narrow"><h1>' + escape(title) + '</h1><p>' + escape(detail) + '</p><div class="actions"><a href="/account/">我的账户</a><a href="/">返回首页</a></div></section>',session);
}

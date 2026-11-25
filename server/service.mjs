import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { accountKey, digest, editAccounts, parseAccounts, takeAttempt } from './storage.mjs';
import { avatarSvg, defaultAvatar, isAvatar } from './avatars.mjs';
import { createComments } from './comments.mjs';
import * as ui from './ui.mjs';

const derive = promisify(scrypt);
const random = (n = 24) => randomBytes(n).toString('base64url');
const week = 7 * 86400;
const sessionKey = token => 'auth/sessions/' + digest(token) + '.json';
const normalName = value => (value || '').trim().toLowerCase();
export const validName = value => /^[a-z0-9][a-z0-9._@-]{2,39}$/.test(value);
const reservedNames = new Set(['owner','admin','administrator']);
const dummy = {salt:'unavailable-account',hash:'00'.repeat(32)};
const derivePassword = async (password, salt) => Buffer.from(await derive(password, salt, 32, {N:32768,r:8,p:1,maxmem:64*1024*1024}));
export async function passwordData(password) {
  const salt = random(16);
  return {salt, hash:(await derivePassword(password, salt)).toString('hex')};
}
async function verifyPassword(password, data = dummy) {
  const actual = await derivePassword(password, data.salt);
  const expected = Buffer.from(data.hash,'hex');
  return actual.length === expected.length && timingSafeEqual(actual,expected);
}
export async function newAccount(name, password, level = 'member', isAdmin = false, avatar = defaultAvatar) {
  return {name, accountId:random(), password:await passwordData(password), level, isAdmin, avatar, revision:random(), createdAt:new Date().toISOString()};
}
const same = (a,b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b)));
function cookieToken(header, cookieName) {
  const value = (header || '').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName + '='))?.slice(cookieName.length+1);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}
const htmlType = 'text/html; charset=utf-8';
const jsonType = 'application/json; charset=utf-8';
const csp = "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; media-src 'self'; object-src 'none'";
function reply(status, body = '', type = htmlType, headers = {}) {
  return {status, body, headers:{'Content-Type':type,'Cache-Control':'private, no-store, max-age=0, must-revalidate',
    'CDN-Cache-Control':'no-store','Surrogate-Control':'no-store',Pragma:'no-cache', Vary:'Cookie',
    'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','X-Robots-Tag':'noindex, nofollow, noarchive',
    'Referrer-Policy':'same-origin','Content-Security-Policy':csp,...headers}};
}
const json = (status, data, headers) => reply(status,JSON.stringify(data),jsonType,headers);
const redirect = (location, extra = {}) => reply(303,'',htmlType,{Location:location,...extra});
function nextPath(raw, fallback = '/account/') {
  if (!raw || raw.length > 280 || /[\s\\]/.test(raw) || raw.includes('..') || raw.includes('//')) return fallback;
  if (/^\/(?:diary\/)?posts\/[a-z0-9-]+\/(?:#(?:comments|reply-[a-f0-9]{32}-[a-f0-9]{32}))?$/.test(raw)) return raw;
  if (!/^\/(?:account(?:\/(?:users)?)?|diary(?:\/[a-z0-9/_\-.]*)?)$/.test(raw)) return fallback;
  return raw;
}
function allowForm(request, origin) {
  return request.headers.origin === origin && request.headers['content-type']?.split(';')[0].trim().toLowerCase() === 'application/x-www-form-urlencoded';
}
function sessionView(user, csrf) {
  // Pre-comment accounts have no accountId. Their creation timestamp survives
  // password changes; a newly created account always gets a fresh random ID.
  const accountId = user.accountId ?? digest('legacy\n' + user.name + '\n' + user.createdAt);
  return {name:user.name,accountId,revision:user.revision,csrf,authenticated:true,avatar:isAvatar(user.avatar) ? user.avatar : defaultAvatar,
    canReadDiary:user.isAdmin || user.level === 'reader',isAdmin:user.isAdmin};
}
const anonymous = {authenticated:false, canReadDiary:false, isAdmin:false};
class FormError extends Error {}
const errorPage = (status,title,detail,session) => reply(status,ui.statusPage(title,detail,session));

export function createService(store, {origin, now = Date.now}) {
  const secure = new URL(origin).protocol === 'https:';
  const cookieName = secure ? '__Host-paper_session' : 'paper_notes_local';
  const cookie = (value, age) => cookieName + '=' + value + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + age + (secure ? '; Secure' : '');
  const comments = createComments(store,now,json);
  const directory = async () => parseAccounts(await store.read(accountKey));
  async function signIn(user, next) {
    const fresh = random(32);
    await store.put(sessionKey(fresh),Buffer.from(JSON.stringify({name:user.name,revision:user.revision,csrf:random(24),expires:now()+week*1000})));
    return redirect(next,{'Set-Cookie':cookie(fresh,week)});
  }
  async function register(form, next) {
    const name = normalName(form.get('username'));
    const password = form.get('password') || '';
    const avatar = form.get('avatar') ?? defaultAvatar;
    const failure = (status, detail, headers = {}) => reply(status,ui.register(name,avatar,detail,next),htmlType,headers);
    if (!validName(name)) return failure(400,'用户名须为 3 至 40 位字母、数字或 . _ @ -，并以字母或数字开头。');
    if (reservedNames.has(name)) return failure(409,'这个用户名不可用于注册。');
    if (password.length < 12 || password.length > 256) return failure(400,'请使用 12 至 256 位密码。');
    if (!isAvatar(avatar)) return failure(400,'请从预设头像中选择。');
    if (!await takeAttempt(store,name,now(),'register')) return failure(429,'注册尝试过多，请在 15 分钟后重试。',{'Retry-After':'900'});
    const user = await newAccount(name,password,'member',false,avatar);
    try {
      await editAccounts(store, accounts => {
        if (![...accounts.values()].some(account => account.isAdmin)) throw new Error('Account directory is not initialized');
        if (accounts.has(name)) throw new FormError('这个用户名已被使用，请换一个。');
        return user;
      });
    } catch (error) {
      if (error instanceof FormError) return failure(409,error.message);
      throw error;
    }
    // Registration has committed even if writing its first session fails.
    try { return await signIn(user,next); }
    catch { return redirect('/account/login?registered=1' + (next === '/account/' ? '' : '&next=' + encodeURIComponent(next))); }
  }
  async function getSession(token) {
    if (!token) return null;
    const bytes = await store.read(sessionKey(token));
    if (!bytes) return null;
    const record = JSON.parse(bytes);
    if (!(record.expires > now()) || !record.name) return null;
    const user = (await directory()).get(record.name);
    if (!user || user.level === 'disabled' || user.revision !== record.revision) return null;
    return sessionView(user, record.csrf);
  }
  async function privateFile(path) {
    const key = path.slice(1) + (path.endsWith('/') ? 'index.html' : '');
    if (!/^diary\/(?:[a-zA-Z0-9_.-]+\/)*[a-zA-Z0-9_.-]+$/.test(key) || key.includes('..')) return errorPage(404,'页面不存在','找不到这篇日记或附件。');
    const bytes = await store.readDiary(key);
    if (!bytes) return errorPage(404,'页面不存在','找不到这篇日记或附件。');
    if (key.startsWith('diary/media/')) {
      const ext = key.split('.').pop().toLowerCase();
      const mime = {png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',avif:'image/avif',
        mp3:'audio/mpeg',m4a:'audio/mp4',ogg:'audio/ogg',mp4:'video/mp4',webm:'video/webm'}[ext];
      return reply(200,bytes,mime || 'application/octet-stream',{'Content-Disposition':mime ? 'inline' : 'attachment',
        'Content-Security-Policy':"sandbox; default-src 'none'; frame-ancestors 'none'"});
    }
    if (key === 'diary/search.json') return reply(200,bytes.toString('utf8'),jsonType);
    if (!key.endsWith('/index.html')) return errorPage(404,'页面不存在','此地址没有可阅读的页面。');
    const html = bytes.toString('utf8');
    // The compiler emits inline scripts for article helpers and Mermaid in addition to external modules.
    const hashes = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)].filter(m=>! /\bsrc\s*=/.test(m[1]) && m[2])
      .map(m=>"'sha256-" + createHash('sha256').update(m[2]).digest('base64') + "'");
    return reply(200,html,htmlType,{'Content-Security-Policy':csp + "; script-src 'self' " + [...new Set(hashes)].join(' ')});
  }
  async function handle(request) {
    const url = new URL(request.path,'https://internal.invalid');
    const path = url.pathname;
    const commentsRoute = path === '/account/comments' || path.startsWith('/account/comments/');
    const method = request.method.toUpperCase();
    if (!['GET','HEAD','POST'].includes(method)) return reply(405,'',htmlType,{Allow:'GET, HEAD, POST'});
    if (path.startsWith('/account/avatars/')) {
      if (method === 'POST') return reply(405,'',htmlType,{Allow:'GET, HEAD'});
      const id = /^\/account\/avatars\/([a-z0-9-]+)\.svg$/.exec(path)?.[1];
      if (!isAvatar(id)) return reply(404,'','text/plain; charset=utf-8');
      return reply(200,avatarSvg(id),'image/svg+xml; charset=utf-8',{'Content-Security-Policy':"sandbox; default-src 'none'"});
    }
    if (method === 'POST' && !allowForm(request,origin)) {
      return commentsRoute ? json(403,{error:'请从本站页面提交。'}) : errorPage(403,'请求未通过验证','请从本站页面重新提交表单。');
    }
    if (method === 'POST' && Buffer.byteLength(request.body || '') > (commentsRoute ? 12288 : 4096)) {
      return commentsRoute ? json(413,{error:'评论过长。'}) : errorPage(403,'请求未通过验证','请从本站页面重新提交表单。');
    }
    const form = new URLSearchParams(method === 'POST' ? request.body : '');
    const token = cookieToken(request.headers.cookie, cookieName);
    const session = await getSession(token);
    if (commentsRoute) {
      if (method === 'POST' && session && !same(form.get('csrf'),session.csrf)) return json(403,{error:'登录状态已变更，请重新打开页面。'});
      return comments(method,url,form,session);
    }
    if (path === '/account/session' && method !== 'POST') {
      if (!session) return json(200,anonymous);
      const {authenticated,canReadDiary,isAdmin,avatar} = session;
      return json(200,{authenticated,canReadDiary,isAdmin,avatar});
    }
    if (path === '/account/register' || path === '/account/register/') {
      const next = nextPath(method === 'POST' ? form.get('next') : url.searchParams.get('next'));
      if (session) return redirect(next);
      return method === 'POST' ? register(form,next) : reply(200,ui.register('',defaultAvatar,'',next));
    }
    if (path === '/account/login') {
      const next = nextPath(method === 'POST' ? form.get('next') : url.searchParams.get('next'));
      if (method !== 'POST') return session ? redirect(next) : reply(200,ui.login(next,'',url.searchParams.get('registered') === '1'));
      const name = normalName(form.get('username')), pass = form.get('password') || '';
      if (!await takeAttempt(store,name.slice(0,40),now())) return reply(429,ui.login(next,'登录尝试过多，请在 15 分钟后重试。'),htmlType,{'Retry-After':'900'});
      const user = validName(name) && (await directory()).get(name);
      const valid = await verifyPassword(pass.length <= 256 ? pass : '',user?.password);
      if (!valid || !user || user.level === 'disabled') return reply(401,ui.login(next,'用户名或密码不正确，或账户已停用。'));
      return signIn(user,next);
    }
    const accountRoute = path === '/account' || path.startsWith('/account/');
    const diaryRoute = path === '/diary' || path.startsWith('/diary/');
    if (!accountRoute && !diaryRoute) return errorPage(404,'页面不存在','请检查链接或返回首页。');
    if (!session) {
      if (method === 'POST' || path === '/diary/search.json' || path.startsWith('/diary/media/')) return json(401,{authenticated:false});
      return redirect('/account/login?next=' + encodeURIComponent(nextPath(path)));
    }
    if (method === 'POST' && !same(form.get('csrf'),session.csrf)) return errorPage(403,'表单已失效','请重新打开页面后再试。',session);
    if (diaryRoute) {
      if (method === 'POST') return reply(405,'',htmlType,{Allow:'GET, HEAD'});
      if (!session.canReadDiary) return path === '/diary/search.json' || path.startsWith('/diary/media/') ? json(403,{canReadDiary:false}) : errorPage(403,'需要日记阅读权限','请联系站点管理员开通日记阅读权限。',session);
      return path === '/diary' ? redirect('/diary/') : privateFile(path);
    }
    if (path === '/account/logout' && method === 'POST') {
      await store.remove(sessionKey(token));
      return redirect('/',{'Set-Cookie':cookie('',0)});
    }
    if (path === '/account/avatar' && method === 'POST') {
      const avatar = form.get('avatar');
      if (!isAvatar(avatar)) return reply(400,ui.home(session,'请从预设头像中选择。',true));
      await editAccounts(store, accounts => {
        const user = accounts.get(session.name);
        if (!user || user.revision !== session.revision) throw new FormError('账户已变更，请重新登录。');
        return user.avatar === avatar ? null : {...user,avatar};
      });
      return redirect('/account/');
    }
    if (path === '/account/password' && method === 'POST') {
      const old = form.get('current') || '', updated = form.get('password') || '';
      if (updated.length < 12 || updated.length > 256 || updated === old) return reply(400,ui.home(session,'请使用与当前密码不同的 12 至 256 位新密码。',true));
      const user = (await directory()).get(session.name);
      if (!user || !await verifyPassword(old,user.password)) return reply(400,ui.home(session,'当前密码不正确。',true));
      const password = await passwordData(updated);
      await editAccounts(store, accounts => {
        const current = accounts.get(session.name);
        if (!current || current.revision !== session.revision) throw new FormError('账户已变更，请重新登录。');
        return {...current,password,revision:random()};
      });
      return redirect('/account/login',{'Set-Cookie':cookie('',0)});
    }
    if (path === '/account/users' || path === '/account/users/') {
      if (!session.isAdmin) return errorPage(403,'需要管理员权限','只有站点管理员可以管理用户。',session);
      if (method !== 'POST') return reply(200,ui.users(session,await directory()));
      const action = form.get('action'), name = normalName(form.get('username')), level = form.get('level');
      if (!validName(name)) return reply(400,ui.users(session,await directory(),'用户名须为 3 至 40 位字母、数字或 . _ @ -。',null,true));
      if (action === 'confirm-delete') return reply(200,ui.confirmDelete(session,name));
      const generated = ['create','reset'].includes(action) ? random(20) : '';
      const password = generated ? await passwordData(generated) : null;
      try {
        await editAccounts(store, accounts => {
          const owner = accounts.get(session.name);
          if (!owner?.isAdmin || owner.revision !== session.revision) throw new FormError('管理员会话已失效。');
          const current = accounts.get(name);
          if (action === 'create') {
            if (current) throw new FormError('这个用户名已被使用。');
            if (!['member','reader'].includes(level)) throw new FormError('请选择有效的权限。');
            return {name,accountId:random(),password,level,isAdmin:false,revision:random(),createdAt:new Date(now()).toISOString()};
          }
          if (!current || current.isAdmin) throw new FormError('此操作仅适用于现有普通用户。');
          if (action === 'reset') return {...current,password,revision:random()};
          if (action === 'delete') return {name,deleted:true};
          if (action === 'access' && ['member','reader','disabled'].includes(level)) return {...current,level,revision:level === 'disabled' ? random() : current.revision};
          throw new FormError('无效的用户管理操作。');
        });
      } catch (e) {
        if (!(e instanceof FormError)) throw e;
        return reply(409,ui.users(session,await directory(),e.message,null,true));
      }
      if (generated) return reply(200,ui.users(session,await directory(),action === 'create' ? '已创建用户。' : '已重置密码，原有会话已失效。',{name,password:generated}));
      return redirect('/account/users');
    }
    if ((path === '/account/' || path === '/account') && method !== 'POST') return reply(200,ui.home(session));
    return errorPage(404,'页面不存在','请检查链接或返回首页。',session);
  }
  return async request => {
    try {
      const result = await handle(request);
      if (request.method.toUpperCase() === 'HEAD') result.body = '';
      return result;
    } catch (error) {
      if (error instanceof FormError) return errorPage(409,'账户已变更',error.message);
      console.error('account-service',String(error.code || error.name || 'Unavailable').replace(/[^a-zA-Z0-9._-]/g,'').slice(0,70));
      if (request.path?.startsWith('/account/comments/')) return json(503,{error:'评论暂时无法加载，请稍后重试。'});
      return errorPage(503,'服务暂时不可用','请稍后再试。');
    }
  };
}

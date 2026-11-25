import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import config from '../theme.config.mjs';
import { createService } from './service.mjs';
import { accountKey, openStore, parseAccounts } from './storage.mjs';
import { buildReader, dataDirectory, openInside } from './files.mjs';

const mime = {
  html:'text/html; charset=utf-8', css:'text/css; charset=utf-8', js:'text/javascript; charset=utf-8',
  mjs:'text/javascript; charset=utf-8', json:'application/json; charset=utf-8', svg:'image/svg+xml',
  png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', webp:'image/webp', avif:'image/avif',
  gif:'image/gif', ico:'image/x-icon', woff:'font/woff', woff2:'font/woff2', ttf:'font/ttf', otf:'font/otf',
  wasm:'application/wasm', pdf:'application/pdf', mp3:'audio/mpeg', m4a:'audio/mp4', wav:'audio/wav',
  ogg:'audio/ogg', mp4:'video/mp4', webm:'video/webm', xml:'application/xml', txt:'text/plain; charset=utf-8',
};
const inlineMedia = new Set(['png','jpg','jpeg','webp','avif','gif','pdf','mp3','m4a','wav','ogg','mp4','webm']);
const privateHeaders = {'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff'};
const loopback = new Set(['127.0.0.1','localhost','[::1]','::1']);

export function createBlogServer({origin, store, publicDir}) {
  const canonical = new URL(origin);
  const handleAccount = createService(store, {origin: canonical.origin});
  return createServer({requestTimeout: 30000, headersTimeout: 15000}, async (req, res) => {
    try {
      if (req.headers.host !== canonical.host) {
        res.writeHead(421, privateHeaders).end('请使用此服务配置的站点地址。');
        return;
      }
      const raw = req.url.split('?', 1)[0];
      let path;
      try { path = decodeURIComponent(raw); } catch { res.writeHead(400, privateHeaders).end(); return; }
      if (!path.startsWith('/') || /[\\\x00-\x1f]/.test(path) || path.includes('//') ||
          path.split('/').some(part => part.startsWith('.')) || /%(?:2f|5c)/i.test(raw)) {
        res.writeHead(404, privateHeaders).end();
        return;
      }
      store.refresh();
      if (/^\/(?:account|diary)(?:\/|$)/.test(path)) {
        const chunks = [];
        let bytes = 0;
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > 16384) { res.writeHead(413, privateHeaders).end(); return; }
          chunks.push(chunk);
        }
        const reply = await handleAccount({method:req.method, path:req.url, headers:req.headers, body:Buffer.concat(chunks).toString('utf8')});
        res.writeHead(reply.status, reply.headers).end(req.method === 'HEAD' ? undefined : reply.body);
        return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) {
        res.writeHead(405, {...privateHeaders,Allow:'GET, HEAD'}).end();
        return;
      }
      const name = path.slice(1) + (path.endsWith('/') ? 'index.html' : '');
      let result = await openInside(publicDir, name);
      if (!result && !path.endsWith('/') && !extname(name)) {
        const index = await openInside(publicDir, name + '/index.html');
        if (index) {
          await index.file.close();
          res.writeHead(308, {Location:raw + '/' + req.url.slice(raw.length)}).end();
          return;
        }
      }
      if (!result) { res.writeHead(404, privateHeaders).end(); return; }
      const {file, size} = result;
      const ext = extname(name).slice(1).toLowerCase();
      const download = path.startsWith('/media/') && !inlineMedia.has(ext);
      res.writeHead(200, {
        'Content-Type':download ? 'application/octet-stream' : (mime[ext] || 'application/octet-stream'),
        'X-Content-Type-Options':'nosniff', 'Content-Length': size,
        'Cache-Control':path.startsWith('/_astro/') ? 'public, max-age=31536000, immutable' : 'no-cache',
        ...(download ? {'Content-Disposition':'attachment'} : {}),
      });
      if (req.method === 'HEAD') { await file.close(); res.end(); return; }
      await pipeline(file.createReadStream(), res);
    } catch (error) {
      if (res.headersSent) { res.destroy(); return; }
      console.error('Site request failed:', error.code || error.name);
      res.writeHead(503, {...privateHeaders,'Content-Type':'text/plain; charset=utf-8'}).end('服务暂时不可用，请检查服务日志和构建产物。');
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.umask(0o077);
  if (!config.services) throw new Error('Enable services in theme.config.mjs and rebuild before starting the account server.');
  const port = Number(process.env.PORT || 4321);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.');
  const host = process.env.HOST || '127.0.0.1';
  const origin = process.env.PUBLIC_ORIGIN || 'http://127.0.0.1:' + port;
  const site = new URL(origin);
  if (site.origin !== origin || (site.protocol !== 'https:' &&
      !(site.protocol === 'http:' && loopback.has(host) && loopback.has(site.hostname)))) {
    throw new Error('PUBLIC_ORIGIN must be the exact external HTTPS origin, or a loopback HTTP origin for local development.');
  }
  const publicDir = resolve('dist');
  const privateDir = resolve('dist-private');
  if (!existsSync(join(publicDir,'index.html')) || existsSync(join(publicDir,'diary'))) {
    throw new Error('Expected a completed public build with private diary files separated.');
  }
  const store = openStore(dataDirectory(), buildReader(publicDir, privateDir));
  store.refresh();
  if (![...parseAccounts(store.read(accountKey)).values()].some(account => account.isAdmin)) {
    store.close();
    throw new Error('Initialize the site owner first: node server/owner.mjs <username>');
  }
  const server = createBlogServer({origin, store, publicDir});
  server.listen(port, host, () => console.log('Paper Notes: ' + origin));
  server.on('close', () => store.close());
  for (const event of ['SIGTERM','SIGINT']) process.once(event, () => server.close());
}

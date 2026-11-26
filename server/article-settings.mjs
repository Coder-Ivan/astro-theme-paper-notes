import { statSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { dataDirectory } from './files.mjs';

const prefix = 'auth/article-settings/';
const actions = new Map([
  ['show',['hidden',false]], ['hide',['hidden',true]], ['pin',['pinned',true]], ['unpin',['pinned',false]],
]);

export const articleFormLimit = 1024 * 1024;
export const isArticleManagement = path => path === '/account/posts' || path === '/account/posts/';

export function articleAction(action) {
  const change = actions.get(action);
  if (!change) return null;
  const [field,value] = change;
  return {field,value};
}

export function applyArticleSettings(db, posts, {field,value}) {
  let changed = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    const overrides = storedSettings(db);
    const write = db.prepare('INSERT OR REPLACE INTO records(key, data, expires) VALUES (?, ?, NULL)');
    const data = Buffer.from(JSON.stringify(value));
    for (const post of posts) {
      if ((overrides[post.id]?.[field] ?? post[field]) !== value) {
        write.run(prefix + post.id + '/' + field, data);
        changed++;
      }
    }
    db.exec('COMMIT');
    return changed;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function storedSettings(db) {
  const settings = {};
  const rows = db.prepare('SELECT key, data FROM records WHERE key GLOB ?').all(prefix + '*');
  for (const row of rows) {
    const match = /^([a-f0-9]{32})\/(hidden|pinned)$/.exec(row.key.slice(prefix.length));
    const value = JSON.parse(Buffer.from(row.data).toString('utf8'));
    if (!match || typeof value !== 'boolean') throw new Error('Invalid saved article setting.');
    (settings[match[1]] ??= {})[match[2]] = value;
  }
  return settings;
}

// An initial services build can precede the one-time owner initialization.
export function readArticleSettings() {
  const filename = join(dataDirectory(), 'accounts.sqlite');
  try { statSync(filename); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
  const db = new DatabaseSync(filename, {readOnly:true});
  try { return storedSettings(db); } finally { db.close(); }
}

export function needsArticleBuild(catalog, settings) {
  return catalog.some(post => Object.entries(settings[post.id] || {}).some(([field,value]) => post[field] !== value));
}

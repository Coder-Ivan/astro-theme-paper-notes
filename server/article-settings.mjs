import { statSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { dataDirectory } from './files.mjs';

const prefix = 'auth/article-settings/';
const actions = new Map([
  ['show',['hidden',false]], ['hide',['hidden',true]], ['pin',['pinned',true]], ['unpin',['pinned',false]],
]);

export function settingChange(id, action) {
  const change = actions.get(action);
  if (!change || !/^[a-f0-9]{32}$/.test(id)) return null;
  return {key:prefix + id + '/' + change[0], field:change[0], value:change[1]};
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

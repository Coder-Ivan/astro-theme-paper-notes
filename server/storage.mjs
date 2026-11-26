import { createHash } from 'node:crypto';
import { storedSettings } from './article-settings.mjs';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const accountKey = 'auth/accounts.ndjson';
export const digest = value => createHash('sha256').update(value).digest('hex');

// Accounts, sessions and discussions live outside the web roots. A length-checked
// append gives concurrent edits one winner and lets the caller retry its projection.
export function openStore(directory, release) {
  mkdirSync(directory, {recursive: true, mode: 0o700});
  const db = new DatabaseSync(join(directory, 'accounts.sqlite'));
  db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS records (
      key TEXT PRIMARY KEY, data BLOB NOT NULL, expires INTEGER
    );
    CREATE INDEX IF NOT EXISTS records_expiry ON records(expires) WHERE expires IS NOT NULL;`);
  const get = db.prepare('SELECT data FROM records WHERE key = ?');
  const replace = db.prepare('INSERT OR REPLACE INTO records(key, data, expires) VALUES (?, ?, ?)');
  const extend = db.prepare('UPDATE records SET data = CAST(data || ? AS BLOB) WHERE key = ? AND length(data) = ?');
  const insert = db.prepare('INSERT OR IGNORE INTO records(key, data, expires) VALUES (?, ?, ?)');
  const remove = db.prepare('DELETE FROM records WHERE key = ?');
  const prune = db.prepare('DELETE FROM records WHERE expires <= ?');
  const discussionRows = db.prepare("SELECT key FROM records WHERE key GLOB 'auth/comments/threads/*'");
  let nextPrune = 0;
  let previousThreads;

  function refresh() {
    const now = Date.now();
    if (now >= nextPrune) {
      prune.run(now);
      nextPrune = now + 900000;
    }
    const threads = release.threads();
    if (previousThreads === threads) return threads;
    const liveIds = new Set([...Object.values(threads.public), ...Object.values(threads.diary), ...(threads.articles || []).map(post => post.id)]);
    // Keep histories separate on visibility moves; purge both when an article is deleted.
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const {key} of discussionRows.all()) {
        const id = key.slice(key.lastIndexOf('/') + 1, -'.ndjson'.length);
        if (!liveIds.has(id)) remove.run(key);
      }
      db.exec('COMMIT');
      previousThreads = threads;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return threads;
  }

  return {
    threads: refresh,
    articleSettings: () => storedSettings(db),
    readDiary: key => release.readDiary(key),
    refresh,
    close: () => db.close(),
    read(key) {
      const row = get.get(key);
      return row ? Buffer.from(row.data) : null;
    },
    put(key, data) {
      const expires = key.startsWith('auth/sessions/') ? JSON.parse(data.toString()).expires : null;
      replace.run(key, data, expires);
    },
    remove(key) { remove.run(key); },
    append(key, offset, data) {
      if (key.startsWith('auth/comments/threads/')) {
        const [, , , audience, filename] = key.split('/');
        const id = filename.slice(0, -'.ndjson'.length);
        const index = refresh()[audience === 'diary' ? 'diary' : 'public'];
        if (!Object.values(index).includes(id)) return false;
        if (audience === 'article' && storedSettings(db)[id]?.hidden) return false;
      }
      if (offset) return extend.run(data, key, offset).changes === 1;
      const rate = /^auth\/(?:attempts\/(?:register\/)?|comments\/limits\/)(\d+)\//.exec(key);
      const expires = rate ? (Number(rate[1]) + 2) * 900000 : null;
      return insert.run(key, data, expires).changes === 1;
    },
  };
}

export function parseAccounts(bytes) {
  const current = new Map();
  for (const line of (bytes?.toString('utf8') || '').trimEnd().split('\n')) {
    if (!line) continue;
    const event = JSON.parse(line);
    if (event.deleted) current.delete(event.name);
    else current.set(event.name, event);
  }
  return current;
}

export async function editAccounts(store, change) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const data = await store.read(accountKey);
    const event = change(parseAccounts(data));
    if (!event) return;
    const bytes = Buffer.from(JSON.stringify(event) + '\n');
    if (await store.append(accountKey, data?.length || 0, bytes)) return;
  }
  throw new Error('Account update conflict.');
}

// Both limits are shared by concurrent requests.
// The username hash is partitioned to bound key cardinality even for invented names.
export async function takeAttempt(store, name, now, purpose = 'login') {
  const window = Math.floor(now / 900000);
  const bucket = digest(name).slice(0, 2);
  const registering = purpose === 'register';
  const prefix = registering ? 'auth/attempts/register/' : 'auth/attempts/';
  for (const [group, limit] of [[bucket,registering ? 8 : 12], ['all',registering ? 60 : 120]]) {
    const key = prefix + window + '/' + group;
    let taken = false;
    for (let attempt = 0; attempt < 6; attempt++) {
      const bytes = await store.read(key);
      const length = bytes?.length || 0;
      if (length >= limit) return false;
      if (await store.append(key, length, Buffer.from('.'))) { taken = true; break; }
    }
    if (!taken) return false;
  }
  return true;
}

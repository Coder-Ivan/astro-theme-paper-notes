import { open, realpath } from 'node:fs/promises';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

const missing = error => error.code === 'ENOENT' || error.code === 'ENOTDIR';

export async function openInside(root, name) {
  if (!name || name.split('/').some(part => !part || part.startsWith('.') || /[\\\x00-\x1f:]/.test(part))) return null;
  let file;
  try {
    const base = await realpath(root);
    const target = await realpath(join(base, name));
    if (!target.startsWith(base + sep)) return null;
    file = await open(target, 'r');
    const info = await file.stat();
    if (info.isFile()) return {file, size: info.size};
    await file.close();
    return null;
  } catch (error) {
    await file?.close();
    if (missing(error)) return null;
    throw error;
  }
}

function articleSlugs(root) {
  try {
    return readdirSync(root, {withFileTypes:true})
      .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  } catch (error) {
    if (missing(error)) return [];
    throw error;
  }
}

export function buildReader(publicDir, privateDir) {
  const manifest = join(privateDir, 'threads.json');
  let previous;
  let current;
  return {
    threads() {
      const raw = readFileSync(manifest, 'utf8');
      if (raw === previous) return current;
      const next = JSON.parse(raw);
      const seen = new Set();
      for (const [key, dir] of [['public', join(publicDir,'posts')], ['diary', join(privateDir,'diary','posts')]]) {
        const entries = next?.[key];
        if (!entries || typeof entries !== 'object' || Array.isArray(entries)) throw new Error('Invalid discussion manifest.');
        for (const [slug, id] of Object.entries(entries)) {
          if (!/^[a-z0-9-]+$/.test(slug) || typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id) || seen.has(id)) {
            throw new Error('Invalid discussion identifier.');
          }
          seen.add(id);
        }
        if (JSON.stringify(Object.keys(entries).sort()) !== JSON.stringify(articleSlugs(dir))) {
          throw new Error('Build and discussion manifest differ; finish the build and restart the service.');
        }
      }
      previous = raw;
      current = next;
      return current;
    },
    async readDiary(key) {
      if (!/^diary\/(?:index\.html|search\.json|posts\/[a-z0-9-]+\/index\.html|media\/[a-f0-9]{64}(?:\.[a-z0-9]{1,16})?)$/.test(key)) return null;
      const result = await openInside(privateDir, key);
      if (!result) return null;
      try { return await result.file.readFile(); }
      finally { await result.file.close(); }
    },
  };
}

export function dataDirectory() {
  const dir = resolve(process.env.PAPER_NOTES_DATA_DIR || '.paper-notes');
  const cwd = resolve('.');
  if (dir === cwd || ['dist','dist-private','public','content','src'].some(name => {
    const root = join(cwd, name);
    return dir === root || dir.startsWith(root + sep);
  })) throw new Error('Set PAPER_NOTES_DATA_DIR to a private directory outside the site content and build paths.');
  return dir;
}

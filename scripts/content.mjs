import { createHash } from 'node:crypto';
import { readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { destinations } from './markdown-links.mjs';
import { stripPhotoLocation } from './image-metadata.mjs';

export const mediaTypes = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.avif': 'image/avif', '.pdf': 'application/pdf', '.zip': 'application/zip',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.ogg': 'audio/ogg', '.webm': 'video/webm', '.wav': 'audio/wav',
};
const digest = data => createHash('sha256').update(data).digest('hex');
const within = (root, file) => file.startsWith(root + path.sep);
const journalRoot = name => typeof name === 'string' && name.toLowerCase() === 'journal';
const mediaName = /^[a-f0-9]{64}\.[a-z0-9]+$/;

export async function readAttachment(filename) {
  const bytes = await readFile(filename);
  return /\.(?:png|jpe?g)$/i.test(filename) ? stripPhotoLocation(bytes) : bytes;
}

async function findMarkdown(dir) {
  const notes = [];
  for (const entry of await readdir(dir, {withFileTypes:true})) {
    if (entry.name.startsWith('.') || entry.name === '_resources' || entry.isSymbolicLink()) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) notes.push(...await findMarkdown(file));
    else if (entry.isFile() && /\.md$/i.test(entry.name)) notes.push(file);
  }
  return notes.sort();
}

function noteFrom(text, relative, imported, rootName) {
  text = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const front = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(text);
  if (!front && (imported || /^---[ \t]*\n/.test(text))) throw new Error('Missing or incomplete YAML front matter in ' + relative);
  const meta = front ? parseYaml(front[1]) : {};
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) throw new Error('Invalid front matter in ' + relative);
  const body = front ? text.slice(front[0].length).replace(/^\n/, '') : text;
  const filename = path.posix.basename(relative, path.posix.extname(relative));
  const title = String(meta.title ?? filename).trim();
  if (!title) throw new Error('Empty title in ' + relative);
  const name = filename.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-/, '').slice(0, 48).replace(/-$/, '') || 'note';
  const suffix = digest((imported ? 'joplin/' : 'content/') + relative).slice(0, 12);
  const slug = String(meta.slug ?? (name + '-' + suffix));
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 120) throw new Error('Invalid slug in ' + relative);
  const id = String(meta.id ?? digest('thread/' + slug).slice(0, 32));
  if (!/^[0-9a-f]{32}$/i.test(id)) throw new Error('Expected a 32-digit hexadecimal id in ' + relative);
  const directories = relative.split('/').slice(0, -1);
  const supplied = meta.notebookPath;
  if (supplied !== undefined && !(Array.isArray(supplied) && supplied.every(item => typeof item === 'string' && item.trim()))) {
    throw new Error('notebookPath must be a list of notebook names in ' + relative);
  }
  // A path on disk under Journal can never be made public by its front matter.
  let notebookPath = supplied ?? directories;
  if (journalRoot(directories[0])) notebookPath = ['Journal', ...directories.slice(1)];
  else if (journalRoot(rootName) || journalRoot(notebookPath[0])) {
    notebookPath = ['Journal', ...(journalRoot(notebookPath[0]) ? notebookPath.slice(1) : notebookPath)];
  }
  const iso = value => {
    if (value == null || value === '') return '';
    const time = Date.parse(String(value));
    if (!Number.isFinite(time)) throw new Error('Invalid date in ' + relative);
    return new Date(time).toISOString();
  };
  if (meta.tags !== undefined && !(Array.isArray(meta.tags) && meta.tags.every(tag => typeof tag === 'string'))) {
    throw new Error('tags must be a list of names in ' + relative);
  }
  for (const field of ['hidden', 'pinned']) {
    if (meta[field] !== undefined && typeof meta[field] !== 'boolean') {
      throw new Error(field + ' must be true or false in ' + relative);
    }
  }
  return { id:id.toLowerCase(), slug, title, created:iso(meta.created ?? meta.date), updated:iso(meta.updated),
    tags:meta.tags ?? [], notebookPath, body, hidden:meta.hidden ?? false, pinned:meta.pinned ?? false };
}

export async function readNotebook(directory, {imported = false} = {}) {
  const root = await realpath(directory);
  const files = await findMarkdown(root);
  const notes = new Map();
  const assets = new Map();
  const staged = new Map();
  for (const file of files) {
    const relative = path.relative(root, file).split(path.sep).join('/').normalize('NFC');
    const key = file.normalize('NFC');
    if (notes.has(key)) throw new Error('Duplicate normalized note path: ' + relative);
    notes.set(key, noteFrom(await readFile(file, 'utf8'), relative, imported, path.basename(root)));
  }
  const notesById = new Map([...notes.values()].map(note => [note.id, note]));
  async function rewrite(from, note, url) {
    if (/^(?:https?:|mailto:|tel:|\/\/|#|\?|$)/i.test(url)) return url;
    const noteId = /^:\/([a-f0-9]{32})([?#].*)?$/i.exec(url);
    if (noteId) {
      const target = notesById.get(noteId[1].toLowerCase());
      if (target) return (target.notebookPath[0] === 'Journal' ? '/diary' : '') + '/posts/' + target.slug + '/' + (noteId[2] || '');
    }
    if (/^\/(?:Users|home|Volumes|private)\//.test(url) || /^(?:[a-z][a-z0-9+.-]*:|:\/|\\)/i.test(url)) {
      throw new Error('Unresolved or non-portable URL; export the linked notes and resources together.');
    }
    if (url.startsWith('/')) return url;
    const cut = url.search(/[?#]/);
    const local = cut < 0 ? url : url.slice(0, cut);
    const tail = cut < 0 ? '' : url.slice(cut);
    const decoded = decodeURIComponent(local);
    if (decoded.includes('\\') || decoded.includes('\0')) throw new Error('Invalid relative path.');
    const target = path.resolve(path.dirname(from), decoded);
    if (!within(root, target)) throw new Error('Relative link points outside the notebook: ' + url);
    const other = notes.get(target.normalize('NFC'));
    if (other) {
      if (other.notebookPath[0] === 'Journal') return '/diary/posts/' + other.slug + '/' + tail;
      return '/posts/' + other.slug + '/' + tail;
    }
    const segments = path.relative(root, target).split(path.sep);
    const ext = path.extname(target).toLowerCase();
    if (!segments.includes('_resources') || !Object.hasOwn(mediaTypes, ext)) throw new Error('Missing linked note or unsupported attachment: ' + url);
    if (journalRoot(segments[0]) && note.notebookPath[0] !== 'Journal') return '/diary/';
    let actual;
    try {actual = await realpath(target);} catch {throw new Error('Missing attachment: ' + url);}
    if (actual !== target) throw new Error('Attachments must be regular files within the notebook.');
    let hashName = staged.get(actual);
    if (!hashName) {
      hashName = digest(await readAttachment(actual)) + ext;
      staged.set(actual, hashName);
      assets.set(hashName, actual);
    }
    return '/media/' + hashName + tail;
  }
  for (const name of files) {
    const note = notes.get(name.normalize('NFC'));
    try {
      for (const {start, end, url, alt} of destinations(note.body)) {
        const next = await rewrite(name, note, url);
        if (next === url && alt === undefined) continue;
        const text = alt === undefined ? next : '![' + alt.replace(/[\\\[\]]/g, '\\$&') + '](<' + next.replace(/[<>\s]/g, encodeURIComponent) + '>)';
        note.body = note.body.slice(0, start) + text + note.body.slice(end);
      }
    } catch (e) { throw new Error(path.relative(root, name) + ': ' + e.message); }
  }
  const result = [...notes.values()];
  uniqueNotes(result);
  return {notes:result, assets};
}

function uniqueNotes(notes) {
  const ids = new Set();
  const slugs = new Set();
  for (const note of notes) {
    if (slugs.has(note.slug) || ids.has(note.id)) throw new Error('Duplicate article slug or id: ' + note.slug);
    slugs.add(note.slug);
    ids.add(note.id);
  }
}

export function importedDirectory() {
  return path.resolve('.paper-notes/imported');
}

export async function readContent() {
  const local = await readNotebook(path.resolve('content'));
  let imported;
  try { imported = JSON.parse(await readFile(path.join(importedDirectory(), 'notes.json'), 'utf8')); }
  catch (e) {if (e.code === 'ENOENT') return local; throw e;}
  if (imported.version !== 1 || !Array.isArray(imported.notes) || !Array.isArray(imported.assets)) {
    throw new Error('Unrecognized import. Repeat npm run import:joplin with a Markdown + Front Matter export.');
  }
  for (const name of imported.assets) {
    if (!mediaName.test(name)) throw new Error('Invalid imported attachment name.');
    local.assets.set(name, path.join(importedDirectory(), 'media', name));
  }
  local.notes.push(...imported.notes);
  uniqueNotes(local.notes);
  return local;
}

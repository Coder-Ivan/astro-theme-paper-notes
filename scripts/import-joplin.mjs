import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { importedDirectory, readAttachment, readNotebook } from './content.mjs';

async function importNotes(source) {
  const incoming = await readNotebook(path.resolve(source), {imported:true});
  if (!incoming.notes.length) throw new Error('Export contains no Markdown notes.');
  const authored = await readNotebook(path.resolve('content'));
  const ids = new Set(authored.notes.map(note => note.id));
  const slugs = new Set(authored.notes.map(note => note.slug));
  if (incoming.notes.some(note => ids.has(note.id) || slugs.has(note.slug))) {
    throw new Error('A Joplin note has the same id or slug as a note in content/.');
  }
  const dir = importedDirectory();
  const mediaDir = path.join(dir, 'media');
  await mkdir(mediaDir, {recursive:true, mode:0o700});
  // Immutable resources are installed first. A failed or competing import never
  // leaves the active manifest pointing to a half-written file.
  for (const [name, file] of incoming.assets) {
    const tmp = path.join(mediaDir, randomUUID() + '.tmp');
    try {
      const bytes = await readAttachment(file);
      if (createHash('sha256').update(bytes).digest('hex') !== name.split('.')[0]) {
        throw new Error('An attachment changed during import. Retry after the export finishes.');
      }
      await writeFile(tmp, bytes, {mode:0o600, flag:'wx'});
      await rename(tmp, path.join(mediaDir, name));
    } finally {await rm(tmp, {force:true});}
  }
  const tmp = path.join(dir, randomUUID() + '.tmp');
  try {
    await writeFile(tmp, JSON.stringify({version:1, notes:incoming.notes, assets:[...incoming.assets.keys()]})+'\n', {flag:'wx',mode:0o600});
    await rename(tmp, path.join(dir, 'notes.json'));
  } finally {await rm(tmp, {force:true});}
  console.log('Imported ' + incoming.notes.length + ' notes and ' + incoming.assets.size + ' referenced attachments.');
}
if (process.argv.length !== 3) {
  console.error('Usage: npm run import:joplin -- <Markdown + Front Matter export directory>');
  process.exitCode = 1;
} else {
  importNotes(process.argv[2]).catch(e => {console.error(e.message);process.exitCode = 1;});
}

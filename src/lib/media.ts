import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import config from '../../theme.config.mjs';
import { assets } from './journal.ts';
import { readAttachment, mediaTypes } from '../../scripts/content.mjs';
import { ELEMENT_NODE, parse, type Node } from 'ultrahtml';
import type { JournalPost } from './journal.ts';

const origin = new URL(config.site || 'https://example.invalid');

// Copy only attachments used by an actual link or image in this audience's
// rendered pages. A private image linked from a redacted note label stays private.
export function attachmentNames(collection: JournalPost[], prefix: string) {
  const names = new Set<string>();
  function collect(node: Node) {
    if (node.type !== ELEMENT_NODE) return;
    const raw = node.name === 'a' ? node.attributes.href : node.name === 'img' ? node.attributes.src : '';
    if (raw && /^(?:\/|https?:\/\/)/i.test(raw)) {
      const url = URL.parse(raw, origin);
      if (url?.host === origin.host && url.pathname.startsWith(prefix)) {
        const name = url.pathname.slice(prefix.length);
        if (/^[a-f0-9]{64}(?:\.[a-z0-9]{1,16})?$/.test(name)) names.add(name);
      }
    }
    node.children.forEach(collect);
  }
  for (const post of collection) parse(post.html).children.forEach(collect);
  return [...names].sort().map(name => ({ params: { name } }));
}

export async function attachmentResponse(name: string) {
  if (!/^[a-f0-9]{64}(?:\.[a-z0-9]{1,16})?$/.test(name)) throw new Error('附件名称无效。');
  const filename = assets.get(name);
  if (!filename) return new Response(null, {status: 404});
  const bytes = await readAttachment(filename);
  if (createHash('sha256').update(bytes).digest('hex') !== name.split('.')[0]) {
    throw new Error('An attachment changed during rendering. Rebuild from the updated content.');
  }
  return new Response(bytes, {
    headers: { 'Content-Type': mediaTypes[extname(name)] || 'application/octet-stream' },
  });
}

import { parse, postprocess, preprocess } from 'micromark';
import { decodeString } from 'micromark-util-decode-string';

function normalizeLabel(label) {
  return label.trim().replace(/[\t\n\r ]+/g, ' ').toLowerCase().toUpperCase();
}

// Token offsets let us change just the URL, retaining the author's Markdown,
// including code examples, tables, link titles and math delimiters.
export function destinations(body) {
  const events = postprocess(parse().document().write(preprocess()(body, 'utf8', true)));
  const changes = [];
  const references = new Set();
  const definitions = new Map();
  const links = [];
  let definitionLabel;
  for (const [event, token] of events) {
    const { type, start, end } = token;
    if (event === 'exit') {
      if (type === 'link' || type === 'image') {
        const link = links.pop();
        if (!link.inline) {
          const key = normalizeLabel(link.reference || link.label || '');
          references.add(key);
        }
      }
      continue;
    }
    const raw = () => body.slice(start.offset, end.offset);
    const span = () => ({ start: start.offset, end: end.offset, url: decodeString(raw()) });
    if (type === 'link' || type === 'image') links.push({});
    else if (type === 'labelText' && links.length) links.at(-1).label = raw();
    else if (type === 'referenceString' && links.length) links.at(-1).reference = raw();
    else if (type === 'resource' && links.length) links.at(-1).inline = true;
    else if (type === 'resourceDestinationString') changes.push(span());
    else if (type === 'definitionLabelString') definitionLabel = normalizeLabel(raw());
    else if (type === 'definitionDestinationString' && !definitions.has(definitionLabel)) {
      definitions.set(definitionLabel, span());
    } else if (type === 'htmlText' || type === 'htmlFlow') {
      // Joplin emits an HTML img for resized images. Translate standalone tags
      // to Markdown so the renderer can keep arbitrary raw HTML disabled.
      const anchor = /^<a\s+href=(["'])([^"'<>]+)\1(?:\s+target=(["'])_[a-z]+\3)?\s*>$/i.exec(raw());
      if (anchor) {
        const offset = start.offset + anchor[0].indexOf(anchor[1]) + 1;
        changes.push({start:offset, end:offset + anchor[2].length, url:decodeString(anchor[2])});
        continue;
      }
      const tag = /^<img\b((?:"[^"]*"|'[^']*'|[^'">])*)\/?>$/i.exec(raw().trim());
      if (!tag) continue;
      const attrs = new Map();
      for (const m of tag[1].matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
        attrs.set(m[1].toLowerCase(), decodeString(m[2] ?? m[3] ?? m[4]));
      }
      if (attrs.has('src')) {
        changes.push({ start: start.offset, end: end.offset, url: attrs.get('src'), alt: attrs.get('alt') || '' });
      }
    }
  }
  for (const ref of references) {
    if (definitions.has(ref)) changes.push(definitions.get(ref));
  }
  return changes.sort((a, b) => b.start - a.start);
}

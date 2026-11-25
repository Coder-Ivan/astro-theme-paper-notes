import { decodeString } from 'micromark-util-decode-string';
import { ELEMENT_NODE, TEXT_NODE, parse, type DocumentNode, type Node } from 'ultrahtml';
import { diaryDate } from './diary.ts';
import { diaryPosts, isDiary, posts, postUrl, type JournalPost } from './journal.ts';
import type { SearchDocument } from './search.ts';

const omitted = new Set(['script', 'style', 'template', 'noscript', 'annotation', 'svg']);
const blocks = new Set(['p', 'div', 'pre', 'blockquote', 'br', 'li', 'hr', 'dt', 'dd', 'td', 'th',
  'caption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const publishedDay = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
});

// Read only rendered text nodes. Inline markup keeps the words on either side joined.
function visibleText(html: string): string {
  const parts: string[] = [];
  function visit(node: Node) {
    if (node.type === TEXT_NODE) {
      parts.push(node.value.replace(/&(?:#[0-9]+|#x[\da-f]+|[a-z][\da-z]+);/gi, entity => decodeString(entity)));
      return;
    }
    if (node.type !== ELEMENT_NODE) return;
    const attrs = node.attributes;
    if (omitted.has(node.name) || 'hidden' in attrs || attrs['aria-hidden'] === 'true') return;
    const block = blocks.has(node.name);
    if (block) parts.push(' ');
    node.children.forEach(visit);
    if (block) parts.push(' ');
  }
  const tree: DocumentNode = parse(html);
  tree.children.forEach(visit);
  return parts.join('').replace(/\s+/gu, ' ').trim();
}

function documentFor(post: JournalPost): SearchDocument {
  const diary = isDiary(post);
  const created = new Date(post.created);
  const date = diary ? diaryDate(post) : Number.isFinite(created.getTime()) ? publishedDay.format(created) : '';
  return {
    title: post.title, url: postUrl(post), kind: diary ? 'diary' : 'article', date,
    category: diary ? '' : post.notebookPath?.[0] || '', tags: diary ? [] : post.tags,
    text: visibleText(post.html),
  };
}

export const searchIndexJson = JSON.stringify(posts.map(documentFor));
export const diaryIndexJson = JSON.stringify(diaryPosts.map(documentFor));
export const searchIndexUrl = '/assets/search.json';

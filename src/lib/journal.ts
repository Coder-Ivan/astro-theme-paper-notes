import { createHash } from 'node:crypto';
import MarkdownIt, { type Token } from 'markdown-it';
import { codeLanguageId } from './code-languages.mjs';
import { highlightCode } from './code-highlight.mjs';
import { katex } from '@mdit/plugin-katex';
import GithubSlugger from 'github-slugger';
import config from '../../theme.config.mjs';
import { readContent } from '../../scripts/content.mjs';
import { readArticleSettings } from '../../server/article-settings.mjs';

const { notes: source, assets } = await readContent();
export { assets };

interface ExportedPost {
  id: string;
  slug: string;
  title: string;
  created: string;
  updated: string;
  tags: string[];
  notebookPath?: string[];
  hidden?: boolean;
  pinned?: boolean;
  body: string;
}

export interface JournalPost extends ExportedPost {
  cover?: { src: string; alt: string };
  excerpt: string;
  headings: { id: string; title: string; level: number }[];
  hasMermaid: boolean;
  html: string;
}

const md = new MarkdownIt({ html: false, breaks: true, linkify: true, typographer: false });
md.use(katex, { throwOnError: false, trust: false, output: 'htmlAndMathml' });

// Joplin clippings sometimes contain these inline tags inside ordinary Markdown.
md.inline.ruler.before('html_inline', 'joplin-inline', (state, silent) => {
  if (state.src[state.pos] !== '<') return false;
  const remaining = state.src.slice(state.pos, state.posMax);
  const br = /^<br\s*\/?\s*>/i.exec(remaining);
  const anchor = /^<a\s+id=(["'])([^"'<>\s]+)\1\s*>\s*<\/a>/i.exec(remaining);
  const link = /^<a\s+href=(["'])([^"'<>]+)\1(?:\s+target=(["'])_[a-z]+\3)?\s*>([^<>\n]+)<\/a>/i.exec(remaining);
  const match = br || anchor || link;
  if (!match) return false;
  let href = link ? md.normalizeLink(md.utils.unescapeAll(link[2])) : '';
  const internal = /^:\/([a-f0-9]{32})([?#].*)?$/i.exec(href);
  const target = internal && notesById.get(internal[1].toLowerCase());
  if (internal && target) href = postUrl(target) + (internal[2] || '');
  if (link && !md.validateLink(href)) return false;
  if (!silent) {
    if (br) {
      state.push('hardbreak', 'br', 0);
    } else if (anchor) {
      state.push('span_open', 'span', 1).attrSet('id', md.utils.unescapeAll(anchor[2]));
      state.push('span_close', 'span', -1);
    } else if (link) {
      state.push('link_open', 'a', 1).attrSet('href', href);
      state.push('text', '', 0).content = md.utils.unescapeAll(link[4]);
      state.push('link_close', 'a', -1);
    }
  }
  state.pos += match[0].length;
  return true;
});

const defaultImage = md.renderer.rules.image;
md.renderer.rules.image = (tokens, index, options, env, self) => {
  const token = tokens[index];
  const src = String(token.attrGet('src') || '');
  if (/^(?:https?:)?\/\//i.test(src)) token.attrSet('referrerpolicy', 'no-referrer');
  token.attrSet('decoding', 'async');
  return defaultImage(tokens, index, options, env, self);
};

function fenceLanguage(info: string) {
  return md.utils.unescapeAll(info).trim().split(/\s+/,1)[0].toLowerCase();
}

const renderCode: NonNullable<typeof md.renderer.rules.fence> = (tokens, index, _options, env) => {
  const token = tokens[index];
  const name = fenceLanguage(token.info);
  if (name === 'mermaid') {
    return '<pre class="mermaid">' + md.utils.escapeHtml(token.content) + '</pre>\n';
  }
  const declared = codeLanguageId(name);
  const { html, language } = highlightCode(token.content, declared || 'auto');
  const digest = createHash('sha256').update(token.content).digest('hex').slice(0,24);
  // Identical snippets can occur twice in one article and have separate reader preferences.
  const occurrence = (env.codeOccurrences.get(digest) || 0) + 1;
  env.codeOccurrences.set(digest, occurrence);
  const blockKey = digest + '-' + occurrence;
  // Markdown terminates the last source line with a newline, including blank lines.
  const lineCount = token.content.replace(/\n$/, '').split('\n').length;
  const numbers = Array.from({ length: lineCount }, (_, i) => i + 1).join('\n');
  return '<div class="code-block" data-code-block="' + blockKey +
    '" data-language="' + language + '" data-source="' + (declared ? 'explicit' : 'auto') +
    '"><span class="code-line-numbers" id="code-lines-' + blockKey + '" aria-hidden="true" data-lines="' + numbers +
    '"></span><pre><code class="hljs language-' + language + '">' + html + '</code></pre></div>\n';
};
md.renderer.rules.fence = renderCode;
md.renderer.rules.code_block = renderCode;

function inlineText(tokens: Token[], includeEmbeds = false): string {
  return tokens.map(token => {
    if (token.type === 'text' || token.type === 'code_inline') return token.content;
    if (includeEmbeds && (token.type === 'image' || token.type === 'math_inline')) return token.content;
    if (token.type === 'softbreak' || token.type === 'hardbreak') return ' ';
    return '';
  }).join('').trim();
}

function outlineHeadings(tokens: Token[]): JournalPost['headings'] {
  const slugger = new GithubSlugger();
  const reserved = new Set(['top', 'main', 'comments', 'comments-title', 'comment-body', 'comment-length', 'profile-name',
    ...['dialog', 'query', 'close', 'results', 'more', 'retry'].map(name => 'site-search-' + name)]);
  const pending = [];
  for (const [index, token] of tokens.entries()) {
    for (const child of token.children ?? []) {
      const anchor = child.attrGet('id');
      if (typeof anchor === 'string' && anchor) reserved.add(anchor);
    }
    if (token.type !== 'heading_open') continue;
    const children = tokens[index + 1]?.children ?? [];
    // Preserve Markdown's original fragments, including the suffixes for duplicate headings.
    const id = slugger.slug(inlineText(children));
    token.attrSet('id', id);
    const title = inlineText(children, true);
    if (title) pending.push({token, id, title});
  }
  const occupied = new Set([...reserved, ...pending.map(item => item.id)]);
  return pending.map(({token, id, title}, index) => {
    if (!id || reserved.has(id)) {
      const base = 'section-' + (index + 1);
      id = base;
      let suffix = 2;
      while (occupied.has(id)) id = base + '-' + suffix++;
      occupied.add(id);
      token.attrSet('id', id);
    }
    token.attrSet('tabindex', '-1');
    return {id, title, level: Number(token.tag.slice(1))};
  });
}

const overrides = config.services ? readArticleSettings() : {};
const notes: ExportedPost[] = source.map((note: ExportedPost) => isDiary(note)
  ? { ...note, hidden: false, pinned: false }
  : { ...note, ...overrides[note.id] });
export const articleCatalog = notes.filter(note => !isDiary(note)).map(note => ({
  id: note.id, slug: note.slug, title: note.title, category: note.notebookPath?.[0] ?? '',
  hidden: note.hidden ?? false, pinned: note.pinned ?? false,
}));
const notesById = new Map(notes.map(note => [note.id, note]));
const hiddenSlugs = new Set(notes.filter(note => note.hidden).map(note => note.slug));
const diarySlugs = new Set(notes.filter(isDiary).map(note => note.slug));
const siteOrigin = new URL(config.site || 'https://example.invalid').origin;

function restrictLinks(tokens: Token[], diary: boolean) {
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const attribute = token.type === 'link_open' ? 'href' : token.type === 'image' ? 'src' : '';
    const raw = attribute && token.attrGet(attribute);
    if (typeof raw === 'string' && /^(?:\/|https?:\/\/)/i.test(raw)) {
      const url = URL.parse(raw, siteOrigin);
      if (url && url.host === new URL(siteOrigin).host) {
        // URL path segments can spell ASCII slug characters with percent escapes.
        const path = url.pathname.replace(/%([0-9a-f]{2})/gi, (original, code) => {
          const character = String.fromCharCode(parseInt(code, 16));
          return /[a-z0-9.-]/i.test(character) ? character : original;
        });
        const slug = /^\/(?:diary\/)?posts\/([a-z0-9-]+)(?:\/index\.html|\/)?$/.exec(path)?.[1];
        const hiddenPost = slug && hiddenSlugs.has(slug);
        const privatePost = slug && diarySlugs.has(slug);
        if (hiddenPost || (!diary && (privatePost || path === '/diary' || path.startsWith('/diary/')))) {
          // A Joplin note link normally uses the target's title as its label.
          if (token.type === 'link_open') {
            const end = tokens.findIndex((next, n) => n > i && next.type === 'link_close');
            if (end < 0) throw new Error('文章中的内部链接格式无效。');
            tokens.splice(i + 1, end - i);
          }
          token.type = 'text';
          token.tag = '';
          token.nesting = 0;
          token.attrs = null;
          token.children = null;
          token.content = hiddenPost ? '未公开文章' : '受限日记';
        } else if (privatePost) {
          token.attrSet(attribute, '/diary/posts/' + slug + '/' + url.search + url.hash);
        } else if (diary && /^\/media\/[a-f0-9]{64}(?:\.[a-z0-9]{1,16})?$/.test(url.pathname)) {
          token.attrSet(attribute, '/diary' + url.pathname + url.search + url.hash);
        }
      }
    }
    if (token.children) {
      restrictLinks(token.children, diary);
      if (token.type === 'image') {
        token.content = md.renderer.renderInlineAsText(token.children, md.options, {});
      }
    }
  }
}

function preparePost(post: ExportedPost): JournalPost {
  const env = { slug: post.slug, codeOccurrences:new Map<string, number>() };
  const tokens = md.parse(post.body, env);
  restrictLinks(tokens, isDiary(post));
  let cover: JournalPost['cover'];
  let excerpt = '';
  let hasMermaid = false;
  const headings = outlineHeadings(tokens);

  tokens.forEach((token, index) => {
    const children = token.children || [];
    if (!excerpt && token.type === 'inline' && tokens[index - 1]?.type === 'paragraph_open') {
      excerpt = inlineText(children);
    }
    if (!cover) {
      for (const child of children) {
        if (child.type !== 'image') continue;
        const src = child.attrGet('src');
        if (typeof src === 'string' && src.startsWith('/')) {
          cover = { src, alt: child.content };
          break;
        }
      }
    }
    if (token.type === 'fence' && fenceLanguage(token.info) === 'mermaid') hasMermaid = true;
  });

  return { ...post, cover, excerpt, headings, hasMermaid, html: md.renderer.render(tokens, md.options, env) };
}

const allPosts: JournalPost[] = notes.filter(post => !post.hidden).map(preparePost).sort((a: JournalPost, b: JournalPost) =>
  (Date.parse(b.created) || 0) - (Date.parse(a.created) || 0) || a.title.localeCompare(b.title, 'zh-CN')
);

export function isDiary(post: Pick<JournalPost, 'notebookPath'>): boolean {
  return post.notebookPath?.[0] === 'Journal';
}

export const diaryPosts = allPosts.filter(isDiary);
export const posts = allPosts.filter(post => !isDiary(post));
export const feedPosts = [...posts.filter(post => post.pinned), ...posts.filter(post => !post.pinned)];

export function postUrl(post: Pick<ExportedPost, 'slug' | 'notebookPath'>): string {
  return (isDiary(post) ? '/diary/posts/' : '/posts/') + encodeURIComponent(post.slug) + '/';
}

export function postPaths(collection: JournalPost[]) {
  return collection.map((post, index) => ({
    params: { slug: post.slug },
    props: { post, older: collection[index + 1], newer: collection[index - 1] },
  }));
}

export const tags = [...new Set(posts.flatMap(post => post.tags))].sort((a, b) => a.localeCompare(b, 'zh-CN'));

export function dateLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Shanghai'
  }).format(date);
}

export const pageSize = 10;
export const pageCount = Math.max(1, Math.ceil(posts.length / pageSize));

export function pageUrl(page: number): string {
  return page === 1 ? '/' : `/page/${page}/`;
}

export function notebookAnchor(path: string[]): string {
  return 'book-' + Buffer.from(JSON.stringify(path), 'utf8').toString('base64url');
}

export const notebooks = new Map<string, { articles: JournalPost[]; legacyAnchors: Set<string> }>();
export const years = new Map<string, JournalPost[]>();
const yearFormatter = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', timeZone: 'Asia/Shanghai' });
for (const post of posts) {
  const path = post.notebookPath;
  if (path?.[0]) {
    const root = path[0];
    let group = notebooks.get(root);
    if (!group) {
      group = { articles: [], legacyAnchors: new Set() };
      notebooks.set(root, group);
    }
    group.articles.push(post);
    // Existing links to a nested notebook now land at its top-level category.
    if (path.length > 1) group.legacyAnchors.add(notebookAnchor(path));
  }
  const created = new Date(post.created);
  const year = Number.isFinite(created.getTime()) ? yearFormatter.format(created).replace(/年$/, '') : '日期未记录';
  if (!years.has(year)) years.set(year, []);
  years.get(year)!.push(post);
}
export const sortedNotebooks = [...notebooks].sort(([a], [b]) => a.localeCompare(b, 'zh-CN'));

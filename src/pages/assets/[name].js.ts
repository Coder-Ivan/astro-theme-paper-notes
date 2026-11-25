import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { diaryPosts, posts } from '../../lib/journal.ts';

export function getStaticPaths() {
  return [...posts, ...diaryPosts].some(post => post.hasMermaid) ? [{ params: { name: 'mermaid.min' } }] : [];
}

export async function GET() {
  const require = createRequire(import.meta.url);
  const script = await readFile(require.resolve('mermaid/dist/mermaid.min.js'), 'utf8');
  return new Response(script, { headers: { 'Content-Type': 'application/javascript' } });
}

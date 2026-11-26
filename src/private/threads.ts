import { articleCatalog, posts, diaryPosts, type JournalPost } from '../lib/journal.ts';
const mapThreads = (notes: JournalPost[]) => Object.fromEntries(notes.map(({slug, id}) => [slug, id]));
export function GET() {
  return Response.json({public:mapThreads(posts), diary:mapThreads(diaryPosts), articles:articleCatalog});
}

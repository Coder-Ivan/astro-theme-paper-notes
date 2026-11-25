import { diaryIndexJson } from '../lib/search-index.ts';

export function GET() {
  return new Response(diaryIndexJson, { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

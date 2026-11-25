import { searchIndexJson } from '../../lib/search-index.ts';

export function GET() {
  return new Response(searchIndexJson, { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

export interface SearchDocument {
  title: string;
  url: string;
  kind: 'article' | 'diary';
  date: string;
  category: string;
  tags: string[];
  text: string;
}

function termsFor(query: string): string[] {
  return [...new Set(query.trim().toLowerCase().split(/\s+/u).filter(Boolean))];
}

function literal(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function excerpt(text: string, matchIndex: number): string {
  if (text.length <= 110) return text;
  let start = Math.max(0, matchIndex - 24);
  let end = Math.min(start + 110, text.length);
  // Keep UTF-16 surrogate pairs together at either end of a snippet.
  if (start && /[\uDC00-\uDFFF]/.test(text[start])) start--;
  if (end < text.length && /[\uDC00-\uDFFF]/.test(text[end])) end++;
  return (start ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

export function searchDocuments(documents: SearchDocument[], query: string, limit = 30) {
  const terms = termsFor(query);
  const patterns = terms.map(term => new RegExp(literal(term), 'iu'));
  const matches: { document: SearchDocument; score: number; matchIndex: number }[] = [];
  if (terms.length) {
    const phrase = terms.join(' ');
    for (const document of documents) {
      const title = document.title.toLowerCase();
      const metadata = [document.date, document.category, ...document.tags, document.kind === 'diary' ? '日记' : '文章'].join(' ');
      let score = title === phrase ? 1000 : title.includes(phrase) ? 100 : 0;
      let bodyIndex = Infinity;
      let matched = true;
      for (const pattern of patterns) {
        const index = document.text.search(pattern);
        if (index >= 0) bodyIndex = Math.min(bodyIndex, index);
        if (pattern.test(document.title)) score += 12;
        else if (pattern.test(metadata)) score += 5;
        else if (index >= 0) score += 1;
        else { matched = false; break; }
      }
      if (matched) matches.push({ document, score, matchIndex: Number.isFinite(bodyIndex) ? bodyIndex : 0 });
    }
  }
  matches.sort((a, b) => b.score - a.score || b.document.date.localeCompare(a.document.date)
    || a.document.title.localeCompare(b.document.title, 'zh-CN'));
  return {
    total: matches.length,
    results: matches.slice(0, limit).map(({ document, matchIndex }) => ({
      document, snippet: excerpt(document.text, matchIndex),
    })),
  };
}

export function highlightSegments(text: string, query: string) {
  const terms = termsFor(query).sort((a, b) => b.length - a.length);
  if (!terms.length) return [{ text, match: false }];
  const pattern = new RegExp(terms.map(literal).join('|'), 'giu');
  const pieces: { text: string; match: boolean }[] = [];
  let position = 0;
  for (const hit of text.matchAll(pattern)) {
    if (position < hit.index) pieces.push({ text: text.slice(position, hit.index), match: false });
    pieces.push({ text: hit[0], match: true });
    position = hit.index + hit[0].length;
  }
  if (position < text.length) pieces.push({ text: text.slice(position), match: false });
  return pieces;
}

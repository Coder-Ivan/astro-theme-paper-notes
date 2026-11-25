import { diaryPosts, postUrl, type JournalPost } from './journal.ts';

const creationDay = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function diaryDate(post: Pick<JournalPost, 'title' | 'created'>): string {
  // The Journal plugin titles a backdated entry with the date its author selected.
  const title = post.title.trim();
  const match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/u.exec(title)
    ?? /^(\d{4})年(\d{1,2})月(\d{1,2})日/u.exec(title);
  if (match) {
    if (match[1] === '0000') return '';
    const date = [match[1], match[2].padStart(2, '0'), match[3].padStart(2, '0')].join('-');
    const parsed = new Date(date + 'T00:00:00Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().startsWith(date + 'T') ? date : '';
  }
  const created = new Date(post.created);
  return Number.isFinite(created.getTime()) ? creationDay.format(created) : '';
}

interface DiaryEntry {
  title: string;
  url: string;
  excerpt: string;
  titleOnly: boolean;
}

const byDay = new Map<string, DiaryEntry[]>();
export const undatedEntries: DiaryEntry[] = [];
export const diaryCount = diaryPosts.length;
for (const post of diaryPosts) {
  const date = diaryDate(post);
  const text = Array.from(post.excerpt.replace(/\s+/gu, ' ').trim());
  const entry = {
    title: post.title, url: postUrl(post), titleOnly: !post.body.trim(),
    excerpt: text.length > 120 ? text.slice(0, 120).join('') + '…' : text.join(''),
  };
  if (!date) {
    undatedEntries.push(entry);
    continue;
  }
  const existing = byDay.get(date);
  if (existing) existing.push(entry);
  else byDay.set(date, [entry]);
}

export const diaryDays = [...byDay].sort(([a], [b]) => b.localeCompare(a))
  .map(([date, entries]) => ({ date, entries }));

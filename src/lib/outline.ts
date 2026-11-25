import type { JournalPost } from './journal.ts';

type Heading = JournalPost['headings'][number];
export interface OutlineItem extends Heading {
  number: string;
  children: OutlineItem[];
}

export function buildOutline(headings: Heading[]): OutlineItem[] {
  const roots: OutlineItem[] = [];
  const ancestors: OutlineItem[] = [];
  for (const heading of headings) {
    while (ancestors.length && ancestors.at(-1)!.level >= heading.level) ancestors.pop();
    const parent = ancestors.at(-1);
    const siblings = parent?.children ?? roots;
    const number = (parent ? parent.number + '.' : '') + (siblings.length + 1);
    const item = { ...heading, number, children: [] };
    siblings.push(item);
    ancestors.push(item);
  }
  return roots;
}

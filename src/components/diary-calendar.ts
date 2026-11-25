export function isDateKey(value: string): boolean {
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const day = new Date(value + 'T12:00:00Z');
  return Number.isFinite(day.valueOf()) && day.toISOString().slice(0, 10) === value;
}

export function monthLabel(month: string): string {
  return Number(month.slice(0, 4)) + ' 年 ' + Number(month.slice(5)) + ' 月';
}

export function shortDate(date: string): string {
  return Number(date.slice(5, 7)) + ' 月 ' + Number(date.slice(8)) + ' 日';
}

export function dayOfWeek(date: string): string {
  return '星期' + '日一二三四五六'[new Date(date + 'T12:00:00Z').getUTCDay()];
}

export function adjacentMonth(month: string, offset: number): string | undefined {
  const day = new Date(month + '-01T12:00:00Z');
  day.setUTCMonth(day.getUTCMonth() + offset);
  const year = day.getUTCFullYear();
  if (!(year >= 1 && year <= 9999)) return undefined;
  return day.toISOString().slice(0, 7);
}

// A Monday-first grid. Empty strings are padding outside the displayed month.
export function weeksOfMonth(month: string): string[][] {
  const first = new Date(month + '-01T12:00:00Z');
  const last = new Date(first);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  const days: string[] = Array((first.getUTCDay() + 6) % 7).fill('');
  for (let day = 1; day <= last.getUTCDate(); day++) {
    days.push(month + '-' + String(day).padStart(2, '0'));
  }
  while (days.length % 7) days.push('');
  const rows = [];
  for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));
  return rows;
}

import { parseCents } from './money';

/**
 * Entries search: words match the note or category name; a number matches the amount (84 finds $84.xx,
 * 84.2 or $84.20 finds exactly $84.20).
 */
export function matchesSearch(t: { note: string | null; amount_cents: number }, category: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (`${t.note ?? ''} ${category}`.toLowerCase().includes(q)) return true;
  const plain = q.replace(/^\$/, '');
  if (!/^[\d.,]+$/.test(plain)) return false;
  if (/^\d+$/.test(plain.replace(/,/g, ''))) return Math.floor(t.amount_cents / 100) === Number(plain.replace(/,/g, ''));
  return parseCents(plain) === t.amount_cents;
}

const MAX_CENTS = 2147483647; // Postgres integer max

/** Parses a typed dollar amount into positive integer cents, or null. No float math. */
export function parseCents(input: string): number | null {
  let s = input.replace(/\s/g, '');
  if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.'); // decimal comma: "12,50" (fr-CA keyboards)
  else if (/^\d{1,3}(,\d{3})+(\.\d{0,2})?$/.test(s)) s = s.replace(/,/g, ''); // thousands: "1,234.56"
  const m = /^(\d+)(?:\.(\d{0,2}))?$/.exec(s);
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return cents > 0 && cents <= MAX_CENTS ? cents : null;
}

const cad = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' });

export function formatCents(cents: number): string {
  return cad.format(cents / 100); // display only; cents/100 is exact enough for 2-dp formatting
}

/** Like parseCents but accepts zero ("0", "0.00"); for plan amounts and limits. */
export function parseCentsOrZero(input: string): number | null {
  return /^\s*0+(\.0{0,2})?\s*$/.test(input) ? 0 : parseCents(input);
}

/** "1234.56" for spreadsheets: integer math only, no float rounding. */
export function centsToPlain(cents: number): string {
  const a = Math.abs(cents);
  return `${cents < 0 ? '-' : ''}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}

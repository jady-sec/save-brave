const MAX_CENTS = 2147483647; // Postgres integer max

/** Parses a typed dollar amount into positive integer cents, or null. No float math. */
export function parseCents(input: string): number | null {
  const s = input.replace(/[\s,]/g, '');
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

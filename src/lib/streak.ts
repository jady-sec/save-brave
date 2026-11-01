/** Days in a row, ending today (or yesterday, until today is over), on which I logged at least one entry myself. */
export function dayStreak(me: string, entries: { date: string; created_by: string; recurring_rule_id: string | null }[], today: string): number {
  const days = new Set(entries.filter((e) => e.created_by === me && !e.recurring_rule_id).map((e) => e.date));
  const d = new Date(`${today}T12:00`);
  const key = () => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (!days.has(key())) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(key())) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

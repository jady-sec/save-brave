/** RFC 4180 CSV. Cells that a spreadsheet would run as a formula get a leading apostrophe (CSV injection). */
export function toCsv(rows: string[][]): string {
  const cell = (v: string) => {
    const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(',') + '\r\n').join('');
}

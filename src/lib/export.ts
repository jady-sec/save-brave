import { centsToPlain } from './money';
import type { Tx } from './types';

/** Spreadsheet rows for the entries I can see. your_share is what counts against my budget. */
export function exportRows(me: string, partnerName: string, txs: Tx[], catName: Map<string, string>): string[][] {
  return [
    ['date', 'type', 'scope', 'category', 'amount', 'your_share', 'paid_by', 'note'],
    ...txs.map((t) => [
      t.date, t.type, t.scope, catName.get(t.category_id) ?? '', centsToPlain(t.amount_cents),
      centsToPlain(t.scope === 'shared' ? t.splits.find((s) => s.user_id === me)?.share_cents ?? 0 : t.amount_cents),
      t.paid_by === me ? 'you' : partnerName, t.note ?? '',
    ]),
  ];
}

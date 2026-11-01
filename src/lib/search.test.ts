import { expect, test } from 'vitest';
import { matchesSearch } from './search';

const t = { note: 'Costco run', amount_cents: 8420 };

test('matches note and category, ignoring case and extra spaces', () => {
  expect(matchesSearch(t, 'Groceries', '  costco ')).toBe(true);
  expect(matchesSearch(t, 'Groceries', 'GROC')).toBe(true);
  expect(matchesSearch(t, 'Groceries', 'rent')).toBe(false);
});

test('matches the amount as typed: 84.20, 84.2, $84.20 or 84', () => {
  for (const q of ['84.20', '84.2', '$84.20', '84']) expect(matchesSearch(t, 'Groceries', q)).toBe(true);
  expect(matchesSearch(t, 'Groceries', '84.21')).toBe(false);
  expect(matchesSearch({ note: null, amount_cents: 120000 }, 'Rent', '1,200')).toBe(true);
});

test('an empty search matches everything', () => {
  expect(matchesSearch(t, 'Groceries', '   ')).toBe(true);
});

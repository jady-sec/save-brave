import { describe, expect, test } from 'vitest';
import { formatCents, parseCents } from './money';

describe('parseCents', () => {
  test.each([
    ['12', 1200], ['12.5', 1250], ['12.34', 1234], ['12.', 1200], ['1,234.56', 123456],
    [' 7.05 ', 705], ['0.30', 30], ['0.01', 1], ['21474836.47', 2147483647],
  ])('%j -> %i', (input, cents) => expect(parseCents(input)).toBe(cents));

  test.each(['', '0', '0.00', '-5', '12.345', 'abc', '1.2.3', '.', '99999999', '21474836.48', '1e3', '$5'])(
    'rejects %j', (input) => expect(parseCents(input)).toBeNull(),
  );
});

describe('formatCents', () => {
  test('formats CAD with thousands separator', () => {
    const s = formatCents(123456);
    expect(s).toMatch(/1,234\.56/);
    expect(s).toContain('$');
  });
  test('shows minus for negatives', () => expect(formatCents(-500)).toMatch(/-.*5\.00/));
  test('zero', () => expect(formatCents(0)).toMatch(/0\.00/));
});

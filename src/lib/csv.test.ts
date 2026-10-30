import { describe, expect, test } from 'vitest';
import { toCsv } from './csv';
import { centsToPlain } from './money';

describe('toCsv', () => {
  test('plain cells, CRLF line ends', () => expect(toCsv([['a', 'b'], ['1', '2']])).toBe('a,b\r\n1,2\r\n'));
  test('quotes cells with comma, quote, newline or CR; doubles quotes', () =>
    expect(toCsv([['a,b', 'say "hi"', 'x\ny', 'x\ry']])).toBe('"a,b","say ""hi""","x\ny","x\ry"\r\n'));
  test.each(['=SUM(A1)', '+1', '-2', '@cmd', '\tx', '\rx'])('formula-looking cell %j gets a leading apostrophe', (cell) =>
    expect(toCsv([[cell]]).startsWith(`'`) || toCsv([[cell]]).startsWith(`"'`)).toBe(true));
  test('the apostrophe goes inside the quotes when quoting is needed', () => expect(toCsv([['=1,2']])).toBe(`"'=1,2"\r\n`));
  test('empty cell', () => expect(toCsv([['', 'x']])).toBe(',x\r\n'));
});

describe('centsToPlain', () => {
  test.each([[5, '0.05'], [123456, '1234.56'], [0, '0.00'], [100, '1.00'], [2147483647, '21474836.47'], [-5, '-0.05'], [-123456, '-1234.56']] as const)(
    '%i → %s', (c, s) => expect(centsToPlain(c)).toBe(s));
});

import { expect, test } from 'vitest';
import { cleanInviteCode } from './invite';

test('removes spaces and line breaks but keeps every letter, including s', () =>
  expect(cleanInviteCode(' k7s2 ab\ncd ')).toBe('k7s2abcd'));

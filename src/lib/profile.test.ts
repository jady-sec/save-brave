import { describe, expect, test } from 'vitest';
import { AVATARS, cleanName, displayName } from './profile';

describe('displayName', () => {
  test('uses the chosen name, else the part of the email before @', () => {
    expect(displayName({ email: 'josh.d@gmail.com', display_name: 'Josh' })).toBe('Josh');
    expect(displayName({ email: 'josh.d@gmail.com', display_name: null })).toBe('josh.d');
    expect(displayName({ email: 'josh.d@gmail.com' })).toBe('josh.d');
  });
});

describe('cleanName', () => {
  test('trims and squeezes spaces', () => {
    expect(cleanName('  Josh   Dan ')).toBe('Josh Dan');
  });
  test('rejects empty and over 24 characters', () => {
    expect(cleanName('   ')).toBeNull();
    expect(cleanName('x'.repeat(25))).toBeNull();
    expect(cleanName('x'.repeat(24))).toBe('x'.repeat(24));
  });
});

test('the avatar set matches the database check list', () => {
  expect(Object.keys(AVATARS)).toEqual(['fox', 'panda', 'koala', 'tiger', 'lion', 'frog', 'monkey', 'rabbit',
    'bear', 'pig', 'octopus', 'unicorn', 'penguin', 'cat', 'dog', 'owl']);
});

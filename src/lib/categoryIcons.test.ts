import { expect, test } from 'vitest';
import { CATEGORY_ICONS, iconFor } from './categoryIcons';

test('a chosen icon wins; otherwise the name picks a sensible one', () => {
  expect(iconFor({ name: 'Groceries', icon: 'gift' })).toBe('gift');
  const guess = (name: string) => iconFor({ name, icon: null });
  expect(guess('Groceries')).toBe('cart');
  expect(guess('Rent')).toBe('home');
  expect(guess('Eating out')).toBe('food');
  expect(guess('Coffee')).toBe('coffee');
  expect(guess('Gas & parking')).toBe('car');
  expect(guess('Utilities')).toBe('bolt');
  expect(guess('Salary')).toBe('money');
  expect(guess('Netflix')).toBe('film');
  expect(guess('Something odd')).toBe('tag');
});

test('the icon set matches the database check list', () => {
  expect(Object.keys(CATEGORY_ICONS)).toEqual(['cart', 'home', 'food', 'coffee', 'bus', 'car', 'bolt', 'phone', 'wifi',
    'heart', 'gift', 'shirt', 'film', 'plane', 'book', 'dumbbell', 'money', 'tag']);
});

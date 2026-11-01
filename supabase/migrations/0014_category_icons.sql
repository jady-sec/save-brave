-- An optional icon per category, from the app's fixed set (src/lib/categoryIcons.ts). Null = the app guesses
-- one from the name. Existing category policies already decide who can change it.
alter table public.categories add column icon text check (icon in ('cart', 'home', 'food', 'coffee', 'bus', 'car', 'bolt',
  'phone', 'wifi', 'heart', 'gift', 'shirt', 'film', 'plane', 'book', 'dumbbell', 'money', 'tag'));

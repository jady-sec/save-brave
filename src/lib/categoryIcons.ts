// Category icons: 24×24 outline paths, drawn in the same 2px-ink style as the rest of the app.
// The keys must match the check list in supabase/migrations/0014_category_icons.sql.
export const CATEGORY_ICONS = {
  cart: 'M3 4h2l2.4 11h10.8l2-8H6.3M9.5 20h.01M17 20h.01',
  home: 'M3 11l9-7 9 7M5.5 9.5V20h13V9.5M10 20v-6h4v6',
  food: 'M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2.5 1.5-3 5-3 8h3',
  coffee: 'M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10.5h1.5a2.5 2.5 0 0 1 0 5H17M8 3v3M12 3v3',
  bus: 'M5 4h14v12H5zM5 11h14M8 16v3M16 16v3M8 13.5h.01M16 13.5h.01',
  car: 'M4 16v-3l2-5h12l2 5v3zM7 16v2.5M17 16v2.5M7.5 12.5h.01M16.5 12.5h.01',
  bolt: 'M13 3L5 13h6l-1 8 8-10h-6z',
  phone: 'M8 3h8v18H8zM11 18h2',
  wifi: 'M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01',
  heart: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
  gift: 'M4 11h16v9H4zM3 7.5h18V11H3zM12 7.5V20M12 7.5C11 4 7 4 7 6.2s5 1.3 5 1.3zM12 7.5C13 4 17 4 17 6.2s-5 1.3-5 1.3z',
  shirt: 'M8.5 4L12 6l3.5-2L20 7l-2 3.5-2-1V20H8V9.5l-2 1L4 7z',
  film: 'M4 5h16v14H4zM8 5v14M16 5v14M4 9.5h4M4 14.5h4M16 9.5h4M16 14.5h4',
  plane: 'M10.5 13.5L3 11l1.5-1.5 8 1L17 6a2 2 0 0 1 3 3l-4.5 4.5 1 8L15 23l-2.5-7.5L9 19v3l-1.5 1-1-4-4-1 1-1.5h3z',
  book: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5V5.5M8 7h7',
  dumbbell: 'M3 10v4M6 7.5v9M18 7.5v9M21 10v4M6 12h12',
  money: 'M3 7h18v10H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6.5 10h.01M17.5 14h.01',
  tag: 'M3 12V4h8l10 10-8 8zM7.5 8h.01',
} as const;
export type CategoryIcon = keyof typeof CATEGORY_ICONS;

// First match wins, so more specific words come first.
const GUESSES: [RegExp, CategoryIcon][] = [
  [/grocer|supermarket|costco|market/i, 'cart'],
  [/coffee|caf[eé]|tim hortons|starbucks/i, 'coffee'],
  [/eat|restaurant|dining|lunch|dinner|takeout|take-out|food|delivery/i, 'food'],
  [/rent|mortgage|home|house|condo/i, 'home'],
  [/transit|bus|train|subway|metro|presto|transport/i, 'bus'],
  [/car|gas|fuel|parking|uber|lyft|taxi|insurance/i, 'car'],
  [/util|electric|hydro|water|power|heat/i, 'bolt'],
  [/internet|wi-?fi/i, 'wifi'],
  [/phone|mobile|cell/i, 'phone'],
  [/health|medic|pharm|doctor|dental|therapy/i, 'heart'],
  [/gift|present|donat|charity/i, 'gift'],
  [/cloth|shopping|apparel|shoes/i, 'shirt'],
  [/movie|entertain|fun|netflix|spotify|stream|subscri|game/i, 'film'],
  [/travel|trip|flight|holiday|vacation|hotel/i, 'plane'],
  [/book|educat|school|course|tuition/i, 'book'],
  [/gym|fitness|sport|yoga/i, 'dumbbell'],
  [/salary|pay|income|wage|bonus|refund|interest/i, 'money'],
];

/** The category's chosen icon, else a guess from its name. */
export function iconFor(c: { name: string; icon?: string | null }): CategoryIcon {
  if (c.icon && c.icon in CATEGORY_ICONS) return c.icon as CategoryIcon;
  return GUESSES.find(([re]) => re.test(c.name))?.[1] ?? 'tag';
}

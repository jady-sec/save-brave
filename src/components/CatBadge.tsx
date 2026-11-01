import { CATEGORY_ICONS, iconFor } from '../lib/categoryIcons';
import { useMe } from '../me';

/** Coloured square with the category's icon. The colour is decoration (stable per name), never status. */
export function CatBadge({ id, size = 42 }: { id: string; size?: number }) {
  const { categories } = useMe();
  const c = categories.find((x) => x.id === id) ?? { name: 'Category', icon: null };
  const tone = [...c.name].reduce((h, ch) => h + ch.charCodeAt(0), 0) % 5;
  return (
    <span className={`cat-badge t${tone}`} style={{ width: size, height: size }} aria-hidden="true">
      <CategoryGlyph icon={iconFor(c)} />
    </span>
  );
}

export function CategoryGlyph({ icon, size = 22 }: { icon: keyof typeof CATEGORY_ICONS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={CATEGORY_ICONS[icon]} />
    </svg>
  );
}

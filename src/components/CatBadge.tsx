/** Coloured square with the category's initial. The colour is decoration (stable per name), never status. */
export function CatBadge({ name }: { name: string }) {
  const tone = [...name].reduce((h, c) => h + c.charCodeAt(0), 0) % 5;
  return <span className={`cat-badge t${tone}`} aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>;
}

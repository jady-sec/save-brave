type Page<T> = (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Supabase caps each response (1000 rows by default) without saying so; read page after page instead. Needs a stable order. */
export async function fetchAll<T>(page: Page<T>, size = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < size) return out;
  }
}

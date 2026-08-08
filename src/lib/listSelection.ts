export function resolveListSelection<T, K>(
  items: readonly T[],
  selected: T | null,
  key: (item: T) => K,
): T | null {
  if (selected) {
    const selectedKey = key(selected);
    const current = items.find((item) => key(item) === selectedKey);
    if (current) return current;
  }
  return items[0] ?? null;
}

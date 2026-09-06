/**
 * Resolve a source module from Vite's manifest, including modules emitted as
 * dynamic imports of another manifest entry.
 */
export function requireManifestEntry(manifest, key) {
  const directEntry = manifest[key];
  if (directEntry?.file) return directEntry;

  const dynamicEntry = Object.values(manifest).find((entry) => entry.dynamicImports?.includes(key));
  if (dynamicEntry?.file) return dynamicEntry;

  throw new Error(`Missing Vite manifest entry: ${key}`);
}

export function workspaceFolderName(
  path: string | null | undefined,
  fallback = "OpenAgent",
): string {
  if (!path) return fallback;

  const segments = path.split(/[/\\]+/).filter(Boolean);
  return segments.at(-1) ?? fallback;
}

export function isWslWorkspacePath(path: string): boolean {
  return /^(?:\\\\wsl(?:\.localhost|\$)\\|\\\\\?\\UNC\\wsl(?:\.localhost|\$)\\)/i.test(path);
}

/** Keep native paths intact for I/O; omit Windows namespace syntax in visible copy. */
export function displayPath(path: string): string {
  if (/^\\\\\?\\UNC\\/i.test(path)) return `\\\\${path.slice(8)}`;
  if (/^\\\\\?\\[a-z]:\\/i.test(path)) return path.slice(4);
  return path;
}

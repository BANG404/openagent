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

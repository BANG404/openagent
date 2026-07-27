export function workspaceFolderName(path: string | null | undefined, fallback = "OpenAgent"): string {
  if (!path) return fallback;

  const segments = path.split(/[/\\]+/).filter(Boolean);
  return segments.at(-1) ?? fallback;
}

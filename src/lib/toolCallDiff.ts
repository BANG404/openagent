export type DiffLine = { type: "add" | "remove" | "context"; text: string };

export const MAX_TOOL_DIFF_PREVIEW_LINES = 240;
export const MAX_TOOL_DIFF_PREVIEW_CHARACTERS_PER_SIDE = 24_000;

export function buildReplacementDiff(oldText: string, newText: string): DiffLine[] {
  if (!oldText && !newText) return [];

  const oldPreview = oldText.slice(0, MAX_TOOL_DIFF_PREVIEW_CHARACTERS_PER_SIDE);
  const newPreview = newText.slice(0, MAX_TOOL_DIFF_PREVIEW_CHARACTERS_PER_SIDE);
  const previewTruncated = oldPreview.length < oldText.length || newPreview.length < newText.length;
  const oldLines = oldPreview.split("\n");
  const newLines = newPreview.split("\n");
  let prefix = 0;
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) {
    prefix += 1;
  }

  let oldSuffix = oldLines.length - 1;
  let newSuffix = newLines.length - 1;
  while (
    oldSuffix >= prefix &&
    newSuffix >= prefix &&
    oldLines[oldSuffix] === newLines[newSuffix]
  ) {
    oldSuffix -= 1;
    newSuffix -= 1;
  }

  const lines: DiffLine[] = [];
  let truncated = false;
  const append = (line: DiffLine): boolean => {
    if (lines.length >= MAX_TOOL_DIFF_PREVIEW_LINES - 1) {
      truncated = true;
      return false;
    }
    lines.push(line);
    return true;
  };

  for (let i = Math.max(0, prefix - 2); i < prefix; i += 1) {
    if (!append({ type: "context", text: "  " + oldLines[i] })) break;
  }
  for (let i = prefix; !truncated && i <= oldSuffix; i += 1) {
    if (!append({ type: "remove", text: "- " + oldLines[i] })) break;
  }
  for (let i = prefix; !truncated && i <= newSuffix; i += 1) {
    if (!append({ type: "add", text: "+ " + newLines[i] })) break;
  }
  for (let i = newSuffix + 1; !truncated && i < Math.min(newLines.length, newSuffix + 3); i += 1) {
    if (!append({ type: "context", text: "  " + newLines[i] })) break;
  }

  if (truncated || previewTruncated) lines.push({ type: "context", text: "  …" });
  return lines;
}

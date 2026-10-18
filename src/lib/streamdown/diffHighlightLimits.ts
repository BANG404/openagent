import { diffCodeText, type FileChangeDiffLine } from "$lib/fileChangeDiff";

/** Bound grammar work and the number of spans committed to the WebView. */
export function canHighlightDiff(lines: FileChangeDiffLine[]): boolean {
  if (!lines.length || lines.length > 2_000) return false;
  let size = 0;
  for (const line of lines) {
    const length = diffCodeText(line).length;
    size += length + 1;
    if (length > 2_000 || size > 100_000) return false;
  }
  return true;
}

export const MAX_DIFF_TOKENS = 12_000;

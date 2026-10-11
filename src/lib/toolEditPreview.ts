import type { FileChangeDiffLine } from "./fileChangeDiff";

export const MAX_TOOL_EDIT_PREVIEW_LINES = 240;
export const MAX_TOOL_EDIT_PREVIEW_CHARACTERS = 48_000;

/** Submitted replacement fragments have no known offsets in the complete file. */
export function parseEditFilePreview(args: Record<string, unknown> | null): {
  lines: FileChangeDiffLine[];
  replacements: number;
  additions: number;
  removals: number;
} {
  const lines: FileChangeDiffLine[] = [];
  let replacements = 0;
  let additions = 0;
  let removals = 0;
  const rendered = { add: 0, remove: 0 };
  const characters = { add: 0, remove: 0 };
  let omitted = false;
  if (!Array.isArray(args?.edits)) return { lines, replacements, additions, removals };

  for (const edit of args.edits) {
    if (!edit || typeof edit.old_text !== "string" || typeof edit.new_text !== "string") continue;
    replacements++;
    for (const [type, source] of [
      ["remove", edit.old_text],
      ["add", edit.new_text],
    ] as const) {
      const separators = /\r\n|\r|\n/g;
      let start = 0;
      while (start < source.length) {
        const separator = separators.exec(source);
        const end = separator?.index ?? source.length;
        if (type === "add") additions++;
        else removals++;
        if (
          rendered[type] >=
            Math.floor((MAX_TOOL_EDIT_PREVIEW_LINES - 1) / 2) + (type === "add" ? 1 : 0) ||
          characters[type] + end - start + 1 > MAX_TOOL_EDIT_PREVIEW_CHARACTERS / 2
        ) {
          omitted = true;
        } else {
          const text = `${type === "add" ? "+" : "-"}${source.slice(start, end)}`;
          lines.push({ type, text });
          rendered[type]++;
          characters[type] += text.length;
        }
        if (!separator) break;
        start = separators.lastIndex;
      }
    }
  }
  if (omitted) lines.push({ type: "context", text: "..." });
  return { lines, replacements, additions, removals };
}

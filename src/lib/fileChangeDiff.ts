import { decompress } from "fzstd";
import type { FileChange } from "$lib/types";

export type FileChangeDiffLine = {
  type: "add" | "remove" | "context";
  text: string;
  oldLine?: number;
  newLine?: number;
};

export function diffCodeText(line: FileChangeDiffLine): string {
  return line.type === "context" ? line.text : line.text.slice(1);
}

function changedPatchLines(source: string[], start: number, oldLine: number, newLine: number) {
  const lines: FileChangeDiffLine[] = [];
  const changed: string[] = [];
  let index = start;
  while (
    index < source.length &&
    (source[index].startsWith("+") || source[index].startsWith("-")) &&
    !source[index].startsWith("+++") &&
    !source[index].startsWith("---")
  ) {
    changed.push(source[index]);
    index += 1;
  }
  for (const changedLine of changed.filter((item) => item.startsWith("+"))) {
    lines.push({ type: "remove", text: `-${changedLine.slice(1)}`, oldLine });
    oldLine += 1;
  }
  for (const changedLine of changed.filter((item) => item.startsWith("-"))) {
    lines.push({ type: "add", text: `+${changedLine.slice(1)}`, newLine });
    newLine += 1;
  }
  return { lines, nextIndex: index - 1, oldLine, newLine };
}

export function parseReverseFilePatch(patch: string): FileChangeDiffLine[] {
  let oldLine = 0;
  let newLine = 0;
  const lines: FileChangeDiffLine[] = [];
  const source = patch.split("\n");
  let skippedUntil = -1;
  for (const [index, line] of source.entries()) {
    if (index <= skippedUntil) continue;
    const header = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (header) {
      // Stored patches run new -> old. Swap the hunk counters for forward display.
      oldLine = Number(header[2]);
      newLine = Number(header[1]);
      continue;
    }
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+") || line.startsWith("-")) {
      const changed = changedPatchLines(source, index, oldLine, newLine);
      lines.push(...changed.lines);
      oldLine = changed.oldLine;
      newLine = changed.newLine;
      skippedUntil = changed.nextIndex;
      continue;
    }
    lines.push({ type: "context", text: line, oldLine, newLine });
    oldLine += 1;
    newLine += 1;
  }
  return lines;
}

export function fileChangeDiffLines(change: FileChange | undefined): FileChangeDiffLine[] {
  if (!change) return [];
  if (change.old_patch) return parseReverseFilePatch(change.old_patch);
  if (!change.new_content_z) return [];

  try {
    const content = new TextDecoder().decode(decompress(Uint8Array.from(change.new_content_z)));
    if (!content) return [];
    const source = content.split("\n");
    if (source.at(-1) === "") source.pop();
    return source.map((text, index) => ({ type: "add", text: `+${text}`, newLine: index + 1 }));
  } catch {
    return [];
  }
}

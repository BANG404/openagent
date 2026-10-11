import { decompress } from "fzstd";
import type { FileChange } from "$lib/types";

export type FileChangeDiffLine = {
  type: "add" | "remove" | "context";
  text: string;
  oldLine?: number;
  newLine?: number;
  /** Insertion position in the complete latest snapshot for removed lines. */
  newLineAnchor?: number;
};

export function diffCodeText(line: FileChangeDiffLine): string {
  return line.type === "context" ? line.text : line.text.slice(1);
}

function changedPatchLines(
  source: string[],
  start: number,
  oldLine: number,
  newLine: number,
  reverse: boolean,
  anchors = false,
) {
  const lines: FileChangeDiffLine[] = [];
  const changed: string[] = [];
  let index = start;
  while (
    index < source.length &&
    (source[index].startsWith("+") || source[index].startsWith("-"))
  ) {
    changed.push(source[index]);
    index += 1;
  }
  for (const changedLine of changed.filter((item) => item.startsWith(reverse ? "+" : "-"))) {
    lines.push({
      type: "remove",
      text: `-${changedLine.slice(1)}`,
      oldLine,
      ...(anchors ? { newLineAnchor: newLine } : {}),
    });
    oldLine += 1;
  }
  for (const changedLine of changed.filter((item) => item.startsWith(reverse ? "-" : "+"))) {
    lines.push({ type: "add", text: `+${changedLine.slice(1)}`, newLine });
    newLine += 1;
  }
  return { lines, nextIndex: index - 1, oldLine, newLine };
}

export function parseReverseFilePatch(patch: string): FileChangeDiffLine[] {
  return parseUnifiedFilePatch(patch, true);
}

export function parseForwardFilePatch(patch: string): FileChangeDiffLine[] {
  return parseUnifiedFilePatch(patch, false);
}

function parseUnifiedFilePatch(
  patch: string,
  reverse: boolean,
  anchors = false,
): FileChangeDiffLine[] {
  let oldLine = 0;
  let newLine = 0;
  const lines: FileChangeDiffLine[] = [];
  const source = patch.split("\n").map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
  let inHunk = false;
  let skippedUntil = -1;
  for (const [index, line] of source.entries()) {
    if (index <= skippedUntil) continue;
    const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (header) {
      inHunk = true;
      // Stored patches run new -> old. Swap the hunk counters for forward display.
      oldLine = Number(header[reverse ? 3 : 1]);
      newLine = Number(header[reverse ? 1 : 3]);
      if (anchors && header[reverse ? 2 : 4] === "0") newLine++;
      continue;
    }
    if (!inHunk) continue;
    if (line.startsWith("+") || line.startsWith("-")) {
      const changed = changedPatchLines(source, index, oldLine, newLine, reverse, anchors);
      lines.push(...changed.lines);
      oldLine = changed.oldLine;
      newLine = changed.newLine;
      skippedUntil = changed.nextIndex;
      continue;
    }
    if (!line.startsWith(" ")) continue;
    lines.push({ type: "context", text: line.slice(1), oldLine, newLine });
    oldLine += 1;
    newLine += 1;
  }
  return lines;
}

export function fileChangeProjectionLines(
  change: FileChange | undefined,
  mode: "diff" | "content",
): FileChangeDiffLine[] {
  if (mode === "diff") {
    return change?.projection
      ? change.projection.diff
        ? parseForwardFilePatch(change.projection.diff)
        : []
      : fileChangeDiffLines(change);
  }
  return recordedContentLines(fileChangeContent(change));
}

function recordedContentLines(content: string | null): FileChangeDiffLine[] {
  if (content === null || content === "") return [];
  const source = content.split(/\r\n|\n|\r/);
  if (source.at(-1) === "") source.pop();
  return source.map((text, index) => ({ type: "context", text, newLine: index + 1 }));
}

/** Recorded content is available even when the Runtime omits its derived projection. */
export function fileChangeContent(change: FileChange | undefined): string | null {
  if (change?.projection) return change.projection.content;
  if (!change?.new_content_z) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      decompress(Uint8Array.from(change.new_content_z)),
    );
  } catch {
    return null;
  }
}

/** Overlay recorded changes on every latest file line, including context outside hunks. */
export function fileChangeFullDiffLines(
  change: FileChange,
  content = fileChangeContent(change),
): FileChangeDiffLine[] {
  const projection = change.projection;
  const patch = projection ? projection.diff : change.old_patch;
  const changes = patch ? parseUnifiedFilePatch(patch, !projection, true) : [];
  if (content === null) {
    return projection?.kind === "deleted"
      ? changes
          .filter((line) => line.type === "remove")
          .map(({ newLineAnchor: _, ...line }) => line)
      : [];
  }
  const source = recordedContentLines(content);
  if (!projection && change.old_patch === null) {
    return source.map((line) => ({ ...line, type: "add", text: `+${line.text}` }));
  }
  if (!changes.length) return source;
  const result: FileChangeDiffLine[] = [];
  let next = 1;
  let oldOffset = 0;
  const context = () => {
    result.push({
      type: "context",
      text: source[next - 1].text,
      oldLine: next + oldOffset,
      newLine: next,
    });
    next++;
  };
  for (const line of changes) {
    const anchor = Math.max(1, line.newLineAnchor ?? line.newLine ?? next);
    if (anchor < next || anchor > source.length + 1) return source;
    while (next < anchor) context();
    if (line.type === "remove") {
      result.push({ type: "remove", text: line.text, oldLine: line.oldLine });
      oldOffset++;
    } else {
      if (next > source.length) return source;
      result.push({
        type: line.type,
        text: `${line.type === "add" ? "+" : ""}${source[next - 1].text}`,
        newLine: next,
        ...(line.type === "context" ? { oldLine: line.oldLine } : {}),
      });
      if (line.type === "add") oldOffset--;
      next++;
    }
  }
  while (next <= source.length) context();
  return result;
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

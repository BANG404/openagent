import { fileChangeDiffLines, type FileChangeDiffLine } from "./fileChangeDiff";
import type { FileChange } from "./types";

export type ToolPatchOperation = "add" | "update" | "delete";

export type ToolPatchFilePreview = {
  path: string;
  operation: ToolPatchOperation;
  movePath?: string;
  lines: FileChangeDiffLine[];
  additions: number;
  removals: number;
};

export const MAX_TOOL_PATCH_PREVIEW_LINES = 240;
export const MAX_TOOL_PATCH_PREVIEW_CHARACTERS = 48_000;

const operationHeader = /^\*\*\* (Add|Update|Delete) File: (.+)$/;

function operationHeaderFromLine(value: string): RegExpExecArray | null {
  return operationHeader.exec(value.trim());
}

function operationFromHeader(value: string): ToolPatchOperation {
  return value === "Add" ? "add" : value === "Delete" ? "delete" : "update";
}

function previewLines(
  operation: ToolPatchOperation,
  body: string[],
): Pick<ToolPatchFilePreview, "lines" | "additions" | "removals"> {
  const lines: FileChangeDiffLine[] = [];
  let additions = 0;
  let removals = 0;
  let oldLine: number | undefined = operation === "delete" ? 1 : undefined;
  let newLine: number | undefined = operation === "add" ? 1 : undefined;
  let characters = 0;
  let omitted = false;

  for (const sourceLine of body) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(sourceLine);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      continue;
    }
    if (sourceLine.startsWith("@@") || sourceLine.startsWith("\\ No newline")) continue;

    let line: FileChangeDiffLine | null = null;
    if (operation === "add" || sourceLine.startsWith("+")) {
      additions += 1;
      line = { type: "add", text: `+${sourceLine.replace(/^\+/, "")}`, newLine };
      if (newLine !== undefined) newLine += 1;
    } else if (sourceLine.startsWith("-")) {
      removals += 1;
      line = { type: "remove", text: sourceLine, oldLine };
      if (oldLine !== undefined) oldLine += 1;
    } else if (sourceLine.startsWith(" ")) {
      line = { type: "context", text: sourceLine.slice(1), oldLine, newLine };
      if (oldLine !== undefined) oldLine += 1;
      if (newLine !== undefined) newLine += 1;
    }

    if (!line) continue;
    characters += line.text.length;
    if (
      lines.length >= MAX_TOOL_PATCH_PREVIEW_LINES - 1 ||
      characters > MAX_TOOL_PATCH_PREVIEW_CHARACTERS
    ) {
      omitted = true;
      continue;
    }
    lines.push(line);
  }

  if (omitted) lines.push({ type: "context", text: "..." });
  return { lines, additions, removals };
}

function boundedPreviewLines(source: FileChangeDiffLine[]): FileChangeDiffLine[] {
  const lines: FileChangeDiffLine[] = [];
  let characters = 0;
  let omitted = false;

  for (const line of source) {
    characters += line.text.length;
    if (
      lines.length >= MAX_TOOL_PATCH_PREVIEW_LINES - 1 ||
      characters > MAX_TOOL_PATCH_PREVIEW_CHARACTERS
    ) {
      omitted = true;
      continue;
    }
    lines.push(line);
  }

  if (omitted) lines.push({ type: "context", text: "..." });
  return lines;
}

function normalizedPath(path: string): string {
  return path
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "")
    .replace(/\/+$/, "");
}

function matchesFileChangePath(changePath: string, patchPath: string): boolean {
  const change = normalizedPath(changePath);
  const patch = normalizedPath(patchPath);
  if (!change || !patch) return false;
  return change === patch || change.endsWith(`/${patch}`) || patch.endsWith(`/${change}`);
}

/**
 * Fill standard Delete File previews from the runtime's pre-delete snapshot.
 * Codex-compatible delete headers do not include the deleted file body.
 */
export function applyFileChangeSnapshotsToPatchPreviews(
  previews: ToolPatchFilePreview[],
  changes: FileChange[],
): ToolPatchFilePreview[] {
  return previews.map((preview) => {
    if (preview.operation !== "delete" || preview.lines.length > 0) return preview;
    const change = changes.find(
      (candidate) =>
        candidate.old_patch !== null && matchesFileChangePath(candidate.path, preview.path),
    );
    if (!change) return preview;

    const sourceLines = fileChangeDiffLines(change);
    return {
      ...preview,
      lines: boundedPreviewLines(sourceLines),
      additions: sourceLines.filter((line) => line.type === "add").length,
      removals: sourceLines.filter((line) => line.type === "remove").length,
    };
  });
}

export function parseApplyPatchPreview(patch: string): ToolPatchFilePreview[] {
  const source = patch.split("\n");
  const previews: ToolPatchFilePreview[] = [];
  let index = source[0] === "*** Begin Patch" ? 1 : 0;

  while (index < source.length) {
    const header = operationHeaderFromLine(source[index]);
    if (!header) {
      index += 1;
      continue;
    }
    const operation = operationFromHeader(header[1]);
    const path = header[2].trim();
    index += 1;
    const body: string[] = [];
    while (
      index < source.length &&
      source[index].trim() !== "*** End Patch" &&
      !(
        operationHeaderFromLine(source[index]) &&
        (operation !== "update" || !source[index].startsWith(" "))
      )
    ) {
      body.push(source[index]);
      index += 1;
    }
    const moveLine = body.find((line) => line.trim().startsWith("*** Move to: "));
    const movePath = moveLine?.trim().slice("*** Move to: ".length).trim();
    previews.push({
      path,
      operation,
      ...(movePath ? { movePath } : {}),
      ...previewLines(operation, body),
    });
  }

  return previews;
}

export function summarizePatchChanges(previews: ToolPatchFilePreview[]): {
  files: number;
  additions: number;
  removals: number;
} {
  return previews.reduce(
    (summary, preview) => ({
      files: summary.files + 1,
      additions: summary.additions + preview.additions,
      removals: summary.removals + preview.removals,
    }),
    { files: 0, additions: 0, removals: 0 },
  );
}

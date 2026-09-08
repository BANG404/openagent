import type { FileChangeDiffLine } from "./fileChangeDiff";

export type ToolPatchOperation = "add" | "update" | "delete";

export type ToolPatchFilePreview = {
  path: string;
  operation: ToolPatchOperation;
  lines: FileChangeDiffLine[];
  additions: number;
  removals: number;
};

export const MAX_TOOL_PATCH_PREVIEW_LINES = 240;
export const MAX_TOOL_PATCH_PREVIEW_CHARACTERS = 48_000;

const operationHeader = /^\*\*\* (Add|Update|Delete) File: (.+)$/;

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
  let oldLine: number | undefined;
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

export function parseApplyPatchPreview(patch: string): ToolPatchFilePreview[] {
  const source = patch.split("\n");
  const previews: ToolPatchFilePreview[] = [];
  let index = source[0] === "*** Begin Patch" ? 1 : 0;

  while (index < source.length) {
    const header = operationHeader.exec(source[index]);
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
      source[index] !== "*** End Patch" &&
      !operationHeader.test(source[index])
    ) {
      body.push(source[index]);
      index += 1;
    }
    previews.push({ path, operation, ...previewLines(operation, body) });
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

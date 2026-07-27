export interface FileLineRange {
  start: number;
  end: number;
}

const MAX_PREVIEW_LINES = 200;

/** Parse the line selector accepted by the AGUI File component. */
export function parseFileLineRange(value: unknown): FileLineRange | null {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  const match = /^(?:L)?(\d+)(?:\s*[-:]\s*(?:L)?(\d+))?$/i.exec(text);
  if (!match) return null;

  const start = Number(match[1]);
  const requestedEnd = Number(match[2] ?? match[1]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 1 || requestedEnd < start) {
    return null;
  }

  return { start, end: Math.min(requestedEnd, start + MAX_PREVIEW_LINES - 1) };
}

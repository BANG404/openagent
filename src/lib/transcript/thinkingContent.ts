export function normalizeThinkingContent(content: string): string {
  return content.replace(/^\s*(analysis|reasoning)\s*[:：]\s*/i, "");
}

/** Keep the preceding line visible while a new line contains only whitespace. */
export function latestThinkingLine(content: string): string {
  const trimmed = content.trimEnd();
  const start = Math.max(trimmed.lastIndexOf("\n"), trimmed.lastIndexOf("\r")) + 1;
  return trimmed.slice(start).trim();
}

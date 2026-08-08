export function applySlashCommandSelection(
  value: string,
  triggerStart: number,
  caret: number,
  insertText: string,
): { value: string; caret: number } {
  const before = value.slice(0, triggerStart);
  const after = value.slice(caret);
  const separator = after.length === 0 || !/^\s/.test(after) ? " " : "";
  const insertion = `${insertText}${separator}`;
  return {
    value: `${before}${insertion}${after}`,
    caret: before.length + insertion.length,
  };
}

/** Apply the accepted snapshot while preserving edits made during the save. */
export function rebaseDraftValue(base: unknown, saved: unknown, edited: unknown): unknown {
  if (JSON.stringify(edited) === JSON.stringify(base)) return structuredClone(saved);
  if (
    base !== null &&
    saved !== null &&
    edited !== null &&
    typeof base === "object" &&
    typeof saved === "object" &&
    typeof edited === "object" &&
    !Array.isArray(base) &&
    !Array.isArray(saved) &&
    !Array.isArray(edited)
  ) {
    const baseRecord = base as Record<string, unknown>;
    const savedRecord = saved as Record<string, unknown>;
    const editedRecord = edited as Record<string, unknown>;
    const rebased: Record<string, unknown> = {};
    for (const key of new Set([
      ...Object.keys(baseRecord),
      ...Object.keys(savedRecord),
      ...Object.keys(editedRecord),
    ])) {
      rebased[key] = rebaseDraftValue(baseRecord[key], savedRecord[key], editedRecord[key]);
    }
    return rebased;
  }
  return structuredClone(edited);
}

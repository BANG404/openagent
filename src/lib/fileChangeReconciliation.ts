import type { FileChange } from "$lib/types";

export function retainUndurableFileChanges(
  liveChanges: FileChange[],
  durableChanges: FileChange[],
  finalizedIds: ReadonlySet<string>,
): FileChange[] {
  const durableIds = new Set(durableChanges.map((change) => change.id));
  return liveChanges.filter((change) => !finalizedIds.has(change.id) || !durableIds.has(change.id));
}

import type { FileChange } from "$lib/types";

export function retainUndurableFileChanges(
  liveChanges: FileChange[],
  durableChanges: FileChange[],
  finalizedIds: ReadonlySet<string>,
  projectedCheckpointIds: ReadonlySet<string>,
): FileChange[] {
  const durableIds = new Set(
    durableChanges
      .filter((change) => projectedCheckpointIds.has(change.checkpoint_id))
      .map((change) => change.id),
  );
  return liveChanges.filter((change) => !finalizedIds.has(change.id) || !durableIds.has(change.id));
}

import type { FileChange } from "$lib/types";

export type LiveFileChange = FileChange & { branchId?: string | null };

export function retainUndurableFileChanges(
  liveChanges: FileChange[],
  durableChanges: FileChange[],
  finalizedIds: ReadonlySet<string>,
  projectedCheckpointIds: ReadonlySet<string>,
): FileChange[] {
  const durableIds = new Set(
    durableChanges
      .filter((change) => projectedCheckpointIds.has(change.checkpoint_id))
      .flatMap((change) => [change.id, ...(change.projection?.change_ids ?? [])]),
  );
  return liveChanges.filter((change) => !finalizedIds.has(change.id) || !durableIds.has(change.id));
}

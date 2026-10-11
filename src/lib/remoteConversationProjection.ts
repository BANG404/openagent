import type { RemoteConversationMeta } from "$lib/openagent/contracts";
import type { Conversation, FileChange } from "$lib/types";

export function remoteConversationMetaToConversation(meta: RemoteConversationMeta): Conversation {
  return {
    id: meta.id,
    title: meta.title,
    messages: [],
    createdAt: meta.created_at * 1000,
    updatedAt: meta.updated_at * 1000,
    pinned: meta.pinned,
    parentConvId: meta.parent_conv_id,
    compactedFromConvId: meta.compacted_from_conv_id,
    flowKind: meta.flow_kind,
    flowStatus: meta.flow_status,
    roleId: meta.role_id,
  };
}

export function projectCurrentFileChanges(
  fileChanges: FileChange[],
  activeCheckpointIds: ReadonlySet<string>,
): FileChange[] {
  const branchChanges = activeCheckpointIds.size
    ? fileChanges.filter((change) => activeCheckpointIds.has(change.checkpoint_id))
    : fileChanges;
  const byPath = new Map<string, FileChange>();

  for (const change of branchChanges) {
    const existing = byPath.get(change.path);
    if (
      !existing ||
      change.projection?.change_ids.includes(existing.id) ||
      (!existing.projection &&
        !change.projection &&
        (change.created_at > existing.created_at ||
          (change.created_at === existing.created_at && change.seq > existing.seq)))
    ) {
      byPath.set(change.path, change);
    }
  }

  return [...byPath.values()].filter(
    (change) => !(change.projection?.available && change.projection.kind === "unchanged"),
  );
}

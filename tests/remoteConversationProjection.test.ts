// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import {
  projectCurrentFileChanges,
  remoteConversationMetaToConversation,
} from "../src/lib/remoteConversationProjection";
import type { FileChange } from "../src/lib/types";

function change(
  id: string,
  checkpointId: string,
  path: string,
  oldPatch: string | null,
  createdAt: number,
  seq: number,
): FileChange {
  return {
    id,
    conv_id: "conversation",
    checkpoint_id: checkpointId,
    path,
    operation: "write",
    old_patch: oldPatch,
    old_content_z: null,
    new_content_z: null,
    new_hash: null,
    created_at: createdAt,
    seq,
  };
}

describe("remote conversation projection", () => {
  test("maps transport metadata into the shared conversation shape", () => {
    expect(
      remoteConversationMetaToConversation({
        id: "conversation",
        title: "Remote chat",
        created_at: 10,
        updated_at: 20,
        pinned: true,
        parent_conv_id: "parent",
        role_id: "reviewer",
      }),
    ).toEqual({
      id: "conversation",
      title: "Remote chat",
      messages: [],
      createdAt: 10_000,
      updatedAt: 20_000,
      pinned: true,
      parentConvId: "parent",
      compactedFromConvId: undefined,
      flowKind: undefined,
      flowStatus: undefined,
      roleId: "reviewer",
    });
  });

  test("keeps only active-branch changes and the restorable record for each path", () => {
    const changes = [
      change("old", "active", "src/app.ts", "old patch", 1, 1),
      change("new", "active", "src/app.ts", "new patch", 2, 2),
      change("create", "active", "src/new.ts", null, 1, 3),
      change("other-branch", "other", "src/other.ts", "patch", 10, 4),
    ];

    expect(projectCurrentFileChanges(changes, new Set(["active"])).map((item) => item.id)).toEqual([
      "new",
      "create",
    ]);
  });
});

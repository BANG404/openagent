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
  createdAt: number,
  seq: number,
): FileChange {
  return {
    id,
    conv_id: "conversation",
    checkpoint_id: checkpointId,
    path,
    operation: "write",
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

  test("keeps only active-branch changes and the latest estimate for each path", () => {
    const changes = [
      change("old", "active", "src/app.ts", 1, 1),
      change("new", "active", "src/app.ts", 2, 2),
      change("create", "active", "src/new.ts", 1, 3),
      change("other-branch", "other", "src/other.ts", 10, 4),
    ];

    expect(projectCurrentFileChanges(changes, new Set(["active"])).map((item) => item.id)).toEqual([
      "new",
      "create",
    ]);
  });
});

test("creation uses the latest SDK projection across checkpoint sequence resets", () => {
  const created = change("create", "root", "demo.txt", 1, 5);
  const edited = change("edit", "tip", "demo.txt", 1, 0);
  edited.projection = {
    kind: "created",
    available: true,
    change_ids: [created.id, edited.id],
    content: "one\ntwo\nthree\nfour\n",
    diff: "forward",
  };
  expect(projectCurrentFileChanges([edited, created], new Set(["root", "tip"]))).toEqual([edited]);
  const sibling = {
    ...edited,
    id: "sibling",
    checkpoint_id: "sibling",
    projection: { ...edited.projection, change_ids: [created.id, "sibling"], content: "other" },
  };
  expect(projectCurrentFileChanges([created, sibling, edited], new Set(["root", "tip"]))).toEqual([
    edited,
  ]);
});

test("net-zero files disappear, while unavailable history remains inspectable", () => {
  const created = change("create", "root", "demo.txt", 1, 0);
  const reverted = change("revert", "tip", "demo.txt", 2, 0);
  reverted.projection = {
    kind: "unchanged",
    available: true,
    change_ids: [created.id, reverted.id],
    content: null,
    diff: "",
  };
  expect(projectCurrentFileChanges([created, reverted], new Set())).toEqual([]);
  reverted.projection.available = false;
  expect(projectCurrentFileChanges([created, reverted], new Set())).toEqual([reverted]);
});

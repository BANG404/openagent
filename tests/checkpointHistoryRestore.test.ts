import { expect, test } from "bun:test";
import {
  agentHistoryRestoreCheckpoint,
  buildTreeFromCheckpoints,
  computeActivePath,
  selectActivePathToCheckpoint,
  findForkParentCheckpointId,
} from "../src/lib/checkpointTree";
import type { CheckpointMessage, RenderableCheckpoint } from "../src/lib/types";

function checkpoint(id: string, messages: CheckpointMessage[]): RenderableCheckpoint {
  return {
    meta: {
      thread_id: "conversation",
      checkpoint_id: id,
      parent_checkpoint_id: null,
      metadata: "{}",
      created_at: 1,
    },
    data: { messages, file_change_ids: [], phase: "interrupted" },
  };
}

function input(hidden: boolean): CheckpointMessage {
  return {
    id: "input",
    role: "user",
    content: [{ type: "text", text: "Continue" }],
    status: "completed",
    timestamp: 1,
    first_token_at: null,
    completed_at: null,
    tags: [],
    plugin_tags: hidden ? ["plugin:chat-groups:control"] : [],
    plugin_user_visible: !hidden,
    plugin_model_visible: true,
    system_prompt: null,
    tools: null,
  };
}

test("metadata-only ancestors preserve ownership while rendering only the selected complete body", () => {
  const root = checkpoint("root", []);
  root.data_loaded = false;
  root.data.format_version = 2;
  root.meta.metadata = JSON.stringify({
    turn: {
      id: "turn",
      input_message_id: "input",
      response_message_id: "reply",
      status: "completed",
      started_at: 1,
    },
  });
  const selected = checkpoint("selected", [input(false)]);
  selected.meta.parent_checkpoint_id = "root";
  selected.data_loaded = true;
  selected.data.format_version = 2;
  const tree = buildTreeFromCheckpoints([root, selected]);
  expect(computeActivePath(tree).map((message) => message.id)).toEqual(["input"]);
  expect(tree.nodes.root.dataLoaded).toBe(false);
  expect(findForkParentCheckpointId(tree, "input")).toBe(null);
});

test("refreshing metadata retains a previously loaded branch snapshot", () => {
  const loaded = checkpoint("branch", [input(false)]);
  const previous = buildTreeFromCheckpoints([loaded]);
  const header = checkpoint("branch", []);
  header.data_loaded = false;
  const tree = buildTreeFromCheckpoints([header], previous);
  expect(tree.nodes.branch.dataLoaded).toBe(true);
  expect(computeActivePath(tree).map((message) => message.id)).toEqual(["input"]);
});

test("an internal active tip keeps the loaded visible ancestor instead of a newer sibling", () => {
  const ancestor = checkpoint("ancestor", [input(false)]);
  ancestor.data_loaded = true;
  const sibling = checkpoint("newer-sibling", []);
  sibling.meta.created_at = 2;
  sibling.data_loaded = false;
  const previous = buildTreeFromCheckpoints([
    checkpoint("ancestor", []),
    checkpoint("newer-sibling", [{ ...input(false), id: "sibling-input" }]),
  ]);
  for (const parent of [null, "ancestor"]) {
    sibling.meta.parent_checkpoint_id = parent;
    for (const cached of [undefined, previous]) {
      const tree = selectActivePathToCheckpoint(
        buildTreeFromCheckpoints([ancestor, sibling], cached),
        "internal-recovery-tip",
      );
      expect(computeActivePath(tree).map((message) => message.id)).toEqual(["input"]);
      expect(agentHistoryRestoreCheckpoint(tree, false)).toBe("ancestor");
    }
  }
});

test("hidden-only history restores its selected durable tip even with an empty transcript", () => {
  const tree = buildTreeFromCheckpoints([checkpoint("hidden-tip", [input(true)])]);
  expect(computeActivePath(tree)).toEqual([]);
  expect(agentHistoryRestoreCheckpoint(tree, false)).toBe("hidden-tip");
});

test("a user-only snapshot restores without waiting for an assistant record", () => {
  const tree = buildTreeFromCheckpoints([checkpoint("user-tip", [input(false)])]);
  expect(computeActivePath(tree).map((message) => message.role)).toEqual(["user"]);
  expect(agentHistoryRestoreCheckpoint(tree, false)).toBe("user-tip");
});

test("complete snapshots stay authoritative after hiding repeated compaction replay", () => {
  const earlier = input(false);
  const boundary: CheckpointMessage = {
    ...input(false),
    id: "compaction-ui",
    role: "ui",
    content: [
      {
        type: "ui",
        ui: {
          version: 1,
          component: "builtin.divider",
          props: { label_key: "compactionCompleted" },
          fallback: "Context compacted",
        },
      },
    ],
  };
  const replay = { ...input(false), id: "provider-replay", tags: ["context_compaction" as const] };
  const records = [earlier, boundary, replay];
  for (const version of [undefined, 2]) {
    const parent = checkpoint("before", records);
    const child = checkpoint("after", records);
    child.meta.parent_checkpoint_id = "before";
    child.data.format_version = version;
    const tree = buildTreeFromCheckpoints([parent, child]);
    const messages = computeActivePath(tree);
    expect(tree.nodes.after.isSelfContainedSnapshot).toBe(true);
    expect(messages.map((message) => message.id)).toEqual([earlier.id, boundary.id]);
  }
});

test("format-2 compacted snapshots may contain fewer records than their parent", () => {
  const parent = checkpoint("before", [input(false), { ...input(false), id: "earlier" }]);
  const child = checkpoint("after", [{ ...input(false), id: "compacted" }]);
  child.meta.parent_checkpoint_id = "before";
  child.data.format_version = 2;
  expect(
    computeActivePath(buildTreeFromCheckpoints([parent, child])).map((message) => message.id),
  ).toEqual(["compacted"]);
});

test("restoration follows the selected sibling rather than the newest snapshot", () => {
  const tree = selectActivePathToCheckpoint(
    buildTreeFromCheckpoints([
      checkpoint("selected", [input(true)]),
      checkpoint("newest", [input(false)]),
    ]),
    "selected",
  );
  expect(agentHistoryRestoreCheckpoint(tree, false)).toBe("selected");
});

test("live navigation skips both stale-tip restoration and empty-history clearing", () => {
  const tree = buildTreeFromCheckpoints([checkpoint("stale-tip", [input(true)])]);
  expect(agentHistoryRestoreCheckpoint(tree, true)).toBeUndefined();
  expect(agentHistoryRestoreCheckpoint(buildTreeFromCheckpoints([]), true)).toBeUndefined();
  expect(agentHistoryRestoreCheckpoint(undefined, true)).toBeUndefined();
});

test("only an idle conversation without a selected tip clears its history", () => {
  expect(agentHistoryRestoreCheckpoint(buildTreeFromCheckpoints([]), false)).toBeNull();
  expect(agentHistoryRestoreCheckpoint(undefined, false)).toBeNull();
});

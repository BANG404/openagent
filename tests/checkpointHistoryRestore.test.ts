import { expect, test } from "bun:test";
import {
  agentHistoryRestoreCheckpoint,
  buildTreeFromCheckpoints,
  computeActivePath,
  selectActivePathToCheckpoint,
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

// @ts-nocheck -- Bun provides the test module at runtime.
import { describe, expect, test } from "bun:test";
import { appendCompactionProgress, resolveUserInput } from "../src/lib/chatStream";
import {
  ROOT_KEY,
  buildTreeFromCheckpoints,
  findForkParentCheckpointId,
  getSiblingInfoForUserMessage,
  isCompactionBoundary,
  preserveMessagesAddedDuringHydration,
} from "../src/lib/checkpointTree";

describe("background checkpoint reconciliation", () => {
  const message = (id, role, content) => ({
    id,
    role,
    content,
    timestamp: 1,
  });

  test("keeps a queued user message inserted while the checkpoint was loading", () => {
    const previousUser = message("user-1", "user", "first");
    const previousAssistant = message("assistant-1", "assistant", "done");
    const queuedUser = message("user-2", "user", "queued");

    expect(
      preserveMessagesAddedDuringHydration(
        [previousUser, previousAssistant, queuedUser],
        [previousUser, previousAssistant],
        new Set(["user-1", "assistant-1"]),
      ),
    ).toEqual([previousUser, previousAssistant, queuedUser]);
  });

  test("does not duplicate a message already present in the durable snapshot", () => {
    const previousUser = message("user-1", "user", "first");
    const queuedUser = message("user-2", "user", "queued");

    expect(
      preserveMessagesAddedDuringHydration(
        [previousUser, queuedUser],
        [previousUser, queuedUser],
        new Set(["user-1"]),
      ),
    ).toEqual([previousUser, queuedUser]);
  });
});

describe("resolveUserInput", () => {
  test("replaces a pending ask_user form with its answered state", () => {
    const request = {
      request_id: "ask-1",
      conv_id: "conv-1",
      kind: "ask_user",
      fields: [{ type: "text", name: "name", label: "Name" }],
    };

    expect(
      resolveUserInput([{ type: "user_input", request, state: "pending" }], "ask-1", "answered", {
        values: { name: "Ada" },
      }),
    ).toEqual([
      {
        type: "user_input",
        request,
        state: "answered",
        response: { values: { name: "Ada" } },
      },
    ]);
  });
});

describe("appendCompactionProgress", () => {
  test("updates one transient progress record in place", () => {
    const initial = [
      { type: "text", content: "Before compaction" },
      { type: "compaction", stage: "checking" },
    ];

    expect(appendCompactionProgress(initial, "summarizing")).toEqual([
      { type: "text", content: "Before compaction" },
      { type: "compaction", stage: "summarizing", error: undefined },
    ]);
  });

  test("removes transient progress when compaction completes or is skipped", () => {
    const initial = [{ type: "compaction", stage: "creating" }];

    expect(appendCompactionProgress(initial, "done")).toEqual([]);
    expect(appendCompactionProgress(initial, "skipped")).toEqual([]);
  });
});

describe("getSiblingInfoForUserMessage", () => {
  test("keeps branch navigation on its originating user message after a later tip snapshot", () => {
    const tree = {
      nodes: {
        parent: {
          ckId: "parent",
          parentCkId: null,
          createdAt: 1,
          timelineMessages: [],
          isSelfContainedSnapshot: false,
          childIds: ["original", "branch"],
        },
        original: {
          ckId: "original",
          parentCkId: "parent",
          createdAt: 2,
          user: { id: "original-user" },
          timelineMessages: [],
          isSelfContainedSnapshot: false,
          childIds: [],
        },
        branch: {
          ckId: "branch",
          parentCkId: "parent",
          createdAt: 3,
          user: { id: "branch-user" },
          timelineMessages: [],
          isSelfContainedSnapshot: false,
          childIds: ["branch-tip"],
        },
        "branch-tip": {
          ckId: "branch-tip",
          parentCkId: "branch",
          createdAt: 4,
          user: { id: "later-user" },
          timelineMessages: [],
          isSelfContainedSnapshot: true,
          childIds: [],
        },
      },
      rootIds: ["parent"],
      activeChild: { [ROOT_KEY]: 0, parent: 1, branch: 0 },
    };

    expect(getSiblingInfoForUserMessage(tree, "branch-user")).toEqual({
      parentKey: "parent",
      siblings: ["original", "branch"],
      activeIdx: 1,
    });
  });

  test("uses the active branch when legacy snapshot user IDs collide", () => {
    const tree = {
      nodes: {
        original: {
          ckId: "original",
          parentCkId: null,
          createdAt: 1,
          user: { id: "checkpoint-message-0" },
          timelineMessages: [{ id: "checkpoint-message-0", role: "user" }],
          isSelfContainedSnapshot: true,
          childIds: [],
        },
        branch: {
          ckId: "branch",
          parentCkId: null,
          createdAt: 2,
          user: { id: "later-user" },
          timelineMessages: [
            { id: "checkpoint-message-0", role: "user" },
            { id: "later-user", role: "user" },
          ],
          isSelfContainedSnapshot: true,
          childIds: ["branch-tip"],
        },
        "branch-tip": {
          ckId: "branch-tip",
          parentCkId: "branch",
          createdAt: 3,
          user: { id: "newest-user" },
          timelineMessages: [],
          isSelfContainedSnapshot: true,
          childIds: [],
        },
      },
      rootIds: ["original", "branch"],
      activeChild: { [ROOT_KEY]: 1, branch: 0 },
    };

    expect(getSiblingInfoForUserMessage(tree, "checkpoint-message-0")).toEqual({
      parentKey: ROOT_KEY,
      siblings: ["original", "branch"],
      activeIdx: 1,
    });
  });
});

describe("isCompactionBoundary", () => {
  test("recognizes legacy system and inline user compaction tags", () => {
    const legacySystem = {
      id: "assistant-1",
      role: "system",
      content: "done",
      timestamp: 1,
      checkpointId: "checkpoint-1",
      tags: ["context_compaction"],
    };
    const inlineUser = {
      ...legacySystem,
      id: "user-1",
      role: "user",
    };

    expect(isCompactionBoundary(legacySystem)).toBe(true);
    expect(isCompactionBoundary(inlineUser)).toBe(true);
  });
});

describe("buildTreeFromCheckpoints", () => {
  const checkpoint = (id, parentId, createdAt) => ({
    meta: {
      checkpoint_id: id,
      parent_checkpoint_id: parentId,
      created_at: createdAt,
    },
    data: { messages: [] },
  });

  test("keeps the selected branch when checkpoints reload after completion", () => {
    const checkpoints = [
      checkpoint("root", null, 1),
      checkpoint("earlier", "root", 2),
      checkpoint("later", "root", 3),
    ];
    const initial = buildTreeFromCheckpoints(checkpoints);
    const viewingEarlier = {
      ...initial,
      activeChild: { ...initial.activeChild, [ROOT_KEY]: 0, root: 0 },
    };

    const reloaded = buildTreeFromCheckpoints(
      [...checkpoints, checkpoint("newest", "root", 4)],
      viewingEarlier,
    );

    expect(reloaded.activeChild.root).toBe(0);
    expect(reloaded.nodes.root.childIds[reloaded.activeChild.root]).toBe("earlier");
  });

  test("forks before the checkpoint that first introduced an edited user message", () => {
    const message = (id, role, text) => ({
      id,
      role,
      content: [{ type: "text", text }],
      status: "completed",
      timestamp: 0,
      first_token_at: null,
      completed_at: null,
      tags: [],
    });
    const snapshot = (id, parentId, createdAt, messages) => ({
      meta: {
        checkpoint_id: id,
        parent_checkpoint_id: parentId,
        created_at: createdAt,
      },
      data: { messages },
    });
    const firstUser = message("user-1", "user", "hi");
    const firstAssistant = message("assistant-1", "assistant", "hello");
    const secondUser = message("user-2", "user", "how are you");
    const tree = buildTreeFromCheckpoints([
      snapshot("turn-1-request", null, 1, [firstUser]),
      snapshot("turn-1-final", "turn-1-request", 2, [firstUser, firstAssistant]),
      snapshot("turn-2-request", "turn-1-final", 3, [firstUser, firstAssistant, secondUser]),
      snapshot("turn-2-final", "turn-2-request", 4, [firstUser, firstAssistant, secondUser]),
    ]);

    expect(findForkParentCheckpointId(tree, "user-1")).toBeNull();
    expect(findForkParentCheckpointId(tree, "user-2")).toBe("turn-1-final");
  });

  test("restores an answered ask_user as its dedicated summary item", () => {
    const record = (id, role, content) => ({
      id,
      role,
      content: [content],
      status: "completed",
      timestamp: 0,
      first_token_at: null,
      completed_at: null,
      tags: [],
    });
    const tree = buildTreeFromCheckpoints([
      {
        meta: {
          checkpoint_id: "final",
          parent_checkpoint_id: null,
          created_at: 1,
        },
        data: {
          phase: "final_completed",
          messages: [
            record("ask", "assistant", {
              type: "tool_use",
              id: "ask-1",
              name: "ask_user",
              input: {
                title: "Choose",
                fields: [{ type: "select", name: "choice", label: "Choice", options: ["A", "B"] }],
              },
            }),
            record("answer", "user", {
              type: "tool_result",
              tool_use_id: "ask-1",
              content: JSON.stringify({ values: { choice: "B" } }),
            }),
          ],
        },
      },
    ]);

    expect(tree.nodes.final.timelineMessages).toHaveLength(1);
    expect(tree.nodes.final.timelineMessages[0].items).toEqual([
      {
        type: "user_input",
        request: {
          request_id: "ask-1",
          conv_id: null,
          kind: "ask_user",
          title: "Choose",
          fields: [{ type: "select", name: "choice", label: "Choice", options: ["A", "B"] }],
        },
        state: "answered",
        response: { values: { choice: "B" } },
      },
    ]);
  });

  test("normalizes object options when restoring ask_user from a checkpoint", () => {
    const tree = buildTreeFromCheckpoints([
      {
        meta: { checkpoint_id: "interrupted", parent_checkpoint_id: null, created_at: 1 },
        data: {
          phase: "interrupted",
          messages: [
            {
              id: "ask",
              role: "assistant",
              content: [
                {
                  type: "tool_use",
                  id: "ask-1",
                  name: "ask_user",
                  input: {
                    fields: [
                      {
                        type: "select",
                        name: "choice",
                        label: "Choice",
                        options: [{ label: "A" }, { label: "Bee", value: "B" }],
                      },
                    ],
                  },
                },
              ],
              status: "completed",
              timestamp: 0,
              first_token_at: null,
              completed_at: null,
              tags: [],
            },
          ],
        },
      },
    ]);

    expect(tree.nodes.interrupted.timelineMessages[0].items[0]).toMatchObject({
      type: "user_input",
      request: {
        fields: [{ options: ["A", "B"] }],
      },
    });
  });

  test("restores an ask_user abandoned by a direct reply as unanswered", () => {
    const record = (id, role, content) => ({
      id,
      role,
      content: [content],
      status: "completed",
      timestamp: 0,
      first_token_at: null,
      completed_at: null,
      tags: [],
    });
    const denial =
      "Tool 'ask_user' was not approved because the user continued the conversation. It was not executed.";
    const tree = buildTreeFromCheckpoints([
      {
        meta: { checkpoint_id: "final", parent_checkpoint_id: null, created_at: 1 },
        data: {
          phase: "final_completed",
          messages: [
            record("ask", "assistant", {
              type: "tool_use",
              id: "ask-1",
              name: "ask_user",
              input: { fields: [{ type: "text", name: "choice", label: "Choice" }] },
            }),
            record("denial", "user", {
              type: "tool_result",
              tool_use_id: "ask-1",
              content: [{ type: "text", text: denial }],
            }),
          ],
        },
      },
    ]);

    expect(tree.nodes.final.timelineMessages[0].items[0]).toMatchObject({
      type: "user_input",
      state: "unanswered",
    });
  });

  test("restores an unanswered ask_user as a pending form instead of a tool card", () => {
    const tree = buildTreeFromCheckpoints([
      {
        meta: { checkpoint_id: "interrupted", parent_checkpoint_id: null, created_at: 1 },
        data: {
          phase: "interrupted",
          messages: [
            {
              id: "ask",
              role: "assistant",
              content: [
                {
                  type: "tool_use",
                  id: "ask-1",
                  name: "ask_user",
                  input: { fields: [{ type: "text", name: "name", label: "Name" }] },
                },
              ],
              status: "completed",
              timestamp: 0,
              first_token_at: null,
              completed_at: null,
              tags: [],
            },
          ],
        },
      },
    ]);

    expect(tree.nodes.interrupted.timelineMessages[0].items[0]).toMatchObject({
      type: "user_input",
      state: "pending",
      request: { request_id: "ask-1", kind: "ask_user" },
    });
  });

  test("restores durable runtime terminal messages as special notice items", () => {
    const tree = buildTreeFromCheckpoints([
      {
        meta: { checkpoint_id: "failed", parent_checkpoint_id: null, created_at: 1 },
        data: {
          phase: "final_failed",
          messages: [
            {
              id: "runtime-error",
              role: "assistant",
              content: [{ type: "runtime_error", reason: "Provider disconnected" }],
              status: "completed",
              timestamp: 1,
              first_token_at: null,
              completed_at: null,
              tags: [],
            },
          ],
        },
      },
    ]);

    expect(tree.nodes.failed.timelineMessages[0].items).toEqual([
      {
        type: "runtime_notice",
        kind: "error",
        reason: "Provider disconnected",
      },
    ]);
  });

  test("hides goal continuation prompts while projecting checkpoint flow metadata", () => {
    const record = (id, role, text, tags = []) => ({
      id,
      role,
      content: [{ type: "text", text }],
      status: "completed",
      timestamp: 0,
      first_token_at: null,
      completed_at: null,
      tags,
    });
    const tree = buildTreeFromCheckpoints([
      {
        meta: { checkpoint_id: "goal-running", parent_checkpoint_id: null, created_at: 1 },
        data: {
          phase: "before_completion",
          flow: {
            kind: "goal",
            state: {
              objective: "Ship the feature",
              graph_node_id: null,
              todos: [{ id: "implement", task: "Implement it", status: "in_progress" }],
              status: "running",
            },
          },
          messages: [
            record("goal-command", "user", "/goal Ship the feature", ["goal_bootstrap"]),
            record("assistant", "assistant", "I am working on it."),
            record("goal-control", "user", "Continue the incomplete goal.", ["goal_continuation"]),
          ],
        },
      },
    ]);

    expect(tree.nodes["goal-running"]).toMatchObject({
      flowKind: "goal",
      flowStatus: "running",
    });
    expect(tree.nodes["goal-running"].timelineMessages.map((message) => message.id)).toEqual([
      "goal-command",
      "assistant",
    ]);
  });
});

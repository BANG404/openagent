import { expect, test } from "bun:test";
import { createInputQueueProjection } from "../src/lib/inputQueue";
import type { InputQueueAction, InputQueueSnapshot } from "../sdk/typescript/src/contracts";

function snapshot(revision: number, convId = "one"): InputQueueSnapshot {
  return { convId, revision, paused: false, activeRunId: null, items: [] };
}

test("a late read cannot replace an accepted mutation or another conversation", async () => {
  let resolveRead!: (value: InputQueueSnapshot) => void;
  const projection = createInputQueueProjection({
    getInputQueue: () =>
      new Promise((resolve) => {
        resolveRead = resolve;
      }),
    mutateInputQueue: async () => snapshot(3),
  });
  const read = projection.load("one");
  await projection.mutate("one", { type: "set_paused", paused: true });
  projection.accept(snapshot(5, "two"));
  resolveRead(snapshot(1));
  await read;
  projection.accept(snapshot(2));
  expect(projection.snapshots.one.revision).toBe(3);
  expect(projection.snapshots.two.revision).toBe(5);
  expect(projection.loading.one).toBe(false);
});

test("uncertain acceptance reuses identities and keeps attachments, context and model", async () => {
  const attempts: InputQueueAction[] = [];
  const projection = createInputQueueProjection({
    getInputQueue: async () => snapshot(0),
    mutateInputQueue: async (_convId, action) => {
      attempts.push(action);
      if (attempts.length === 1) throw new Error("response lost");
      return snapshot(attempts.length);
    },
  });
  const input = {
    convId: "one",
    text: "follow up",
    branchId: "branch",
    attachments: ["upload.txt"],
    contexts: [{ type: "quote" as const, text: "excerpt", sourceMessageId: "earlier" }],
    modelBinding: { providerId: "provider", model: "model" },
  };
  await expect(projection.submit(input, "next_turn")).rejects.toThrow("response lost");
  expect(projection.pending.one).toBe(0);
  expect(projection.errors.one).toContain("response lost");
  await projection.submit(input, "next_turn");
  expect(attempts[1]).toEqual(attempts[0]);
  expect(attempts[1]).toMatchObject({ type: "add", input });
  await projection.submit(input, "next_turn");
  expect(attempts[2]).not.toEqual(attempts[1]);
});

test("steering includes its observed run and never starts a turn in the client", async () => {
  const attempts: InputQueueAction[] = [];
  const projection = createInputQueueProjection({
    getInputQueue: async () => snapshot(0),
    mutateInputQueue: async (_convId, action) => {
      attempts.push(action);
      return snapshot(1);
    },
  });
  await projection.submit(
    { convId: "one", text: "adjust", modelBinding: null },
    "steer",
    "observed-run",
  );
  expect(attempts).toHaveLength(1);
  expect(attempts[0]).toMatchObject({
    type: "add",
    delivery: "steer",
    expectedRunId: "observed-run",
  });
});

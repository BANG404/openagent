import { expect, test } from "bun:test";
import { createInputQueueProjection, visibleInputQueueItems } from "../src/lib/inputQueue";
import type { InputQueueAction, InputQueueSnapshot } from "../sdk/typescript/src/contracts";

function snapshot(revision: number, convId = "one"): InputQueueSnapshot {
  return { convId, revision, paused: false, activeRunId: null, items: [] };
}

test("an idle dispatch head does not open the inbox; actual waiting and failures do", () => {
  const state: InputQueueSnapshot = {
    ...snapshot(1),
    items: ["first", "second"].map((id) => ({
      id,
      input: { convId: "one", text: id },
      delivery: "next_turn",
      status: "queued",
      runId: null,
      error: null,
    })),
  };
  expect(visibleInputQueueItems({ ...state, items: [state.items[0]] })).toEqual([]);
  expect(visibleInputQueueItems(state).map((item) => item.id)).toEqual(["second"]);
  expect(visibleInputQueueItems({ ...state, activeRunId: "busy" })).toEqual(state.items);
  expect(visibleInputQueueItems({ ...state, paused: true })).toEqual(state.items);
  expect(
    visibleInputQueueItems({ ...state, items: [{ ...state.items[0], status: "failed" }] }),
  ).toHaveLength(1);
  for (const status of ["starting", "running", "failed"] as const) {
    const blocked = { ...state, items: [{ ...state.items[0], status }, state.items[1]] };
    expect(visibleInputQueueItems(blocked).some((item) => item.id === "second")).toBe(true);
  }
});

test("confirmed consumption removes a row even if a stale acceptance arrives later", () => {
  const projection = createInputQueueProjection({
    getInputQueue: async () => snapshot(0),
    mutateInputQueue: async () => snapshot(0),
  });
  const queued: InputQueueSnapshot = {
    ...snapshot(1),
    activeRunId: "busy",
    items: [
      {
        id: "steer",
        delivery: "steer",
        status: "queued",
        runId: "busy",
        error: null,
        input: { convId: "one", text: "correction" },
      },
    ],
  };
  projection.accept(queued);
  expect(projection.snapshots.one.items).toHaveLength(1);
  projection.confirmConsumed("one", "steer");
  expect(projection.snapshots.one.items).toEqual([]);
  projection.accept({ ...queued, revision: 2 });
  expect(projection.snapshots.one.items).toEqual([]);
});

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

test("terminal notifications during a read trigger one trailing refresh", async () => {
  let release!: (value: InputQueueSnapshot) => void;
  let reads = 0;
  const projection = createInputQueueProjection({
    getInputQueue: async () => {
      reads++;
      return reads === 1
        ? new Promise((resolve) => {
            release = resolve;
          })
        : snapshot(4);
    },
    mutateInputQueue: async () => snapshot(0),
  });
  const reading = projection.load("one");
  await projection.load("one");
  await projection.load("one");
  release({ ...snapshot(3), activeRunId: "finishing-run" });
  await reading;
  expect(reads).toBe(2);
  expect(projection.snapshots.one).toEqual(snapshot(4));
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
  const accepted = await projection.submit(input, "next_turn");
  expect(attempts[1]).toEqual(attempts[0]);
  expect(attempts[1]).toMatchObject({ type: "add", input });
  expect(accepted.snapshot).toEqual(snapshot(2));
  expect((attempts[1] as Extract<InputQueueAction, { type: "add" }>).input).toEqual(accepted.input);
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
  const accepted = await projection.submit(
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
  expect(accepted.input.userMessageId).toBeTruthy();
  expect((attempts[0] as Extract<InputQueueAction, { type: "add" }>).input).toEqual(accepted.input);
});

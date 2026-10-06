import { describe, expect, test } from "bun:test";
import type { RemoteConversationState } from "../src/lib/openagent";
import { createRemoteConnectionController } from "../src/lib/remote/connection";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function state(convId: string): RemoteConversationState {
  return {
    conv_id: convId,
    title: null,
    phase: null,
    checkpoint_id: null,
    messages: [],
    interrupts: [],
  };
}

function harness() {
  let active: string | null = null;
  const snapshots = new Map<string, ReturnType<typeof deferred<RemoteConversationState>>>();
  const subscriptions: Array<{
    convId: string;
    onState: (next: RemoteConversationState) => void;
    onError?: () => void;
    unsubscribed: boolean;
    ready: ReturnType<typeof deferred<() => void>>;
  }> = [];
  const prepares: boolean[] = [];
  const applied: string[] = [];
  const initial: string[] = [];
  const historyChecks: Array<() => boolean> = [];
  const errors: unknown[] = [];
  const timers: Array<{ callback: () => void; delay: number; cancelled: boolean }> = [];
  let reconnects = 0;
  const controller = createRemoteConnectionController({
    client: {
      getRemoteConversationState(convId) {
        const next = deferred<RemoteConversationState>();
        snapshots.set(convId, next);
        return next.promise;
      },
      subscribeToConversationState(convId, onState, onError) {
        const subscription = {
          convId,
          onState,
          onError,
          unsubscribed: false,
          ready: deferred<() => void>(),
        };
        subscriptions.push(subscription);
        return subscription.ready.promise;
      },
    },
    activeConversationId: () => active,
    prepare(preserve) {
      prepares.push(preserve);
    },
    async loadHistory(_convId, isCurrent) {
      historyChecks.push(isCurrent);
    },
    applyInitialState(next) {
      active = next.conv_id;
      initial.push(next.conv_id);
    },
    applyState(next) {
      applied.push(next.conv_id);
    },
    onConnected() {},
    onReconnecting() {
      reconnects += 1;
    },
    onError(cause) {
      errors.push(cause);
    },
    schedule(callback, delay) {
      timers.push({ callback, delay, cancelled: false });
      return timers.length as unknown as ReturnType<typeof setTimeout>;
    },
    cancel(timer) {
      timers[Number(timer) - 1].cancelled = true;
    },
  });
  async function resolveSnapshot(convId: string) {
    snapshots.get(convId)!.resolve(state(convId));
    await Promise.resolve();
    await Promise.resolve();
  }
  function resolveSubscription(index: number) {
    const entry = subscriptions[index];
    entry.ready.resolve(() => {
      entry.unsubscribed = true;
    });
  }
  return {
    controller,
    snapshots,
    subscriptions,
    prepares,
    applied,
    initial,
    historyChecks,
    errors,
    timers,
    resolveSnapshot,
    resolveSubscription,
    get reconnects() {
      return reconnects;
    },
  };
}

describe("remote connection ownership", () => {
  test("ignores snapshots and history from a retired request", async () => {
    const h = harness();
    const old = h.controller.connect("old");
    const current = h.controller.connect("current");
    expect(h.historyChecks[0]()).toBe(false);
    expect(h.historyChecks[1]()).toBe(true);
    await h.resolveSnapshot("old");
    await old;
    expect(h.initial).toEqual([]);
    await h.resolveSnapshot("current");
    h.resolveSubscription(0);
    await current;
    expect(h.initial).toEqual(["current"]);
    expect(h.subscriptions.map((entry) => entry.convId)).toEqual(["current"]);
  });

  test("releases a subscription that arrives after reset", async () => {
    const h = harness();
    const connecting = h.controller.connect("a");
    await h.resolveSnapshot("a");
    h.controller.reset();
    h.resolveSubscription(0);
    await connecting;
    expect(h.subscriptions[0].unsubscribed).toBe(true);
    h.subscriptions[0].onState(state("a"));
    h.subscriptions[0].onError?.();
    expect(h.applied).toEqual([]);
    expect(h.timers).toEqual([]);
  });

  test("owns one timer and cancels it when selection changes", async () => {
    const h = harness();
    const connecting = h.controller.connect("a");
    await h.resolveSnapshot("a");
    h.resolveSubscription(0);
    await connecting;
    h.subscriptions[0].onError?.();
    h.subscriptions[0].onError?.();
    expect(h.timers).toHaveLength(1);
    expect(h.reconnects).toBe(1);
    h.controller.reset();
    expect(h.timers[0].cancelled).toBe(true);
    h.timers[0].callback();
    expect(h.prepares).toEqual([false]);
    expect(h.subscriptions[0].unsubscribed).toBe(true);
  });

  test("backs off failed retries while preserving the pending turn", async () => {
    const h = harness();
    const connecting = h.controller.connect("a");
    await h.resolveSnapshot("a");
    h.resolveSubscription(0);
    await connecting;
    h.subscriptions[0].onError?.();
    expect(h.timers[0].delay).toBe(1000);
    h.timers[0].callback();
    h.snapshots.get("a")!.reject(new Error("offline"));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(h.prepares).toEqual([false, true]);
    expect(h.errors).toHaveLength(1);
    expect(h.timers[1].delay).toBe(2000);
    h.controller.dispose();
    expect(h.timers[1].cancelled).toBe(true);
  });

  test("dispose prevents late initial state and further connections", async () => {
    const h = harness();
    const connecting = h.controller.connect("a");
    h.controller.dispose();
    await h.resolveSnapshot("a");
    await connecting;
    await h.controller.connect("b");
    expect(h.initial).toEqual([]);
    expect(h.subscriptions).toEqual([]);
    expect(h.prepares).toEqual([false]);
  });
});

import { expect, test } from "bun:test";
import { startMemoryStatusPolling } from "../src/lib/page/memoryStatusPolling";

class Visibility extends EventTarget {
  hidden = false;
  change(hidden: boolean) {
    this.hidden = hidden;
    this.dispatchEvent(new Event("visibilitychange"));
  }
}

function fixture(
  read: () => Promise<boolean> = async () => false,
  observeActivity?: (changed: (active: boolean) => void) => Promise<() => void>,
) {
  const visibility = new Visibility();
  let now = 0;
  let sequence = 0;
  const timers = new Map<number, { callback: () => void; at: number }>();
  const updates: boolean[] = [];
  const stop = startMemoryStatusPolling({
    read,
    update: (syncing) => updates.push(syncing),
    visibility,
    observeActivity,
    schedule(callback, milliseconds) {
      const id = ++sequence;
      timers.set(id, { callback, at: now + milliseconds });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    cancel(timer) {
      timers.delete(timer as unknown as number);
    },
  });
  async function flush() {
    await Promise.resolve();
    await Promise.resolve();
  }
  return {
    visibility,
    updates,
    stop,
    timers,
    flush,
    async advance(milliseconds: number) {
      const end = now + milliseconds;
      await flush();
      while (true) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        now = next[1].at;
        timers.delete(next[0]);
        next[1].callback();
        await flush();
      }
      now = end;
    },
  };
}

test("idle status performs five reads in one minute including the initial read; hidden pages perform none", async () => {
  let calls = 0;
  const f = fixture(async () => {
    calls++;
    return false;
  });
  await f.advance(60_000);
  expect(calls).toBe(5);
  f.visibility.change(true);
  await f.advance(60_000);
  expect(calls).toBe(5);
  f.visibility.change(false);
  await f.flush();
  expect(calls).toBe(6);
  f.stop();
  await f.advance(60_000);
  f.visibility.change(false);
  expect(calls).toBe(6);
  expect(f.timers.size).toBe(0);
});

test("busy status refreshes every two seconds then returns to idle cadence", async () => {
  let calls = 0;
  const f = fixture(async () => ++calls < 3);
  await f.advance(4_000);
  expect(f.updates).toEqual([true, true, false]);
  await f.advance(14_999);
  expect(calls).toBe(3);
  await f.advance(1);
  expect(calls).toBe(4);
  f.stop();
});

test("slow reads never overlap and disposal ignores a pending result", async () => {
  let resolve!: (value: boolean) => void;
  let calls = 0;
  const f = fixture(() => {
    calls++;
    return new Promise<boolean>((done) => {
      resolve = done;
    });
  });
  await f.advance(60_000);
  f.visibility.change(true);
  f.visibility.change(false);
  expect(calls).toBe(1);
  f.stop();
  resolve(true);
  await f.flush();
  expect(f.updates).toEqual([]);
  expect(f.timers.size).toBe(0);
});

test("a failed optional read backs off and retries when visible", async () => {
  let calls = 0;
  const f = fixture(async () => {
    if (++calls === 1) throw new Error("offline");
    return true;
  });
  await f.advance(15_000);
  expect(calls).toBe(2);
  expect(f.updates).toEqual([true]);
  f.stop();
});

test("native focus pauses polling even when WebView2 document visibility stays visible", async () => {
  let changed!: (active: boolean) => void;
  let disposed = false;
  let calls = 0;
  const f = fixture(
    async () => {
      calls++;
      return false;
    },
    async (listener) => {
      changed = listener;
      return () => {
        disposed = true;
      };
    },
  );
  await f.flush();
  changed(false);
  expect(f.visibility.hidden).toBe(false);
  await f.advance(60_000);
  expect(calls).toBe(1);
  changed(true);
  await f.flush();
  expect(calls).toBe(2);
  f.stop();
  expect(disposed).toBe(true);
  changed(true);
  expect(calls).toBe(2);
});

test("a native listener that finishes attaching after teardown is disposed", async () => {
  let attached!: (dispose: () => void) => void;
  let disposed = false;
  const f = fixture(
    async () => false,
    () =>
      new Promise((resolve) => {
        attached = resolve;
      }),
  );
  f.stop();
  attached(() => {
    disposed = true;
  });
  await f.flush();
  expect(disposed).toBe(true);
  expect(f.timers.size).toBe(0);
});

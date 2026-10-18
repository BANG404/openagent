import { afterEach, beforeEach, expect, test } from "bun:test";
import { highlightDiffInWorker } from "../src/lib/streamdown/diffHighlightClient";
import type { FileChangeDiffLine } from "../src/lib/fileChangeDiff";

const OriginalWorker = globalThis.Worker;
const lines: FileChangeDiffLine[] = [{ type: "add", text: "+const a = 1", newLine: 1 }];
class ControlledWorker {
  static instances: ControlledWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminated = false;
  constructor() {
    ControlledWorker.instances.push(this);
  }
  postMessage() {}
  terminate() {
    this.terminated = true;
  }
}
beforeEach(() => {
  ControlledWorker.instances = [];
  globalThis.Worker = ControlledWorker as unknown as typeof Worker;
});
afterEach(() => {
  globalThis.Worker = OriginalWorker;
});

test("syntax completion returns tokens and terminates its worker", async () => {
  const result = highlightDiffInWorker(lines, "file.ts", new AbortController().signal);
  const worker = ControlledWorker.instances[0];
  const tokens = [[{ content: "const a = 1", offset: 0 }]];
  worker.onmessage?.({ data: tokens } as MessageEvent);
  expect(await result).toEqual(tokens);
  expect(worker.terminated).toBe(true);
});

test("switching source or unmounting aborts pending grammar work", async () => {
  const controller = new AbortController();
  const result = highlightDiffInWorker(lines, "file.ts", controller.signal);
  controller.abort();
  expect(await result).toBeNull();
  expect(ControlledWorker.instances[0].terminated).toBe(true);
  expect(await highlightDiffInWorker(lines, "file.ts", controller.signal)).toBeNull();
  expect(ControlledWorker.instances.length).toBe(1);
});

test("worker startup and runtime errors preserve literal source", async () => {
  globalThis.Worker = class {
    constructor() {
      throw new Error("worker unavailable");
    }
  } as unknown as typeof Worker;
  expect(await highlightDiffInWorker(lines, "file.ts", new AbortController().signal)).toBeNull();
  globalThis.Worker = ControlledWorker as unknown as typeof Worker;
  const result = highlightDiffInWorker(lines, "file.ts", new AbortController().signal);
  ControlledWorker.instances[0].onmessageerror?.();
  expect(await result).toBeNull();
  expect(ControlledWorker.instances[0].terminated).toBe(true);
});

test("a stalled grammar worker is terminated at its deadline", async () => {
  expect(await highlightDiffInWorker(lines, "file.ts", new AbortController().signal)).toBeNull();
  expect(ControlledWorker.instances[0].terminated).toBe(true);
});

test("long embedded source bypasses workers without changing the input", async () => {
  const text = "+<style>" + ".car{color:red}".repeat(1_000) + "</style>";
  const oversized: FileChangeDiffLine[] = [{ type: "add", text, newLine: 1 }];
  expect(
    await highlightDiffInWorker(oversized, "index.html", new AbortController().signal),
  ).toBeNull();
  expect(ControlledWorker.instances.length).toBe(0);
  expect(oversized[0].text).toBe(text);
});

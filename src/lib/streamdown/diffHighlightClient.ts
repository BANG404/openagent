import type { ThemedToken } from "shiki/core";
import type { FileChangeDiffLine } from "$lib/fileChangeDiff";
import { canHighlightDiff } from "./diffHighlightLimits";

/** A disposable worker keeps grammar compilation/tokenization off the UI thread. */
export function highlightDiffInWorker(
  lines: FileChangeDiffLine[],
  path: string,
  signal: AbortSignal,
): Promise<ThemedToken[][] | null> {
  if (signal.aborted || !canHighlightDiff(lines)) return Promise.resolve(null);
  return new Promise((resolve) => {
    let worker: Worker | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (tokens: ThemedToken[][] | null) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      worker?.terminate();
      resolve(tokens);
    };
    const cancel = () => finish(null);
    signal.addEventListener("abort", cancel, { once: true });
    try {
      worker = new Worker(new URL("./diffHighlight.worker.ts", import.meta.url), {
        type: "module",
      });
      worker.onmessage = (event: MessageEvent<ThemedToken[][]>) => finish(event.data);
      worker.onerror = (event) => {
        event.preventDefault();
        finish(null);
      };
      worker.onmessageerror = cancel;
      timer = setTimeout(cancel, 4_000);
      worker.postMessage({ lines, path });
    } catch {
      finish(null);
    }
  });
}

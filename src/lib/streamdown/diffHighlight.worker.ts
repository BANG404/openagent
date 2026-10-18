import type { FileChangeDiffLine } from "$lib/fileChangeDiff";
import { highlightDiffLines } from "./diffHighlight";

self.onmessage = async (event: MessageEvent<{ lines: FileChangeDiffLine[]; path: string }>) => {
  const { lines, path } = event.data;
  self.postMessage(await highlightDiffLines(lines, path));
};

import { parseBlocks, splice, type ComposerEdit, type InlineNode } from "./composerMarkdown";

type References = ReadonlyMap<string, string>;

function inlineNodes(value: string, references: References): InlineNode[] {
  const nodes: InlineNode[] = [];
  const visit = (items: InlineNode[]) => {
    for (const item of items) {
      nodes.push(item);
      visit(item.children ?? []);
    }
  };
  for (const block of parseBlocks(value, references)) visit(block.inline);
  return nodes;
}

/** Delete what the user can see, skipping hidden delimiters and whole chips. */
export function visibleDeletionRange(
  value: string,
  caret: number,
  backward: boolean,
  references: References = new Map(),
): { start: number; end: number } {
  const units: Array<{ start: number; end: number }> = [];
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  for (const node of inlineNodes(value, references)) {
    if (node.kind === "chip") units.push({ start: node.start, end: node.end });
    if (node.kind !== "text") continue;
    for (const segment of segmenter.segment(node.text)) {
      const start = node.contentStart + segment.index;
      units.push({ start, end: start + segment.segment.length });
    }
  }
  for (let index = value.indexOf("\n"); index !== -1; index = value.indexOf("\n", index + 1)) {
    units.push({ start: index, end: index + 1 });
  }
  units.sort((a, b) => a.start - b.start);
  const target = backward
    ? units.findLast((unit) => unit.start < caret)
    : units.find((unit) => unit.end > caret);
  return target ?? { start: caret, end: caret };
}

/**
 * Replay a visible selection on the source. Only delimiters belonging to spans
 * emptied or crossed by this edit are removed; unrelated literal source is safe.
 */
export function replaceMarkdownRange(
  value: string,
  start: number,
  end: number,
  insertion: string,
  references: References = new Map(),
): ComposerEdit {
  if (start === end) return splice(value, start, end, insertion);
  const removals = [{ start, end }];
  for (const node of inlineNodes(value, references)) {
    if (node.kind === "text" || node.kind === "chip") continue;
    const emptied = !insertion && start <= node.contentStart && end >= node.contentEnd;
    const crossesStart = start <= node.start && end > node.contentStart;
    const crossesEnd = start < node.contentEnd && end >= node.end;
    if (emptied || crossesStart || crossesEnd) {
      removals.push({ start: node.start, end: node.contentStart });
      removals.push({ start: node.contentEnd, end: node.end });
    }
  }
  // Merging lines discards the second line's hidden heading/list/quote marker.
  for (const block of parseBlocks(value, references)) {
    if (start < block.start && end >= block.start && block.markerRaw) {
      removals.push({ start: block.start, end: block.contentStart });
    }
  }
  removals.sort((a, b) => a.start - b.start);
  const merged: typeof removals = [];
  for (const removal of removals) {
    const previous = merged.at(-1);
    if (previous && removal.start <= previous.end)
      previous.end = Math.max(previous.end, removal.end);
    else merged.push({ ...removal });
  }
  let next = "";
  let cursor = 0;
  let caret = start;
  for (const removal of merged) {
    next += value.slice(cursor, removal.start);
    if (removal.start <= start && start <= removal.end) {
      next += insertion;
      caret = next.length;
    }
    cursor = removal.end;
  }
  return { value: next + value.slice(cursor), caret };
}

/** A copied fragment is self-contained Markdown, even inside nested formats. */
export function selectedMarkdown(
  value: string,
  start: number,
  end: number,
  references: References = new Map(),
): string {
  const fragment = (nodes: InlineNode[]): string =>
    nodes
      .map((node) => {
        const from = Math.max(start, node.contentStart);
        const to = Math.min(end, node.contentEnd);
        if (from >= to) return "";
        if (node.kind === "chip") return node.raw;
        if (node.kind === "text") return value.slice(from, to);
        const content = fragment(node.children ?? []);
        return (
          value.slice(node.start, node.contentStart) +
          content +
          value.slice(node.contentEnd, node.end)
        );
      })
      .join("");
  return parseBlocks(value, references)
    .filter((block) => block.end >= start && block.start <= end)
    .map((block) => (start <= block.contentStart ? block.markerRaw : "") + fragment(block.inline))
    .join("\n");
}

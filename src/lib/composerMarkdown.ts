import { segmentComposerTokens } from "./components/composerTokenHighlights";

/**
 * Pure markdown model for the composer and the user transcript bubble.
 *
 * The markdown string is canonical. This module projects it into blocks and
 * inline nodes carrying exact source offsets, so a contenteditable view can hide
 * markup markers while still mapping DOM carets back to markdown offsets.
 */

export type InlineKind = "text" | "strong" | "em" | "del" | "code" | "link" | "chip";

export interface InlineNode {
  kind: InlineKind;
  /** Visible text, with markup markers removed. */
  text: string;
  /** Exact markdown source slice. */
  raw: string;
  /** Absolute offset of `raw` in the document. */
  start: number;
  end: number;
  /** Absolute offset where visible content begins (after any opening marker). */
  contentStart: number;
  contentEnd: number;
  children?: InlineNode[];
  href?: string;
  chipKind?: "attachment" | "token";
}

export type BlockKind = "paragraph" | "heading" | "quote" | "listItem";

export interface BlockNode {
  kind: BlockKind;
  /** Exact markdown source line. */
  raw: string;
  start: number;
  end: number;
  /** Absolute offset where the visible line content begins (after the marker). */
  contentStart: number;
  /** Exact marker source, e.g. `"## "`, `"- [ ] "`, `"> "`, `""`. */
  markerRaw: string;
  level?: number;
  ordered?: boolean;
  /** `true`/`false` for task items, `null` for plain list items. */
  checked?: boolean | null;
  inline: InlineNode[];
}

export interface ComposerEdit {
  value: string;
  caret: number;
}

const HEADING = /^(#{1,6})[ \t]+/;
const QUOTE = /^>[ \t]?/;
const TASK = /^([-*+])[ \t]+\[([ xX])\][ \t]+/;
const UNORDERED = /^([-*+])[ \t]+/;
const ORDERED = /^(\d{1,9})([.)])[ \t]+/;

const MAX_INLINE_DEPTH = 6;
const WHITESPACE = /\s/u;
const WORD_BREAK = /[\s,，。;；：!?！？、()[\]{}<>《》]/u;

interface Delimited {
  contentStart: number;
  contentEnd: number;
  end: number;
  href?: string;
}

export interface ProtectedSpan {
  start: number;
  end: number;
  kind: "attachment" | "token";
}

/** Attachment labels and `@`/`#` tokens that must never parse as markdown. */
export function protectedSpans(
  text: string,
  references: ReadonlyMap<string, string> = new Map(),
): ProtectedSpan[] {
  const spans: ProtectedSpan[] = [];
  let offset = 0;
  for (const segment of segmentComposerTokens(text, references)) {
    if (segment.highlighted) {
      spans.push({
        start: offset,
        end: offset + segment.text.length,
        kind: segment.attachmentPath ? "attachment" : "token",
      });
    }
    offset += segment.text.length;
  }
  return spans;
}

function matchDelimited(text: string, start: number, delimiter: string): Delimited | null {
  const contentStart = start + delimiter.length;
  const first = text[contentStart];
  if (first === undefined || WHITESPACE.test(first)) return null;
  let search = contentStart;
  while (search <= text.length) {
    const close = text.indexOf(delimiter, search);
    if (close === -1) return null;
    const before = text[close - 1];
    if (close > contentStart && before !== undefined && !WHITESPACE.test(before)) {
      return { contentStart, contentEnd: close, end: close + delimiter.length };
    }
    search = close + 1;
  }
  return null;
}

function matchLink(text: string, start: number): Delimited | null {
  const labelEnd = text.indexOf("](", start + 1);
  if (labelEnd <= start + 1) return null;
  const urlStart = labelEnd + 2;
  const urlEnd = text.indexOf(")", urlStart);
  if (urlEnd <= urlStart) return null;
  return {
    contentStart: start + 1,
    contentEnd: labelEnd,
    end: urlEnd + 1,
    href: text.slice(urlStart, urlEnd),
  };
}

/** Only closed, non-empty spans render; a half-typed marker stays literal. */
function matchSpan(text: string, index: number): { kind: InlineKind; match: Delimited } | null {
  const character = text[index];
  if (character === "`") {
    const match = matchDelimited(text, index, "`");
    return match ? { kind: "code", match } : null;
  }
  if (character === "[") {
    const match = matchLink(text, index);
    return match ? { kind: "link", match } : null;
  }
  if (character === "~") {
    const match = matchDelimited(text, index, "~~");
    return match ? { kind: "del", match } : null;
  }
  if (character === "*") {
    if (text.startsWith("**", index)) {
      const strong = matchDelimited(text, index, "**");
      if (strong) return { kind: "strong", match: strong };
    }
    const em = matchDelimited(text, index, "*");
    return em ? { kind: "em", match: em } : null;
  }
  return null;
}

function textNode(raw: string, start: number): InlineNode {
  return {
    kind: "text",
    text: raw,
    raw,
    start,
    end: start + raw.length,
    contentStart: start,
    contentEnd: start + raw.length,
  };
}

function parseEmphasis(
  text: string,
  base: number,
  depth: number,
  references: ReadonlyMap<string, string>,
): InlineNode[] {
  const nodes: InlineNode[] = [];
  let plainStart = 0;
  let index = 0;

  const pushPlain = (end: number) => {
    if (end <= plainStart) return;
    nodes.push(textNode(text.slice(plainStart, end), base + plainStart));
  };

  while (index < text.length) {
    const found = matchSpan(text, index);
    if (!found) {
      index += 1;
      continue;
    }
    const { kind, match } = found;
    pushPlain(index);
    const content = text.slice(match.contentStart, match.contentEnd);
    const children =
      kind === "code" || depth >= MAX_INLINE_DEPTH
        ? [textNode(content, base + match.contentStart)]
        : parseInlineRange(content, base + match.contentStart, depth + 1, references);
    const node: InlineNode = {
      kind,
      text: content,
      raw: text.slice(index, match.end),
      start: base + index,
      end: base + match.end,
      contentStart: base + match.contentStart,
      contentEnd: base + match.contentEnd,
      children,
    };
    if (kind === "link") node.href = match.href;
    nodes.push(node);
    index = match.end;
    plainStart = index;
  }
  pushPlain(text.length);
  return nodes;
}

function parseInlineRange(
  text: string,
  base: number,
  depth: number,
  references: ReadonlyMap<string, string>,
): InlineNode[] {
  const spans = protectedSpans(text, references);
  if (spans.length === 0) return parseEmphasis(text, base, depth, references);
  const nodes: InlineNode[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) {
      nodes.push(
        ...parseEmphasis(text.slice(cursor, span.start), base + cursor, depth, references),
      );
    }
    const raw = text.slice(span.start, span.end);
    nodes.push({
      kind: "chip",
      text: raw,
      raw,
      start: base + span.start,
      end: base + span.end,
      contentStart: base + span.start,
      contentEnd: base + span.end,
      chipKind: span.kind,
    });
    cursor = span.end;
  }
  if (cursor < text.length) {
    nodes.push(...parseEmphasis(text.slice(cursor), base + cursor, depth, references));
  }
  return nodes;
}

export function parseInline(
  text: string,
  base = 0,
  references: ReadonlyMap<string, string> = new Map(),
): InlineNode[] {
  return parseInlineRange(text, base, 0, references);
}

function buildBlock(
  kind: BlockKind,
  raw: string,
  start: number,
  markerRaw: string,
  references: ReadonlyMap<string, string>,
  extra: Partial<Pick<BlockNode, "level" | "ordered" | "checked">> = {},
): BlockNode {
  const contentStart = start + markerRaw.length;
  return {
    kind,
    raw,
    start,
    end: start + raw.length,
    contentStart,
    markerRaw,
    inline: parseInline(raw.slice(markerRaw.length), contentStart, references),
    ...extra,
  };
}

function parseLine(raw: string, start: number, references: ReadonlyMap<string, string>): BlockNode {
  const heading = HEADING.exec(raw);
  if (heading) {
    return buildBlock("heading", raw, start, heading[0], references, {
      level: heading[1].length,
    });
  }
  const quote = QUOTE.exec(raw);
  if (quote) return buildBlock("quote", raw, start, quote[0], references);
  const task = TASK.exec(raw);
  if (task) {
    return buildBlock("listItem", raw, start, task[0], references, {
      ordered: false,
      checked: task[2].toLowerCase() === "x",
    });
  }
  const ordered = ORDERED.exec(raw);
  if (ordered) return buildBlock("listItem", raw, start, ordered[0], references, { ordered: true });
  const unordered = UNORDERED.exec(raw);
  if (unordered) {
    return buildBlock("listItem", raw, start, unordered[0], references, {
      ordered: false,
      checked: null,
    });
  }
  return buildBlock("paragraph", raw, start, "", references);
}

/** One block per source line, so a projection can map carets line by line. */
export function parseBlocks(
  markdown: string,
  references: ReadonlyMap<string, string> = new Map(),
): BlockNode[] {
  const blocks: BlockNode[] = [];
  let lineStart = 0;
  while (lineStart <= markdown.length) {
    const newline = markdown.indexOf("\n", lineStart);
    const lineEnd = newline === -1 ? markdown.length : newline;
    blocks.push(parseLine(markdown.slice(lineStart, lineEnd), lineStart, references));
    if (newline === -1) break;
    lineStart = newline + 1;
  }
  return blocks;
}

/** Lossless: every node keeps its exact `raw`, so serialization is a join. */
export function serializeInline(nodes: InlineNode[]): string {
  return nodes.map((node) => node.raw).join("");
}

export function serializeBlocks(blocks: BlockNode[]): string {
  return blocks.map((block) => block.raw).join("\n");
}

export function lineBoundsAt(
  value: string,
  offset: number,
): { start: number; end: number; text: string } {
  const start = value.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
  const newline = value.indexOf("\n", offset);
  const end = newline === -1 ? value.length : newline;
  return { start, end, text: value.slice(start, end) };
}

function lineMarker(text: string): string | null {
  for (const pattern of [TASK, ORDERED, UNORDERED, QUOTE, HEADING]) {
    const match = pattern.exec(text);
    if (match) return match[0];
  }
  return null;
}

/** Marker that continues the current line's list or quote, or `null`. */
export function continuationMarker(text: string): string | null {
  const task = TASK.exec(text);
  if (task) return `${task[1]} [ ] `;
  const ordered = ORDERED.exec(text);
  if (ordered) return `${Number.parseInt(ordered[1], 10) + 1}${ordered[2]} `;
  const unordered = UNORDERED.exec(text);
  if (unordered) return `${unordered[1]} `;
  const quote = QUOTE.exec(text);
  if (quote) return quote[0];
  return null;
}

/** Previous word boundary for ctrl/alt+backspace style deletion. */
export function wordBoundaryBefore(value: string, offset: number): number {
  let index = offset;
  while (index > 0 && WORD_BREAK.test(value[index - 1])) index -= 1;
  while (index > 0 && !WORD_BREAK.test(value[index - 1])) index -= 1;
  return index;
}

/** Next word boundary for ctrl+delete style deletion. */
export function wordBoundaryAfter(value: string, offset: number): number {
  let index = offset;
  while (index < value.length && WORD_BREAK.test(value[index])) index += 1;
  while (index < value.length && !WORD_BREAK.test(value[index])) index += 1;
  return index;
}

export function splice(value: string, start: number, end: number, insertion: string): ComposerEdit {
  return {
    value: `${value.slice(0, start)}${insertion}${value.slice(end)}`,
    caret: start + insertion.length,
  };
}

/**
 * Shift+Enter: stay inside the current quote or list by repeating the marker,
 * and drop an empty marker instead of carrying it onto the new line. Headings
 * are single-line, so a heading marker is never carried forward.
 */
export function insertSoftLineBreak(value: string, offset: number): ComposerEdit {
  const line = lineBoundsAt(value, offset);
  const marker = lineMarker(line.text);
  if (!marker) return splice(value, offset, offset, "\n");
  if (line.text.slice(marker.length).trim().length === 0) {
    return { value: `${value.slice(0, line.start)}${value.slice(line.end)}`, caret: line.start };
  }
  const next = continuationMarker(line.text);
  return splice(value, offset, offset, next ? `\n${next}` : "\n");
}

/** Backspace at the start of a marked line clears the marker instead of merging. */
export function removeLineMarker(value: string, offset: number): ComposerEdit | null {
  const line = lineBoundsAt(value, offset);
  const marker = lineMarker(line.text);
  if (!marker) return null;
  if (offset > line.start + marker.length) return null;
  return {
    value: `${value.slice(0, line.start)}${value.slice(line.start + marker.length)}`,
    caret: line.start,
  };
}

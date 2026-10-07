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

export type BlockKind = "paragraph" | "heading" | "quote" | "listItem" | "codeBlock";

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
const QUOTE = /^(?:>[ \t]?)+/;
const TASK = /^(\s*)([-*+])[ \t]+\[([ xX])\][ \t]+/;
const UNORDERED = /^(\s*)([-*+])[ \t]+/;
const ORDERED = /^(\s*)(\d{1,9})([.)])[ \t]+/;

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
    let close = text.indexOf(delimiter, search);
    if (close === -1) return null;
    if (isEscaped(text, close)) {
      search = close + delimiter.length;
      continue;
    }
    // ***bold italic*** is strong containing emphasis, with matching margins.
    if (delimiter.length === 2 && text[close + 2] === delimiter[0]) {
      const innerRuns =
        text.slice(contentStart, close).match(delimiter[0] === "*" ? /\*+/g : /_+/g) ?? [];
      if (
        text[start + 2] === delimiter[0] ||
        innerRuns.filter((run) => run.length % 2 === 1).length % 2 === 1
      )
        close += 1;
    }
    const before = text[close - 1];
    if (close > contentStart && before !== undefined && !WHITESPACE.test(before)) {
      return { contentStart, contentEnd: close, end: close + delimiter.length };
    }
    search = close + 1;
  }
  return null;
}

function isEscaped(text: string, index: number): boolean {
  let slashes = 0;
  while (index > 0 && text[--index] === "\\") slashes += 1;
  return slashes % 2 === 1;
}

function matchCode(text: string, start: number): Delimited | null {
  const delimiter = /^`+/.exec(text.slice(start))?.[0] ?? "`";
  const contentStart = start + delimiter.length;
  let search = contentStart;
  while (search < text.length) {
    const close = text.indexOf(delimiter, search);
    if (close < 0) return null;
    if (text[close - 1] !== "`" && text[close + delimiter.length] !== "`" && close > contentStart) {
      return { contentStart, contentEnd: close, end: close + delimiter.length };
    }
    search = close + delimiter.length;
  }
  return null;
}

function matchLink(text: string, start: number): Delimited | null {
  const labelEnd = text.indexOf("](", start + 1);
  if (labelEnd <= start + 1) return null;
  const urlStart = labelEnd + 2;
  let urlEnd = urlStart;
  let depth = 1;
  for (; urlEnd < text.length; urlEnd += 1) {
    if (isEscaped(text, urlEnd)) continue;
    if (text[urlEnd] === "(") depth += 1;
    if (text[urlEnd] === ")" && --depth === 0) break;
  }
  if (depth !== 0) return null;
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
  if (isEscaped(text, index)) return null;
  const character = text[index];
  if (character === "`") {
    const match = matchCode(text, index);
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
  if (character === "*" || character === "_") {
    if (character === "_" && /[\p{L}\p{N}]/u.test(text[index - 1] ?? "")) return null;
    if (text.startsWith(character.repeat(2), index)) {
      const strong = matchDelimited(text, index, character.repeat(2));
      if (strong) return { kind: "strong", match: strong };
    }
    const em = matchDelimited(text, index, character);
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
  const spans = protectedSpans(text, references);

  const pushPlain = (end: number) => {
    if (end <= plainStart) return;
    nodes.push(textNode(text.slice(plainStart, end), base + plainStart));
  };

  while (index < text.length) {
    const span = spans.find((item) => item.start === index);
    if (span) {
      pushPlain(index);
      const raw = text.slice(span.start, span.end);
      nodes.push({ ...textNode(raw, base + span.start), kind: "chip", chipKind: span.kind });
      index = span.end;
      plainStart = index;
      continue;
    }
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
  return parseEmphasis(text, base, depth, references);
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
      checked: task[3].toLowerCase() === "x",
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
  let fence: { character: string; length: number } | null = null;
  while (lineStart <= markdown.length) {
    const newline = markdown.indexOf("\n", lineStart);
    const lineEnd = newline === -1 ? markdown.length : newline;
    const raw = markdown.slice(lineStart, lineEnd);
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(raw);
    if (fence || marker) {
      // Code source is literal, including fences, tokens and Markdown markers.
      // Keeping fences editable also preserves incomplete code blocks losslessly.
      blocks.push({
        ...buildBlock("codeBlock", raw, lineStart, "", references),
        inline: raw ? [textNode(raw, lineStart)] : [],
      });
      if (!fence && marker) fence = { character: marker[1][0], length: marker[1].length };
      else if (
        fence &&
        marker &&
        marker[1][0] === fence.character &&
        marker[1].length >= fence.length &&
        marker[2].trim() === ""
      )
        fence = null;
    } else blocks.push(parseLine(raw, lineStart, references));
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
  const start = offset === 0 ? 0 : value.lastIndexOf("\n", offset - 1) + 1;
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
  if (task) return `${task[1]}${task[2]} [ ] `;
  const ordered = ORDERED.exec(text);
  if (ordered) return `${ordered[1]}${Number.parseInt(ordered[2], 10) + 1}${ordered[3]} `;
  const unordered = UNORDERED.exec(text);
  if (unordered) return `${unordered[1]}${unordered[2]} `;
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

/** Shift+Enter replaces the selection and splits nested formats into closed spans. */
export function insertSoftLineBreak(value: string, offset: number, end = offset): ComposerEdit {
  let start = Math.min(offset, end);
  let selectionEnd = Math.max(offset, end);
  const blocks = parseBlocks(value);
  const spans: InlineNode[] = [];
  const visit = (nodes: InlineNode[]) => {
    for (const node of nodes) {
      if (node.kind !== "text" && node.kind !== "chip") spans.push(node);
      visit(node.children ?? []);
    }
  };
  for (const block of blocks) visit(block.inline);
  if (start !== selectionEnd) {
    // A selected formatted phrase is replaced, never silently retained.
    for (const node of spans) {
      if (start <= node.contentStart && selectionEnd >= node.contentEnd) {
        start = Math.min(start, node.start);
        selectionEnd = Math.max(selectionEnd, node.end);
      }
    }
    const edit = splice(value, start, selectionEnd, "");
    return insertSoftLineBreak(edit.value, edit.caret);
  }
  // At an inline edge the new line belongs outside that span.
  for (const node of spans) {
    if (start === node.contentStart) start = node.start;
    else if (start === node.contentEnd) start = node.end;
  }
  const line = lineBoundsAt(value, start);
  const block = blocks.find((item) => item.start === line.start);
  const marker = block?.kind === "codeBlock" ? null : lineMarker(line.text);
  if (marker && line.text.slice(marker.length).trim().length === 0) {
    return { value: `${value.slice(0, line.start)}${value.slice(line.end)}`, caret: line.start };
  }
  const continuation = marker ? (continuationMarker(line.text) ?? "") : "";
  const active = spans.filter((node) => node.contentStart < start && start < node.contentEnd);
  const closing = [...active]
    .reverse()
    .map((node) => value.slice(node.contentEnd, node.end))
    .join("");
  const opening = active.map((node) => value.slice(node.start, node.contentStart)).join("");
  return splice(value, start, start, `${closing}\n${continuation}${opening}`);
}

/** Backspace at the start of a marked line clears the marker instead of merging. */
export function removeLineMarker(value: string, offset: number): ComposerEdit | null {
  const line = lineBoundsAt(value, offset);
  if (parseBlocks(value).find((block) => block.start === line.start)?.kind === "codeBlock")
    return null;
  const marker = lineMarker(line.text);
  if (!marker) return null;
  if (offset > line.start + marker.length) return null;
  return {
    value: `${value.slice(0, line.start)}${value.slice(line.start + marker.length)}`,
    caret: line.start,
  };
}

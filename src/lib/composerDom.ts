import type { BlockNode, InlineNode } from "./composerMarkdown";

/**
 * Projects `composerMarkdown` blocks into a contenteditable view and maps DOM
 * carets back to markdown offsets.
 *
 * Markup markers are not rendered; every innermost rendered element carries the
 * markdown offsets of the text it shows, so a caret inside it maps to
 * `srcContentStart + renderedOffset`. Chips are atomic (`contenteditable=false`).
 */

const SRC_START = "srcStart";
const SRC_END = "srcEnd";
const SRC_CONTENT_START = "srcContentStart";
const SRC_CONTENT_END = "srcContentEnd";

export interface Point {
  node: Node;
  offset: number;
}

interface Leaf {
  el: HTMLElement;
  chip: boolean;
  start: number;
  end: number;
  contentStart: number;
  contentEnd: number;
}

function applySrc(element: HTMLElement, node: InlineNode): void {
  element.dataset[SRC_START] = String(node.start);
  element.dataset[SRC_END] = String(node.end);
  element.dataset[SRC_CONTENT_START] = String(node.contentStart);
  element.dataset[SRC_CONTENT_END] = String(node.contentEnd);
}

const TAG_FOR_KIND: Partial<Record<InlineNode["kind"], string>> = {
  strong: "strong",
  em: "em",
  del: "del",
  code: "code",
};

export function renderInlineNodes(parent: Node, nodes: InlineNode[]): void {
  for (const node of nodes) {
    if (node.kind === "text") {
      if (!node.text) continue;
      const span = document.createElement("span");
      applySrc(span, node);
      span.textContent = node.text;
      parent.appendChild(span);
      continue;
    }
    if (node.kind === "chip") {
      const chip = document.createElement("span");
      applySrc(chip, node);
      chip.className = `composer-chip composer-chip-${node.chipKind ?? "token"}`;
      chip.dataset.markdown = node.raw;
      chip.contentEditable = "false";
      chip.textContent = node.raw;
      parent.appendChild(chip);
      continue;
    }
    const element = document.createElement(TAG_FOR_KIND[node.kind] ?? "span");
    applySrc(element, node);
    element.dataset.inlineKind = node.kind;
    if (node.kind === "link") {
      element.className = "composer-link";
      element.dataset.href = node.href ?? "";
    }
    renderInlineNodes(element, node.children ?? []);
    parent.appendChild(element);
  }
}

function markerGlyph(block: BlockNode): string {
  if (block.kind !== "listItem") return "";
  if (block.checked === true) return "☑";
  if (block.checked === false) return "☐";
  return block.ordered ? block.markerRaw.trim() : "•";
}

function renderBlock(block: BlockNode): HTMLElement {
  const element = document.createElement("div");
  element.className = `composer-block composer-block-${block.kind}`;
  element.dataset.blockStart = String(block.start);
  element.dataset.blockEnd = String(block.end);
  element.dataset.blockKind = block.kind;
  if (block.level !== undefined) element.dataset.level = String(block.level);
  if (block.checked === true || block.checked === false) {
    element.dataset.checked = String(block.checked);
  }
  if (block.kind === "listItem") {
    const marker = document.createElement("span");
    marker.className = "composer-marker";
    marker.dataset.decoration = "true";
    marker.contentEditable = "false";
    // Carries the marker's own source range so a caret beside it still resolves
    // to the line, even though the glyph itself is not editable content.
    marker.dataset[SRC_START] = String(block.start);
    marker.dataset[SRC_END] = String(block.inline[0]?.start ?? block.end);
    marker.textContent = markerGlyph(block);
    element.appendChild(marker);
  }
  renderInlineNodes(element, block.inline);
  if (!element.querySelector("[data-src-content-start]")) {
    element.appendChild(document.createElement("br"));
  }
  return element;
}

export function renderBlocks(root: HTMLElement, blocks: BlockNode[]): void {
  const fragment = document.createDocumentFragment();
  for (const block of blocks) fragment.appendChild(renderBlock(block));
  root.replaceChildren(fragment);
}

/** Empty projection, so an editor with no markdown shows only its placeholder. */
export function clearBlocks(root: HTMLElement): void {
  root.replaceChildren();
}

/** Innermost elements that carry rendered text, in document order. Decorations
 * such as list glyphs hold a source range but are not text leaves. */
function collectLeaves(scope: Node): HTMLElement[] {
  const leaves: HTMLElement[] = [];
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode() as HTMLElement | null;
  while (node) {
    if (
      node.dataset[SRC_CONTENT_START] !== undefined &&
      !node.querySelector(`[data-src-content-start]`)
    ) {
      leaves.push(node);
    }
    node = walker.nextNode() as HTMLElement | null;
  }
  return leaves;
}

function toLeaf(element: HTMLElement): Leaf {
  return {
    el: element,
    chip: element.classList.contains("composer-chip"),
    start: Number(element.dataset[SRC_START]),
    end: Number(element.dataset[SRC_END]),
    contentStart: Number(element.dataset[SRC_CONTENT_START]),
    contentEnd: Number(element.dataset[SRC_CONTENT_END]),
  };
}

function boundary(el: Node, after: boolean): Point {
  const parent = el.parentNode;
  if (!parent) return { node: el, offset: 0 };
  const index = Array.prototype.indexOf.call(parent.childNodes, el as ChildNode);
  return { node: parent, offset: after ? index + 1 : index };
}

/** Markdown offset for a DOM point inside `root`. */
export function markdownOffset(root: HTMLElement, node: Node, offset: number): number {
  if (node.nodeType === Node.TEXT_NODE) {
    const parent = (node as Text).parentElement;
    if (parent && parent.dataset[SRC_CONTENT_START] !== undefined) {
      const start = Number(parent.dataset[SRC_CONTENT_START]);
      const end = Number(parent.dataset[SRC_CONTENT_END]);
      return Math.min(end, Math.max(start, start + offset));
    }
    return blockStartFor(parent ?? root);
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as HTMLElement;
    const children = Array.from(element.childNodes);
    const next = children[offset] as HTMLElement | undefined;
    const previous = children[children.length - 1] as HTMLElement | undefined;
    const scope = next ?? previous;
    if (scope instanceof HTMLElement) {
      const edge = sourceEdge(scope, Boolean(next));
      if (edge !== null) return edge;
    }
    if (element.dataset[SRC_CONTENT_START] !== undefined) {
      return Number(element.dataset[SRC_CONTENT_START]);
    }
    const block = element.closest<HTMLElement>("[data-block-start]");
    // Nothing mapped in reach: an empty line projects only a `<br>`, so its one
    // caret position is the end of the block's source text.
    if (block) return Number(block.dataset.blockEnd ?? block.dataset.blockStart);
  }
  const first = root.querySelector<HTMLElement>("[data-block-start]");
  return first ? Number(first.dataset.blockStart) : 0;
}

function blockStartFor(element: HTMLElement | null): number {
  const block = element?.closest?.<HTMLElement>("[data-block-start]");
  return block ? Number(block.dataset.blockStart) : 0;
}

/** Direct child of the enclosing block, which carries the full source range. */
function outerOf(element: HTMLElement): HTMLElement {
  const block = element.closest<HTMLElement>("[data-block-start]");
  if (!block) return element;
  let node = element;
  while (node.parentElement && node.parentElement !== block) node = node.parentElement;
  return node;
}

/**
 * Source offset of a mapped edge at or below `element`. Leading edges take the
 * node's own source start and trailing edges its own source end, not the inner
 * text range, so the caret can rest *after* a closing marker (`**bold|**`) as
 * well as inside its content.
 */
function sourceEdge(element: HTMLElement, leading: boolean): number | null {
  const own = element.dataset[leading ? SRC_START : SRC_END];
  if (own !== undefined) return Number(own);
  const leaves = collectLeaves(element);
  if (leaves.length === 0) return null;
  const leaf = leading ? leaves[0] : leaves[leaves.length - 1];
  return leading ? toLeaf(leaf).start : toLeaf(leaf).end;
}

/**
 * DOM point for a markdown offset. Offsets inside a leaf's rendered text map to
 * a caret in that text node; offsets in the hidden marker margins around it map
 * to a boundary beside the outermost element, so `markdownOffset` reads them
 * back unchanged.
 */
export function domPoint(root: HTMLElement, markdownOffsetValue: number): Point {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>("[data-block-start]"));
  if (blocks.length === 0) return { node: root, offset: 0 };
  // Resolve the block first: an empty line has no leaves, and the caret must
  // still land in *that* block rather than at the end of the previous one.
  let block = blocks[blocks.length - 1];
  for (const candidate of blocks) {
    if (markdownOffsetValue <= Number(candidate.dataset.blockEnd)) {
      block = candidate;
      break;
    }
  }
  const leaves = collectLeaves(block).map(toLeaf);
  if (leaves.length === 0) return { node: block, offset: block.childNodes.length };
  for (const leaf of leaves) {
    if (markdownOffsetValue > leaf.contentEnd) continue;
    if (markdownOffsetValue < leaf.contentStart) return boundary(outerOf(leaf.el), false);
    if (leaf.chip) return boundary(outerOf(leaf.el), markdownOffsetValue > leaf.start);
    const text = leaf.el.firstChild;
    if (!text || text.nodeType !== Node.TEXT_NODE) return boundary(outerOf(leaf.el), false);
    return { node: text, offset: markdownOffsetValue - leaf.contentStart };
  }
  return boundary(outerOf(leaves[leaves.length - 1].el), true);
}

/** Current markdown selection, or `null` when the selection is outside `root`. */
export function getMarkdownSelection(root: HTMLElement): { start: number; end: number } | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const from = markdownOffset(root, range.startContainer, range.startOffset);
  const to = markdownOffset(root, range.endContainer, range.endOffset);
  return from <= to ? { start: from, end: to } : { start: to, end: from };
}

export function setMarkdownSelection(root: HTMLElement, start: number, end = start): void {
  const from = domPoint(root, Math.min(start, end));
  const to = domPoint(root, Math.max(start, end));
  const range = document.createRange();
  try {
    range.setStart(from.node, from.offset);
    range.setEnd(to.node, to.offset);
  } catch {
    return;
  }
  const selection = window.getSelection();
  if (!selection) return;
  selection.removeAllRanges();
  selection.addRange(range);
}

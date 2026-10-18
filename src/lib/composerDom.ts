import type { BlockNode, InlineNode } from "./composerMarkdown";

/**
 * Projects read-only `composerMarkdown` blocks into authored transcript DOM.
 *
 * Markup markers are hidden and token spans are display-only.
 */

const SRC_START = "srcStart";
const SRC_END = "srcEnd";
const SRC_CONTENT_START = "srcContentStart";
const SRC_CONTENT_END = "srcContentEnd";

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
      const literal =
        parent instanceof HTMLElement && parent.closest("code, [data-block-kind=codeBlock]");
      // Decode Markdown exports only in text; code and protocol tokens stay literal.
      span.textContent = literal
        ? node.text
        : node.text
            .replace(/\\([\\`*_[\]~])/gu, "$1")
            .replace(/&(?:#[0-9]+|#x[0-9a-f]+|[a-z]+);/giu, (entity) => {
              const decoder = document.createElement("textarea");
              decoder.innerHTML = entity;
              return decoder.value;
            });
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

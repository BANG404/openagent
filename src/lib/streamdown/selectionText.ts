const CHAT_MATH_SELECTOR = "[data-chat-math-source]";

function closestChatMath(node: Node): Element | null {
  const element = node instanceof Element ? node : node.parentElement;
  return element?.closest(CHAT_MATH_SELECTOR) ?? null;
}

function replaceChatMathWithSource(fragment: DocumentFragment): boolean {
  const mathElements = [...fragment.querySelectorAll<HTMLElement>(CHAT_MATH_SELECTOR)];
  if (mathElements.length === 0) return false;

  for (const mathElement of mathElements) {
    const source = mathElement.dataset.chatMathSource;
    if (!source) continue;

    const isDisplay = mathElement.dataset.chatMathDisplay === "block";
    const delimiter = isDisplay ? "$$" : "$";
    mathElement.replaceWith(document.createTextNode(`${delimiter}${source}${delimiter}`));
  }

  return true;
}

function renderedText(fragment: DocumentFragment): string {
  const container = document.createElement("div");
  container.setAttribute("aria-hidden", "true");
  container.style.cssText =
    "position:fixed;left:-100000px;top:0;width:1000px;pointer-events:none;white-space:normal;";
  container.append(fragment);
  document.body.append(container);
  try {
    return container.innerText.trim();
  } finally {
    container.remove();
  }
}

/**
 * Return the visible assistant selection while preserving complete rendered
 * expressions as Markdown math. Boundary selections expand to the complete
 * formula instead of serializing KaTeX's visual layout spans.
 */
export function selectionTextWithMath(selection: Selection): string {
  if (selection.isCollapsed || selection.rangeCount === 0) return "";

  const range = selection.getRangeAt(0).cloneRange();
  const startMath = closestChatMath(range.startContainer);
  const endMath = closestChatMath(range.endContainer);
  if (startMath) range.setStartBefore(startMath);
  if (endMath) range.setEndAfter(endMath);

  const fragment = range.cloneContents();
  if (!replaceChatMathWithSource(fragment)) return selection.toString().trim();
  return renderedText(fragment);
}

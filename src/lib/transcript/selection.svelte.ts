import { onMount } from "svelte";
import type { UserMessageContext } from "$lib/types";
import { selectionTextWithMath } from "$lib/streamdown/selectionText";

interface SelectionOptions {
  readonly root: HTMLElement | null;
  onAddQuote: (context: UserMessageContext) => void;
}

/** Selection state and document listeners belong to the mounted transcript. */
export function createTranscriptSelection(options: SelectionOptions) {
  let selectionPopover = $state<{
    text: string;
    sourceMessageId: string;
    left: number;
    top: number;
  } | null>(null);

  function selectionOwner(node: Node | null): HTMLElement | null {
    const element = node instanceof Element ? node : node?.parentElement;
    return element?.closest<HTMLElement>("[data-selection-source-message-id]") ?? null;
  }

  function captureAssistantSelection() {
    const selection = window.getSelection();
    const messagesRoot = options.root;
    if (!selection || selection.isCollapsed || selection.rangeCount === 0 || !messagesRoot) {
      selectionPopover = null;
      return;
    }
    const anchorOwner = selectionOwner(selection.anchorNode);
    const focusOwner = selectionOwner(selection.focusNode);
    const sourceMessageId = anchorOwner?.dataset.selectionSourceMessageId;
    if (
      !anchorOwner ||
      !focusOwner ||
      !sourceMessageId ||
      focusOwner.dataset.selectionSourceMessageId !== sourceMessageId ||
      !messagesRoot.contains(anchorOwner) ||
      !messagesRoot.contains(focusOwner)
    ) {
      selectionPopover = null;
      return;
    }
    const text = selectionTextWithMath(selection);
    if (!text) {
      selectionPopover = null;
      return;
    }
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    if (!rect.width && !rect.height) {
      selectionPopover = null;
      return;
    }
    selectionPopover = {
      text,
      sourceMessageId,
      left: Math.min(window.innerWidth - 72, Math.max(72, rect.left + rect.width / 2)),
      top: Math.max(8, rect.top - 8),
    };
  }

  function addSelectedQuote() {
    if (!selectionPopover) return;
    options.onAddQuote({
      type: "quote",
      text: selectionPopover.text,
      sourceMessageId: selectionPopover.sourceMessageId,
    });
    selectionPopover = null;
    window.getSelection()?.removeAllRanges();
  }

  onMount(() => {
    const closeOnViewportChange = () => (selectionPopover = null);
    const closeOnCollapsedSelection = () => {
      if (window.getSelection()?.isCollapsed) selectionPopover = null;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") selectionPopover = null;
    };
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    window.addEventListener("keydown", closeOnEscape);
    document.addEventListener("selectionchange", closeOnCollapsedSelection);
    return () => {
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
      window.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("selectionchange", closeOnCollapsedSelection);
    };
  });
  return {
    get selectionPopover() {
      return selectionPopover;
    },
    captureAssistantSelection,
    addSelectedQuote,
  };
}

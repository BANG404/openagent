import { onMount, tick } from "svelte";
import {
  insertSoftLineBreak,
  parseBlocks,
  removeEmptyFormatting,
  removeLineMarker,
  splice,
  wordBoundaryAfter,
  wordBoundaryBefore,
  type ComposerEdit,
} from "$lib/composerMarkdown";
import {
  clearBlocks,
  getMarkdownSelection,
  renderBlocks,
  setMarkdownSelection,
} from "$lib/composerDom";
import { applyComposerFormat, type ComposerFormat } from "$lib/components/composerFormatting";
import type { ChatAttachment } from "$lib/types";
import type { createPaletteController } from "./palette.svelte";

interface EditorOptions {
  value: string;
  readonly attachments: ChatAttachment[];
  readonly disabled: boolean;
  readonly focusRequest: number;
  readonly palette: ReturnType<typeof createPaletteController>;
  runPrimaryAction(): void;
}

/** One owner for canonical edits, DOM projection, selection, IME, and history. */
export function createEditorController(options: EditorOptions) {
  let editorEl = $state<HTMLDivElement | null>(null);
  // The markdown string is canonical; `lastProjected` is what the editor DOM shows.
  let lastProjected = "";
  let composing = $state(false);
  const undoStack: Array<{ value: string; caret: number }> = [];
  let redoStack: Array<{ value: string; caret: number }> = [];
  let wasDisabled = $state(false);
  const attachmentReferencePaths = $derived.by(() => {
    const references = new Map<string, string>();
    for (const attachment of options.attachments) {
      if (attachment.referenceLabel) references.set(attachment.referenceLabel, attachment.path);
    }
    return references;
  });
  /** Paste plain text so the markdown model and the editor DOM stay in sync. */
  function insertPastedText(event: ClipboardEvent) {
    if (options.disabled) return;
    const text = event.clipboardData?.getData("text/plain");
    if (!text) return;
    event.preventDefault();
    const selection = editorEl ? getMarkdownSelection(editorEl) : null;
    const start = selection?.start ?? options.value.length;
    const end = selection?.end ?? start;
    commitEdit(splice(options.value, start, end, text.replace(/\r\n?/g, "\n")));
  }

  function refocusEditor() {
    void tick().then(() => editorEl?.focus({ preventScroll: true }));
  }

  const historyLimit = 100;

  /** Rebuild the editor DOM from the canonical markdown and restore the caret. */
  function project(nextValue: string, start: number, end = start) {
    if (!editorEl) return;
    lastProjected = nextValue;
    if (nextValue.length === 0) clearBlocks(editorEl);
    else renderBlocks(editorEl, parseBlocks(nextValue, attachmentReferencePaths));
    setMarkdownSelection(editorEl, start, end);
    options.palette.syncPaletteFromCaret();
  }

  /** Apply an editor-originated edit: record history, then re-project. */
  function commit(nextValue: string, start: number, end = start) {
    const selection = editorEl ? getMarkdownSelection(editorEl) : null;
    undoStack.push({ value: options.value, caret: selection?.start ?? options.value.length });
    if (undoStack.length > historyLimit) undoStack.shift();
    redoStack = [];
    options.value = nextValue;
    project(nextValue, start, end);
  }

  function commitEdit(edit: ComposerEdit | null) {
    if (edit) {
      const normalized = removeEmptyFormatting(edit.value, edit.caret);
      commit(normalized.value, normalized.caret);
    }
  }

  function restore(entry: { value: string; caret: number }) {
    options.value = entry.value;
    project(entry.value, Math.min(entry.caret, entry.value.length));
  }

  function undo() {
    const entry = undoStack.pop();
    if (!entry) return;
    const selection = editorEl ? getMarkdownSelection(editorEl) : null;
    redoStack.push({ value: options.value, caret: selection?.start ?? options.value.length });
    restore(entry);
  }

  function redo() {
    const entry = redoStack.pop();
    if (!entry) return;
    const selection = editorEl ? getMarkdownSelection(editorEl) : null;
    undoStack.push({ value: options.value, caret: selection?.start ?? options.value.length });
    restore(entry);
  }

  $effect(() => {
    const nextValue = options.value;
    if (!editorEl || composing || nextValue === lastProjected) return;
    const selection = getMarkdownSelection(editorEl);
    const limit = nextValue.length;
    const start = Math.min(selection?.start ?? limit, limit);
    const end = Math.min(selection?.end ?? start, limit);
    project(nextValue, start, end);
  });

  $effect(() => {
    if (wasDisabled && !options.disabled) {
      focusInput();
    }
    wasDisabled = options.disabled;
  });

  $effect(() => {
    if (options.focusRequest > 0) void focusInputAfterWindowActivation(options.focusRequest);
  });

  async function focusInputAfterWindowActivation(request: number) {
    await focusInput();
    // Windows can report the Tauri window as focused before WebView2 finishes
    // restoring its internal keyboard focus. Retry after that native handoff so
    // the browser does not restore the previously focused control over us.
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    if (options.focusRequest !== request || !editorEl || options.disabled) return;
    editorEl.focus({ preventScroll: true });
  }

  async function focusInput() {
    await tick();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (!editorEl || options.disabled) return;
    editorEl.focus({ preventScroll: true });
  }

  function handleKeydown(e: KeyboardEvent) {
    // IME owns Enter/Escape/arrows while composing; never intercept those.
    if (composing || e.isComposing) return;

    if (options.palette.paletteMode) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (options.palette.paletteItems.length > 0) {
          options.palette.activeIdx =
            (options.palette.activeIdx + 1) % options.palette.paletteItems.length;
        }
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (options.palette.paletteItems.length > 0) {
          options.palette.activeIdx =
            (options.palette.activeIdx - 1 + options.palette.paletteItems.length) %
            options.palette.paletteItems.length;
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        options.palette.closePalette();
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        if (options.palette.paletteItems.length > 0) {
          e.preventDefault();
          options.palette.applySelection(options.palette.paletteItems[options.palette.activeIdx]);
          return;
        }
      }
    }

    if ((e.metaKey || e.ctrlKey) && !e.altKey) {
      const key = e.key.toLowerCase();
      // Native undo cannot survive re-projection, so history is model-level.
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        redo();
        return;
      }
      const format: ComposerFormat | null =
        key === "b"
          ? { prefix: "**" }
          : key === "i"
            ? { prefix: "*" }
            : e.key === "`"
              ? { prefix: "`" }
              : null;
      if (format) {
        e.preventDefault();
        applyFormat(format);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      options.runPrimaryAction();
    }
  }

  /** Cut keeps the clipboard payload but replays the deletion on the model. */
  function handleCut(event: ClipboardEvent) {
    if (options.disabled) return;
    const selection = editorEl ? getMarkdownSelection(editorEl) : null;
    if (!selection || selection.start === selection.end) return;
    event.preventDefault();
    event.clipboardData?.setData("text/plain", options.value.slice(selection.start, selection.end));
    commitEdit(splice(options.value, selection.start, selection.end, ""));
  }

  /**
   * Every browser edit is cancelled and replayed against the markdown model, so
   * the DOM can never drift from the canonical string. Paste, cut, and history
   * have their own listeners and are deliberately not handled here.
   */
  function handleBeforeInput(event: InputEvent) {
    if (composing) return;
    const selection = editorEl ? getMarkdownSelection(editorEl) : null;
    const start = selection?.start ?? options.value.length;
    const end = selection?.end ?? start;

    const replace = (from: number, to: number, insertion: string) => {
      event.preventDefault();
      commitEdit(splice(options.value, from, to, insertion));
    };

    switch (event.inputType) {
      case "insertText":
      case "insertReplacementText": {
        const text = event.data ?? event.dataTransfer?.getData("text/plain") ?? "";
        if (text) replace(start, end, text);
        return;
      }
      case "insertLineBreak":
        event.preventDefault();
        commitEdit(insertSoftLineBreak(options.value, start, end));
        return;
      case "insertParagraph":
        event.preventDefault();
        options.runPrimaryAction();
        return;
      case "deleteContentBackward":
        if (start !== end) {
          replace(start, end, "");
        } else {
          event.preventDefault();
          commitEdit(
            removeLineMarker(options.value, start) ??
              splice(options.value, Math.max(0, start - 1), start, ""),
          );
        }
        return;
      case "deleteContentForward":
        replace(start, end === start ? Math.min(options.value.length, start + 1) : end, "");
        return;
      case "deleteWordBackward":
        replace(wordBoundaryBefore(options.value, start), end, "");
        return;
      case "deleteWordForward":
        replace(start, wordBoundaryAfter(options.value, end), "");
        return;
      default:
        return;
    }
  }

  function applyFormat(format: ComposerFormat) {
    const selection = editorEl ? getMarkdownSelection(editorEl) : null;
    const start = selection?.start ?? options.value.length;
    const end = selection?.end ?? start;
    const next = applyComposerFormat(options.value, start, end, format);
    // Leave the wrapped content selected so the next keystroke replaces it.
    commit(next.value, next.start, next.end);
    refocusEditor();
  }

  let compositionAnchor = 0;

  // While an IME owns the editor the DOM is left alone; `handleBeforeInput` and
  // the projection effect both stand down until the composition commits.
  function handleCompositionStart() {
    composing = true;
    compositionAnchor = editorEl
      ? (getMarkdownSelection(editorEl)?.start ?? options.value.length)
      : options.value.length;
  }

  function handleCompositionEnd(event: CompositionEvent) {
    composing = false;
    const text = event.data ?? "";
    if (text) commitEdit(splice(options.value, compositionAnchor, compositionAnchor, text));
    else if (options.value !== lastProjected) project(options.value, compositionAnchor);
  }

  function handleDragOver(event: DragEvent) {
    // Nothing may edit the projection directly — drops are replayed on the model.
    event.preventDefault();
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    if (options.disabled) return;
    const text = event.dataTransfer?.getData("text/plain");
    if (!text) return;
    const selection = editorEl ? getMarkdownSelection(editorEl) : null;
    const start = selection?.start ?? options.value.length;
    const end = selection?.end ?? start;
    commitEdit(splice(options.value, start, end, text.replace(/\r\n?/g, "\n")));
  }

  onMount(() => {
    void focusInput();
  });
  return {
    get editorEl() {
      return editorEl;
    },
    set editorEl(next: HTMLDivElement | null) {
      editorEl = next;
    },
    get composing() {
      return composing;
    },
    commit,
    insertPastedText,
    refocusEditor,
    handleKeydown,
    handleCut,
    handleBeforeInput,
    applyFormat,
    handleCompositionStart,
    handleCompositionEnd,
    handleDragOver,
    handleDrop,
  };
}

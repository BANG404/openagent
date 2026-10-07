import { onMount, tick } from "svelte";
import {
  insertSoftLineBreak,
  parseBlocks,
  removeLineMarker,
  wordBoundaryAfter,
  wordBoundaryBefore,
  type ComposerEdit,
} from "$lib/composerMarkdown";
import { replaceMarkdownRange, selectedMarkdown, visibleDeletionRange } from "$lib/composerEditing";
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
  type HistoryEntry = { value: string; start: number; end: number };
  const undoStack: HistoryEntry[] = [];
  let redoStack: HistoryEntry[] = [];
  let savedSelection: { start: number; end: number } | null = null;

  function selection() {
    return (
      (editorEl ? getMarkdownSelection(editorEl) : null) ??
      savedSelection ?? { start: options.value.length, end: options.value.length }
    );
  }

  function replace(start: number, end: number, text: string) {
    return replaceMarkdownRange(options.value, start, end, text, attachmentReferencePaths);
  }
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
    const { start, end } = selection();
    commitEdit(replace(start, end, text.replace(/\r\n?/g, "\n")));
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
    savedSelection = { start, end };
    options.palette.syncPaletteFromCaret();
  }

  /** Apply an editor-originated edit: record history, then re-project. */
  function commit(nextValue: string, start: number, end = start, before = selection()) {
    if (options.disabled || composing) return;
    if (nextValue === options.value) {
      project(nextValue, start, end);
      return;
    }
    undoStack.push({ value: options.value, ...before });
    if (undoStack.length > historyLimit) undoStack.shift();
    redoStack = [];
    options.value = nextValue;
    project(nextValue, start, end);
  }

  function commitEdit(edit: ComposerEdit | null) {
    if (edit) {
      commit(edit.value, edit.caret);
    }
  }

  function restore(entry: HistoryEntry) {
    options.value = entry.value;
    project(entry.value, entry.start, entry.end);
  }

  function undo() {
    const entry = undoStack.pop();
    if (!entry) return;
    redoStack.push({ value: options.value, ...selection() });
    restore(entry);
  }

  function redo() {
    const entry = redoStack.pop();
    if (!entry) return;
    undoStack.push({ value: options.value, ...selection() });
    restore(entry);
  }

  $effect(() => {
    const nextValue = options.value;
    if (!editorEl || composing || nextValue === lastProjected) return;
    // Sending, draft switching and external restores start a new history scope.
    undoStack.length = 0;
    redoStack = [];
    savedSelection = null;
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
    if (options.disabled || composing || e.isComposing || e.keyCode === 229) return;

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
    event.clipboardData?.setData(
      "text/plain",
      selectedMarkdown(options.value, selection.start, selection.end, attachmentReferencePaths),
    );
    commitEdit(replace(selection.start, selection.end, ""));
  }

  function handleCopy(event: ClipboardEvent) {
    const current = editorEl ? getMarkdownSelection(editorEl) : null;
    if (!current || current.start === current.end || !event.clipboardData) return;
    event.preventDefault();
    event.clipboardData.setData(
      "text/plain",
      selectedMarkdown(options.value, current.start, current.end, attachmentReferencePaths),
    );
  }

  /**
   * Every browser edit is cancelled and replayed against the markdown model, so
   * the DOM can never drift from the canonical string. Paste, cut, and history
   * have their own listeners and are deliberately not handled here.
   */
  function handleBeforeInput(event: InputEvent) {
    if (options.disabled) {
      event.preventDefault();
      return;
    }
    if (composing || event.isComposing) return;
    const { start, end } = selection();

    const replay = (from: number, to: number, insertion: string) => {
      event.preventDefault();
      commitEdit(
        replaceMarkdownRange(options.value, from, to, insertion, attachmentReferencePaths),
      );
    };

    switch (event.inputType) {
      case "insertText":
      case "insertReplacementText": {
        const text = event.data ?? event.dataTransfer?.getData("text/plain") ?? "";
        if (text) replay(start, end, text);
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
          replay(start, end, "");
        } else {
          event.preventDefault();
          const markerEdit = removeLineMarker(options.value, start);
          const range = visibleDeletionRange(options.value, start, true, attachmentReferencePaths);
          commitEdit(markerEdit ?? replace(range.start, range.end, ""));
        }
        return;
      case "deleteContentForward":
        if (start !== end) replay(start, end, "");
        else {
          const range = visibleDeletionRange(options.value, start, false, attachmentReferencePaths);
          replay(range.start, range.end, "");
        }
        return;
      case "deleteWordBackward":
        replay(start !== end ? start : wordBoundaryBefore(options.value, start), end, "");
        return;
      case "deleteWordForward":
        replay(start, start !== end ? end : wordBoundaryAfter(options.value, end), "");
        return;
      case "historyUndo":
        event.preventDefault();
        undo();
        return;
      case "historyRedo":
        event.preventDefault();
        redo();
        return;
      case "formatBold":
        event.preventDefault();
        applyFormat({ prefix: "**" });
        return;
      case "formatItalic":
        event.preventDefault();
        applyFormat({ prefix: "*" });
        return;
      case "deleteByCut":
      case "insertFromPaste":
      case "insertFromDrop":
        event.preventDefault();
        return;
      default:
        // Unsupported native mutations must not corrupt the projection.
        event.preventDefault();
        return;
    }
  }

  function applyFormat(format: ComposerFormat) {
    if (options.disabled || composing) return;
    const { start, end } = selection();
    const next = applyComposerFormat(options.value, start, end, format);
    // Leave the wrapped content selected so the next keystroke replaces it.
    commit(next.value, next.start, next.end);
    refocusEditor();
  }

  let compositionSelection = { start: 0, end: 0 };
  let compositionValue = "";

  // While an IME owns the editor the DOM is left alone; `handleBeforeInput` and
  // the projection effect both stand down until the composition commits.
  function handleCompositionStart() {
    if (options.disabled) return;
    compositionSelection = selection();
    compositionValue = options.value;
    composing = true;
  }

  function handleCompositionEnd(event: CompositionEvent) {
    composing = false;
    const text = event.data ?? "";
    const { start, end } = compositionSelection;
    // A draft replacement during composition wins over the old IME session.
    if (options.value !== compositionValue) {
      undoStack.length = 0;
      redoStack = [];
      project(options.value, options.value.length);
      return;
    }
    if (options.disabled) {
      project(options.value, start, end);
      return;
    }
    savedSelection = { start, end };
    // The native IME DOM is already mutated; history must use its original range.
    if (text) {
      const edit = replace(start, end, text);
      commit(edit.value, edit.caret, edit.caret, compositionSelection);
    } else project(options.value, start, end);
  }

  function rememberSelection() {
    if (editorEl && !composing) savedSelection = getMarkdownSelection(editorEl) ?? savedSelection;
  }

  function handleInput() {
    // Non-cancelable browser edits (e.g. spellcheck) must not leave a stale DOM.
    if (!composing && editorEl) {
      const current = savedSelection ?? selection();
      project(options.value, current.start, current.end);
    }
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
    commitEdit(replace(start, end, text.replace(/\r\n?/g, "\n")));
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
    handleCopy,
    rememberSelection,
    handleInput,
    handleBeforeInput,
    applyFormat,
    handleCompositionStart,
    handleCompositionEnd,
    handleDragOver,
    handleDrop,
  };
}

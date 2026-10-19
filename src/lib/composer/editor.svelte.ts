import { onMount, tick } from "svelte";
import type { Editor } from "@tiptap/core";
import type { ChatAttachment } from "$lib/types";
import type { createPaletteController } from "./palette.svelte";

interface EditorOptions {
  value: string;
  readonly attachments: ChatAttachment[];
  readonly disabled: boolean;
  readonly placeholder: string;
  readonly focusRequest: number;
  readonly palette: ReturnType<typeof createPaletteController>;
  handlePaste(event: ClipboardEvent): void;
  runPrimaryAction(): void;
}

/** Tiptap owns the live document, selection, input rules, IME and history.
 * Markdown crosses the component boundary only; it is never replayed on input. */
export function createEditorController(options: EditorOptions) {
  let mountEl = $state<HTMLDivElement | null>(null);
  let editor = $state.raw<Editor | null>(null);
  let engine: typeof import("./tiptap") | null = null;
  let loadFailed = $state(false);
  let disposed = false;
  let revision = $state(0);
  let composing = $state(false);
  let lastPublished = options.value;
  let compositionValue = "";

  function references() {
    return new Map(
      options.attachments.flatMap((item) =>
        item.referenceLabel ? [[item.referenceLabel, item.path] as const] : [],
      ),
    );
  }

  function publish() {
    if (!editor || composing) return;
    lastPublished = editor.markdown!.serialize(
      engine!.protocolDocument(editor.getJSON(), references()),
    );
    options.value = lastPublished;
    void options.palette.syncPaletteFromCaret();
  }

  function textSelection() {
    if (!editor) return null;
    const { value, positions } = engine!.textPositions(editor.state.doc);
    const offset = (position: number) => {
      const exact = positions.indexOf(position);
      if (exact !== -1) return exact;
      const next = positions.findIndex((candidate) => candidate >= position);
      return next < 0 ? value.length : next;
    };
    return {
      value,
      start: offset(editor.state.selection.from),
      end: offset(editor.state.selection.to),
    };
  }

  function commit(value: string, caret: number) {
    if (!editor || options.disabled || composing) return;
    const current = engine!.textPositions(editor.state.doc);
    let from = 0;
    while (
      from < current.value.length &&
      from < value.length &&
      current.value[from] === value[from]
    )
      from++;
    let tail = 0;
    while (
      tail < current.value.length - from &&
      tail < value.length - from &&
      current.value.at(-tail - 1) === value.at(-tail - 1)
    )
      tail++;
    const position = (offset: number) =>
      current.positions[offset] ?? editor!.state.doc.content.size - 1;
    const insertion = value.slice(from, value.length - tail);
    editor.view.dispatch(
      editor.state.tr.insertText(insertion, position(from), position(current.value.length - tail)),
    );
    const mapped = engine!.textPositions(editor.state.doc);
    editor.commands.setTextSelection(mapped.positions[caret] ?? editor.state.doc.content.size - 1);
  }

  function handleKeydown(event: KeyboardEvent): boolean {
    if (options.disabled || composing || event.isComposing || event.keyCode === 229) return false;
    const palette = options.palette;
    if (palette.paletteMode) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (palette.paletteItems.length) {
          const delta = event.key === "ArrowDown" ? 1 : -1;
          palette.activeIdx =
            (palette.activeIdx + delta + palette.paletteItems.length) % palette.paletteItems.length;
        }
        return true;
      }
      if (event.key === "Escape") {
        palette.closePalette();
        return true;
      }
      if ((event.key === "Enter" || event.key === "Tab") && palette.paletteItems.length) {
        palette.applySelection(palette.paletteItems[palette.activeIdx]);
        return true;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      publish();
      options.runPrimaryAction();
      return true;
    }
    if (event.key === "Enter" && event.shiftKey && editor) {
      if (editor.isActive("codeBlock")) return editor.commands.newlineInCode();
      for (const type of ["taskItem", "listItem"]) {
        if (editor.isActive(type))
          return editor.commands.splitListItem(type) || editor.commands.liftListItem(type);
      }
      if (editor.isActive("blockquote")) return editor.commands.splitBlock();
    }
    return false;
  }

  function applyFormat(format: { prefix: string }) {
    if (!editor || options.disabled || composing) return;
    const chain = editor.chain().focus();
    if (format.prefix === "**") chain.toggleBold().run();
    else if (format.prefix === "*") chain.toggleItalic().run();
    else if (format.prefix === "~~") chain.toggleStrike().run();
    else if (format.prefix === "`") chain.toggleCode().run();
  }

  function insertPastedText(event: ClipboardEvent, capturedText?: string) {
    if (!editor || options.disabled) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    const text = capturedText ?? event.clipboardData?.getData("text/plain");
    if (!text) return;
    editor.commands.insertContent(text.replace(/\r\n?/g, "\n"), { contentType: "markdown" });
  }

  async function refocusEditor() {
    await tick();
    if (!options.disabled) editor?.commands.focus(undefined, { scrollIntoView: false });
  }

  function focusEnd() {
    editor?.commands.focus("end", { scrollIntoView: false });
  }

  function replaceDraft(value: string) {
    if (!editor) return;
    lastPublished = value;
    editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
    editor.view.updateState(
      engine!.EditorState.create({
        schema: editor.schema,
        doc: editor.state.doc,
        plugins: editor.state.plugins,
      }),
    );
    revision++;
  }

  $effect(() => {
    const value = options.value;
    if (editor && !composing && value !== lastPublished) replaceDraft(value);
  });

  $effect(() => {
    if (!editor) return;
    const wasEditable = editor.isEditable;
    editor.setEditable(!options.disabled, false);
    editor.view.dom.setAttribute("aria-label", options.placeholder);
    editor.view.dom.dataset.placeholder = options.placeholder;
    if (!wasEditable && !options.disabled) void refocusEditor();
  });

  $effect(() => {
    const request = options.focusRequest;
    if (request <= 0) return;
    void refocusEditor();
    const timer = setTimeout(() => {
      if (options.focusRequest === request) void refocusEditor();
    }, 100);
    return () => clearTimeout(timer);
  });

  async function loadEditor() {
    loadFailed = false;
    try {
      const module = await import("./tiptap");
      if (disposed || !mountEl) return;
      engine = module;
      editor = new module.Editor({
        element: mountEl,
        extensions: module.composerExtensions(references),
        content: options.value,
        contentType: "markdown",
        editable: !options.disabled,
        editorProps: {
          attributes: {
            class: "input input-editor composer-md",
            role: "textbox",
            "aria-multiline": "true",
            spellcheck: "false",
          },
          handleKeyDown: (_view, event) => handleKeydown(event),
          handleDOMEvents: {
            paste: (_view, event) => {
              options.handlePaste(event);
              return event.defaultPrevented;
            },
            blur: () => {
              setTimeout(() => options.palette.closePalette(), 100);
              return false;
            },
            compositionstart: () => {
              compositionValue = options.value;
              composing = true;
              return false;
            },
            compositionend: () => {
              setTimeout(() => {
                composing = false;
                if (options.value !== compositionValue) replaceDraft(options.value);
                else publish();
              }, 0);
              return false;
            },
          },
          clipboardTextSerializer: (slice) =>
            editor?.markdown?.serialize(
              engine!.protocolDocument(
                {
                  type: "doc",
                  content: slice.content.toJSON(),
                },
                references(),
              ),
            ) ?? "",
        },
        onUpdate: publish,
        onTransaction: () => {
          revision++;
        },
        onSelectionUpdate: () => {
          if (!composing) void options.palette.syncPaletteFromCaret();
        },
      });
      lastPublished = options.value;
      void refocusEditor();
    } catch (error) {
      if (!disposed) {
        console.error("Composer editor could not load", error);
        loadFailed = true;
      }
    }
  }

  onMount(() => {
    void loadEditor();
    return () => {
      disposed = true;
      editor?.destroy();
      editor = null;
    };
  });

  return {
    get mountEl() {
      return mountEl;
    },
    set mountEl(value: HTMLDivElement | null) {
      mountEl = value;
    },
    get editorEl() {
      return (editor?.view.dom as HTMLDivElement | undefined) ?? null;
    },
    get ready() {
      return editor !== null;
    },
    get loadFailed() {
      return loadFailed;
    },
    retry: loadEditor,
    get composing() {
      return composing;
    },
    get isEmpty() {
      void revision;
      return editor?.isEmpty ?? !options.value;
    },
    get paletteText() {
      void revision;
      return editor ? engine!.textPositions(editor.state.doc).value : options.value;
    },
    isActive(prefix: string) {
      void revision;
      return (
        editor?.isActive(
          ({ "**": "bold", "*": "italic", "~~": "strike", "`": "code" } as Record<string, string>)[
            prefix
          ],
        ) ?? false
      );
    },
    textSelection,
    commit,
    insertPastedText,
    refocusEditor,
    focusEnd,
    applyFormat,
    rememberSelection() {
      /* ProseMirror retains selection when toolbar controls receive focus. */
    },
  };
}

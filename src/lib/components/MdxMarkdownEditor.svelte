<script lang="ts">
  import { convertFileSrc, isTauri } from "@tauri-apps/api/core";
  import { locale, tr, type TranslationKeys } from "$lib/i18n";
  import { invoke } from "$lib/openagent/tauriClient";
  import { onDestroy, onMount } from "svelte";

  type EditorProps = {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    class?: string;
  };

  type EditorMethods = {
    setMarkdown: (value: string) => void;
    insertMarkdown: (value: string) => void;
  };

  let { value, onChange, placeholder = "", class: className = "" }: EditorProps = $props();

  let hostEl = $state<HTMLDivElement | null>(null);
  let editorRef: EditorMethods | null = null;
  let reactRoot: import("react-dom/client").Root | null = null;
  let React: typeof import("react") | null = null;
  let editorModule: typeof import("@mdxeditor/editor") | null = null;
  let lastEditorValue = "";
  let applyingExternalValue = false;
  let removePasteListener: (() => void) | null = null;
  const tauriAvailable = isTauri();
  const editorTranslationKeys = {
    "toolbar.richText": "mdEditorRichText",
    "toolbar.source": "mdEditorSource",
    "toolbar.undo": "mdEditorUndo",
    "toolbar.redo": "mdEditorRedo",
    "toolbar.blockTypes.paragraph": "mdEditorParagraph",
    "toolbar.blockTypes.quote": "mdEditorQuote",
    "toolbar.blockTypes.heading": "mdEditorHeading",
    "toolbar.blockTypeSelect.selectBlockTypeTooltip": "mdEditorSelectBlockType",
    "toolbar.blockTypeSelect.placeholder": "mdEditorBlockType",
    "toolbar.bold": "mdEditorBold",
    "toolbar.removeBold": "mdEditorRemoveBold",
    "toolbar.italic": "mdEditorItalic",
    "toolbar.removeItalic": "mdEditorRemoveItalic",
    "toolbar.underline": "mdEditorUnderline",
    "toolbar.removeUnderline": "mdEditorRemoveUnderline",
    "toolbar.inlineCode": "mdEditorInlineCode",
    "toolbar.removeInlineCode": "mdEditorRemoveInlineCode",
    "toolbar.bulletedList": "mdEditorBulletedList",
    "toolbar.numberedList": "mdEditorNumberedList",
    "toolbar.checkList": "mdEditorCheckList",
    "toolbar.link": "mdEditorCreateLink",
    "toolbar.image": "mdEditorInsertImage",
    "toolbar.table": "mdEditorInsertTable",
    "toolbar.thematicBreak": "mdEditorInsertThematicBreak",
    "toolbar.toggleGroup": "mdEditorToggleGroup",
    "dialog.close": "mdEditorCloseDialog",
    "dialogControls.save": "mdEditorSave",
    "dialogControls.cancel": "mdEditorCancel",
    "createLink.url": "mdEditorLinkUrl",
    "createLink.urlPlaceholder": "mdEditorLinkUrlPlaceholder",
    "createLink.text": "mdEditorLinkText",
    "createLink.textTooltip": "mdEditorLinkTextTooltip",
    "createLink.title": "mdEditorLinkTitle",
    "createLink.titleTooltip": "mdEditorLinkTitleTooltip",
    "createLink.saveTooltip": "mdEditorSetUrl",
    "createLink.cancelTooltip": "mdEditorCancelLinkChange",
    "linkPreview.open": "mdEditorOpenLink",
    "linkPreview.edit": "mdEditorEditLink",
    "linkPreview.copyToClipboard": "mdEditorCopyLink",
    "linkPreview.copied": "mdEditorCopied",
    "linkPreview.remove": "mdEditorRemoveLink",
    "uploadImage.dialogTitle": "mdEditorUploadImage",
    "uploadImage.uploadInstructions": "mdEditorUploadImageFromDevice",
    "uploadImage.addViaUrlInstructions": "mdEditorAddImageUrl",
    "uploadImage.addViaUrlInstructionsNoUpload": "mdEditorAddImageUrlNoUpload",
    "uploadImage.autoCompletePlaceholder": "mdEditorImageUrlPlaceholder",
    "uploadImage.alt": "mdEditorImageAlt",
    "uploadImage.title": "mdEditorImageTitle",
    "uploadImage.width": "mdEditorImageWidth",
    "uploadImage.height": "mdEditorImageHeight",
    "imageEditor.deleteImage": "mdEditorDeleteImage",
    "imageEditor.editImage": "mdEditorEditImage",
    "table.deleteTable": "mdEditorDeleteTable",
    "table.columnMenu": "mdEditorColumnMenu",
    "table.textAlignment": "mdEditorTextAlignment",
    "table.alignLeft": "mdEditorAlignLeft",
    "table.alignCenter": "mdEditorAlignCenter",
    "table.alignRight": "mdEditorAlignRight",
    "table.insertColumnLeft": "mdEditorInsertColumnLeft",
    "table.insertColumnRight": "mdEditorInsertColumnRight",
    "table.deleteColumn": "mdEditorDeleteColumn",
    "table.rowMenu": "mdEditorRowMenu",
    "table.insertRowAbove": "mdEditorInsertRowAbove",
    "table.insertRowBelow": "mdEditorInsertRowBelow",
    "table.deleteRow": "mdEditorDeleteRow",
    "codeBlock.language": "mdEditorCodeLanguage",
    "codeBlock.selectLanguage": "mdEditorSelectCodeLanguage",
    "codeBlock.inlineLanguage": "mdEditorLanguage",
    "codeblock.delete": "mdEditorDeleteCodeBlock",
    "frontmatterEditor.title": "mdEditorFrontmatterTitle",
    "frontmatterEditor.key": "mdEditorFrontmatterKey",
    "frontmatterEditor.value": "mdEditorFrontmatterValue",
    "frontmatterEditor.addEntry": "mdEditorFrontmatterAddEntry",
  } as const satisfies Record<string, TranslationKeys>;

  onMount(async () => {
    const [react, reactDom, mdxEditor] = await Promise.all([
      import("react"),
      import("react-dom/client"),
      import("@mdxeditor/editor"),
    ]);

    React = react;
    editorModule = mdxEditor;
    lastEditorValue = value ?? "";
    reactRoot = reactDom.createRoot(hostEl!);
    renderEditor();

    const handlePaste = (event: ClipboardEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(".mdxeditor-root-contenteditable")) {
        return;
      }

      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.some((file) => file.type.startsWith("image/"))) return;

      const markdown = event.clipboardData?.getData("text/plain");
      if (!markdown || !editorRef) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      editorRef.insertMarkdown(markdown);
    };

    hostEl!.addEventListener("paste", handlePaste, true);
    removePasteListener = () => {
      hostEl?.removeEventListener("paste", handlePaste, true);
    };
  });

  onDestroy(() => {
    removePasteListener?.();
    removePasteListener = null;
    reactRoot?.unmount();
    reactRoot = null;
    editorRef = null;
  });

  $effect(() => {
    const nextValue = value ?? "";
    if (!editorRef || nextValue === lastEditorValue) return;

    applyingExternalValue = true;
    editorRef.setMarkdown(nextValue);
    lastEditorValue = nextValue;
    queueMicrotask(() => {
      applyingExternalValue = false;
    });
  });

  $effect(() => {
    $locale;
    renderEditor();
  });

  function translateEditor(
    key: string,
    defaultValue: string,
    interpolations: Record<string, unknown> = {},
  ): string {
    const translationKey = editorTranslationKeys[key as keyof typeof editorTranslationKeys];
    let translated = translationKey ? tr(translationKey) : defaultValue;
    for (const [name, replacement] of Object.entries(interpolations)) {
      translated = translated.replaceAll(`{{${name}}}`, String(replacement));
    }
    return translated;
  }

  function renderEditor() {
    if (!React || !editorModule || !reactRoot) return;

    const {
      MDXEditor,
      headingsPlugin,
      listsPlugin,
      quotePlugin,
      thematicBreakPlugin,
      markdownShortcutPlugin,
      linkPlugin,
      imagePlugin,
      frontmatterPlugin,
      tablePlugin,
      codeBlockPlugin,
      codeMirrorPlugin,
      diffSourcePlugin,
      toolbarPlugin,
      DiffSourceToggleWrapper,
      UndoRedo,
      BoldItalicUnderlineToggles,
      CodeToggle,
      BlockTypeSelect,
      ListsToggle,
      CreateLink,
      InsertImage,
      InsertTable,
      InsertThematicBreak,
      Separator,
    } = editorModule;

    const e = React.createElement;
    const Fragment = React.Fragment;
    const toolbarContents = () =>
      e(DiffSourceToggleWrapper, {
        options: ["rich-text", "source"],
        children: [
          e(UndoRedo, { key: "undo-redo" }),
          e(Separator, { key: "sep-1" }),
          e(BlockTypeSelect, { key: "block-type" }),
          e(BoldItalicUnderlineToggles, { key: "format" }),
          e(CodeToggle, { key: "code" }),
          e(Separator, { key: "sep-2" }),
          e(ListsToggle, {
            key: "lists",
            options: ["bullet", "number", "check"],
          }),
          e(CreateLink, { key: "link" }),
          e(Fragment, { key: "image" }, e(InsertImage)),
          e(InsertTable, { key: "table" }),
          e(InsertThematicBreak, { key: "hr" }),
        ],
      });

    reactRoot.render(
      e(MDXEditor, {
        ref: (instance: EditorMethods | null) => {
          editorRef = instance;
          if (instance) {
            const nextValue = value ?? "";
            if (nextValue !== lastEditorValue) {
              applyingExternalValue = true;
              instance.setMarkdown(nextValue);
              lastEditorValue = nextValue;
              queueMicrotask(() => {
                applyingExternalValue = false;
              });
            }
          }
        },
        markdown: value ?? "",
        className: `mdx-editor-root ${className}`.trim(),
        contentEditableClassName: "mdx-editor-content",
        spellCheck: false,
        suppressHtmlProcessing: true,
        placeholder,
        translation: translateEditor,
        plugins: [
          headingsPlugin(),
          listsPlugin(),
          quotePlugin(),
          thematicBreakPlugin(),
          linkPlugin(),
          imagePlugin({ imageUploadHandler: uploadImage }),
          frontmatterPlugin(),
          tablePlugin(),
          codeBlockPlugin({ defaultCodeBlockLanguage: "txt" }),
          codeMirrorPlugin({
            codeBlockLanguages: {
              js: "JavaScript",
              ts: "TypeScript",
              jsx: "JSX",
              tsx: "TSX",
              css: "CSS",
              html: "HTML",
              json: "JSON",
              md: "Markdown",
              yaml: "YAML",
              bash: "Bash",
              sh: "Shell",
              rust: "Rust",
              txt: "Text",
            },
          }),
          diffSourcePlugin({ viewMode: "rich-text" }),
          toolbarPlugin({ toolbarContents }),
          markdownShortcutPlugin(),
        ],
        onChange: (markdown: string, initialMarkdownNormalize: boolean) => {
          lastEditorValue = markdown;
          if (applyingExternalValue || initialMarkdownNormalize) return;
          onChange(markdown);
        },
      }),
    );
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== "string") {
          reject(new Error(tr("mdEditorReadImageFailed")));
          return;
        }
        resolve(result.slice(result.indexOf(",") + 1));
      };
      reader.onerror = () => reject(reader.error ?? new Error(tr("mdEditorReadImageFailed")));
      reader.readAsDataURL(file);
    });
  }

  function imageFileName(file: File): string {
    if (file.name.trim()) return file.name;
    const extension =
      file.type === "image/jpeg"
        ? "jpg"
        : file.type === "image/svg+xml"
          ? "svg"
          : file.type.split("/")[1] || "png";
    return `image-${Date.now()}.${extension}`;
  }

  async function uploadImage(file: File): Promise<string> {
    if (!tauriAvailable) {
      return URL.createObjectURL(file);
    }
    if (!file.type.startsWith("image/")) {
      throw new Error(tr("mdEditorOnlyImages"));
    }
    const contentBase64 = await fileToBase64(file);
    const path = await invoke<string>("save_pasted_attachment", {
      name: imageFileName(file),
      contentBase64,
    });
    return convertFileSrc(path);
  }
</script>

<div bind:this={hostEl} class="mdx-editor-host"></div>

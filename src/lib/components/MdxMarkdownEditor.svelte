<script lang="ts">
  import { convertFileSrc, isTauri } from "@tauri-apps/api/core";
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

  let {
    value,
    onChange,
    placeholder = "",
    class: className = "",
  }: EditorProps = $props();

  let hostEl = $state<HTMLDivElement | null>(null);
  let editorRef: EditorMethods | null = null;
  let reactRoot: import("react-dom/client").Root | null = null;
  let React: typeof import("react") | null = null;
  let editorModule: typeof import("@mdxeditor/editor") | null = null;
  let lastEditorValue = "";
  let applyingExternalValue = false;
  let removePasteListener: (() => void) | null = null;
  const tauriAvailable = isTauri();

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
      if (
        !(target instanceof Element) ||
        !target.closest(".mdxeditor-root-contenteditable")
      ) {
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
          reject(new Error("Unable to read image"));
          return;
        }
        resolve(result.slice(result.indexOf(",") + 1));
      };
      reader.onerror = () => reject(reader.error ?? new Error("Unable to read image"));
      reader.readAsDataURL(file);
    });
  }

  function imageFileName(file: File): string {
    if (file.name.trim()) return file.name;
    const extension = file.type === "image/jpeg"
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
      throw new Error("Only image files can be inserted");
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

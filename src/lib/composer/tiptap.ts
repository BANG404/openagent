import { Extension, Node, mergeAttributes, type JSONContent } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Plugin } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { segmentComposerTokens } from "$lib/components/composerTokenHighlights";
export { Editor } from "@tiptap/core";
export { EditorState } from "@tiptap/pm/state";

type References = ReadonlyMap<string, string>;

/** Application tokens remain literal Markdown and atomic editor nodes. */
function tokenExtension(references: () => References) {
  return Node.create({
    name: "composerToken",
    group: "inline",
    inline: true,
    atom: true,
    selectable: true,
    addAttributes: () => ({ label: { default: "" }, kind: { default: "token" } }),
    parseHTML: () => [{ tag: "span[data-composer-token]" }],
    renderHTML({ node, HTMLAttributes }) {
      return [
        "span",
        mergeAttributes(HTMLAttributes, {
          "data-composer-token": "true",
          "data-markdown": node.attrs.label,
          class: `composer-chip composer-chip-${node.attrs.kind}`,
          contenteditable: "false",
        }),
        node.attrs.label,
      ];
    },
    renderText: ({ node }) => node.attrs.label,
    markdownTokenName: "composerToken",
    parseMarkdown: (token) => ({
      type: "composerToken",
      attrs: {
        label: token.raw ?? "",
        kind: references().has(token.raw ?? "") ? "attachment" : "token",
      },
    }),
    renderMarkdown: (node) => node.attrs?.label ?? "",
    markdownTokenizer: {
      name: "composerToken",
      level: "inline",
      start: (source) => source.search(/[@#[]/u),
      tokenize(source, tokens) {
        const first = segmentComposerTokens(source, references())[0];
        if (!first?.highlighted || first.text.length < 2) return undefined;
        const previous = tokens.at(-1)?.raw?.at(-1);
        if (!first.attachmentPath && previous && !/\s/u.test(previous)) return undefined;
        if (first.text.startsWith('@"') && !first.text.endsWith('"')) return undefined;
        return { type: "composerToken", raw: first.text };
      },
    },
    addProseMirrorPlugins() {
      return [
        new Plugin({
          appendTransaction(transactions, _old, state) {
            if (
              !transactions.some((tr) => tr.docChanged) ||
              transactions.some((tr) => tr.getMeta("composition") !== undefined)
            )
              return null;
            const changes: Array<{
              from: number;
              to: number;
              label: string;
              kind: string;
              marks: ProseMirrorNode["marks"];
            }> = [];
            state.doc.descendants((node, position) => {
              if (
                !node.isText ||
                node.marks.some((mark) => mark.type.spec.code) ||
                state.doc.resolve(position).parent.type.spec.code
              )
                return;
              let offset = 0;
              for (const segment of segmentComposerTokens(node.text ?? "", references())) {
                const end = offset + segment.text.length;
                if (
                  segment.highlighted &&
                  segment.text.length > 1 &&
                  (segment.attachmentPath || /\s/u.test(node.text?.[end] ?? ""))
                ) {
                  changes.push({
                    from: position + offset,
                    to: position + end,
                    label: segment.text,
                    kind: segment.attachmentPath ? "attachment" : "token",
                    marks: node.marks,
                  });
                }
                offset = end;
              }
            });
            if (!changes.length) return null;
            const tr = state.tr;
            for (const change of changes.reverse()) {
              tr.replaceWith(
                change.from,
                change.to,
                state.schema.nodes.composerToken.create(
                  { label: change.label, kind: change.kind },
                  null,
                  change.marks,
                ),
              );
            }
            return tr;
          },
        }),
      ];
    },
  });
}

export function composerExtensions(references: () => References = () => new Map()) {
  return [
    StarterKit.configure({
      link: { openOnClick: false },
      // Keep the chat toolbar and message protocol deliberately small.
      underline: false,
      horizontalRule: false,
      trailingNode: false,
    }),
    TaskList,
    TaskItem.extend({
      addNodeView: () => null,
      renderHTML({ node }) {
        return [
          "li",
          { "data-type": "taskItem", "data-checked": node.attrs.checked },
          [
            "span",
            { contenteditable: "false", "aria-hidden": "true", class: "composer-task-marker" },
            node.attrs.checked ? "☑" : "☐",
          ],
          ["div", 0],
        ];
      },
    }).configure({ nested: true }),
    tokenExtension(references),
    Extension.create({
      name: "composerLiteralHtml",
      priority: 1100,
      markdownTokenName: "html",
      parseMarkdown(token) {
        const text = { type: "text", text: token.raw };
        return token.block ? { type: "paragraph", content: [text] } : text;
      },
    }),
    Extension.create({
      name: "composerLiteralTag",
      markdownTokenName: "composerLiteralTag",
      parseMarkdown: (token) => ({ type: "text", text: token.raw }),
      markdownTokenizer: {
        name: "composerLiteralTag",
        level: "inline",
        start: (source) => source.indexOf("<"),
        tokenize(source) {
          const tag = /^<[^>\n]+>/u.exec(source)?.[0];
          return tag ? { type: "composerLiteralTag", raw: tag } : undefined;
        },
      },
    }),
    Markdown,
  ];
}

/** Protect protocol tokens from generic Markdown escaping on export. */
export function protocolDocument(doc: JSONContent, references: References): JSONContent {
  const visit = (node: JSONContent, code = false): JSONContent => {
    const literal =
      code || node.type === "codeBlock" || node.marks?.some((mark) => mark.type === "code");
    if (!node.content || literal) return node;
    return {
      ...node,
      content: node.content.flatMap((child, index) => {
        if (child.type !== "text" || child.marks?.some((mark) => mark.type === "code"))
          return [visit(child, literal)];
        const text = child.text ?? "";
        const command =
          node === doc.content?.[0] && index === 0 && !child.marks?.length
            ? /^\/\S+/u.exec(text)?.[0]
            : undefined;
        const segments = segmentComposerTokens(text.slice(command?.length ?? 0), references);
        const result: JSONContent[] = command
          ? [{ type: "composerToken", attrs: { label: command } }]
          : [];
        for (const segment of segments) {
          result.push(
            segment.highlighted && segment.text.length > 1
              ? { type: "composerToken", attrs: { label: segment.text }, marks: child.marks }
              : { ...child, text: segment.text },
          );
        }
        return result;
      }),
    };
  };
  return visit(doc);
}

/** Text offsets for suggestions are independent of Markdown delimiters. */
export function textPositions(doc: ProseMirrorNode) {
  let value = "";
  const positions: number[] = [];
  doc.descendants((node, position) => {
    if (!node.isTextblock) return;
    if (positions.length) value += "\n";
    positions[value.length] = position + 1;
    node.forEach((child, offset) => {
      const text = child.isText
        ? (child.text ?? "")
        : child.type.name === "hardBreak"
          ? "\n"
          : (child.attrs.label ?? "");
      for (let index = 0; index < text.length; index++) {
        positions[value.length + index] = position + 1 + offset + (child.isText ? index : 0);
      }
      value += text;
      positions[value.length] = position + 1 + offset + child.nodeSize;
    });
    return false;
  });
  return { value, positions };
}

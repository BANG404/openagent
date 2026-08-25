import type { StreamdownProps } from "svelte-streamdown";

/**
 * Keep markers outside list-item content so loose Markdown lists whose items
 * render as block paragraphs still align the marker with the first text line.
 */
export const chatMarkdownTheme: NonNullable<StreamdownProps["theme"]> = {
  ol: { base: "list-outside" },
  ul: { base: "list-outside" },
  code: {
    container: "chat-code-container",
    header: "chat-code-header",
    buttons: "chat-code-buttons",
    language: "chat-code-language",
    skeleton: "chat-code-skeleton",
    pre: "chat-code-pre",
    line: "chat-code-line",
  },
};

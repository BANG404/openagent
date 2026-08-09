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
    skeleton: "chat-code-skeleton",
  },
};

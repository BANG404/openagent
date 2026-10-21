import { parseIncompleteMarkdown } from "svelte-streamdown";
import { componentBlockExtension } from "./extensions";

/** Component string values are literal source, never incomplete Markdown. */
export function parseChatMarkdown(source: string): string {
  if (componentBlockExtension.tokenizer?.(source)) return source;
  return parseIncompleteMarkdown(source);
}

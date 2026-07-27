import type { Extension } from "svelte-streamdown";
import { findNextComponentStart, parseComponentAt, type Value } from "./parser";

/** Custom token emitted for a component call. The Streamdown `children` snippet dispatches on type. */
export interface ComponentToken {
  type: "component";
  raw: string;
  name: string;
  args: Array<[string, Value]>;
  partial: boolean;
}

/**
 * Inline marked extension that detects `ComponentName(args...)` and produces a
 * `component` token. Streaming-friendly: if no matching ')' is found yet, the
 * entire remainder is consumed as a partial token (renderer shows a skeleton).
 */
export const componentInlineExtension: Extension = {
  name: "component",
  level: "inline",
  start(src: string): number | undefined {
    const idx = findNextComponentStart(src);
    return idx < 0 ? undefined : idx;
  },
  tokenizer(src: string): ComponentToken | undefined {
    // The dispatcher feeds us `src` starting at some position; we only match
    // when the very first chars look like a component head.
    const head = src.match(/^([A-Z][A-Za-z0-9_]*)\(/);
    if (!head) return undefined;

    const result = parseComponentAt(src, 0);
    if (result.ok) {
      return {
        type: "component",
        raw: src.slice(0, result.value.end),
        name: result.value.name,
        args: result.value.args,
        partial: false,
      };
    }
    // Parse failure — could be a real syntax error OR streaming (unfinished).
    // Detect streaming by checking whether the input runs out before a matching ')' could be found.
    // Heuristic: if the error sits at or past the end-of-input, treat as partial.
    if (result.error.pos >= src.length - 1) {
      return {
        type: "component",
        raw: src,
        name: head[1],
        args: [],
        partial: true,
      };
    }
    // Genuine syntax error — let the text fall through to plain markdown.
    return undefined;
  },
};

/** Block-level variant: lets a multi-line component call (with """triple""" strings or nested objects) act as its own block. */
export const componentBlockExtension: Extension = {
  name: "componentBlock",
  level: "block",
  applyInBlockParsing: true,
  start(src: string): number | undefined {
    // Only kick in if a component head appears at start-of-line.
    const m = src.match(/(^|\n)[A-Z][A-Za-z0-9_]*\(/);
    if (!m) return undefined;
    return m.index! + (m[1] ? 1 : 0);
  },
  tokenizer(src: string): ComponentToken | undefined {
    // Must start at beginning of a line.
    const head = src.match(/^([A-Z][A-Za-z0-9_]*)\(/);
    if (!head) return undefined;
    const result = parseComponentAt(src, 0);
    if (result.ok) {
      // Only treat as a block if it's followed by end-of-input or a blank line / newline.
      const end = result.value.end;
      const after = src.slice(end);
      if (after.length === 0 || /^\s*(?:\n|$)/.test(after)) {
        // consume trailing newline(s)
        const trailing = after.match(/^[ \t]*\n?/);
        const consume = end + (trailing ? trailing[0].length : 0);
        return {
          type: "component",
          raw: src.slice(0, consume),
          name: result.value.name,
          args: result.value.args,
          partial: false,
        };
      }
      return undefined; // not a block — let inline handle it
    }
    // Streaming partial at block level: consume to end-of-input.
    if (result.error.pos >= src.length - 1) {
      return {
        type: "component",
        raw: src,
        name: head[1],
        args: [],
        partial: true,
      };
    }
    return undefined;
  },
};

export const customExtensions: Extension[] = [componentBlockExtension, componentInlineExtension];

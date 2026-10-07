import { parseBlocks, parseInline } from "../composerMarkdown";

export interface ComposerSelection {
  value: string;
  start: number;
  end: number;
}

export interface ComposerFormat {
  prefix: string;
  suffix?: string;
  placeholder?: string;
}

/** Wrap the current selection and return the next caret range. */
export function applyComposerFormat(
  value: string,
  start: number,
  end: number,
  format: ComposerFormat,
): ComposerSelection {
  const prefix = format.prefix;
  const suffix = format.suffix ?? prefix;
  const selected = value.slice(start, end);

  if (selected.includes("\n")) {
    let offset = 0;
    let selectionStart: number | undefined;
    let selectionEnd = 0;
    const lines = parseBlocks(selected).map((block) => {
      const content = block.raw.slice(block.markerRaw.length);
      if (!content.trim() || block.kind === "codeBlock") {
        offset += block.raw.length + 1;
        return block.raw;
      }
      const from = block.markerRaw.length + (content.match(/^\s*/)?.[0].length ?? 0);
      const to = block.raw.trimEnd().length;
      const edit = applyComposerFormat(block.raw, from, to, format);
      selectionStart ??= offset + edit.start;
      selectionEnd = offset + edit.end;
      offset += edit.value.length + 1;
      return edit.value;
    });
    return {
      value: value.slice(0, start) + lines.join("\n") + value.slice(end),
      start: start + (selectionStart ?? 0),
      end: start + selectionEnd,
    };
  }

  // Select-all includes hidden markers; a normal text selection excludes them.
  // Both selections must toggle the same complete span, never nest its markers.
  const [span, sibling] = parseInline(selected);
  if (
    span &&
    !sibling &&
    span.raw.startsWith(prefix) &&
    span.raw.endsWith(suffix) &&
    span.contentStart === prefix.length &&
    span.contentEnd === selected.length - suffix.length
  ) {
    return {
      value:
        value.slice(0, start) + selected.slice(prefix.length, -suffix.length) + value.slice(end),
      start,
      end: end - prefix.length - suffix.length,
    };
  }

  if (
    selected.length > 0 &&
    value.slice(start - prefix.length, start) === prefix &&
    value.slice(end, end + suffix.length) === suffix
  ) {
    return {
      value: `${value.slice(0, start - prefix.length)}${selected}${value.slice(end + suffix.length)}`,
      start: start - prefix.length,
      end: end - prefix.length,
    };
  }

  const content = selected || format.placeholder || "text";
  const nextValue = `${value.slice(0, start)}${prefix}${content}${suffix}${value.slice(end)}`;
  const contentStart = start + prefix.length;
  return {
    value: nextValue,
    start: contentStart,
    end: contentStart + content.length,
  };
}

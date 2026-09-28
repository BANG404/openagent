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

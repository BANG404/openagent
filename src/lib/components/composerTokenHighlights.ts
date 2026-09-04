export interface ComposerTokenSegment {
  text: string;
  highlighted: boolean;
}

function tokenEnd(value: string, start: number): number {
  if (value[start + 1] !== '"') {
    let end = start + 1;
    while (end < value.length && !/[\s,，。;；：!?！？、()[\]{}<>《》]/u.test(value[end])) end += 1;
    while (end > start + 1 && /[.:]/u.test(value[end - 1])) end -= 1;
    return end;
  }

  let escaped = false;
  for (let end = start + 2; end < value.length; end += 1) {
    const character = value[end];
    if (character === '"' && !escaped) return end + 1;
    escaped = character === "\\" && !escaped;
    if (character !== "\\") escaped = false;
  }
  return value.length;
}

export function segmentComposerTokens(value: string): ComposerTokenSegment[] {
  const segments: ComposerTokenSegment[] = [];
  let plainStart = 0;
  let index = 0;

  while (index < value.length) {
    const character = value[index];
    const isTokenStart =
      (character === "@" || character === "#") && (index === 0 || /\s/u.test(value[index - 1]));
    if (!isTokenStart) {
      index += 1;
      continue;
    }

    if (plainStart < index) {
      segments.push({ text: value.slice(plainStart, index), highlighted: false });
    }
    const end = tokenEnd(value, index);
    segments.push({ text: value.slice(index, end), highlighted: true });
    plainStart = end;
    index = end;
  }

  if (plainStart < value.length) {
    segments.push({ text: value.slice(plainStart), highlighted: false });
  }
  return segments;
}

/** Explicit delivery mode carried by an otherwise ordinary attachment locator. */
export const TEXT_REFERENCE_PREFIX = "text-ref:";
export const LARGE_PASTE_CHAR_THRESHOLD = 1000;

export function attachmentLocator(path: string): string {
  return path.startsWith(TEXT_REFERENCE_PREFIX) ? path.slice(TEXT_REFERENCE_PREFIX.length) : path;
}

export function isLargeTextPaste(text: string): boolean {
  const characters = text[Symbol.iterator]();
  for (let count = 0; count <= LARGE_PASTE_CHAR_THRESHOLD; count++) {
    if (characters.next().done) return false;
  }
  return true;
}

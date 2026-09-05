export function countTextLines(text: string): number {
  if (!text) return 0;

  let count = 1;
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) count += 1;
  }
  return count;
}

export function formatTextLineCount(text: string): string {
  const count = countTextLines(text);
  return `${count} line${count === 1 ? "" : "s"}`;
}

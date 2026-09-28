/**
 * A durable tool result is a JSON value, but the Runtime may append
 * model-context text to the same result — automation-hook output and plugin
 * context are pushed as extra content blocks. The product transcript joins
 * those blocks into one string, so a structured result arrives as
 * `<json>\n<appended text>` and stops being parseable as a whole.
 *
 * Read the leading JSON value instead, so appended context cannot make a
 * structured result look like plain text to the features that depend on it
 * (chat-group scope, terminal and Mermaid cards, `ask_user` responses).
 * Plain-text output stays plain text: only a result that starts with an object
 * or array is treated as structured. A result of literal `null` reads as
 * absent, which matches how the product inspects object-shaped results.
 */
export function parseToolResultJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    // Fall through to the leading value: the rest of the result is appended context.
  }
  const end = leadingJsonEnd(trimmed);
  if (end < 0) return null;
  try {
    return JSON.parse(trimmed.slice(0, end));
  } catch {
    return null;
  }
}

/**
 * Index just past the first balanced object or array, or -1 when the text does
 * not start with one. Braces inside strings must not close the value, so the
 * scan tracks string and escape state rather than counting characters.
 */
function leadingJsonEnd(text: string): number {
  if (text[0] !== "{" && text[0] !== "[") return -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{" || char === "[") depth++;
    else if (char === "}" || char === "]") {
      depth--;
      if (depth === 0) return index + 1;
    }
  }
  return -1;
}

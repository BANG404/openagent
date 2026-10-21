/**
 * Preserve Mermaid labels, punctuation, entities, and arrows. Normalize transport
 * artifacts and the missing separator between a flowchart declaration and its
 * first statement; do not rewrite statements or infer other grammar repairs.
 */
export function normalizeMermaidSource(source: string): string {
  const lines = source
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .split("\n");
  const declaration = lines.findIndex((line) => line.trim() && !line.trimStart().startsWith("%%"));
  if (declaration >= 0) {
    // Models sometimes put the first node after `flowchart TD` on the same
    // line. Mermaid requires a newline or semicolon after that declaration.
    // Inspect only the declaration, so multiline labels remain literal.
    lines[declaration] = lines[declaration].replace(
      /^([ \t]*(?:flowchart|graph)[ \t]+(?:TB|TD|BT|RL|LR))[ \t]+(?=[^\s;%])/,
      "$1\n",
    );
  }
  return lines.join("\n");
}

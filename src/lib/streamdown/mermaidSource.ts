/**
 * Mermaid owns its grammar. Rewriting punctuation, entities, whitespace, or
 * arrows here can turn otherwise valid diagrams into different source code.
 * Only normalize transport artifacts that are never meaningful Mermaid syntax.
 */
export function normalizeMermaidSource(source: string): string {
  return source
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

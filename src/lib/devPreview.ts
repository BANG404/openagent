export type StandaloneDevPreview =
  | "attachment-composer"
  | "book-mode"
  | "checkpoint-flow"
  | "command-palette"
  | "pause-control"
  | "quote-context"
  | "permission-settings"
  | "reasoning-effort"
  | "workspace-switcher";

const PREVIEW_QUERIES: ReadonlyArray<[string, StandaloneDevPreview]> = [
  ["book-mode-preview", "book-mode"],
  ["permission-settings-preview", "permission-settings"],
  ["workspace-switcher-preview", "workspace-switcher"],
  ["checkpoint-flow-preview", "checkpoint-flow"],
  ["pause-control-preview", "pause-control"],
  ["quote-context-preview", "quote-context"],
  ["command-palette-preview", "command-palette"],
  ["reasoning-effort-preview", "reasoning-effort"],
  ["attachment-composer-preview", "attachment-composer"],
];

export function resolveStandaloneDevPreview(
  query: URLSearchParams | null,
  development: boolean,
): StandaloneDevPreview | null {
  if (!development || !query) return null;
  return PREVIEW_QUERIES.find(([parameter]) => query.has(parameter))?.[1] ?? null;
}

export function previewParameterPrefix(preview: StandaloneDevPreview): string {
  return `${preview}-preview`;
}

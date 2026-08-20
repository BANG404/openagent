export type StandaloneDevPreview =
  | "attachment-composer"
  | "book-mode"
  | "checkpoint-flow"
  | "compaction-status"
  | "command-palette"
  | "desktop-shell"
  | "follow-up-suggestions"
  | "input-surfaces"
  | "media-sources"
  | "mermaid-finalization"
  | "pause-control"
  | "quote-context"
  | "permission-settings"
  | "reasoning-effort"
  | "runtime-notice"
  | "streaming-transcript"
  | "workspace-switcher";

const PREVIEW_QUERIES: ReadonlyArray<[string, StandaloneDevPreview]> = [
  ["desktop-shell-preview", "desktop-shell"],
  ["book-mode-preview", "book-mode"],
  ["permission-settings-preview", "permission-settings"],
  ["workspace-switcher-preview", "workspace-switcher"],
  ["checkpoint-flow-preview", "checkpoint-flow"],
  ["compaction-status-preview", "compaction-status"],
  ["pause-control-preview", "pause-control"],
  ["quote-context-preview", "quote-context"],
  ["command-palette-preview", "command-palette"],
  ["follow-up-suggestions-preview", "follow-up-suggestions"],
  ["input-surfaces-preview", "input-surfaces"],
  ["media-sources-preview", "media-sources"],
  ["mermaid-finalization-preview", "mermaid-finalization"],
  ["reasoning-effort-preview", "reasoning-effort"],
  ["runtime-notice-preview", "runtime-notice"],
  ["streaming-transcript-preview", "streaming-transcript"],
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

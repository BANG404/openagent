export type RightSidebarPanel =
  "status" | "files" | "terminal" | "group" | `plugin:${string}:${string}`;

export function isPluginSidebarPanel(
  panel: RightSidebarPanel,
): panel is `plugin:${string}:${string}` {
  return panel.startsWith("plugin:");
}

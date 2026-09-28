import type { AgentPluginSidebarViewSummary, AgentPluginSummary } from "./types";
import type { RightSidebarPanel } from "./rightSidebar";

/**
 * Why a declared plugin right-sidebar view is or is not reachable right now.
 *
 * Lifecycle is host-owned: a view published by a disabled or broken plugin, or
 * one whose declared scope the host cannot satisfy, is never mounted, and a
 * panel that was already selected navigates to an available fallback instead of
 * rendering an empty surface.
 */
export type PluginSidebarLifecycle = "available" | "disabled" | "invalid" | "out-of-scope";

export type PluginSidebarPanel = Extract<RightSidebarPanel, `plugin:${string}:${string}`>;

export interface PluginSidebarEntry {
  /** The `plugin:<plugin-id>:<view-id>` panel the right sidebar stores. */
  panel: PluginSidebarPanel;
  /** Owning plugin, which owns the panel's lifecycle gate. */
  pluginId: string;
  view: AgentPluginSidebarViewSummary;
  lifecycle: PluginSidebarLifecycle;
  /** Installed package identity the panel renders, e.g. `demo@1.2.0`. */
  pluginRevision: string;
}

/**
 * Host context a declared sidebar scope resolves against. A view that requests
 * a workspace or conversation scope stays hidden while the host has none, so
 * the sidebar never offers a panel that cannot render its own subject.
 */
export interface PluginSidebarContext {
  hasWorkspace: boolean;
  hasConversation: boolean;
}

/**
 * The single lifecycle gate for one declared view. Enablement is the first gate
 * because a disabled plugin contributes no mounted components, and a manifest
 * or component error means the package must not be trusted to render.
 */
export function pluginSidebarLifecycle(
  view: AgentPluginSidebarViewSummary,
  plugin: Pick<AgentPluginSummary, "enabled" | "error">,
  context: PluginSidebarContext,
): PluginSidebarLifecycle {
  if (!plugin.enabled) return "disabled";
  if (plugin.error) return "invalid";
  if (view.scope === "workspace" && !context.hasWorkspace) return "out-of-scope";
  if (view.scope === "conversation" && !context.hasConversation) return "out-of-scope";
  return "available";
}

/**
 * Every declared view of every installed plugin, carrying its lifecycle state.
 * The first declaration of a panel id wins so a manifest that repeats an id
 * cannot produce two entries the sidebar would have to key separately.
 */
export function pluginSidebarEntries(
  plugins: readonly AgentPluginSummary[],
  context: PluginSidebarContext,
): PluginSidebarEntry[] {
  const entries: PluginSidebarEntry[] = [];
  const seen = new Set<string>();
  for (const plugin of plugins) {
    for (const view of plugin.sidebar_views) {
      if (seen.has(view.id)) continue;
      seen.add(view.id);
      entries.push({
        panel: view.id,
        pluginId: plugin.id,
        view,
        lifecycle: pluginSidebarLifecycle(view, plugin, context),
        pluginRevision: `${plugin.id}@${plugin.version ?? "unversioned"}`,
      });
    }
  }
  return entries;
}

/** The views the host may mount and navigate to in the current context. */
export function availablePluginSidebarViews(
  entries: readonly PluginSidebarEntry[],
): AgentPluginSidebarViewSummary[] {
  return entries.filter((entry) => entry.lifecycle === "available").map((entry) => entry.view);
}

/**
 * The panel the host selects when the sidebar must move off an unavailable
 * panel and no built-in view can take over, or when a plugin panel is the only
 * detail surface the scope has. Returning `null` keeps the caller's own
 * built-in preference instead of hijacking it.
 */
export function firstAvailablePluginSidebarPanel(
  entries: readonly PluginSidebarEntry[],
): PluginSidebarPanel | null {
  return entries.find((entry) => entry.lifecycle === "available")?.panel ?? null;
}

/**
 * Identity of the installed packages behind the visible panels, derived from
 * content rather than from the descriptor array. A plugin list refresh keeps
 * the same revision, while an install, update, removal, or enable/disable
 * changes it and makes every mounted panel re-read its own document.
 */
export function pluginSidebarRevision(entries: readonly PluginSidebarEntry[]): string {
  return entries
    .filter((entry) => entry.lifecycle === "available")
    .map((entry) => `${entry.panel}@${entry.pluginRevision}`)
    .sort()
    .join("|");
}

import type {
  AgentPluginSidebarViewSummary,
  AgentPluginSummary,
  ChatMessage,
  StreamItem,
} from "./types";
import type { RightSidebarPanel } from "./rightSidebar";
import { pluginText } from "./pluginI18n";

/**
 * Why a declared plugin right-sidebar view is or is not reachable right now.
 *
 * Lifecycle is host-owned: a view published by a disabled or broken plugin, or
 * one whose declared scope the host cannot satisfy, is never mounted, and a
 * panel that was already selected navigates to an available fallback instead of
 * rendering an empty surface.
 */
export type PluginSidebarLifecycle =
  "available" | "disabled" | "invalid" | "out-of-scope" | "inactive";

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
  /** Tool names projected from the selected branch, including its live stream. */
  toolNames?: readonly string[];
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
  if (
    view.activation_tools !== undefined &&
    (!context.hasConversation ||
      !view.activation_tools.some((name) => context.toolNames?.includes(name)))
  )
    return "inactive";
  return "available";
}

/** Only actual assistant tool calls activate panels; text and discovery do not. */
export function branchToolNames(
  messages: readonly ChatMessage[],
  streamItems: readonly StreamItem[],
): string[] {
  const names = new Set<string>();
  function visit(items: readonly StreamItem[]): void {
    for (const item of items) {
      if (item.type === "tool_call") names.add(item.name);
      else if (item.type === "retry") visit(item.items);
    }
  }
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    visit(message.items ?? []);
    for (const call of message.toolCalls ?? []) names.add(call.name);
  }
  visit(streamItems);
  return [...names];
}

/** Open each conditional panel once per branch, preserving subsequent user choices. */
export class PluginSidebarActivationStore {
  readonly #seen = new Map<string, Set<PluginSidebarPanel>>();

  activate(scope: string, entries: readonly PluginSidebarEntry[]): PluginSidebarPanel | null {
    const seen = this.#seen.get(scope) ?? new Set<PluginSidebarPanel>();
    this.#seen.set(scope, seen);
    let panel: PluginSidebarPanel | null = null;
    for (const entry of entries) {
      if (entry.lifecycle !== "available" || entry.view.activation_tools === undefined) continue;
      if (!seen.has(entry.panel)) panel ??= entry.panel;
      seen.add(entry.panel);
    }
    return panel;
  }
}

/**
 * Every declared view of every installed plugin, carrying its lifecycle state.
 * The first declaration of a panel id wins so a manifest that repeats an id
 * cannot produce two entries the sidebar would have to key separately.
 */
export function pluginSidebarEntries(
  plugins: readonly AgentPluginSummary[],
  context: PluginSidebarContext,
  locale = "en",
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
        view: {
          ...view,
          title: pluginText(
            plugin.i18n,
            locale,
            `sidebar.${view.id.split(":").at(-1)}.title`,
            view.title,
          ),
        },
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

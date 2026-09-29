import { describe, expect, test } from "bun:test";
import {
  availablePluginSidebarViews,
  firstAvailablePluginSidebarPanel,
  pluginSidebarEntries,
  pluginSidebarLifecycle,
  pluginSidebarRevision,
  type PluginSidebarContext,
} from "../src/lib/pluginSidebar";
import type { AgentPluginSidebarViewSummary, AgentPluginSummary } from "../src/lib/types";

const FULL_CONTEXT: PluginSidebarContext = { hasWorkspace: true, hasConversation: true };
const EMPTY_CONTEXT: PluginSidebarContext = { hasWorkspace: false, hasConversation: false };

function view(
  overrides: Partial<AgentPluginSidebarViewSummary> = {},
): AgentPluginSidebarViewSummary {
  return {
    id: "plugin:demo:panel",
    title: "Panel",
    entry: "ui/panel.html",
    scope: "global",
    icon: null,
    capabilities: [],
    ...overrides,
  };
}

function plugin(overrides: Partial<AgentPluginSummary> = {}): AgentPluginSummary {
  return {
    id: "demo",
    name: "Demo",
    builtin: false,
    enabled: true,
    version: "1.0.0",
    description: null,
    path: "/plugins/demo",
    repository: null,
    homepage: null,
    license: null,
    author: null,
    keywords: [],
    capabilities: [],
    commands: [],
    command_specs: [],
    flows: [],
    message_policies: [],
    skills: [],
    mcp_servers: [],
    sidebar_views: [],
    automation_hooks: [],
    warnings: [],
    error: null,
    ...overrides,
  };
}

describe("pluginSidebarLifecycle", () => {
  test("keeps an enabled, valid view in scope", () => {
    expect(pluginSidebarLifecycle(view(), plugin(), FULL_CONTEXT)).toBe("available");
  });

  test("hides the view when the plugin is disabled, before any scope check", () => {
    expect(
      pluginSidebarLifecycle(
        view({ scope: "conversation" }),
        plugin({ enabled: false }),
        EMPTY_CONTEXT,
      ),
    ).toBe("disabled");
  });

  test("rejects a view of a plugin that failed to load", () => {
    expect(pluginSidebarLifecycle(view(), plugin({ error: "bad manifest" }), FULL_CONTEXT)).toBe(
      "invalid",
    );
  });

  test("hides a workspace view without a workspace and a conversation view without one", () => {
    expect(pluginSidebarLifecycle(view({ scope: "workspace" }), plugin(), EMPTY_CONTEXT)).toBe(
      "out-of-scope",
    );
    expect(pluginSidebarLifecycle(view({ scope: "conversation" }), plugin(), EMPTY_CONTEXT)).toBe(
      "out-of-scope",
    );
  });

  test("keeps a global view reachable without a workspace or conversation", () => {
    expect(pluginSidebarLifecycle(view(), plugin(), EMPTY_CONTEXT)).toBe("available");
  });
});

describe("pluginSidebarEntries", () => {
  test("keeps plugin and manifest order while carrying the owning plugin", () => {
    const entries = pluginSidebarEntries(
      [
        plugin({
          id: "alpha",
          sidebar_views: [
            view({ id: "plugin:alpha:first", title: "First" }),
            view({ id: "plugin:alpha:second", title: "Second" }),
          ],
        }),
        plugin({ id: "beta", sidebar_views: [view({ id: "plugin:beta:only" })] }),
      ],
      FULL_CONTEXT,
    );

    expect(entries.map((entry) => entry.panel)).toEqual([
      "plugin:alpha:first",
      "plugin:alpha:second",
      "plugin:beta:only",
    ]);
    expect(entries[1].pluginId).toBe("alpha");
    expect(entries[1].view.title).toBe("Second");
  });

  test("keeps only the first declaration of a repeated panel id", () => {
    const entries = pluginSidebarEntries(
      [
        plugin({
          sidebar_views: [
            view({ id: "plugin:demo:panel", title: "First" }),
            view({ id: "plugin:demo:panel", title: "Duplicate" }),
          ],
        }),
      ],
      FULL_CONTEXT,
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].view.title).toBe("First");
  });

  test("classifies every declared view against the current host context", () => {
    const entries = pluginSidebarEntries(
      [
        plugin({ sidebar_views: [view({ scope: "workspace" })] }),
        plugin({ id: "off", enabled: false, sidebar_views: [view({ id: "plugin:off:panel" })] }),
      ],
      EMPTY_CONTEXT,
    );

    expect(entries.map((entry) => entry.lifecycle)).toEqual(["out-of-scope", "disabled"]);
  });
});

describe("availablePluginSidebarViews", () => {
  test("publishes only the reachable views to the sidebar", () => {
    const plugins = [
      plugin({
        sidebar_views: [
          view({ id: "plugin:demo:global" }),
          view({ id: "plugin:demo:convo", scope: "conversation" }),
        ],
      }),
    ];
    const inConversation = pluginSidebarEntries(plugins, FULL_CONTEXT);
    const withoutConversation = pluginSidebarEntries(plugins, {
      hasWorkspace: true,
      hasConversation: false,
    });

    expect(availablePluginSidebarViews(inConversation).map((item) => item.id)).toEqual([
      "plugin:demo:global",
      "plugin:demo:convo",
    ]);
    expect(availablePluginSidebarViews(withoutConversation).map((item) => item.id)).toEqual([
      "plugin:demo:global",
    ]);
  });
});

describe("firstAvailablePluginSidebarPanel", () => {
  test("returns the first reachable panel", () => {
    const entries = pluginSidebarEntries(
      [
        plugin({
          sidebar_views: [
            view({ id: "plugin:demo:hidden", scope: "workspace" }),
            view({ id: "plugin:demo:shown" }),
          ],
        }),
      ],
      EMPTY_CONTEXT,
    );

    expect(firstAvailablePluginSidebarPanel(entries)).toBe("plugin:demo:shown");
  });

  test("returns null when no declared view is reachable", () => {
    const entries = pluginSidebarEntries(
      [plugin({ enabled: false, sidebar_views: [view()] })],
      FULL_CONTEXT,
    );

    expect(firstAvailablePluginSidebarPanel(entries)).toBeNull();
  });
});

describe("pluginSidebarRevision", () => {
  test("ignores a plugin list refresh that keeps the same installed package", () => {
    const first = pluginSidebarEntries([plugin({ sidebar_views: [view()] })], FULL_CONTEXT);
    const refreshed = pluginSidebarEntries([plugin({ sidebar_views: [view()] })], FULL_CONTEXT);

    expect(pluginSidebarRevision(refreshed)).toBe(pluginSidebarRevision(first));
  });

  test("changes when a package version or enablement changes", () => {
    const base = pluginSidebarEntries([plugin({ sidebar_views: [view()] })], FULL_CONTEXT);
    const updated = pluginSidebarEntries(
      [plugin({ version: "2.0.0", sidebar_views: [view()] })],
      FULL_CONTEXT,
    );
    const disabled = pluginSidebarEntries(
      [plugin({ enabled: false, sidebar_views: [view()] })],
      FULL_CONTEXT,
    );

    expect(pluginSidebarRevision(updated)).not.toBe(pluginSidebarRevision(base));
    expect(pluginSidebarRevision(disabled)).not.toBe(pluginSidebarRevision(base));
  });

  test("covers only the panels the sidebar currently shows", () => {
    const entries = pluginSidebarEntries(
      [plugin({ sidebar_views: [view({ scope: "conversation" })] })],
      EMPTY_CONTEXT,
    );

    expect(pluginSidebarRevision(entries)).toBe("");
  });
});

import { desktopOpenAgent } from "$lib/openagent/tauriClient";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl as openExternalUrl } from "@tauri-apps/plugin-opener";
import { untrack } from "svelte";
import { fromStore } from "svelte/store";
import { type NormalizedMcpServerConfig } from "$lib/config";
import { CUA_DRIVER_ID } from "$lib/cuaDriver";
import { startCuaDriverDaemon } from "$lib/openagent/cuaDriverHost";
import {
  mcpConnectionFingerprint,
  mcpOAuthHintKey,
  shouldOfferMcpAuthorization,
  type McpOAuthCapability,
} from "$lib/settingsConfig";
import { t } from "$lib/i18n";
import type { McpProbeOutcome, McpOAuthStart, McpOAuthStatus } from "./types";
import type { SettingsDraft } from "./draft.svelte";

export function createMcpSettings(draft: SettingsDraft) {
  const translation = fromStore(t);
  type McpTestStatus = { tone: "idle" | "testing" | "success" | "error"; message: string };
  const isMcpSettingsPreview =
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("mcp-settings-preview");
  let mcpTestStatus = $state<Record<string, McpTestStatus>>({});
  // The OAuth capability each connector's last probe revealed. An absent entry
  // means the connector has not been tested since it was last edited, which
  // keeps the authorization action visible rather than guessing about it.
  let mcpOAuthCapabilities = $state<Record<string, McpOAuthCapability>>({});

  let mcpDiscoveredTools = $state<Record<string, string[]>>(
    isMcpSettingsPreview
      ? {
          "preview-mcp": [
            "create_design_asset",
            "delete_design_asset",
            "inspect_design_asset_with_a_very_long_tool_name",
          ],
        }
      : {},
  );
  let selectedMcpId = $state<string | null>(null);

  const mcpConnectionFingerprints = new Map<string, string>();

  const cuaDriverId = CUA_DRIVER_ID;
  const userMcpServers = $derived(draft.draftConfig.mcp.servers);

  function ensureSelectedMcpServer() {
    if (userMcpServers.some((server) => server.id === selectedMcpId)) return;
    selectedMcpId = userMcpServers[0]?.id ?? null;
  }

  function addMcpServer() {
    const server: NormalizedMcpServerConfig = {
      id: crypto.randomUUID(),
      name: "MCP Server",
      enabled: false,
      transport: "http",
      url: "",
      bearer_token: "",
      headers: {},
      command: "",
      args: [],
      env: {},
      cwd: "",
      disabled_tools: [],
    };
    draft.draftConfig.mcp.servers = [...draft.draftConfig.mcp.servers, server];
    draft.pendingMcpServerIds.add(server.id);
    selectedMcpId = server.id;
  }

  function removeMcpServer(id: string) {
    draft.draftConfig.mcp.servers = draft.draftConfig.mcp.servers.filter((s) => s.id !== id);
    draft.pendingMcpServerIds.delete(id);
    if (selectedMcpId === id) {
      selectedMcpId = draft.draftConfig.mcp.servers[0]?.id ?? null;
    }
  }

  // Probe a connector and record the OAuth capability the attempt revealed.
  // This is the only place a capability is written, so the rendered
  // authorization action can never disagree with the precheck behind it. The
  // status banner belongs to the explicit test action, so a quiet precheck
  // reports nothing here and leaves the caller to decide what to show.
  async function refreshMcpCapability(id: string): Promise<McpProbeOutcome | null> {
    const server = draft.draftConfig.mcp.servers.find((item) => item.id === id);
    if (!server) return null;
    const outcome = (await desktopOpenAgent.invokeProduct("test_mcp_server", {
      server: $state.snapshot(server),
    })) as McpProbeOutcome;
    mcpOAuthCapabilities = { ...mcpOAuthCapabilities, [id]: outcome.oauth ?? "unknown" };
    return outcome;
  }

  async function testMcpServer(id: string) {
    const server = draft.draftConfig.mcp.servers.find((s) => s.id === id);
    if (!server) return;
    const notReady = server.transport === "http" ? !server.url.trim() : !server.command.trim();
    if (notReady) return;
    // The reserved entry is only a client; its daemon has to accept
    // connections before the probe can attach to the shared endpoint.
    if (id === cuaDriverId) {
      try {
        await startCuaDriverDaemon();
      } catch (error) {
        mcpTestStatus = {
          ...mcpTestStatus,
          [id]: { tone: "error", message: `${translation.current("mcpTestFailed")}: ${error}` },
        };
        return;
      }
    }
    mcpTestStatus = {
      ...mcpTestStatus,
      [id]: { tone: "testing", message: translation.current("mcpTesting") },
    };
    mcpDiscoveredTools = { ...mcpDiscoveredTools, [id]: [] };
    try {
      const outcome = await refreshMcpCapability(id);
      if (!outcome) return;
      // A probe that could not connect now arrives as a value rather than a
      // rejection, so it is reported here with the banner the rejection used
      // to produce.
      if (!outcome.probe) {
        mcpTestStatus = {
          ...mcpTestStatus,
          [id]: {
            tone: "error",
            message: `${translation.current("mcpTestFailed")}: ${outcome.error ?? ""}`,
          },
        };
        return;
      }
      const { probe } = outcome;
      mcpDiscoveredTools = {
        ...mcpDiscoveredTools,
        [id]: [...new Set(probe.tools)].sort((left, right) => left.localeCompare(right)),
      };
      mcpTestStatus = {
        ...mcpTestStatus,
        [id]: {
          tone: "success",
          message: `${probe.tools.length} ${translation.current("mcpToolCount")}, ${probe.resources.length} ${translation.current("mcpResourceCount")}`,
        },
      };
    } catch (err: unknown) {
      mcpTestStatus = {
        ...mcpTestStatus,
        [id]: { tone: "error", message: `${translation.current("mcpTestFailed")}: ${err}` },
      };
    }
  }

  async function authorizeMcpServer(id: string) {
    const server = draft.draftConfig.mcp.servers.find((item) => item.id === id);
    if (!server || server.transport !== "http" || !server.url.trim()) return;
    mcpTestStatus = {
      ...mcpTestStatus,
      [id]: { tone: "testing", message: translation.current("mcpAuthorizationOpening") },
    };
    try {
      // Settle the capability before anything leaves the app. An endpoint that
      // cannot complete an OAuth flow must not send the user to a browser
      // first, and an untested connector is exactly the case this settles.
      const probed = await refreshMcpCapability(id);
      const capability = probed?.oauth ?? "unknown";
      if (!shouldOfferMcpAuthorization(capability)) {
        // The explanation replaces the action in place, so clearing the
        // transient banner is what confirms the click was understood.
        mcpTestStatus = {
          ...mcpTestStatus,
          [id]: {
            tone: "idle",
            message: translation.current(mcpOAuthHintKey(capability) ?? "mcpOAuthUnsupported"),
          },
        };
        return;
      }
      const start = (await desktopOpenAgent.invokeProduct("begin_mcp_oauth", {
        server: $state.snapshot(server),
      })) as McpOAuthStart;
      await openExternalUrl(start.authorization_url);
      for (let attempt = 0; attempt < 120; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const status = (await desktopOpenAgent.invokeProduct("get_mcp_oauth_status", {
          server_id: id,
        })) as McpOAuthStatus;
        if (status.authorized) {
          await desktopOpenAgent.invokeProduct("refresh_mcp_servers", {});
          mcpTestStatus = {
            ...mcpTestStatus,
            [id]: { tone: "success", message: translation.current("mcpAuthorizationCompleted") },
          };
          return;
        }
        if (status.error) throw new Error(status.error);
      }
      throw new Error(translation.current("mcpAuthorizationTimedOut"));
    } catch (err: unknown) {
      mcpTestStatus = {
        ...mcpTestStatus,
        [id]: {
          tone: "error",
          message: `${translation.current("mcpAuthorizationFailed")}: ${err}`,
        },
      };
    }
  }

  async function setMcpEnabled(id: string, enabled: boolean) {
    const server = draft.draftConfig.mcp.servers.find((item) => item.id === id);
    if (!server) return;
    if (!enabled) {
      server.enabled = false;
      if (server.plugin_owned)
        draft.draftConfig.agent_plugins_enabled = {
          ...draft.draftConfig.agent_plugins_enabled,
          [server.id]: false,
        };
      return;
    }

    server.enabled = false;
    const notReady = server.transport === "http" ? !server.url.trim() : !server.command.trim();
    if (notReady) {
      mcpTestStatus = {
        ...mcpTestStatus,
        [id]: { tone: "error", message: translation.current("mcpConfigurationRequired") },
      };
      return;
    }

    mcpTestStatus = {
      ...mcpTestStatus,
      [id]: { tone: "testing", message: translation.current("mcpTesting") },
    };
    try {
      const outcome = await refreshMcpCapability(id);
      // Enabling is a claim that the connector works, so a probe that did not
      // connect must leave it off — including one that now reports the failure
      // as a value instead of rejecting.
      if (!outcome?.probe) {
        server.enabled = false;
        mcpTestStatus = {
          ...mcpTestStatus,
          [id]: {
            tone: "error",
            message: `${translation.current("mcpTestFailed")}: ${outcome?.error ?? ""}`,
          },
        };
        return;
      }
      const { probe } = outcome;
      mcpDiscoveredTools = {
        ...mcpDiscoveredTools,
        [id]: [...new Set(probe.tools)].sort((left, right) => left.localeCompare(right)),
      };
      server.enabled = true;
      if (server.plugin_owned)
        draft.draftConfig.agent_plugins_enabled = {
          ...draft.draftConfig.agent_plugins_enabled,
          [server.id]: true,
        };
      mcpTestStatus = {
        ...mcpTestStatus,
        [id]: {
          tone: "success",
          message: `${probe.tools.length} ${translation.current("mcpToolCount")}, ${probe.resources.length} ${translation.current("mcpResourceCount")}`,
        },
      };
    } catch (err: unknown) {
      server.enabled = false;
      mcpTestStatus = {
        ...mcpTestStatus,
        [id]: { tone: "error", message: `${translation.current("mcpTestFailed")}: ${err}` },
      };
    }
  }

  function setMcpToolEnabled(serverId: string, toolName: string, enabled: boolean) {
    const server = draft.draftConfig.mcp.servers.find((item) => item.id === serverId);
    if (!server) return;
    const disabled = new Set(server.disabled_tools);
    if (enabled) disabled.delete(toolName);
    else disabled.add(toolName);
    server.disabled_tools = [...disabled].sort((left, right) => left.localeCompare(right));
  }

  function addEnvVar(idx: number) {
    draft.draftConfig.mcp.servers[idx].env = { ...draft.draftConfig.mcp.servers[idx].env, "": "" };
  }

  function removeEnvVar(idx: number, key: string) {
    const { [key]: _, ...rest } = draft.draftConfig.mcp.servers[idx].env;
    draft.draftConfig.mcp.servers[idx].env = rest;
  }

  function updateEnvKey(idx: number, oldKey: string, newKey: string) {
    const val = draft.draftConfig.mcp.servers[idx].env[oldKey] ?? "";
    const { [oldKey]: _, ...rest } = draft.draftConfig.mcp.servers[idx].env;
    draft.draftConfig.mcp.servers[idx].env = { ...rest, [newKey]: val };
  }

  function addHeader(idx: number) {
    draft.draftConfig.mcp.servers[idx].headers = {
      ...draft.draftConfig.mcp.servers[idx].headers,
      "": "",
    };
  }

  function removeHeader(idx: number, key: string) {
    const { [key]: _, ...rest } = draft.draftConfig.mcp.servers[idx].headers;
    draft.draftConfig.mcp.servers[idx].headers = rest;
  }

  function updateHeaderKey(idx: number, oldKey: string, newKey: string) {
    const val = draft.draftConfig.mcp.servers[idx].headers[oldKey] ?? "";
    const { [oldKey]: _, ...rest } = draft.draftConfig.mcp.servers[idx].headers;
    draft.draftConfig.mcp.servers[idx].headers = { ...rest, [newKey]: val };
  }

  const selectedMcpServer = $derived(userMcpServers.find((s) => s.id === selectedMcpId) ?? null);
  const selectedMcpIndex = $derived(
    draft.draftConfig.mcp.servers.findIndex((s) => s.id === selectedMcpId),
  );
  const mcpDiscoveryFingerprints = new Map<string, string>();

  $effect(() => {
    const server = selectedMcpServer;
    if (!server?.enabled || !isTauri()) return;
    const fingerprint = mcpConnectionFingerprint(server);
    if (mcpDiscoveryFingerprints.get(server.id) === fingerprint) return;
    mcpDiscoveryFingerprints.set(server.id, fingerprint);
    untrack(() => void testMcpServer(server.id));
  });

  $effect(() => {
    if (!draft.initializedFromConfig) return;
    for (const server of draft.draftConfig.mcp.servers) {
      const next = mcpConnectionFingerprint(server);
      const previous = mcpConnectionFingerprints.get(server.id);
      if (previous !== undefined && previous !== next) {
        // A capability describes one set of connection details, so editing any
        // of them retires the conclusion and restores the authorization action
        // until the connector is tested again.
        const { [server.id]: _retired, ...remainingCapabilities } = mcpOAuthCapabilities;
        mcpOAuthCapabilities = remainingCapabilities;
        if (server.enabled) {
          server.enabled = false;
          mcpTestStatus = {
            ...mcpTestStatus,
            [server.id]: {
              tone: "error",
              message: translation.current("configurationChangedReenable"),
            },
          };
        }
      }
      mcpConnectionFingerprints.set(server.id, next);
    }
  });

  ensureSelectedMcpServer();

  return {
    addEnvVar,
    addHeader,
    addMcpServer,
    get cuaDriverId() {
      return cuaDriverId;
    },
    ensureSelectedMcpServer,
    get mcpDiscoveredTools() {
      return mcpDiscoveredTools;
    },
    mcpOAuthHint(id: string) {
      return mcpOAuthHintKey(mcpOAuthCapabilities[id]);
    },
    mcpOAuthOffered(id: string) {
      return shouldOfferMcpAuthorization(mcpOAuthCapabilities[id]);
    },
    get mcpTestStatus() {
      return mcpTestStatus;
    },
    removeEnvVar,
    removeHeader,
    removeMcpServer,
    get selectedMcpId() {
      return selectedMcpId;
    },
    set selectedMcpId(value) {
      selectedMcpId = value;
    },
    get selectedMcpIndex() {
      return selectedMcpIndex;
    },
    get selectedMcpServer() {
      return selectedMcpServer;
    },
    setMcpEnabled,
    setMcpToolEnabled,
    testMcpServer,
    authorizeMcpServer,
    updateEnvKey,
    updateHeaderKey,
    get userMcpServers() {
      return userMcpServers;
    },
  };
}
export type McpSettings = ReturnType<typeof createMcpSettings>;

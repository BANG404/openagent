// @ts-nocheck -- legacy fixture typing is tracked separately from the strict test surface.
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { sdkClientSource } from "../scripts/sdk-client-source.mjs";

const nativeCommands = new Set([
  "activate_frontend_resource",
  "activate_runtime_resource",
  "begin_component_update",
  "begin_shell_install",
  "confirm_frontend_activation",
  "end_component_update",
  "create_workspace_window",
  "cua_driver_endpoint",
  "get_embedding_resource_status",
  "get_component_versions",
  "get_system_locale",
  "get_wsl_home",
  "is_desktop_window_active",
  "list_wsl_distributions",
  "open_path",
  "open_logs_folder",
  "open_role_editor_window",
  "open_settings_window",
  "open_workspace_window",
  "plugin:i18n|get_locale",
  "plugin:i18n|set_locale",
  "prepare_embedding_resource",
  "prepare_frontend_resource",
  "prepare_runtime_resource",
  "prepare_shell_handoff",
  "prepare_release_resources",
  "shell_resource_status",
  "retry_shell_resources",
  "quit_app",
  "read_text_file",
  "report_component_update_event",
  "report_frontend_diagnostic",
  "resolve_wsl_workspace",
  "restart_app",
  "reveal_main_window",
  "reveal_onboarding_window",
  "runtime_transport_mode",
  "save_download_file",
  "start_cua_driver_serve",
  "start_runtime_event_proxy",
]);

const developmentCommandOwners = new Map([
  ["debug_create_context_compaction_diagnostic", "src/lib/components/DevInspector.svelte"],
  ["debug_disconnect_model_requests", "src/lib/components/DevInspector.svelte"],
  ["inspector_database_overview", "src/lib/components/InspectorDatabase.svelte"],
  ["inspector_table_data", "src/lib/components/InspectorDatabase.svelte"],
]);

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:svelte|ts)$/.test(entry.name) ? [path] : [];
  });
}

function literalInvocations(path) {
  const source = readFileSync(path, "utf8");
  const pattern = /\binvoke(?:<[^;\n()]*>)?\(\s*["']([^"']+)["']/g;
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

function desktopProductCommands() {
  const contracts = readFileSync(join(sdkClientSource(), "contracts.ts"), "utf8");
  const block = contracts.match(
    /export const DESKTOP_PRODUCT_COMMANDS = \[([\s\S]*?)\] as const/,
  )?.[1];
  if (!block) throw new Error("DESKTOP_PRODUCT_COMMANDS was not found");
  return [...block.matchAll(/["']([^"']+)["']/g)].map((match) => match[1]);
}

describe("desktop command boundary", () => {
  test("classifies every literal Tauri invocation", () => {
    const productCommands = new Set(desktopProductCommands());
    const unknown = [];

    for (const path of sourceFiles("src")) {
      const owner = relative(".", path).replaceAll("\\", "/");
      for (const command of literalInvocations(path)) {
        if (!productCommands.has(command) && !nativeCommands.has(command)) {
          unknown.push(`${owner}: ${command}`);
        }
      }
    }

    expect(unknown).toEqual([]);
  });

  test("keeps development database and model controls on their inspector surfaces", () => {
    const misplaced = [];
    for (const path of sourceFiles("src")) {
      const owner = relative(".", path).replaceAll("\\", "/");
      for (const command of literalInvocations(path)) {
        const expectedOwner = developmentCommandOwners.get(command);
        if (expectedOwner && owner !== expectedOwner) {
          misplaced.push(`${command}: ${owner}`);
        }
      }
    }

    expect(misplaced).toEqual([]);
  });

  test.skipIf(
    !existsSync("sdk/rust/openagent-runtime/src/commands/remote_gateway/desktop_operations.rs"),
  )("routes Agent Plugin asset reads through the Runtime product dispatcher", () => {
    const contracts = readFileSync(join(sdkClientSource(), "contracts.ts"), "utf8");
    const gateway = readFileSync(
      "sdk/rust/openagent-runtime/src/commands/remote_gateway/desktop_operations.rs",
      "utf8",
    );

    expect(contracts).toContain('"read_agent_plugin_asset"');
    expect(gateway).toContain('"read_agent_plugin_asset" =>');
    expect(gateway).toContain(
      "crate::commands::read_agent_plugin_asset(runtime_state, plugin_id, entry)",
    );
  });

  test.skipIf(!existsSync("sdk/rust/openagent-runtime/src/agent_plugins.rs"))(
    "registers product capabilities through the Agent Plugin descriptor",
    () => {
      const plugins = [
        "sdk/rust/openagent-runtime/src/agent_plugins.rs",
        "sdk/rust/openagent-runtime/src/agent_plugins/builtins.rs",
      ]
        .map((path) => readFileSync(path, "utf8"))
        .join("\n");
      const protocol = readFileSync("sdk/rust/openagent-protocol/src/lib.rs", "utf8");
      const settings = readFileSync(
        "src/lib/components/settings/SettingsPluginsTab.svelte",
        "utf8",
      );

      // Product package ids remain one shared compatibility catalog, but domain
      // packages must not be registered as Runtime implementations. Goal,
      // Graph, Chat Groups, and Cua are ordinary installed packages; only the
      // Runtime-owned multi-agent capability belongs in this registry.
      for (const capability of ["CHAT_GROUPS_ID", "GOAL_ID", "GRAPH_ID", "CUA_DRIVER_ID"]) {
        expect(plugins).toContain(`pub const ${capability}: &str = `);
        expect(plugins).not.toContain(`id: ${capability},`);
      }
      expect(plugins).toContain("pub message_policies: Vec<AgentPluginMessagePolicy>");
      expect(plugins).toContain("id: MULTI_AGENT_V2_ID,");
      expect(plugins).toContain("legacy_enabled: multi_agent_v2_legacy_enabled,");
      expect(protocol).toContain("pub plugin_id: Option<String>");
      expect(settings).toContain("{#each plugins.agentPlugins as plugin (plugin.id)}");
      expect(settings).not.toContain('value="cua-driver" class="application-settings-surface');
    },
  );

  test("resolves native open paths through the active desktop Runtime mode", () => {
    const host = readFileSync("src-tauri/src/native_commands.rs", "utf8");
    const start = host.indexOf("async fn resolve_desktop_open_path");
    const end = host.indexOf("async fn read_text_file", start);
    const openPathBoundary = host.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(openPathBoundary).toContain("embedded_runtime: Option<&OpenAgentRuntime>");
    expect(openPathBoundary).toContain("if let Some(runtime) = embedded_runtime");
    expect(openPathBoundary).toContain('"operation": "resolve_open_path"');
    expect(openPathBoundary).toContain("embedded_runtime: State<'_, EmbeddedRuntimeState>");
    expect(openPathBoundary).toContain("supervisor: State<'_, Arc<RuntimeProcessSupervisor>>");
    expect(openPathBoundary).not.toContain("#[cfg(debug_assertions)]");
    expect(openPathBoundary).not.toContain("#[cfg(not(debug_assertions))]");
  });
});

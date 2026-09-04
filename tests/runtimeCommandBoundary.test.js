// @ts-nocheck -- Bun provides the test module at runtime.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const nativeCommands = new Set([
  "activate_frontend_resource",
  "activate_runtime_resource",
  "confirm_frontend_activation",
  "create_workspace_window",
  "get_embedding_resource_status",
  "get_system_locale",
  "get_wsl_home",
  "is_desktop_window_active",
  "list_wsl_distributions",
  "open_path",
  "open_settings_window",
  "open_workspace_window",
  "plugin:i18n|get_locale",
  "plugin:i18n|set_locale",
  "prepare_embedding_resource",
  "prepare_frontend_resource",
  "prepare_runtime_resource",
  "quit_app",
  "read_text_file",
  "report_frontend_diagnostic",
  "resolve_wsl_workspace",
  "restart_app",
  "reveal_main_window",
  "reveal_onboarding_window",
  "runtime_transport_mode",
  "save_download_file",
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
  const contracts = readFileSync("sdk/typescript/src/contracts.ts", "utf8");
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

  test("resolves native open paths through the active desktop Runtime mode", () => {
    const host = readFileSync("src-tauri/src/lib.rs", "utf8");
    const start = host.indexOf("async fn resolve_desktop_open_path");
    const end = host.indexOf("async fn read_html_preview_file", start);
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

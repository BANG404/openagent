import { readFile, readdir } from "node:fs/promises";
import { readFileSync } from "node:fs";

const componentsUrl = new URL("../src/lib/components/", import.meta.url);

export function hostRustSource(): string {
  return [
    "lib.rs",
    "diagnostics.rs",
    "desktop_plugins.rs",
    "embedding_adapter.rs",
    "embedded_host.rs",
    "invoke_handlers.rs",
    "native_commands.rs",
    "runtime_proxy_commands.rs",
    "desktop_bootstrap/mod.rs",
    "desktop_bootstrap/mode.rs",
    "desktop_bootstrap/persistence.rs",
    "desktop_bootstrap/external.rs",
    "desktop_bootstrap/instances.rs",
    "desktop_bootstrap/provisioning.rs",
    "embedded_commands/mod.rs",
    "embedded_commands/input.rs",
    "embedded_commands/settings.rs",
    "embedded_commands/models.rs",
    "embedded_commands/conversations.rs",
    "embedded_commands/plugins.rs",
    "embedded_commands/workspace.rs",
    "embedded_commands/mcp.rs",
    "embedded_commands/lifecycle.rs",
    "embedded_commands/memory.rs",
    "embedded_commands/documents.rs",
    "desktop_exit.rs",
    "desktop_windows/mod.rs",
    "desktop_windows/focus.rs",
    "desktop_windows/geometry.rs",
    "desktop_windows/material.rs",
    "desktop_windows/tray.rs",
    "desktop_windows/utility.rs",
    "desktop_windows/startup.rs",
    "desktop_windows/inspector.rs",
    "cua_driver/mod.rs",
    "cua_driver/ownership.rs",
    "cua_driver/policy.rs",
    "component_updates/mod.rs",
    "component_updates/handoff.rs",
    "component_updates/barrier.rs",
    "component_updates/frontend.rs",
    "component_updates/runtime.rs",
    "component_updates/sources.rs",
    "component_updates/versions.rs",
  ]
    .map((file) => readFileSync(new URL(`../src-tauri/src/${file}`, import.meta.url), "utf8"))
    .join("\n");
}

export async function readSource(url: URL | string): Promise<string> {
  return (await readFile(url, "utf8")).replace(/\r\n/gu, "\n");
}

export async function pageRuntimeSource(): Promise<string> {
  const page = new URL("../src/lib/page/", import.meta.url);
  const modules = (await readdir(page)).filter((file) => file.endsWith(".ts"));
  const eventModules = (await readdir(new URL("events/", page)))
    .filter((file) => file.endsWith(".ts"))
    .map((file) => `events/${file}`);
  return (
    await Promise.all([
      readSource(new URL("../src/routes/PageRuntime.svelte", import.meta.url)),
      ...[...modules, ...eventModules].map((file) => readSource(new URL(file, page))),
    ])
  ).join("\n");
}

export async function settingsViewSource(): Promise<string> {
  const [views, controllers] = await Promise.all([
    readdir(new URL("settings/", componentsUrl)),
    readdir(new URL("../src/lib/settings/", import.meta.url)),
  ]);
  return (
    await Promise.all(
      [
        "SettingsView.svelte",
        "settings-view.css",
        ...views.filter((file) => file.endsWith(".svelte")).map((file) => `settings/${file}`),
      ]
        .map((file) => readSource(new URL(file, componentsUrl)))
        .concat(
          controllers
            .filter((file) => file.endsWith(".ts"))
            .map((file) => readSource(new URL(`../src/lib/settings/${file}`, import.meta.url))),
        ),
    )
  ).join("\n");
}

export async function transcriptSource(): Promise<string> {
  return (
    await Promise.all(
      [
        "../src/lib/components/MessageList.svelte",
        "../src/lib/components/transcript/AssistantTurnRow.svelte",
        "../src/lib/components/transcript/UserMessageRow.svelte",
        "../src/lib/transcript/assistantContent.ts",
        "../src/lib/transcript/userContent.ts",
        "../src/lib/transcript/userEditor.svelte.ts",
      ].map((file) => readSource(new URL(file, import.meta.url))),
    )
  ).join("\n");
}

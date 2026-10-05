// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readPluginDevIndex, resolvePluginDevPath } from "./plugin-dev-paths.mjs";
import { resolveBlackboxHome } from "./tauri-test-environment.mjs";
import { en } from "../src/lib/i18n.en.ts";
import { zh } from "../src/lib/i18n.zh.ts";

const repo = resolve(fileURLToPath(new URL("..", import.meta.url)));
const home = resolveBlackboxHome(process.env, { instanceName: "plugin-mcp-modes-i18n" });
assert(
  process.env.TAURI_PILOT_SOCKET && home.includes("plugin-mcp-modes-i18n"),
  "use the isolated plugin-mcp-modes-i18n instance and its explicit socket",
);
const artifacts =
  process.env.BLACKBOX_ARTIFACT_DIR || mkdtempSync(join(tmpdir(), "openagent-plugin-mcp-modes-"));
mkdirSync(artifacts, { recursive: true });
/** @param {string} directory */
function revision(directory) {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: directory,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout.trim();
}
const sources = ["goal", "graph", "chat-groups", "cua-driver", "message-board"].map((id) => {
  const indexed = resolvePluginDevPath(readPluginDevIndex(), id);
  const directory = process.env.BLACKBOX_PLUGIN_CANDIDATE_ROOT
    ? resolve(process.env.BLACKBOX_PLUGIN_CANDIDATE_ROOT, id)
    : indexed.directory;
  const manifest = JSON.parse(readFileSync(join(directory, "plugin.json"), "utf8"));
  assert.equal(manifest.name, id);
  const translations = manifest.extensions?.openagent?.i18n?.translations;
  assert(translations?.en?.display_name && translations?.zh?.display_name);
  return {
    id,
    directory,
    version: String(manifest.version),
    revision: revision(directory),
    names: { en: String(translations.en.display_name), zh: String(translations.zh.display_name) },
  };
});

/** @param {string[]} args */
function pilot(args) {
  const result = spawnSync("tauri-pilot", [...args, "--window", "main"], {
    env: process.env,
    cwd: artifacts,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}
/** @param {string} script */
const evaluate = (script) => pilot(["eval", script]);
const close = () =>
  evaluate(
    `document.querySelector('[role=dialog] button[aria-label=Close], [role=dialog] button[aria-label=关闭]')?.click(); true`,
  );

pilot(["ping"]);
pilot(["snapshot", "-i"]);
close();
for (const source of sources)
  assert(
    !existsSync(join(home, "plugins", source.id)),
    `preserve installed ${source.id}; use a fresh fixture`,
  );
/** @type {string[]} */
const installed = [];
try {
  evaluate(
    `(async () => { const {desktopOpenAgent:client}=await import('/src/lib/openagent/tauriClient.ts'); const config=await client.invokeProduct('get_settings',{}); window.__pluginModesOriginal={theme:config.theme,language:config.language,agent_plugins_enabled:config.agent_plugins_enabled,agent_plugins_mcp_tool_modes:config.agent_plugins_mcp_tool_modes}; config.agent_plugins_enabled={...config.agent_plugins_enabled,'cua-driver':false}; await client.invokeProduct('save_settings',{config}); return true; })()`,
  );
  for (const source of sources) {
    evaluate(
      `(async () => { const {desktopOpenAgent:client}=await import('/src/lib/openagent/tauriClient.ts'); const plugin=await client.installAgentPlugin(${JSON.stringify(source.directory)}); if (plugin.error) throw new Error(plugin.error); return plugin.id; })()`,
    );
    installed.push(source.id);
  }
  for (const [theme, language] of /** @type {const} */ [
    ["light", "en"],
    ["light", "zh"],
    ["dark", "en"],
    ["dark", "zh"],
  ]) {
    const messages = language === "en" ? en : zh;
    evaluate(
      `(async () => { const {desktopOpenAgent:client,emit}=await import('/src/lib/openagent/tauriClient.ts'); const config=await client.invokeProduct('get_settings',{}); await client.invokeProduct('save_settings',{config:{...config,theme:${JSON.stringify(theme)},language:${JSON.stringify(language)}}}); const {getCurrentWindow}=await import("/node_modules/@tauri-apps/api/window.js"); await getCurrentWindow().setTheme(${JSON.stringify(theme)}); const {setLocale}=await import('/src/lib/i18n.ts'); const {applyDocumentTheme}=await import('/src/lib/appTheme.ts'); setLocale(${JSON.stringify(language)}); applyDocumentTheme(${JSON.stringify(theme)}); await emit('settings-changed'); return true; })()`,
    );
    close();
    pilot(["snapshot", "-i"]);
    evaluate(
      `(async () => {document.querySelector('#application-integrations-menu').click(); await new Promise(resolve=>setTimeout(resolve,0)); [...document.querySelectorAll('[role=menuitem]')].find(item=>/Plugins|插件/.test(item.textContent)).click(); return true;})()`,
    );
    pilot(["wait", "--selector", ".plugin-management-tabs", "--timeout", "20000"]);
    pilot(["snapshot", "-i"]);
    pilot(["click", ".plugin-management-tabs button:nth-of-type(2)"]);
    pilot([
      "wait",
      "--selector",
      '.plugin-accordion-item[data-plugin-id="message-board"]',
      "--timeout",
      "20000",
    ]);
    const names = Object.fromEntries(sources.map((source) => [source.id, source.names]));
    evaluate(
      `window.__pluginModesProbe=${JSON.stringify({ label: messages.pluginMcpToolMode, hint: messages.pluginMcpToolModeHint, direct: messages.pluginMcpToolModeDirect, relay: messages.pluginMcpToolModeRelay, follow: messages.pluginMcpToolModeDefault, plugins: Object.entries(names).map(([id, translations]) => ({ id, name: translations[language], names: translations })) })}; true`,
    );
    pilot(["snapshot", "-i"]);
    pilot(["run", join(repo, "tests/blackbox/plugin-mcp-modes.toml")]);
    pilot(["snapshot", "-i"]);
    evaluate(
      `(async () => { const card=document.querySelector('.plugin-accordion-item[data-plugin-id="message-board"]'); const trigger=card.querySelector('.plugin-accordion-trigger'); if (trigger.getAttribute('aria-expanded')!=='true') trigger.click(); await new Promise(resolve=>setTimeout(resolve,0)); document.getElementById('plugin-mcp-mode-message-board').scrollIntoView({block:'center'}); return true; })()`,
    );
    pilot([
      "screenshot",
      join(artifacts, `${theme}-${language}.png`),
      "--selector",
      "[role=dialog]",
    ]);
    if (process.env.BLACKBOX_NATIVE_WINDOW_HANDLE) {
      const capture = spawnSync(
        "python",
        [
          join(repo, "scripts/capture-windows-window.py"),
          "--hwnd",
          process.env.BLACKBOX_NATIVE_WINDOW_HANDLE,
          "--output",
          join(artifacts, `${theme}-${language}-native.png`),
        ],
        { encoding: "utf8", windowsHide: true },
      );
      assert.equal(capture.status, 0, capture.stderr);
    }
  }
  writeFileSync(
    join(artifacts, "report.json"),
    JSON.stringify(
      {
        sources,
        sdkRevision: revision(join(repo, "sdk")),
        checks: [
          "names",
          "live locale",
          "direct",
          "relay",
          "follow",
          "save",
          "reopen",
          "independent permissions",
        ],
        appearances: ["light/en", "light/zh", "dark/en", "dark/zh"],
      },
      null,
      2,
    ),
  );
  pilot(["logs", "--level", "error"]);
  console.log(`Plugin MCP modes black-box passed. Artifacts: ${artifacts}`);
} finally {
  close();
  for (const id of installed.reverse())
    evaluate(
      `(async()=>{const {desktopOpenAgent:client}=await import('/src/lib/openagent/tauriClient.ts'); await client.uninstallAgentPlugin(${JSON.stringify(id)}); return true;})()`,
    );
  evaluate(
    `(async()=>{const original=await window.__pluginModesOriginal; const {desktopOpenAgent:client,emit}=await import('/src/lib/openagent/tauriClient.ts');const config=await client.invokeProduct('get_settings',{});await client.invokeProduct('save_settings',{config:{...config,...original}});await emit('settings-changed');return true;})()`,
  );
}

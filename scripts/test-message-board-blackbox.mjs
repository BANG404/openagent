// @ts-check
// Qualify a local Message Board candidate in an explicitly isolated native window.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Transpiler } from "bun";
import { readPluginDevIndex, resolvePluginDevPath } from "./plugin-dev-paths.mjs";
import { resolveBlackboxHome } from "./tauri-test-environment.mjs";

const repo = resolve(import.meta.dirname, "..");
const fixture = resolve(
  resolveBlackboxHome(process.env, { instanceName: "message-board-qualification" }),
);
assert(process.env.OPENAGENT_HOME, "set OPENAGENT_HOME to an isolated fixture");
assert(process.env.TAURI_PILOT_SOCKET, "set TAURI_PILOT_SOCKET to that fixture's native window");
assert(
  ![".openagent", ".openagent-dev"].some((name) => fixture === resolve(homedir(), name)),
  "use an isolated fixture",
);
assert(
  !existsSync(join(fixture, "plugins/message-board")),
  "candidate already installed; preserve it and use a fresh fixture",
);
const indexed = resolvePluginDevPath(readPluginDevIndex(), "message-board");
const source = resolve(process.env.BLACKBOX_MESSAGE_BOARD_SOURCE || indexed.directory);
const manifest = JSON.parse(readFileSync(join(source, "plugin.json"), "utf8"));
assert.equal(manifest.name, "message-board");
const platformLocales = Object.keys(
  JSON.parse(readFileSync(join(repo, "src/lib/platformLocales.json"), "utf8")),
);
assert(
  platformLocales.every((locale) =>
    manifest.extensions?.openagent?.i18n?.supported_locales?.includes(locale),
  ),
  "candidate does not declare every platform language",
);
/** @param {string} directory */
function revision(directory) {
  const result = spawnSync("git", ["-C", directory, "rev-parse", "HEAD"], {
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout.trim();
}
const sourceRevision = revision(source);
const sdkRevision = revision(join(repo, "sdk"));
const hostRevision = revision(repo);
const artifacts =
  process.env.BLACKBOX_ARTIFACT_DIR ||
  mkdtempSync(join(tmpdir(), "openagent-message-board-report-"));
mkdirSync(artifacts, { recursive: true });
const environment = { ...process.env, TAURI_PILOT_WINDOW: "main" };
const workspace = join(fixture, "workspace");
mkdirSync(workspace, { recursive: true });

/** @param {string[]} args */
function pilot(args) {
  const result = spawnSync(process.env.TAURI_PILOT_BIN || "tauri-pilot", args, {
    env: environment,
    cwd: artifacts,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  return result.stdout.trim();
}
/** @param {string} script */
function evaluate(script) {
  return pilot(["eval", script]);
}
/** @param {string} operation @param {unknown} args @returns {any} */
function invoke(operation, args) {
  const output = evaluate(
    `(async () => {const {desktopOpenAgent:client}=await import('/src/lib/openagent/tauriClient.ts');return JSON.stringify({value:await client.invokeProduct(${JSON.stringify(operation)},${JSON.stringify(args)})});})()`,
  );
  return JSON.parse(output).value;
}
/** @param {string} expression @param {string} message */
async function until(expression, message) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (evaluate(expression) === "true") return;
    await new Promise((done) => setTimeout(done, 150));
  }
  throw new Error(message);
}
/** @param {string} name */
function capture(name) {
  pilot(["ipc", "reveal_main_window"]);
  evaluate(
    `document.querySelector(${JSON.stringify(name.endsWith("-uninstalled") ? '.official-plugin-card[data-plugin-id="message-board"]' : '.plugin-accordion-item[data-plugin-id="message-board"]')}).scrollIntoView({block:'center'}); true`,
  );
  assert(
    process.env.BLACKBOX_NATIVE_WINDOW_HANDLE,
    "set BLACKBOX_NATIVE_WINDOW_HANDLE for real native captures",
  );
  const result = spawnSync(
    "python",
    [
      join(repo, "scripts/capture-windows-window.py"),
      "--hwnd",
      process.env.BLACKBOX_NATIVE_WINDOW_HANDLE,
      "--output",
      join(artifacts, `${name}.png`),
    ],
    { encoding: "utf8", windowsHide: true },
  );
  assert.equal(result.status, 0, result.stderr || String(result.error));
}

pilot(["ping"]);
pilot(["snapshot", "-i"]);
const original = invoke("get_settings", {});
/** @type {Array<Record<string, unknown>>} */
const passes = [];
let installed = false;
let subsetInstalled = false;
let sidebarInstalled = false;
try {
  // This fixture needs the managed network-enabled profile to avoid provisioning
  // the restricted Windows account from a plugin process. It grants no host access.
  const config = {
    ...original,
    workspace,
    agent_plugins_enabled: {
      ...original.agent_plugins_enabled,
      "message-board": true,
      "cua-driver": false,
    },
    permission_profile: {
      enforcement: "managed",
      file_system: {
        entries: [
          { access: "read", path: { kind: "host_root" } },
          { access: "write", path: { kind: "workspace" } },
        ],
      },
      network: "enabled",
    },
  };
  invoke("set_workspace", { path: workspace });
  invoke("save_settings", { config });
  invoke("install_agent_plugin", { source: join(repo, "tests/fixtures/plugin-i18n") });
  subsetInstalled = true;
  invoke("install_agent_plugin", { source: join(repo, "tests/fixtures/plugin-i18n-sidebar") });
  sidebarInstalled = true;
  for (const theme of ["light", "dark"]) {
    for (const language of ["en", "zh"]) {
      evaluate(
        "document.querySelector('[role=dialog] button[aria-label=Close], [role=dialog] button[aria-label=关闭]')?.click(); true",
      );
      invoke("save_settings", { config: { ...config, theme, language } });
      evaluate("window.location.reload(); true");
      await until(
        "!!document.querySelector('#application-integrations-menu')",
        "fixture did not reload after setting its appearance",
      );
      const summary = invoke("install_agent_plugin", { source });
      installed = true;
      assert.equal(summary.version, manifest.version);
      assert.equal(summary.skills.length, 3);
      assert.equal(summary.mcp_servers.length, 1);
      assert.deepEqual(summary.warnings, []);
      const channel = `native-${theme}-${language}-${Date.now()}`;
      evaluate(
        `window.__messageBoardProbe = ${JSON.stringify({ version: manifest.version, channel })}; true`,
      );
      pilot(["snapshot", "-i"]);
      pilot(["run", join(repo, "tests/blackbox/message-board.toml")]);
      // Keep test files outside Vite's product serving boundary. Inject only the
      // fixture harness; it mounts the actual compiled application component.
      const mountFixture = new Transpiler({ loader: "ts" })
        .transformSync(readFileSync(join(repo, "tests/fixtures/plugin-i18n/mount.ts"), "utf8"))
        .replace(/^import[\s\S]*?;\s*$/gm, "")
        .replace(/^export\s+/gm, "");
      evaluate(`(async () => {
        const {mount, unmount} = await import('/node_modules/.vite/deps/svelte.js');
        const {default: McpAppFrame} = await import('/src/lib/components/McpAppFrame.svelte');
        ${mountFixture}
        window.__mountPluginLocaleFrame = mountLocaleFrame;
        return true;
      })()`);
      pilot(["run", join(repo, "tests/blackbox/plugin-i18n.toml")]);
      capture(`${theme}-${language}-installed`);
      const root = JSON.parse(evaluate("JSON.stringify(window.__messageBoardProbe.root)"));
      const boardPath = join(fixture, "plugin-data/message-board/board.json");
      const before = readFileSync(boardPath, "utf8");
      evaluate("window.__pluginLifecycleProbe = {id:'message-board'}; true");
      pilot(["snapshot", "-i"]);
      pilot(["run", join(repo, "tests/blackbox/plugin-uninstall.toml")]);
      await until(
        "!document.querySelector('.plugin-accordion-item[data-plugin-id=message-board]') && !document.querySelector('[role=alertdialog]')",
        "enabled uninstall did not finish",
      );
      installed = false;
      assert(!existsSync(join(fixture, "plugins/message-board")));
      assert.equal(readFileSync(boardPath, "utf8"), before);
      evaluate("document.querySelectorAll('.plugin-management-tabs button')[0].click(); true");
      await until(
        "document.querySelector('.official-plugin-card[data-plugin-id=message-board]')?.dataset.installed === 'false'",
        "marketplace did not restore install action",
      );
      assert.equal(
        evaluate(
          "document.querySelector('.official-plugin-card[data-plugin-id=message-board] .plugin-languages')?.dataset.supportedLocales",
        ),
        "en,zh",
      );
      capture(`${theme}-${language}-uninstalled`);
      invoke("install_agent_plugin", { source });
      installed = true;
      await until(
        `(async () => { try { const {desktopOpenAgent:client}=await import('/src/lib/openagent/tauriClient.ts'); const result=await client.invokeProduct('call_agent_plugin_tool',${JSON.stringify({ plugin_id: "message-board", tool_name: "read_post", arguments: { agent_id: "/root/native", message_id: root.message_id } })}); return result.structuredContent?.text === '中文 😀 native board'; } catch { return false; } })()`,
        "reinstalled MCP server did not connect with retained data",
      );
      const result = invoke("call_agent_plugin_tool", {
        plugin_id: "message-board",
        tool_name: "read_post",
        arguments: { agent_id: "/root/native", message_id: root.message_id },
      });
      assert.equal(result.structuredContent.text, "中文 😀 native board");
      invoke("uninstall_agent_plugin", { id: "message-board" });
      installed = false;
      passes.push({
        theme,
        language,
        tools: 9,
        dataPreserved: true,
        reinstallRead: true,
        liveLocale: true,
        mcpAppInputPreserved: true,
        sidebarInputPreserved: true,
      });
      process.stdout.write(
        `${theme}/${language}: nine tools, enablement, uninstall/reinstall passed\n`,
      );
    }
  }
  writeFileSync(
    join(artifacts, "qualification.json"),
    `${JSON.stringify({ source, sourceRevision, sdkRevision, hostRevision, platformLocales, version: manifest.version, passes }, null, 2)}\n`,
  );
  process.stdout.write(`Message Board native qualification passed. Artifacts: ${artifacts}\n`);
} finally {
  evaluate("(async () => {await window.__pluginI18nCleanup?.(); return true;})()");
  evaluate(
    "document.querySelector('[role=dialog] button[aria-label=Close], [role=dialog] button[aria-label=关闭]')?.click(); true",
  );
  if (installed) invoke("uninstall_agent_plugin", { id: "message-board" });
  if (subsetInstalled) invoke("uninstall_agent_plugin", { id: "locale-subset-fixture" });
  if (sidebarInstalled) invoke("uninstall_agent_plugin", { id: "locale-sidebar-fixture" });
  invoke("save_settings", { config: original });
  invoke("set_workspace", { path: original.workspace });
}

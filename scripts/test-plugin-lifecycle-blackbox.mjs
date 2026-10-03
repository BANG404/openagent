// @ts-check
// Installs the current public catalog through the real Settings controls, then
// removes each enabled package and asserts the market immediately allows reinstall.
import { mkdirSync, mkdtempSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveBlackboxHome } from "./tauri-test-environment.mjs";

const repo = resolve(fileURLToPath(new URL("..", import.meta.url)));
const installationOnly = process.argv.includes("--installation-only");
const isolatedHome = resolveBlackboxHome(process.env, { instanceName: "plugin-lifecycle" });
if (
  [join(homedir(), ".openagent"), join(homedir(), ".openagent-dev")]
    .map((path) => resolve(path))
    .includes(resolve(isolatedHome))
) {
  throw new Error("Plugin lifecycle verification requires an isolated OPENAGENT_HOME");
}
const artifacts =
  process.env.BLACKBOX_ARTIFACT_DIR ||
  mkdtempSync(join(tmpdir(), "openagent-plugin-lifecycle-report-"));
mkdirSync(artifacts, { recursive: true });
const registry = JSON.parse(
  readFileSync(join(repo, "src/lib/officialPluginRegistry.json"), "utf8"),
);
const selected = process.env.BLACKBOX_PLUGIN_IDS?.split(",");
/** @type {Array<{id: string}>} */
const plugins = registry.plugins.filter(
  (/** @type {{id: string}} */ plugin) => !selected || selected.includes(plugin.id),
);
const pilotEnv = {
  ...process.env,
  OPENAGENT_HOME: isolatedHome,
  OPENAGENT_DEV_INSTANCE: process.env.OPENAGENT_DEV_INSTANCE || "plugin-lifecycle",
};
if (!pilotEnv.TAURI_PILOT_SOCKET) {
  throw new Error("Set TAURI_PILOT_SOCKET to the isolated fixture window's socket");
}
/** @param {string[]} args */
function pilot(args) {
  const result = spawnSync(
    process.env.TAURI_PILOT_BIN || "tauri-pilot",
    [...args, "--window", "main"],
    {
      cwd: artifacts,
      env: pilotEnv,
      encoding: "utf8",
      windowsHide: true,
    },
  );
  if (result.error || result.status !== 0)
    throw new Error(`tauri-pilot ${args[0]}: ${result.stderr || result.stdout}`, {
      cause: result.error,
    });
  return result.stdout.trim();
}
/** @param {string} script */
function evaluate(script) {
  return pilot(["eval", script]);
}
/** @param {string} name */
async function capture(name) {
  const nativeHandle = process.env.BLACKBOX_NATIVE_WINDOW_HANDLE;
  if (nativeHandle) {
    const result = spawnSync(
      "python",
      [
        join(repo, "scripts/capture-windows-window.py"),
        "--hwnd",
        nativeHandle,
        "--output",
        join(artifacts, `${name}-native.png`),
      ],
      {
        encoding: "utf8",
        windowsHide: true,
      },
    );
    if (result.error || result.status !== 0)
      throw new Error(`Native capture failed: ${result.stderr}`, { cause: result.error });
    return;
  }
  const session = process.env.BLACKBOX_APPIUM_SESSION;
  if (session) {
    const response = await fetch(
      `${process.env.BLACKBOX_APPIUM_URL || "http://127.0.0.1:4723"}/session/${encodeURIComponent(session)}/screenshot`,
    );
    if (!response.ok) throw new Error(`Appium screenshot failed: ${response.status}`);
    const body = await response.json();
    writeFileSync(join(artifacts, `${name}-native.png`), Buffer.from(body.value, "base64"));
  } else {
    pilot(["screenshot", join(artifacts, `${name}.png`)]);
  }
}
/** @param {string} script @param {string} description @param {number} [timeout] */
async function waitFor(script, description, timeout = 180000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (evaluate(script) === "true") return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(
    `${description}: ${evaluate("document.querySelector('.plugin-install-progress, .official-plugin-status, .plugin-management-panel')?.textContent || window.__pluginLifecycleProbe?.error || 'no plugin status'")}`,
  );
}

pilot(["ping"]);
pilot(["snapshot", "-i"]);
if (process.env.BLACKBOX_THEME && process.env.BLACKBOX_LANGUAGE) {
  evaluate(
    `document.querySelector('[role="dialog"] button[aria-label="Close"], [role="dialog"] button[aria-label="关闭"]')?.click(); true`,
  );
  evaluate(
    `window.dispatchEvent(new KeyboardEvent('keydown', {key:',', code:'Comma', ctrlKey:true, bubbles:true})); true`,
  );
  const general = '[role=tabpanel][data-value="general"]';
  await waitFor(
    `!!document.querySelector('${general} .settings-card-row button')`,
    "appearance settings did not open",
  );
  for (const [row, value] of [
    [1, process.env.BLACKBOX_THEME],
    [2, process.env.BLACKBOX_LANGUAGE],
  ]) {
    pilot(["snapshot", "-i"]);
    pilot(["click", `${general} .settings-card-row:nth-child(${row}) button`]);
    pilot(["snapshot", "-i"]);
    pilot(["click", `[role=option][data-value="${value}"]`]);
  }
  evaluate(
    `document.querySelector('[role="dialog"] button[aria-label="Close"], [role="dialog"] button[aria-label="关闭"]')?.click(); true`,
  );
  await waitFor(
    `document.documentElement.classList.contains(${JSON.stringify(process.env.BLACKBOX_THEME)}) && document.body.innerText.includes(${JSON.stringify(process.env.BLACKBOX_LANGUAGE === "zh" ? "新聊天" : "New chat")})`,
    "appearance did not apply",
  );
  pilot(["snapshot", "-i"]);
}
evaluate(`(async () => {
  document.querySelector('#application-integrations-menu').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  [...document.querySelectorAll('[role=menuitem]')].find(item => /Plugins|插件/.test(item.textContent)).click();
  return true;
})()`);
await waitFor(
  "!!document.querySelector('.plugin-management-tabs button')",
  "plugin settings did not open",
);
evaluate("document.querySelector('.plugin-management-tabs button').click(); true");
await waitFor(
  "!!document.querySelector('.official-plugin-card button:not(:disabled)')",
  "plugin marketplace did not load",
);
/** @type {Array<{id: string, phases: string, preservedData: boolean}>} */
const report = [];
const fixtureIds = new Set(plugins.map((plugin) => plugin.id));
if (installationOnly) {
  fixtureIds.add("goal");
  fixtureIds.add("graph");
}
for (const id of fixtureIds) {
  if (existsSync(join(isolatedHome, "plugins", id)))
    throw new Error(`${id} is already installed in the fixture; preserve it and use a fresh home`);
}
if (installationOnly) {
  pilot(["snapshot", "-i"]);
  pilot(["run", join(repo, "tests/blackbox/plugin-install-failure.toml")]);
  await waitFor(
    "!!document.querySelector('[data-plugin-id=graph][data-install-status=error]')",
    "failed source did not report an independent error",
  );
  await waitFor(
    "!!document.querySelector('[data-plugin-id=goal][data-install-status=success]')",
    "the valid install did not survive the other source's failure",
  );
  await capture("failure-isolation");
  pilot(["snapshot", "-i"]);
  pilot(["click", '.official-plugin-card[data-plugin-id="graph"] button']);
  await waitFor(
    "!!document.querySelector('[data-plugin-id=graph][data-install-status=success]')",
    "retry did not finish after restoring the catalog source",
  );
  evaluate(`(async () => {
    const {desktopOpenAgent} = await import('/src/lib/openagent/tauriClient.ts');
    for (const id of ['goal','graph']) await desktopOpenAgent.uninstallAgentPlugin(id);
    document.querySelector('[role="dialog"] button[aria-label="Close"], [role="dialog"] button[aria-label="关闭"]')?.click();
    document.querySelector('#application-integrations-menu').click();
    await new Promise(resolve => setTimeout(resolve, 0));
    [...document.querySelectorAll('[role=menuitem]')].find(item=>/Plugins|插件/.test(item.textContent)).click();
    return true;
  })()`);
  await waitFor(
    "!!document.querySelector('.official-plugin-card[data-plugin-id=goal][data-installed=false] button:not(:disabled)')",
    "fixture cleanup did not restore the catalog",
  );
}
evaluate(
  `window.__pluginLifecycleProbe = ${JSON.stringify({ ids: plugins.map((plugin) => plugin.id) })}`,
);
pilot(["snapshot", "-i"]);
pilot(["run", join(repo, "tests/blackbox/plugin-install.toml")]);
await capture("concurrent-install-progress");
for (const plugin of plugins) {
  evaluate(`window.__pluginLifecycleProbe.id = ${JSON.stringify(plugin.id)}`);
  await waitFor(
    `document.querySelector('.official-plugin-card[data-plugin-id="${plugin.id}"]')?.dataset.installed === 'true' && document.querySelector('[data-plugin-id="${plugin.id}"][data-install-status="success"]') !== null`,
    `${plugin.id} installation did not finish`,
  );
  const phases = evaluate(
    `JSON.stringify(window.__pluginLifecycleProbe.phases[${JSON.stringify(plugin.id)}])`,
  );
  if (!phases.includes("downloading") || !phases.includes("installing"))
    throw new Error(`${plugin.id} did not render Runtime phases: ${phases}`);
  if (!existsSync(join(isolatedHome, "plugins", plugin.id, "plugin.json")))
    throw new Error(`${plugin.id} card claims installation without a package`);
  evaluate("document.querySelectorAll('.plugin-management-tabs button')[1].click(); true");
  await waitFor(
    `!!document.querySelector('.plugin-accordion-item[data-plugin-id="${plugin.id}"] .plugin-version')`,
    "installed card version is missing",
  );
  pilot(["snapshot", "-i"]);
  pilot([
    "click",
    `.plugin-accordion-item[data-plugin-id="${plugin.id}"] .plugin-accordion-trigger`,
  ]);
  await waitFor(
    `document.querySelector('.plugin-accordion-item[data-plugin-id="${plugin.id}"] .plugin-accordion-content')?.dataset.state === 'open'`,
    "installed card did not expand",
  );
  const sharedCard = evaluate(`(() => {
    const card = document.querySelector('.plugin-accordion-item[data-plugin-id="${plugin.id}"]');
    return card.querySelectorAll('.plugin-accordion-content').length === 1 &&
      card.querySelector('.plugin-tools-title').textContent.includes(${JSON.stringify(process.env.BLACKBOX_LANGUAGE === "en" ? "Components" : "组件")}) &&
      !!card.querySelector('.plugin-accordion-footer a[href]');
  })()`);
  if (sharedCard !== "true") throw new Error(`${plugin.id} does not use the shared package card`);
  evaluate(
    `document.querySelector('.plugin-accordion-item[data-plugin-id="${plugin.id}"]').scrollIntoView({block:'start'}); true`,
  );
  await capture(`${plugin.id}-installed-card`);
  evaluate(
    `document.querySelector('.plugin-accordion-item[data-plugin-id="${plugin.id}"] .plugin-accordion-footer').scrollIntoView({block:'end'}); true`,
  );
  await capture(`${plugin.id}-installed-card-footer`);
  evaluate("document.querySelector('.plugin-management-tabs button').click(); true");
  const data = join(isolatedHome, "plugin-data", plugin.id);
  mkdirSync(data, { recursive: true });
  const sentinel = join(data, "lifecycle-preserved.txt");
  writeFileSync(sentinel, "preserved plugin data\n");
  if (!installationOnly && plugin.id !== "cua-driver") {
    const tool = { goal: "read_goal", graph: "graph_read", "chat-groups": "chat_group_list" }[
      plugin.id
    ];
    const args = {
      run: "lifecycle-missing-run",
      _openagent: { conversation_id: "lifecycle-fixture", branch_id: null },
    };
    await waitFor(
      `(async () => {
      const { desktopOpenAgent } = await import('/src/lib/openagent/tauriClient.ts');
      try {
        const result = await desktopOpenAgent.invokeProduct('call_agent_plugin_tool', ${JSON.stringify({ plugin_id: plugin.id, tool_name: tool, arguments: args })});
        return Array.isArray(result.content);
      } catch (error) { window.__pluginLifecycleProbe.error = String(error); return false; }
    })()`,
      `${plugin.id} MCP did not serve a tool call`,
      30000,
    );
  } else if (!installationOnly) {
    pilot(["snapshot", "-i"]);
    evaluate(`(async () => {
      document.querySelectorAll('.plugin-management-tabs button')[1].click();
      await new Promise(resolve => setTimeout(resolve, 0));
      const card = document.querySelector('.plugin-accordion-item[data-plugin-id="cua-driver"]');
      const switches = card.querySelectorAll('[role=switch]');
      if (switches[0].getAttribute('aria-checked') !== 'true') switches[0].click();
      if (switches[1].getAttribute('aria-checked') !== 'true') switches[1].click();
      const opener = card.querySelector('.plugin-accordion-trigger');
      if (opener.getAttribute('aria-expanded') !== 'true') opener.click();
      return true;
    })()`);
    await waitFor(
      `(async () => {
      const { invoke } = await import('/src/lib/openagent/tauriClient.ts');
      try { return await invoke('agent_plugin_daemon_running', { pluginId: 'cua-driver' }); } catch { return false; }
    })()`,
      "Cua daemon did not become ready after the explicit grant",
      600000,
    );
    pilot(["snapshot", "-i"]);
    evaluate(`(() => {
      const card = document.querySelector('.plugin-accordion-item[data-plugin-id="cua-driver"]');
      [...card.querySelectorAll('button')].find(button => /^(Test|测试)$/.test(button.textContent.trim())).click();
      return true;
    })()`);
    await waitFor(
      "!!document.querySelector('.plugin-accordion-item[data-plugin-id=\"cua-driver\"] .provider-status.success') && document.querySelectorAll('.plugin-tool-list .mcp-tool-row').length > 0",
      "Cua MCP tools are unavailable",
      60000,
    );
    await waitFor(
      `(async () => {
      const {desktopOpenAgent} = await import('/src/lib/openagent/tauriClient.ts');
      const result = await desktopOpenAgent.invokeProduct('call_agent_plugin_tool', {plugin_id:'cua-driver', tool_name:'get_screen_size', arguments:{}});
      return !result.isError && result.structuredContent?.width > 0 && result.structuredContent?.height > 0;
    })()`,
      "Cua could not read the real display through MCP",
      15000,
    );
    pilot(["snapshot", "-i"]);
    evaluate(
      `document.querySelectorAll('.plugin-accordion-item[data-plugin-id="cua-driver"] [role=switch]')[1].click(); true`,
    );
    await waitFor(
      `(async () => { const {invoke} = await import('/src/lib/openagent/tauriClient.ts'); return !(await invoke('agent_plugin_daemon_running', {pluginId:'cua-driver'})); })()`,
      "revoking Cua host access did not stop its daemon",
      20000,
    );
    const denied = evaluate(
      `(async () => {const {invoke} = await import('/src/lib/openagent/tauriClient.ts');try { await invoke('start_cua_driver_serve'); return false; } catch {return true;}})()`,
    );
    if (denied !== "true") throw new Error("Cua started after host access was revoked");
    pilot(["snapshot", "-i"]);
    evaluate(
      `document.querySelector('[role="dialog"] button[aria-label="Close"], [role="dialog"] button[aria-label="关闭"]')?.click(); true`,
    );
    evaluate(`(async () => {
      document.querySelector('#application-integrations-menu').click();
      await new Promise(resolve => setTimeout(resolve, 0));
      [...document.querySelectorAll('[role=menuitem]')].find(item => /Plugins|插件/.test(item.textContent)).click();
      return true;
    })()`);
    await waitFor(
      "!!document.querySelector('.plugin-management-tabs button')",
      "plugin settings did not reopen",
    );
    evaluate("document.querySelectorAll('.plugin-management-tabs button')[1].click(); true");
    await waitFor(
      `document.querySelectorAll('.plugin-accordion-item[data-plugin-id="cua-driver"] [role=switch]')[1]?.getAttribute('aria-checked') === 'false'`,
      "Cua revocation did not survive reopening settings",
    );
    pilot(["snapshot", "-i"]);
    evaluate(
      `document.querySelectorAll('.plugin-accordion-item[data-plugin-id="cua-driver"] [role=switch]')[1].click(); true`,
    );
    await waitFor(
      `(async () => {const {invoke} = await import('/src/lib/openagent/tauriClient.ts');return await invoke('agent_plugin_daemon_running', {pluginId:'cua-driver'});})()`,
      "Cua did not restart after restoring the grant",
      30000,
    );
  }
  pilot(["snapshot", "-i"]);
  await capture(`${plugin.id}-installed`);
  pilot(["run", join(repo, "tests/blackbox/plugin-uninstall.toml")]);
  await waitFor(
    `!document.querySelector('.plugin-accordion-item[data-plugin-id="${plugin.id}"]') && !document.querySelector('[role="alertdialog"]')`,
    `${plugin.id} enabled uninstall did not finish`,
    30000,
  );
  if (existsSync(join(isolatedHome, "plugins", plugin.id)))
    throw new Error(`${plugin.id} package directory survived uninstall`);
  if (readFileSync(sentinel, "utf8") !== "preserved plugin data\n")
    throw new Error(`${plugin.id} uninstall lost plugin data`);
  pilot(["snapshot", "-i"]);
  evaluate("document.querySelectorAll('.plugin-management-tabs button')[0].click(); true");
  await waitFor(
    `document.querySelector('.official-plugin-card[data-plugin-id="${plugin.id}"]')?.dataset.installed === 'false' && !!document.querySelector('.official-plugin-card[data-plugin-id="${plugin.id}"] button:not(:disabled)')`,
    `${plugin.id} marketplace remained installed`,
    10000,
  );
  await capture(`${plugin.id}-uninstalled`);
  report.push({ id: plugin.id, phases, preservedData: true });
  process.stdout.write(
    `${plugin.id}: install progress, enabled uninstall, market refresh, and data preservation passed.\n`,
  );
}
writeFileSync(join(artifacts, "lifecycle.json"), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`Plugin lifecycle black-box passed. Artifacts: ${artifacts}\n`);

// @ts-check
// A process-free installed package exercises the real permission controls.
// Queue fixtures cover transient results without network or daemon side effects.
import { cpSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { en } from "../src/lib/i18n.en.ts";
import { zh } from "../src/lib/i18n.zh.ts";
import { resolveBlackboxHome } from "./tauri-test-environment.mjs";

const repo = resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixtureHome = resolveBlackboxHome(process.env, { instanceName: "plugin-settings" });
if (!process.env.TAURI_PILOT_SOCKET || !fixtureHome.includes("plugin-settings")) {
  throw new Error("Use the isolated plugin-settings instance and set its TAURI_PILOT_SOCKET");
}
const artifacts =
  process.env.BLACKBOX_ARTIFACT_DIR || mkdtempSync(join(tmpdir(), "openagent-plugin-settings-"));
mkdirSync(artifacts, { recursive: true });
mkdirSync(join(fixtureHome, "plugins"), { recursive: true });
cpSync(
  join(repo, "tests/fixtures/agent-plugin-settings"),
  join(fixtureHome, "plugins/openagent-settings-probe"),
  { recursive: true },
);

/** @param {string[]} args */
function pilot(args) {
  const result = spawnSync("tauri-pilot", [...args, "--window", "main"], {
    cwd: artifacts,
    env: process.env,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error(result.stderr || result.stdout, { cause: result.error });
  return result.stdout.trim();
}
/** @param {string} script */
const evaluate = (script) => pilot(["eval", script]);
const close = () =>
  evaluate(
    `document.querySelector('[role=dialog] button[aria-label="Close"], [role=dialog] button[aria-label="关闭"]')?.click(); true`,
  );
async function openPlugins() {
  pilot(["snapshot", "-i"]);
  evaluate(`(async () => {
    document.querySelector('#application-integrations-menu').click();
    await new Promise(resolve => setTimeout(resolve, 0));
    [...document.querySelectorAll('[role=menuitem]')].find(item => /Plugins|插件/.test(item.textContent)).click();
    return true;
  })()`);
  pilot(["wait", "--selector", ".plugin-management-tabs", "--timeout", "20000"]);
  pilot(["snapshot", "-i"]);
  pilot(["click", ".plugin-management-tabs button:nth-of-type(2)"]);
  pilot([
    "wait",
    "--selector",
    '.plugin-accordion-item[data-plugin-id="openagent-settings-probe"]',
    "--timeout",
    "20000",
  ]);
}

pilot(["ping"]);
close();
// Restore the original appearance even when an assertion fails.
evaluate(`window.__pluginSettingsOriginal = (async () => {
  const {desktopOpenAgent} = await import('/src/lib/openagent/tauriClient.ts');
  const config = await desktopOpenAgent.invokeProduct('get_settings', {});
  return {theme:config.theme, language:config.language};
})(); true`);
evaluate(`window.__pluginSettingsWindow = (async () => {
  const {getCurrentWindow} = await import('/node_modules/@tauri-apps/api/window.js');
  const {LogicalSize} = await import('/node_modules/@tauri-apps/api/dpi.js');
  const current = getCurrentWindow();
  const size = await current.outerSize();
  await current.setSize(new LogicalSize(1100, 780));
  return size;
})(); true`);
try {
  for (const [theme, language] of /** @type {const} */ [
    ["light", "en"],
    ["light", "zh"],
    ["dark", "en"],
    ["dark", "zh"],
  ]) {
    const catalog = language === "en" ? en : zh;
    evaluate(`(async () => {
      const {desktopOpenAgent} = await import('/src/lib/openagent/tauriClient.ts');
      const config = await desktopOpenAgent.invokeProduct('get_settings', {});
      config.theme = ${JSON.stringify(theme)};
      config.language = ${JSON.stringify(language)};
      await desktopOpenAgent.invokeProduct('save_settings', {config});
      const {emit} = await import('/src/lib/openagent/tauriClient.ts');
      await emit('settings-changed');
      const {getCurrentWindow} = await import('/node_modules/@tauri-apps/api/window.js');
      await getCurrentWindow().setTheme(${JSON.stringify(theme)});
      const {applyDocumentTheme} = await import('/src/lib/appTheme.ts');
      const {setLocale} = await import('/src/lib/i18n.ts');
      applyDocumentTheme(${JSON.stringify(theme)});
      setLocale(${JSON.stringify(language)});
      return true;
    })()`);
    await openPlugins();
    evaluate(
      `window.__pluginSettingsProbe = ${JSON.stringify({ enable: catalog.pluginEnable, access: catalog.pluginHostAccess, hint: catalog.pluginHostAccessHint, success: catalog.pluginInstallSuccess.replace("{name}", "Graph"), update: catalog.pluginUpdate, updating: catalog.pluginUpdating, updated: catalog.pluginUpdateSuccess.replace("{name}", "Graph") })}; true`,
    );
    pilot(["snapshot", "-i"]);
    pilot(["run", join(repo, "tests/blackbox/plugin-settings.toml")]);
    pilot(["snapshot", "-i"]);
    pilot(["click", ".plugin-management-tabs button:nth-of-type(2)"]);
    evaluate(`(async () => {
      const {desktopPluginInstallQueue:queue} = await import('/src/lib/agentPluginInstallQueue.ts');
      void queue.run({key:'settings-capture',pluginId:'settings-capture',label:'Graph',operation:'update',subscribe:async()=>()=>{},install:()=>new Promise(resolve=>{window.__pluginSettingsCaptureFinish=resolve;}),activate:async()=>{}});
      return true;
    })()`);
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
      if (capture.error || capture.status !== 0)
        throw new Error(capture.stderr, { cause: capture.error });
    }
    evaluate(
      `(async () => {const {desktopPluginInstallQueue:queue} = await import('/src/lib/agentPluginInstallQueue.ts');window.__pluginSettingsCaptureFinish(true);await new Promise(resolve=>setTimeout(resolve,0));queue.dismiss('settings-capture');return true;})()`,
    );
    close();
  }
  pilot(["logs", "--level", "error"]);
  process.stdout.write(`Plugin settings black-box passed. Artifacts: ${artifacts}\n`);
} finally {
  close();
  evaluate(`(async () => {
    const original = await window.__pluginSettingsOriginal;
    const {desktopOpenAgent} = await import('/src/lib/openagent/tauriClient.ts');
    const config = await desktopOpenAgent.invokeProduct('get_settings', {});
    Object.assign(config, original);
    await desktopOpenAgent.invokeProduct('save_settings', {config});
    const {emit} = await import('/src/lib/openagent/tauriClient.ts');
    await emit('settings-changed');
    const {getCurrentWindow} = await import('/node_modules/@tauri-apps/api/window.js');
    await getCurrentWindow().setTheme(original.theme === 'system' ? null : original.theme);
    const size = await window.__pluginSettingsWindow;
    const {PhysicalSize} = await import('/node_modules/@tauri-apps/api/dpi.js');
    await getCurrentWindow().setSize(new PhysicalSize(size.width, size.height));
    const {applyDocumentTheme} = await import('/src/lib/appTheme.ts');
    const {setLocale} = await import('/src/lib/i18n.ts');
    applyDocumentTheme(original.theme);
    setLocale(original.language);
    return true;
  })()`);
}

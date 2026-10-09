// @ts-check
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveBlackboxHome } from "./tauri-test-environment.mjs";
import { captureBlackboxScreenshot } from "./blackbox-screenshot.mjs";

const repo = resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixtureHome = resolveBlackboxHome(process.env, { instanceName: "plugin-layout" });
if (!process.env.TAURI_PILOT_SOCKET || !fixtureHome.includes("plugin-layout")) {
  throw new Error("Use the isolated plugin-layout instance and set its TAURI_PILOT_SOCKET");
}
const artifacts =
  process.env.BLACKBOX_ARTIFACT_DIR || mkdtempSync(join(tmpdir(), "openagent-plugin-layout-"));
mkdirSync(artifacts, { recursive: true });
const fixturePlugin = join(fixtureHome, "plugins", "locale-sidebar-fixture");
if (existsSync(fixturePlugin)) throw new Error(`Fixture already exists: ${fixturePlugin}`);
cpSync(join(repo, "tests/fixtures/plugin-i18n-sidebar"), fixturePlugin, { recursive: true });
// A lazy HTTP declaration exposes the mode selector without running a process.
writeFileSync(
  join(fixturePlugin, "mcp.json"),
  JSON.stringify({
    $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
    mcpServers: { layout: { type: "http", url: "https://127.0.0.1:9/mcp" } },
  }),
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
const close = () => evaluate(`document.querySelector('.fullscreen-surface-close')?.click(); true`);
const runStartedAt = Date.now();

/** @param {string} artifact */
function capture(artifact) {
  if (!process.env.BLACKBOX_NATIVE_WINDOW_HANDLE) {
    captureBlackboxScreenshot(pilot, artifact);
    return;
  }
  const result = spawnSync(
    process.env.PYTHON_BIN || "python",
    [
      join(repo, "scripts/capture-windows-window.py"),
      "--hwnd",
      process.env.BLACKBOX_NATIVE_WINDOW_HANDLE,
      "--output",
      artifact,
    ],
    { encoding: "utf8", windowsHide: true },
  );
  if (result.error || result.status !== 0)
    throw new Error(result.stderr || result.stdout, { cause: result.error });
}

pilot(["ping"]);
// Store the restoration data before making any native or appearance changes.
evaluate(`(async () => {
  const {desktopOpenAgent} = await import('/src/lib/openagent/tauriClient.ts');
  const config = await desktopOpenAgent.invokeProduct('get_settings', {});
  const {getCurrentWindow} = await import('/node_modules/@tauri-apps/api/window.js');
  const current = getCurrentWindow();
  window.__pluginLayoutOriginal = {
    theme: config.theme, language: config.language,
    size: await current.innerSize(), maximized: await current.isMaximized(),
  };
  return true;
})()`);
try {
  for (const theme of ["light", "dark"]) {
    for (const language of ["en", "zh"]) {
      close();
      evaluate(`(async () => {
        const {desktopOpenAgent, emit} = await import('/src/lib/openagent/tauriClient.ts');
        const config = await desktopOpenAgent.invokeProduct('get_settings', {});
        config.theme = ${JSON.stringify(theme)};
        config.language = ${JSON.stringify(language)};
        await desktopOpenAgent.invokeProduct('save_settings', {config});
        await emit('settings-changed');
        const {applyDocumentTheme} = await import('/src/lib/appTheme.ts');
        const {setLocale} = await import('/src/lib/i18n.ts');
        applyDocumentTheme(config.theme);
        setLocale(config.language);
        const {getCurrentWindow} = await import('/node_modules/@tauri-apps/api/window.js');
        const {LogicalSize} = await import('/node_modules/@tauri-apps/api/dpi.js');
        const current = getCurrentWindow();
        await current.show();
        await current.setFocus();
        await current.unmaximize();
        await current.setSize(new LogicalSize(1660, 900));
        await new Promise(resolve => setTimeout(resolve, 350));
        return true;
      })()`);
      pilot(["snapshot", "-i"]);
      pilot(["click", "#application-integrations-menu"]);
      pilot(["snapshot", "-i"]);
      evaluate(
        `[...document.querySelectorAll('[role=menuitem]')].find(item => /Plugins|插件/.test(item.textContent)).click(); true`,
      );
      pilot(["wait", "--selector", ".official-plugin-card", "--timeout", "20000"]);
      pilot(["snapshot", "-i"]);
      pilot(["run", join(repo, "tests/blackbox/plugin-layout.toml")]);
      capture(join(artifacts, `${theme}-${language}-restored.png`));
      pilot(["snapshot", "-i"]);
      pilot(["click", ".fullscreen-surface-expand"]);
      pilot(["wait", "--selector", ".fullscreen-surface.expanded"]);
      await new Promise((resolve) => setTimeout(resolve, 350));
      capture(join(artifacts, `${theme}-${language}-expanded.png`));
      pilot(["snapshot", "-i"]);
      pilot(["click", ".plugin-management-tabs button:nth-of-type(2)"]);
      pilot([
        "wait",
        "--selector",
        '.plugin-accordion-item[data-plugin-id="locale-sidebar-fixture"]',
        "--timeout",
        "20000",
      ]);
      pilot(["snapshot", "-i"]);
      pilot(["run", join(repo, "tests/blackbox/plugin-installed-layout.toml")]);
      capture(join(artifacts, `${theme}-${language}-installed-narrow.png`));
      evaluate(`(async () => {
        document.querySelector('.fullscreen-surface').style.width = '1100px';
        await new Promise(resolve => setTimeout(resolve, 350));
        document.querySelector('.plugin-accordion-item[data-plugin-id="locale-sidebar-fixture"]').scrollIntoView({block:'center'});
        return true;
      })()`);
      capture(join(artifacts, `${theme}-${language}-installed-wide.png`));
    }
  }
  const errors = pilot(["logs", "--level", "error", "--json"]);
  const parsed = JSON.parse(errors);
  /** @type {{ timestamp?: number }[]} */
  const entries = Array.isArray(parsed) ? parsed : (parsed.entries ?? parsed.logs ?? [parsed]);
  if (entries.some((entry) => Number(entry.timestamp ?? 0) >= runStartedAt))
    throw new Error(errors);
  process.stdout.write(`Plugin layout black-box passed. Artifacts: ${artifacts}\n`);
} finally {
  rmSync(fixturePlugin, { recursive: true });
  close();
  evaluate(`(async () => {
    const original = window.__pluginLayoutOriginal;
    const {desktopOpenAgent, emit} = await import('/src/lib/openagent/tauriClient.ts');
    const config = await desktopOpenAgent.invokeProduct('get_settings', {});
    Object.assign(config, {theme:original.theme, language:original.language});
    await desktopOpenAgent.invokeProduct('save_settings', {config});
    await emit('settings-changed');
    const {applyDocumentTheme} = await import('/src/lib/appTheme.ts');
    const {setLocale} = await import('/src/lib/i18n.ts');
    applyDocumentTheme(config.theme);
    setLocale(config.language);
    const {getCurrentWindow} = await import('/node_modules/@tauri-apps/api/window.js');
    const {PhysicalSize} = await import('/node_modules/@tauri-apps/api/dpi.js');
    const current = getCurrentWindow();
    await current.unmaximize();
    await current.setSize(new PhysicalSize(original.size.width, original.size.height));
    if (original.maximized) await current.maximize();
    delete window.__pluginLayoutOriginal;
    delete window.__pluginLayoutProbe;
    return true;
  })()`);
}

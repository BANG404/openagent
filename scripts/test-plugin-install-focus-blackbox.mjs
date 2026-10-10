// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBlackboxHome } from "./tauri-test-environment.mjs";

const home = resolveBlackboxHome(process.env, { instanceName: "plugin-tooltip" });
assert(
  process.env.TAURI_PILOT_SOCKET && home.includes("plugin-tooltip"),
  "Use an isolated plugin-tooltip instance and its explicit TAURI_PILOT_SOCKET",
);
const artifacts = mkdtempSync(join(tmpdir(), "oa-plugin-install-focus-"));
const fixture = join(artifacts, "package");
mkdirSync(fixture);
writeFileSync(join(fixture, "plugin.json"), JSON.stringify({ name: "goal", version: "1.0.0" }));
const scenario = fileURLToPath(
  new URL("../tests/blackbox/plugin-install-focus.toml", import.meta.url),
);
/** @param {string[]} args */
function pilot(args) {
  const result = spawnSync("tauri-pilot", [...args, "--window", "main"], {
    cwd: artifacts,
    env: process.env,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  return result.stdout.trim();
}
/** @param {string} script */
const evaluate = (script) => pilot(["eval", script]);
const original = pilot(["url"]);
/** @param {string} expression */
async function waitFor(expression) {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (evaluate(`Boolean(${expression})`) === "true") return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Timed out: " + expression);
}
try {
  pilot(["ping"]);
  evaluate(`(async () => {
    await window.__TAURI_INTERNALS__.invoke('plugin:window|hide', {label:'onboarding'});
    await window.__TAURI_INTERNALS__.invoke('plugin:window|show', {label:'main'});
    await window.__TAURI_INTERNALS__.invoke('plugin:window|set_focus', {label:'main'});
    await new Promise(resolve => setTimeout(resolve, 500));
    return true;
  })()`);
  // The source package and failure are deterministic. Only the catalog download
  // boundary is redirected; the user controls, queue, real Runtime install,
  // activation, refresh, disabled/replaced buttons and focus scopes stay intact.
  for (const theme of ["light", "dark"]) {
    for (const language of ["en", "zh"]) {
      for (const mode of ["pointer", "keyboard", "available", "failure", "elsewhere"]) {
        pilot(["navigate", original]);
        await waitFor("document.querySelector('#application-integrations-menu')");
        await waitFor("document.querySelector('[contenteditable=true]')");
        await new Promise((resolve) => setTimeout(resolve, 700));
        evaluate(`window.__pluginTooltipReady = false; (async () => {
          const {desktopOpenAgent:c} = await import('/src/lib/openagent/tauriClient.ts');
          try {
            const plugins = await c.listAgentPlugins();
            if (plugins.some(plugin => plugin.id === 'goal')) await c.uninstallAgentPlugin('goal');
            const config = await c.invokeProduct('get_settings', {});
            config.theme = ${JSON.stringify(theme)}; config.language = ${JSON.stringify(language)};
            await c.invokeProduct('save_settings', {config});
            window.__pluginTooltipReady = true;
          } catch (error) { window.__pluginTooltipError = String(error); }
        })(); true`);
        await waitFor("window.__pluginTooltipReady || window.__pluginTooltipError");
        assert.equal(evaluate("window.__pluginTooltipError ?? ''"), "");
        pilot(["navigate", original]);
        await waitFor("document.querySelector('#application-integrations-menu')");
        await waitFor("document.querySelector('[contenteditable=true]')");
        await new Promise((resolve) => setTimeout(resolve, 700));
        pilot(["snapshot", "-i"]);
        pilot(["click", "#application-integrations-menu"]);
        pilot(["snapshot", "-i"]);
        evaluate(
          `[...document.querySelectorAll('[role=menuitem]')].find(item => /Plugins|插件/.test(item.textContent)).click(); true`,
        );
        await waitFor(
          "document.querySelector('.official-plugin-card[data-plugin-id=goal] button')",
        );
        evaluate(`(async () => {
          const {desktopOpenAgent:c} = await import('/src/lib/openagent/tauriClient.ts');
          window.__pluginTooltipProbe = ${JSON.stringify({ keyboard: mode === "keyboard", available: mode === "available", fail: mode === "failure", elsewhere: mode === "elsewhere" })};
          c.installOfficialAgentPlugin = async () => {
            await new Promise(resolve => { window.__pluginTooltipProbe.release = resolve; });
            if (window.__pluginTooltipProbe.fail) throw new Error('fixture installation failure');
            return c.installAgentPlugin(${JSON.stringify(fixture)});
          };
          return true;
        })()`);
        pilot(["snapshot", "-i"]);
        pilot(["run", scenario]);
        pilot(["screenshot", join(artifacts, `${theme}-${language}-${mode}.png`)]);
        process.stdout.write(`${theme}/${language}/${mode}: passed\n`);
      }
    }
  }
} finally {
  evaluate(`(async () => {
    const {desktopOpenAgent:c} = await import('/src/lib/openagent/tauriClient.ts');
    if ((await c.listAgentPlugins()).some(plugin => plugin.id === 'goal')) await c.uninstallAgentPlugin('goal');
    return true;
  })()`);
  pilot(["navigate", original]);
}
process.stdout.write(`Plugin install focus black-box passed. Artifacts: ${artifacts}\n`);

// Trusted Tab and hover input complement the native DOM scenarios. Windows
// pilot key injection can be blocked by UIPI; use the workspace browser wrapper.
const session = `plugin-tooltip-${process.pid}`;
const wrapper = fileURLToPath(
  new URL(
    `../.agents/skills/playwright/scripts/playwright_cli.${process.platform === "win32" ? "ps1" : "sh"}`,
    import.meta.url,
  ),
);
/** @param {string[]} args */
function browser(args) {
  if (args[0] === "run-code") {
    const source = join(artifacts, "tooltip-browser-scenario.js");
    writeFileSync(source, args[1]);
    args = ["run-code", "--filename", source];
  }
  const windows = process.platform === "win32";
  const result = spawnSync(
    windows ? "powershell.exe" : "bash",
    [
      ...(windows ? ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"] : []),
      wrapper,
      "--session",
      session,
      ...args,
    ],
    { encoding: "utf8", windowsHide: true },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert(!result.stdout.includes("### Error"), result.stdout);
  return result.stdout;
}
try {
  browser(["open", new URL("/?agents-settings-preview", original).href]);
  browser(["snapshot"]);
  browser([
    "run-code",
    `async (page) => {
    for (const theme of ['light', 'dark']) for (const locale of ['en', 'zh']) {
      await page.goto(${JSON.stringify(new URL(original).origin)} +
        '/?agents-settings-preview&agents-settings-preview-theme=' + theme + '&agents-settings-preview-locale=' + locale);
      const surface = page.locator('.fullscreen-surface');
      const button = page.locator('.fullscreen-surface-expand');
      await surface.waitFor(); await page.waitForTimeout(700);
      await page.mouse.click(500, 100); await surface.focus();
      await page.keyboard.press('Tab');
      await page.waitForTimeout(100);
      const state = await button.evaluate(e => ({active: document.activeElement === e,
        visible: e.matches(':focus-visible'), label: e.getAttribute('aria-label'),
        hint: document.querySelector('.tt-content')?.textContent.trim()}));
      if (!state.active || !state.visible || state.hint !== state.label) throw new Error(JSON.stringify(state));
      await page.mouse.click(500, 100); await surface.focus();
      await page.waitForTimeout(100);
      if (await page.locator('.tt-content').count()) throw new Error('pointer focus opened a tooltip');
      await button.hover(); await page.waitForTimeout(800);
      if ((await page.locator('.tt-content').textContent()).trim() !== state.label) throw new Error('hover hint missing');
    }
  }`,
  ]);
  process.stdout.write(
    "Trusted keyboard, pointer focus and hover passed in both themes and locales.\n",
  );
} finally {
  browser(["close"]);
}

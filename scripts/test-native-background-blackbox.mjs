// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { captureBlackboxScreenshot } from "./blackbox-screenshot.mjs";
import { resolveBlackboxHome } from "./tauri-test-environment.mjs";

const home = resolveBlackboxHome(process.env, { instanceName: "native-background" });
assert(
  process.env.TAURI_PILOT_SOCKET && home.includes("native-background"),
  "Use an isolated native-background home and its explicit TAURI_PILOT_SOCKET",
);
const artifacts = mkdtempSync(join(tmpdir(), "openagent-native-background-"));
const scenario = fileURLToPath(
  new URL("../tests/blackbox/native-background.toml", import.meta.url),
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
/** @param {string} expression */
async function until(expression) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (evaluate(`Promise.resolve(${expression}).then(Boolean)`) === "true") return;
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error(`Native background assertion timed out: ${expression}`);
}
async function openSettings() {
  pilot(["snapshot", "-i"]);
  pilot(["click", "#application-edit-menu"]);
  await until("document.querySelector('[role=menuitem]')");
  evaluate(
    "[...document.querySelectorAll('[role=menuitem]')].find(item=>/Settings|设置/.test(item.textContent))?.click(); true",
  );
  await until("document.querySelector('[data-appearance-native-background] [role=switch]')");
  pilot(["snapshot", "-i"]);
}
async function closeSettings() {
  pilot(["snapshot", "-i"]);
  pilot(["press", "Escape"]);
  await until("!document.querySelector('[data-appearance-native-background]')");
}
pilot(["ping"]);
pilot(["wait", "--selector", "#application-edit-menu", "--timeout", "30000"]);
evaluate(`window.__nativeBackgroundOriginal=(async()=>{
  const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');
  const config=await c.invokeProduct('get_settings',{});
  return {theme:config.theme,language:config.language,theme_plugin:config.theme_plugin,theme_overrides:config.theme_overrides};
})(); true`);
try {
  for (const theme of ["light", "dark"]) {
    for (const language of ["en", "zh"]) {
      evaluate(`(async()=>{
        const {desktopOpenAgent:c,emit}=await import('/src/lib/openagent/tauriClient.ts');
        const config=await c.invokeProduct('get_settings',{});
        Object.assign(config,{theme:'${theme}',language:'${language}',theme_plugin:'',theme_overrides:{light:{},dark:{},font_family:''}});
        await c.invokeProduct('save_settings',{config}); await emit('settings-changed'); return true;
      })()`);
      const native = process.platform === "win32" || process.platform === "darwin";
      await until(`document.documentElement.classList.contains('dark')===${theme === "dark"}`);
      await until(
        `document.querySelector('#application-file-menu')?.textContent.trim()==='${language === "zh" ? "文件" : "File"}'`,
      );
      await until(
        `document.documentElement.classList.contains('native-window-material')===${native}`,
      );
      evaluate("delete window.__nativeBackgroundGeometry; true");
      pilot(["run", scenario]);
      captureBlackboxScreenshot(pilot, join(artifacts, `${theme}-${language}-native.png`));
      await openSettings();
      pilot(["click", "[data-appearance-native-background] [role=switch]"]);
      await until("!document.documentElement.classList.contains('native-window-material')");
      await until(
        `getComputedStyle(document.body).backgroundColor==='${theme === "light" ? "rgb(245, 245, 247)" : "rgb(40, 44, 52)"}'`,
      );
      await until(`(async()=>{const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');
        return (await c.invokeProduct('get_settings',{})).theme_overrides?.opaque_background===true;})()`);
      await closeSettings();
      pilot(["run", scenario]);
      captureBlackboxScreenshot(pilot, join(artifacts, `${theme}-${language}-opaque.png`));
      await openSettings();
      await until(
        "document.querySelector('[data-appearance-native-background] [role=switch]').getAttribute('aria-checked')==='false'",
      );
      pilot(["click", "[data-appearance-native-background] [role=switch]"]);
      await until(
        `document.documentElement.classList.contains('native-window-material')===${native}`,
      );
      await until(`(async()=>{const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');
        return !(await c.invokeProduct('get_settings',{})).theme_overrides?.opaque_background;})()`);
      await closeSettings();
      pilot(["run", scenario]);
      console.log(`Native background passed: ${theme}/${language}`);
    }
  }
  const logs = JSON.parse(pilot(["logs", "--level", "error", "--json"]));
  const entries = Array.isArray(logs) ? logs : (logs.entries ?? logs.logs ?? []);
  assert.equal(entries.length, 0, `Native window logged errors: ${JSON.stringify(entries)}`);
  console.log(`Native background black-box passed. Artifacts: ${artifacts}`);
} finally {
  evaluate(`(async()=>{
    const {desktopOpenAgent:c,emit}=await import('/src/lib/openagent/tauriClient.ts');
    const config=await c.invokeProduct('get_settings',{});
    Object.assign(config,await window.__nativeBackgroundOriginal);
    await c.invokeProduct('save_settings',{config}); await emit('settings-changed'); return true;
  })()`);
}

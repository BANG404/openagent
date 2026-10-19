// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { captureBlackboxScreenshot } from "./blackbox-screenshot.mjs";

assert(
  process.env.OPENAGENT_HOME?.includes("style-contrast") && process.env.TAURI_PILOT_SOCKET,
  "Use a task-owned style-contrast home and explicit Pilot socket",
);
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const artifacts = mkdtempSync(join(tmpdir(), "openagent-style-contrast-native-"));
const scenario = join(root, "tests/blackbox/style-contrast.toml");
const themeId = "openagent-theme-nova";
/** @param {string[]} args */
function pilot(args) {
  if (["click", "press"].includes(args[0])) pilot(["snapshot", "-i"]);
  const result = spawnSync("tauri-pilot", [...args, "--window", "main"], {
    cwd: artifacts,
    env: process.env,
    encoding: "utf8",
    windowsHide: true,
    timeout: 70000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  return result.stdout.trim();
}
/** @param {string} script */
const evaluate = (script) => pilot(["eval", script]);
/** @param {string} expression */
async function until(expression) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (evaluate(`Boolean(${expression})`) === "true") return;
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error("Native assertion timed out: " + expression);
}
/** @param {string} script */
async function operation(script) {
  evaluate(`window.__contrastOperation={done:false};(async()=>{try{await(async()=>{${script}})();}
    catch(error){window.__contrastOperation.error=String(error);}finally{window.__contrastOperation.done=true;}})();true`);
  await until("window.__contrastOperation.done");
  assert.equal(evaluate("window.__contrastOperation.error ?? ''"), "");
}
async function close() {
  evaluate(
    `document.querySelector('[role=dialog] button[aria-label="Close"], [role=dialog] button[aria-label="关闭"]')?.click();true`,
  );
  await until("!document.querySelector('[data-appearance-contrast]')");
}
async function open() {
  pilot(["click", "#application-edit-menu"]);
  await operation(`const item=[...document.querySelectorAll('[role=menuitem]')].find(item=>/Settings|设置/.test(item.textContent));
    if(!item)throw Error('Settings entry missing');item.click();`);
  await until("document.querySelector('[data-appearance-contrast] [role=slider]')");
}
/** @param {number | null} value */
async function persisted(value) {
  await operation(`const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');
    for(let attempt=0;attempt<100;attempt++){
      const settings=await c.invokeProduct('get_settings',{});
      if((settings.theme_overrides.style_contrast ?? null)===${value})return;
      await new Promise(done=>setTimeout(done,100));
    }throw Error('Contrast did not persist: ${value}');`);
}
pilot(["ping"]);
pilot(["snapshot", "-i"]);
const original = JSON.parse(
  evaluate(
    `(async()=>{const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');return c.invokeProduct('get_settings',{});})()`,
  ),
);
let installed = false;
try {
  await operation(`const {desktopOpenAgent:c,emit}=await import('/src/lib/openagent/tauriClient.ts');
    if((await c.listAgentPlugins()).some(plugin=>plugin.id==='${themeId}'))throw Error('Fixture theme already installed');
    await c.installAgentPlugin(${JSON.stringify(join(root, "plugins", themeId))});await emit('agent-plugins-changed');`);
  installed = true;
  for (const mode of ["light", "dark"])
    for (const language of ["en", "zh"]) {
      await close();
      await operation(`const {desktopOpenAgent:c,emit}=await import('/src/lib/openagent/tauriClient.ts');
        const config=await c.invokeProduct('get_settings',{});
        Object.assign(config,{theme:'${mode}',language:'${language}',theme_plugin:'',theme_overrides:{light:{},dark:{},font_family:''}});
        config.agent_plugins_enabled={...config.agent_plugins_enabled,'${themeId}':true};
        await c.invokeProduct('save_settings',{config});await emit('settings-changed');await emit('agent-plugins-changed');`);
      await until(`document.documentElement.classList.contains('${mode}')`);
      for (const id of ["", themeId]) {
        await open();
        pilot(["click", "[data-appearance-theme] button"]);
        pilot(["click", `[role=option][data-value="${id}"]`]);
        await until(
          "document.querySelector('[data-appearance-contrast] [role=slider]')?.getAttribute('aria-valuenow')==='60'",
        );
        captureBlackboxScreenshot(
          pilot,
          join(artifacts, `${id || "builtin"}-${mode}-${language}-default.png`),
        );
        pilot(["run", scenario]);
        await persisted(99);
        await close();
        await open();
        await until(
          "document.querySelector('[data-appearance-contrast] [role=slider]')?.getAttribute('aria-valuenow')==='99'",
        );
        pilot(["click", "[data-appearance-contrast] .ui-slider"]);
        await until(
          "Number(document.querySelector('[data-appearance-contrast] [role=slider]')?.getAttribute('aria-valuenow'))>20 && Number(document.querySelector('[data-appearance-contrast] [role=slider]')?.getAttribute('aria-valuenow'))<80",
        );
        const pointerValue = Number(
          evaluate(
            "Number(document.querySelector('[data-appearance-contrast] [role=slider]').getAttribute('aria-valuenow'))",
          ),
        );
        await persisted(pointerValue);
        captureBlackboxScreenshot(
          pilot,
          join(artifacts, `${id || "builtin"}-${mode}-${language}-adjusted.png`),
        );
        await close();
        pilot(["navigate", pilot(["url"])]);
        await until("document.querySelector('#application-edit-menu')");
        await open();
        await until(
          `document.querySelector('[data-appearance-contrast] [role=slider]')?.getAttribute('aria-valuenow')==='${pointerValue}'`,
        );
        pilot(["click", "[data-appearance-reset] button"]);
        await until(
          "document.querySelector('[data-appearance-contrast] [role=slider]')?.getAttribute('aria-valuenow')==='60'",
        );
        await persisted(null);
        await close();
        console.log(
          `Verified contrast preview, keyboard, pointer, saved reload and reset: ${id || "builtin"}/${mode}/${language}`,
        );
      }
    }
  writeFileSync(join(artifacts, "errors.log"), pilot(["logs", "--level", "error"]));
} finally {
  await close();
  await operation(`const {desktopOpenAgent:c,emit}=await import('/src/lib/openagent/tauriClient.ts');
    await c.invokeProduct('save_settings',{config:${JSON.stringify(original)}});
    ${installed ? `await c.uninstallAgentPlugin('${themeId}');` : ""}
    await emit('settings-changed');await emit('agent-plugins-changed');`);
}
console.log(`Style contrast black-box passed. Artifacts: ${artifacts}`);

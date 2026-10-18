// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { captureBlackboxScreenshot } from "./blackbox-screenshot.mjs";
import { resolveBlackboxHome } from "./tauri-test-environment.mjs";

const home = resolveBlackboxHome(process.env, { instanceName: "topbar-stability" });
assert(
  process.env.TAURI_PILOT_SOCKET && home.includes("topbar-"),
  "Use an isolated topbar-* home and its explicit TAURI_PILOT_SOCKET",
);
const repo = resolve(fileURLToPath(new URL("..", import.meta.url)));
const artifacts = mkdtempSync(join(tmpdir(), "openagent-topbar-appearance-"));
const fixture = join(artifacts, "theme");
mkdirSync(fixture);
copyFileSync(join(repo, "scripts/themes/fonts/geist.woff2"), join(fixture, "probe.woff2"));
copyFileSync(join(repo, "scripts/themes/fonts/geist.LICENSE.txt"), join(fixture, "LICENSE.txt"));
const themeId = "openagent-topbar-stability-probe";
writeFileSync(
  join(fixture, "plugin.json"),
  JSON.stringify({
    name: themeId,
    version: "1.0.0",
    description: "Isolated font continuity fixture",
    extensions: {
      openagent: {
        type: "theme",
        compatibility: {
          plugin_protocol: { min: 1, max: 1 },
          features: ["theme-v1", "theme-fonts-v1"],
        },
        theme: {
          version: 1,
          tokens: {
            "--font-sans": '"OpenAgent Stability Probe", sans-serif',
            "--font-heading": '"OpenAgent Stability Probe", sans-serif',
          },
          fonts: [{ family: "OpenAgent Stability Probe", entry: "probe.woff2", weight: "100 900" }],
        },
      },
    },
  }),
);
/** @param {string[]} args */
function pilot(args) {
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
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (evaluate(`Boolean(${expression})`) === "true") return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Native assertion timed out: ${expression}`);
}
/** @param {string} script */
async function operation(script) {
  evaluate(`window.__topbarOperation={done:false};
    (async()=>{try{await(async()=>{${script}})();}catch(error){window.__topbarOperation.error=String(error);}
    finally{window.__topbarOperation.done=true;}})();true`);
  await until("window.__topbarOperation.done");
  assert.equal(evaluate("window.__topbarOperation.error ?? ''"), "");
}
let installed = false;
/** @type {Record<string, unknown> | undefined} */
let original;
try {
  pilot(["ping"]);
  pilot(["snapshot", "-i"]);
  writeFileSync(join(artifacts, "window.txt"), pilot(["windows"]));
  writeFileSync(
    join(artifacts, "fixture.json"),
    JSON.stringify({
      home,
      socket: process.env.TAURI_PILOT_SOCKET,
      nativeWindowId: process.env.BLACKBOX_NATIVE_WINDOW_ID,
    }),
  );
  original = JSON.parse(
    evaluate(`(async()=>{const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');
    return c.invokeProduct('get_settings',{});})()`),
  );
  await operation(`const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');
    if((await c.listAgentPlugins()).some(p=>p.id==='${themeId}')) throw new Error('Fixture already installed');
    await c.installAgentPlugin(${JSON.stringify(fixture)});`);
  installed = true;
  // Use the actual application shell and SettingsView, including its mount,
  // preview, autosave and unmount effects, rather than a synthetic dialog.
  for (const theme of ["light", "dark"])
    for (const language of ["en", "zh"]) {
      await operation(`const {desktopOpenAgent:c,emit}=await import('/src/lib/openagent/tauriClient.ts');
      const config=await c.invokeProduct('get_settings',{});
      Object.assign(config,{onboarding_completed:true,theme:'${theme}',language:'${language}',
        theme_plugin:'${themeId}',theme_overrides:{light:{},dark:{},font_family:''}});
      config.agent_plugins_enabled={...config.agent_plugins_enabled,'${themeId}':true};
      await c.invokeProduct('save_settings',{config});await emit('settings-changed');await emit('agent-plugins-changed');`);
      const pass = `${theme}-${language}`;
      const search = `?topbar-stability-pass=${pass}-${Date.now()}`;
      const url = evaluate("location.origin") + "/" + search;
      evaluate(`setTimeout(()=>location.assign(${JSON.stringify(url)}),50);true`);
      await until(
        `location.search===${JSON.stringify(search)} && document.querySelector('#conversation-stage') && [...document.fonts].some(f=>f.family.includes('OpenAgent Stability Probe') && f.status==='loaded')`,
      );
      await until(
        `document.documentElement.classList.contains('dark')===${theme === "dark"} && document.querySelector('#application-file-menu')?.textContent.trim()==='${language === "zh" ? "文件" : "File"}'`,
      );
      pilot(["snapshot", "-i"]);
      pilot(["run", join(repo, "tests/blackbox/topbar-appearance-stability.toml")]);
      const result = evaluate("window.__topbarAppearanceProbe.result()");
      writeFileSync(join(artifacts, `${theme}-${language}.json`), result);
      captureBlackboxScreenshot(pilot, join(artifacts, `${theme}-${language}-open.png`));
      evaluate(
        "window.__topbarAppearanceProbe.close().then(()=>{window.__topbarAppearanceProbe.cleanup();return true;})",
      );
      captureBlackboxScreenshot(pilot, join(artifacts, `${theme}-${language}-closed.png`));
      console.log(`Topbar appearance passed: ${theme}/${language} ${result}`);
    }
  await operation(`const {emit}=await import('/src/lib/openagent/tauriClient.ts');
    window.__topbarRetiredFaces=[...document.fonts].filter(face=>face.family.includes('OpenAgent Stability Probe'));
    await emit('agent-plugins-changed');`);
  await until(
    "window.__topbarRetiredFaces.every(face=>!document.fonts.has(face)) && [...document.fonts].some(face=>face.family.includes('OpenAgent Stability Probe') && face.status==='loaded')",
  );
  console.log("Explicit package asset refresh replaced retired faces successfully");
  const errors = pilot(["logs", "--level", "error", "--json"]);
  writeFileSync(join(artifacts, "errors.json"), errors);
  const logs = JSON.parse(errors);
  assert.equal((Array.isArray(logs) ? logs : (logs.entries ?? logs.logs ?? [])).length, 0, errors);
  console.log(`Topbar appearance black-box passed. Artifacts: ${artifacts}`);
} finally {
  evaluate(
    "window.__topbarAppearanceProbe?.cleanup();document.querySelector('.fullscreen-surface-close')?.click();true",
  );
  if (original)
    await operation(`const {desktopOpenAgent:c,emit}=await import('/src/lib/openagent/tauriClient.ts');
    await c.invokeProduct('save_settings',{config:${JSON.stringify(original)}});await emit('settings-changed');`);
  if (installed)
    await operation(
      `const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');await c.uninstallAgentPlugin('${themeId}');`,
    );
}

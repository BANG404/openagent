// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { captureBlackboxScreenshot } from "./blackbox-screenshot.mjs";

assert(
  process.env.TAURI_PILOT_SOCKET && process.env.OPENAGENT_HOME,
  "Select the isolated native instance and home",
);
assert(
  ![".openagent", ".openagent-dev"].some(
    (name) => resolve(process.env.OPENAGENT_HOME || "") === resolve(homedir(), name),
  ),
  "Preserve developer data",
);
const artifacts = mkdtempSync(join(tmpdir(), "openagent-runtime-transport-"));
/** @param {string[]} args */
function pilot(args) {
  const result = spawnSync("tauri-pilot", [...args, "--window", "main"], {
    cwd: artifacts,
    env: process.env,
    windowsHide: true,
    encoding: "utf8",
    timeout: 40000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  return result.stdout.trim();
}
/** @param {unknown} config */
function save(config) {
  pilot([
    "eval",
    `(async () => { const {desktopOpenAgent: client, emit} = await import('/src/lib/openagent/tauriClient.ts'); await client.invokeProduct('save_settings', {config:${JSON.stringify(config)}}); await emit('settings-changed'); return true; })()`,
  ]);
}
pilot(["ping"]);
pilot(["snapshot", "-i"]);
const original = JSON.parse(
  pilot([
    "eval",
    `(async () => {const {desktopOpenAgent: c}=await import('/src/lib/openagent/tauriClient.ts'); return JSON.stringify(await c.invokeProduct('get_settings', {}));})()`,
  ]),
);
const scenario = fileURLToPath(
  new URL("../tests/blackbox/runtime-transport.toml", import.meta.url),
);
try {
  for (const theme of ["light", "dark"])
    for (const language of ["en", "zh"]) {
      save({ ...original, theme, language });
      pilot([
        "eval",
        `(async()=>{ const {tr}=await import('/src/lib/i18n.ts'); const deadline=Date.now()+10000; while(document.documentElement.classList.contains('dark')!==${theme === "dark"} || tr('exitQuitting')!==${JSON.stringify(language === "en" ? "Quitting OpenAgent" : "正在退出 OpenAgent")}) {if(Date.now()>deadline) throw new Error('Appearance did not reach the product'); await new Promise(r=>setTimeout(r,50));} return true;})()`,
      ]);
      pilot(["snapshot", "-i"]);
      pilot(["run", scenario, "--junit", join(artifacts, `${theme}-${language}.xml`)]);
      captureBlackboxScreenshot(pilot, join(artifacts, `${theme}-${language}.png`));
    }
  pilot(["logs", "--level", "error"]);
} finally {
  save(original);
}
process.stdout.write(`Runtime transport black-box passed. Artifacts: ${artifacts}\n`);

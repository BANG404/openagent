// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

assert(
  process.env.TAURI_PILOT_SOCKET && process.env.OPENAGENT_HOME?.includes("quick-chat"),
  "Use an isolated quick-chat instance with explicit OPENAGENT_HOME and TAURI_PILOT_SOCKET",
);
const artifacts = mkdtempSync(join(tmpdir(), "openagent-quick-chat-"));
const scenario = fileURLToPath(new URL("../tests/blackbox/quick-chat.toml", import.meta.url));

/** @param {string[]} args */
function pilot(args) {
  const result = spawnSync("tauri-pilot", [...args, "--window", "quick-chat"], {
    cwd: artifacts,
    env: process.env,
    windowsHide: true,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  return result.stdout.trim();
}
/** @param {string} command @param {unknown} args @returns {any} */
function invoke(command, args) {
  return JSON.parse(
    pilot([
      "eval",
      `(async()=>{const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts'); return JSON.stringify(await c.invokeProduct(${JSON.stringify(command)},${JSON.stringify(args)}));})()`,
    ]),
  );
}

pilot(["ping"]);
pilot(["snapshot", "-i"]);
const original = invoke("get_settings", {});
const nativeVisible =
  pilot([
    "eval",
    "window.__TAURI_INTERNALS__.invoke('plugin:window|is_visible',{label:'quick-chat'})",
  ]) === "true";
try {
  const config = structuredClone(original);
  config.providers = [
    {
      id: "quick-chat-fixture",
      name: "Fixture",
      provider: "ollama",
      api_key: "",
      base_url: "http://127.0.0.1:9",
      enabled: true,
      models: ["MiniMax-M3", "Long-model-name-for-toolbar-width-regression"],
      model_context_compaction_thresholds: {},
      model_reasoning_efforts: {},
      model_reasoning_effort_enabled: {},
      model_vision_enabled: {},
    },
  ];
  config.defaults.chat_model = { provider_id: "quick-chat-fixture", model: "MiniMax-M3" };
  for (const theme of ["light", "dark"]) {
    for (const language of ["en", "zh"]) {
      config.theme = theme;
      config.language = language;
      invoke("save_settings", { config });
      pilot([
        "eval",
        "(async()=>{const {emit}=await import('/src/lib/openagent/tauriClient.ts');await emit('settings-changed');return true;})()",
      ]);
      pilot([
        "eval",
        `(async()=>{for(let i=0;i<300;i++){if(document.documentElement.classList.contains('dark') === ${theme === "dark"} && document.querySelector('.model-select button')?.textContent.includes('MiniMax-M3') && document.querySelector('.attach-btn')?.getAttribute('aria-label') === ${JSON.stringify(language === "en" ? "Attach images or files" : "添加图片或文件")})return true;await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('launcher settings did not refresh');})()`,
      ]);
      pilot([
        "eval",
        "(async()=>{const {showQuickChatWindow}=await import('/src/lib/quickChatWindow.ts');await showQuickChatWindow();return true;})()",
      ]);
      pilot(["snapshot", "-i"]);
      pilot(["screenshot", join(artifacts, `${theme}-${language}.png`)]);
      pilot(["run", scenario]);
    }
  }
  process.stdout.write(`Quick chat black-box verification passed. Artifacts: ${artifacts}\n`);
} finally {
  invoke("save_settings", { config: original });
  pilot([
    "eval",
    `(async()=>{const {emit}=await import('/src/lib/openagent/tauriClient.ts');await emit('settings-changed');const w=await import('/src/lib/quickChatWindow.ts');await w.${nativeVisible ? "showQuickChatWindow" : "hideQuickChatWindow"}();return true;})()`,
  ]);
}

// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { captureBlackboxScreenshot } from "./blackbox-screenshot.mjs";
import { en } from "../src/lib/i18n.en.ts";
import { zh } from "../src/lib/i18n.zh.ts";

const root = resolve(import.meta.dirname, "..");
assert(
  process.env.OPENAGENT_HOME?.includes("mcp-tool-mode") && process.env.TAURI_PILOT_SOCKET,
  "Use an isolated mcp-tool-mode home and its explicit Pilot socket",
);
const artifacts = mkdtempSync(join(tmpdir(), "openagent-mcp-tool-mode-"));
/** @param {string[]} args */
function pilot(args) {
  const result = spawnSync("tauri-pilot", [...args, "--window", "main"], {
    cwd: artifacts,
    env: process.env,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}
/** @param {string} script */
const evaluate = (script) => pilot(["eval", script]);
pilot(["ping"]);
pilot(["wait", "--selector", "#application-integrations-menu", "--timeout", "30000"]);
pilot(["snapshot", "-i"]);
evaluate(`(async()=>{
  const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');
  const config=await c.invokeProduct('get_settings',{});
  window.__mcpModeOriginal={theme:config.theme,language:config.language,mcp:config.mcp};
  return true;
})()`);
try {
  for (const theme of ["light", "dark"]) {
    for (const language of ["en", "zh"]) {
      const copy = language === "en" ? en : zh;
      pilot(["snapshot", "-i"]);
      evaluate(`document.querySelector('.fullscreen-surface-close')?.click();true`);
      evaluate(`(async()=>{
        const {desktopOpenAgent:c,emit}=await import('/src/lib/openagent/tauriClient.ts');
        const config=await c.invokeProduct('get_settings',{});
        const server={id:'mcp-mode-fixture',name:'MCP mode fixture',enabled:false,transport:'http',
          url:'http://127.0.0.1:1/mcp',bearer_token:'',headers:{},command:'',args:[],env:{},cwd:'',disabled_tools:['blocked']};
        config.mcp={servers:[server,{...server,id:'mcp-mode-other',name:'Other MCP',tool_mode:'direct'}]};
        config.theme='${theme}';config.language='${language}';
        await c.invokeProduct('save_settings',{config});await emit('settings-changed');
        const {applyDocumentTheme}=await import('/src/lib/appTheme.ts');
        const {setLocale}=await import('/src/lib/i18n.ts');applyDocumentTheme('${theme}');setLocale('${language}');
        window.__mcpModeCopy=${JSON.stringify({ label: copy.mcpToolMode, hint: copy.mcpToolModeHint, direct: copy.mcpToolModeDirect, relay: copy.mcpToolModeRelay })};
        window.dispatchEvent(new KeyboardEvent('keydown',{key:'6',code:'Digit6',ctrlKey:true,shiftKey:true,bubbles:true}));
        return true;
      })()`);
      pilot(["wait", "--selector", "#mcp-tool-mode-mcp-mode-fixture", "--timeout", "20000"]);
      pilot(["snapshot", "-i"]);
      pilot(["run", join(root, "tests/blackbox/mcp-tool-mode.toml")]);
      pilot(["snapshot", "-i"]);
      evaluate(
        `document.querySelector('#mcp-tool-mode-mcp-mode-fixture').scrollIntoView({block:'center'});true`,
      );
      captureBlackboxScreenshot(pilot, join(artifacts, `${theme}-${language}.png`));
    }
  }
  pilot(["logs", "--level", "error"]);
  console.log(
    `MCP mode verification passed in all four theme/locale combinations. Artifacts: ${artifacts}`,
  );
} finally {
  evaluate(`document.querySelector('.fullscreen-surface-close')?.click();true`);
  evaluate(`(async()=>{
    const {desktopOpenAgent:c,emit}=await import('/src/lib/openagent/tauriClient.ts');
    const config=await c.invokeProduct('get_settings',{});
    await c.invokeProduct('save_settings',{config:{...config,...window.__mcpModeOriginal}});
    await emit('settings-changed');return true;
  })()`);
}

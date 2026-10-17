// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { captureBlackboxScreenshot } from "./blackbox-screenshot.mjs";
import { resolveBlackboxHome } from "./tauri-test-environment.mjs";

const root = resolve(import.meta.dirname, "..");
const home = resolveBlackboxHome(process.env, { instanceName: "channel-settings" });
assert(
  process.env.TAURI_PILOT_SOCKET && home.includes("channel-settings"),
  "Use an isolated channel-settings home and its explicit Pilot socket",
);
const artifacts = mkdtempSync(join(tmpdir(), "openagent-channel-settings-"));
const ids = ["imessage", ...Array.from({ length: 14 }, (_, i) => `channel-probe-${i}`), "langfuse"];
for (const id of ids) {
  const source = join(artifacts, id);
  mkdirSync(source);
  // Keep real package classification and localized identity, without account,
  // process, or platform dependencies in this presentation fixture.
  const original = ["imessage", "langfuse"].includes(id)
    ? JSON.parse(readFileSync(join(root, "plugins", id, "plugin.json"), "utf8"))
    : null;
  const extension = original?.extensions.openagent;
  writeFileSync(
    join(source, "plugin.json"),
    JSON.stringify({
      name: id,
      version: "1.0.0",
      description: original?.description ?? "Channel fixture",
      extensions: {
        openagent: {
          type: extension?.type ?? "integration",
          category: extension?.category ?? "communication",
          compatibility: { plugin_protocol: { min: 1, max: 1 }, features: ["integration-v1"] },
          ...(extension?.i18n
            ? {
                i18n: {
                  ...extension.i18n,
                  translations: Object.fromEntries(
                    extension.i18n.supported_locales.map((/** @type {string} */ language) => [
                      language,
                      {
                        display_name: extension.i18n.translations[language].display_name,
                        description: extension.i18n.translations[language].description,
                      },
                    ]),
                  ),
                },
              }
            : {}),
        },
      },
    }),
  );
}
/** @param {string[]} args */
function pilot(args) {
  if (["click", "scroll"].includes(args[0])) pilot(["snapshot", "-i"]);
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
/** @param {string} expression */
async function until(expression) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (evaluate(`Boolean(${expression})`) === "true") return;
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error(`Native assertion timed out: ${expression}`);
}
/** @param {string} script */
async function operation(script) {
  evaluate(`window.__channelDone=false; window.__channelError=null;
    (async()=>{try{await(async()=>{${script}})();}catch(e){window.__channelError=String(e);}
    finally{window.__channelDone=true;}})(); true`);
  await until("window.__channelDone");
  assert.equal(
    evaluate("Boolean(window.__channelError)"),
    "false",
    evaluate("window.__channelError"),
  );
}
const close = () => evaluate("document.querySelector('.fullscreen-surface-close')?.click(); true");
/** @param {"channels" | "plugins"} section */
async function open(section) {
  close();
  pilot(["snapshot", "-i"]);
  await operation(`for(let i=0;i<30;i++){
    const trigger=document.querySelector('#application-integrations-menu');
    if(trigger?.getAttribute('aria-expanded')!=='true') trigger?.click();
    await new Promise(r=>setTimeout(r,100));
    const item=[...document.querySelectorAll('[role=menuitem]')].find(x=>${section === "channels" ? "/Channels|通道/" : "/Plugins|插件/"}.test(x.textContent));
    if(item){item.click();return;}
  } throw new Error('Integration menu unavailable');`);
  await until(`document.querySelector('[data-value="${section}"][data-state="active"]')`);
}
/** @type {string[]} */ const installed = [];
pilot(["ping"]);
pilot(["wait", "--selector", "#application-integrations-menu", "--timeout", "30000"]);
try {
  await operation(`const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');
    if((await c.listAgentPlugins()).some(p=>${JSON.stringify(ids)}.includes(p.id)))throw new Error('Fixture already installed');
    window.__channelOriginal=await c.invokeProduct('get_settings',{});
    const {getCurrentWindow}=await import('/node_modules/@tauri-apps/api/window.js');
    window.__channelSize=await getCurrentWindow().outerSize();
    await getCurrentWindow().setMinSize(new (await import('/node_modules/@tauri-apps/api/dpi.js')).LogicalSize(500,500));
    const config=structuredClone(window.__channelOriginal);
    config.agent_plugins_enabled={...config.agent_plugins_enabled,...Object.fromEntries(${JSON.stringify(ids)}.map(id=>[id,false]))};
    await c.invokeProduct('save_settings',{config});`);
  for (const id of ids) {
    await operation(`const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');
      const p=await c.installAgentPlugin(${JSON.stringify(join(artifacts, id))});
      if(p.error)throw new Error(p.error);`);
    installed.push(id);
  }
  for (const theme of ["light", "dark"])
    for (const language of ["en", "zh"]) {
      close();
      await operation(`const {desktopOpenAgent:c,emit}=await import('/src/lib/openagent/tauriClient.ts');
      const config=await c.invokeProduct('get_settings',{}); config.theme='${theme}'; config.language='${language}';
      await c.invokeProduct('save_settings',{config}); await emit('settings-changed'); await emit('agent-plugins-changed');
      const {getCurrentWindow}=await import('/node_modules/@tauri-apps/api/window.js');
      const {LogicalSize}=await import('/node_modules/@tauri-apps/api/dpi.js');
      await getCurrentWindow().setSize(new LogicalSize(1100,720));`);
      await open("channels");
      await until("document.querySelector('[data-integration-plugin=imessage]')");
      evaluate(
        `window.__channelName=${JSON.stringify(language === "en" ? "iMessage Channel" : "iMessage 消息接入")}; true`,
      );
      pilot(["run", join(root, "tests/blackbox/channel-settings.toml")]);
      pilot(["click", '[data-integration-plugin="imessage"]']);
      await until(
        "document.querySelector('[data-integration-detail=imessage] [role=switch][aria-checked=false]')",
      );
      captureBlackboxScreenshot(pilot, join(artifacts, `${theme}-${language}.png`));
      // Narrow surfaces retain the shared horizontal viewport and usable detail.
      await operation(`const {getCurrentWindow}=await import('/node_modules/@tauri-apps/api/window.js');
      const {LogicalSize}=await import('/node_modules/@tauri-apps/api/dpi.js');
      await getCurrentWindow().setSize(new LogicalSize(620,720));`);
      await until("innerWidth<=640");
      assert.equal(
        evaluate(`(()=>{const v=document.querySelector('.channel-settings-list .ui-scroll-area-viewport');
      v.scrollLeft=v.scrollWidth; return v.scrollLeft>0 && document.querySelector('.channel-settings-detail').getBoundingClientRect().height>100;})()`),
        "true",
      );
      await open("plugins");
      pilot(["click", ".plugin-management-tabs button:nth-of-type(2)"]);
      await until("document.querySelector('.plugin-accordion-item[data-plugin-id=langfuse]')");
      pilot([
        "click",
        '.plugin-accordion-item[data-plugin-id="langfuse"] .plugin-accordion-trigger',
      ]);
      await until(
        "document.querySelector('.plugin-accordion-item[data-plugin-id=langfuse] .plugin-accordion-content[data-state=open]')",
      );
    }
  await open("channels");
  pilot(["click", '[data-integration-plugin="imessage"]']);
  await operation(`const {desktopOpenAgent:c,emit}=await import('/src/lib/openagent/tauriClient.ts');
    await c.uninstallAgentPlugin('imessage'); await emit('agent-plugins-changed');`);
  installed.splice(installed.indexOf("imessage"), 1);
  await until(
    "!document.querySelector('[data-integration-plugin=imessage]') && document.querySelector('.channel-settings-item.active img[src*=feishu]')",
  );
  pilot(["logs", "--level", "error"]);
  console.log(`Channel settings black-box passed. Artifacts: ${artifacts}`);
} finally {
  close();
  for (const id of installed.reverse())
    await operation(
      `const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts'); await c.uninstallAgentPlugin('${id}');`,
    );
  await operation(`if(!window.__channelOriginal)return;
    const {desktopOpenAgent:c,emit}=await import('/src/lib/openagent/tauriClient.ts');
    await c.invokeProduct('save_settings',{config:window.__channelOriginal}); await emit('settings-changed'); await emit('agent-plugins-changed');
    const {getCurrentWindow}=await import('/node_modules/@tauri-apps/api/window.js');
    const {PhysicalSize}=await import('/node_modules/@tauri-apps/api/dpi.js');
    const size=window.__channelSize; await getCurrentWindow().setSize(new PhysicalSize(size.width,size.height));`);
}

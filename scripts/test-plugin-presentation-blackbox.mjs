// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { captureBlackboxScreenshot } from "./blackbox-screenshot.mjs";
import { resolveBlackboxHome } from "./tauri-test-environment.mjs";

const repo = resolve(fileURLToPath(new URL("..", import.meta.url)));
const home = resolveBlackboxHome(process.env, { instanceName: "plugin-presentation" });
if (!process.env.TAURI_PILOT_SOCKET || !home.includes("plugin-presentation"))
  throw new Error("Use an isolated plugin-presentation home and its explicit TAURI_PILOT_SOCKET");
const artifacts =
  process.env.BLACKBOX_ARTIFACT_DIR || mkdtempSync(join(tmpdir(), "oa-plugin-presentation-"));
mkdirSync(artifacts, { recursive: true });

/** @param {string[]} args @param {string} [window] */
function pilot(args, window = "main") {
  if (["click", "fill"].includes(args[0])) pilot(["snapshot", "-i"], window);
  const result = spawnSync("tauri-pilot", [...args, "--window", window], {
    cwd: artifacts,
    env: process.env,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error(result.stderr || result.stdout, { cause: result.error });
  return result.stdout.trim();
}
/** @param {string} script @param {string} [window] */
const evaluate = (script, window = "main") => pilot(["eval", script], window);
/** @param {string} script */
async function operation(script) {
  evaluate(`window.__presentationDone=false; window.__presentationError=null;
    (async()=>{try {window.__presentationResult=await (async()=>{${script}})();}
    catch(error){window.__presentationError=String(error);}
    finally{window.__presentationDone=true;}})(); true`);
  await waitExpression("window.__presentationDone");
  if (evaluate("Boolean(window.__presentationError)").includes("true"))
    throw new Error(evaluate("window.__presentationError"));
}
/** @param {string} expression @param {string} [window] */
async function waitExpression(expression, window = "main") {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (evaluate(`Boolean(${expression})`, window).includes("true")) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("Native assertion timed out: " + expression);
}
const close = () =>
  evaluate(
    `document.querySelector('[role=dialog] button[aria-label="Close"], [role=dialog] button[aria-label="关闭"]')?.click(); true`,
  );
/** @param {"channels" | "plugins" | "general"} section */
async function open(section) {
  close();
  pilot(["snapshot", "-i"]);
  await operation(`document.querySelector('${section === "general" ? "#application-edit-menu" : "#application-integrations-menu"}').click();
    await new Promise(r=>setTimeout(r,0));
    [...document.querySelectorAll('[role=menuitem]')].find(item=>${section === "channels" ? "/Channels|通道/" : section === "general" ? "/Settings|设置/" : "/Plugins|插件/"}.test(item.textContent)).click(); return true;`);
  pilot([
    "wait",
    "--selector",
    section === "channels"
      ? ".channel-settings-list"
      : section === "general"
        ? "[data-appearance-theme] button"
        : ".plugin-management-tabs",
    "--timeout",
    "20000",
  ]);
  pilot(["snapshot", "-i"]);
  if (section === "plugins") pilot(["click", ".plugin-management-tabs button:nth-of-type(2)"]);
}
const themeId = "openagent-theme-probe";
const integrationId = "openagent-integration-probe";
/** @type {string[]} */
const installed = [];
/** @type {unknown} */
let acceptanceFailure;
/** @type {unknown} */
let cleanupFailure;
try {
  pilot(["ping"]);
  pilot(["wait", "--selector", "#application-edit-menu", "--timeout", "30000"]);
  await operation(`const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');
    const packages=await c.listAgentPlugins();
    if(packages.some(p=>[${JSON.stringify(themeId)},${JSON.stringify(integrationId)}].includes(p.id)))
      throw new Error('Fixture packages already exist');
    const config=await c.invokeProduct('get_settings',{});
    window.__presentationOriginal={theme:config.theme,language:config.language,agent_plugins_enabled:config.agent_plugins_enabled,theme_plugin:config.theme_plugin,theme_overrides:config.theme_overrides};
    return true;`);
  for (const [directory, id] of [
    ["agent-plugin-theme", themeId],
    ["agent-plugin-integration", integrationId],
  ]) {
    await operation(`const {desktopOpenAgent:c,emit}=await import('/src/lib/openagent/tauriClient.ts');
      await c.installAgentPlugin(${JSON.stringify(join(repo, "tests/fixtures", directory))});
      await emit('agent-plugins-changed'); return true;`);
    installed.push(id);
  }
  for (const theme of ["light", "dark"]) {
    for (const language of ["en", "zh"]) {
      await operation(`const {desktopOpenAgent:c,emit}=await import('/src/lib/openagent/tauriClient.ts');
        const config=await c.invokeProduct('get_settings',{});
        config.theme=${JSON.stringify(theme)}; config.language=${JSON.stringify(language)};
        config.theme_plugin=''; config.theme_overrides={light:{},dark:{},font_family:''};
        config.agent_plugins_enabled={...config.agent_plugins_enabled, '${themeId}':true, '${integrationId}':true};
        await c.invokeProduct('save_settings',{config}); await emit('settings-changed');
        await emit('agent-plugins-changed'); return true;`);
      const primary = theme === "light" ? "#663399" : "#cc99ff";
      await open("general");
      // Hold one real save while another edit passes its debounce. Its reply and
      // settings notifications must preserve the newer preview and merge base.
      await operation(`const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');
        window.__appearanceSaveOriginal=c.invokeProduct;
        window.__appearanceSaveStarted=false;
        c.invokeProduct=async function(command,args){
          if(command==='save_settings' && !window.__appearanceSaveStarted){
            window.__appearanceSaveStarted=true;
            await new Promise(resolve=>window.__appearanceSaveRelease=resolve);
          }
          return window.__appearanceSaveOriginal.call(this,command,args);
        }; return true;`);
      try {
        pilot(["click", "[data-appearance-mode] button"]);
        pilot(["click", `[role=option][data-value="${theme === "light" ? "dark" : "light"}"]`]);
        await waitExpression("window.__appearanceSaveStarted");
        pilot(["click", "[data-appearance-mode] button"]);
        pilot(["click", `[role=option][data-value="${theme}"]`]);
        pilot(["fill", "#appearance-accent", "#337799"]);
        await operation(`const {emit}=await import('/src/lib/openagent/tauriClient.ts');
          await emit('settings-changed'); await new Promise(resolve=>setTimeout(resolve,1000));
          if(document.documentElement.classList.contains('dark')!==${theme === "dark"})
            throw new Error('settings notification replaced the draft theme');
          window.__appearanceSaveRelease(); return true;`);
        await operation(`const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');
          for(let i=0;i<100;i++){const config=await c.invokeProduct('get_settings',{});
            if(config.theme==='${theme}' && config.theme_overrides?.['${theme}']?.accent==='#337799'){
              await new Promise(resolve=>setTimeout(resolve,1000));
              if(document.documentElement.classList.contains('dark')!==${theme === "dark"} ||
                document.querySelector('#appearance-accent').value!=='#337799')
                throw new Error('earlier save replaced the newer appearance edit');
              return true;
            } await new Promise(resolve=>setTimeout(resolve,100));
          } throw new Error('appearance edit made during a save did not persist');`);
      } finally {
        evaluate(`window.__appearanceSaveRelease?.(); true`);
        await operation(`const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');
          c.invokeProduct=window.__appearanceSaveOriginal; return true;`);
      }
      pilot(["fill", "#appearance-accent", ""]);
      await operation(`const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');
        for(let i=0;i<100;i++){
          if(!(await c.invokeProduct('get_settings',{})).theme_overrides?.['${theme}']?.accent)return true;
          await new Promise(resolve=>setTimeout(resolve,100));
        } throw new Error('race probe override did not reset');`);
      pilot(["click", "[data-appearance-theme] button"]);
      await waitExpression(`document.querySelector('[role=option][data-value="${themeId}"]')`);
      pilot(["click", `[role=option][data-value="${themeId}"]`]);
      await waitExpression(
        `getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()===${JSON.stringify(primary)}`,
      );
      const accent = theme === "light" ? "#145A86" : "#88BBFF";
      const background = theme === "light" ? "#FAF5EF" : "#16202A";
      const foreground = theme === "light" ? "#17212B" : "#EEF1F4";
      pilot(["fill", "#appearance-accent", accent]);
      pilot(["fill", "#appearance-background", background]);
      pilot(["fill", "#appearance-foreground", foreground]);
      pilot(["click", "[data-appearance-font] button"]);
      await waitExpression(`document.querySelector('[role=option][data-value="mono"]')`);
      pilot(["click", '[role=option][data-value="mono"]']);
      pilot(["click", ".appearance-advanced summary"]);
      pilot(["fill", "#appearance-ui_font_size", "16"]);
      pilot(["fill", "#appearance-code_font_size", "15"]);
      await waitExpression(
        `document.documentElement.style.getPropertyValue('--primary')==='${accent}' && document.documentElement.style.getPropertyValue('--surface')==='${background}' && getComputedStyle(document.body).fontSize==='16px' && getComputedStyle(document.body).fontFamily.includes('JetBrains') && document.documentElement.style.getPropertyValue('--code-font-size')==='15px'`,
      );
      await operation(`const {mount,unmount,tick}=await import('/node_modules/.vite/deps/svelte.js');
        const {default:FileDiff}=await import('/src/lib/components/FileDiffView.svelte');
        const target=document.createElement('div'); document.body.append(target);
        const component=mount(FileDiff,{target,props:{lines:[{type:'add',text:'+const appearance = true;',newLine:1}],path:'appearance.ts'}});
        try {await tick(); window.__appearanceDiffFont=getComputedStyle(target.querySelector('.diff-row code')).fontSize;
          if(window.__appearanceDiffFont!=='15px')throw new Error('Code font override did not reach the actual diff component');}
        finally {await unmount(component);target.remove();} return true;`);
      await operation(`const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');
        for(let i=0;i<100;i++){const config=await c.invokeProduct('get_settings',{}); const o=config.theme_overrides;
          if(config.theme_plugin==='${themeId}' && o?.['${theme}']?.accent==='${accent}' && o?.['${theme}']?.background==='${background}' && o?.['${theme}']?.foreground==='${foreground}' && o?.font_family==='mono' && o?.ui_font_size===16 && o?.code_font_size===15)return true;
          await new Promise(r=>setTimeout(r,100));} throw new Error('Appearance overrides did not persist');`);
      captureBlackboxScreenshot(pilot, join(artifacts, `${theme}-${language}-appearance.png`));
      evaluate(
        `document.querySelector('[data-appearance-theme]').closest('.ui-scroll-area-viewport').scrollTop=0; true`,
      );
      captureBlackboxScreenshot(
        pilot,
        join(artifacts, `${theme}-${language}-appearance-theme.png`),
      );
      evaluate(
        `window.__appearanceProbe=${JSON.stringify({ accent, background, foreground, resetLabel: language === "zh" ? "重置覆盖配置" : "Reset overrides" })}; true`,
      );
      pilot(["run", join(repo, "tests/blackbox/plugin-appearance.toml")]);
      await operation(
        `const {invoke}=await import('/src/lib/openagent/tauriClient.ts'); await invoke('open_settings_window',{kind:'general',section:'general'}); return true;`,
      );
      await waitExpression(
        `document.documentElement.style.getPropertyValue('--primary')==='${accent}' && document.querySelector('#appearance-accent')?.value==='${accent}' && document.querySelector('#appearance-ui_font_size')?.value==='16'`,
        "settings-general",
      );
      pilot(["snapshot", "-i"], "settings-general");
      evaluate(
        `window.__TAURI_INTERNALS__.invoke('plugin:window|hide',{label:'settings-general'}); true`,
        "settings-general",
      );
      await open("general");
      pilot(["click", "[data-appearance-reset] button"]);
      await waitExpression(
        `document.documentElement.style.getPropertyValue('--primary')==='${primary}' && !document.documentElement.style.getPropertyValue('--app-font-size') && !document.documentElement.style.getPropertyValue('--code-font-size')`,
      );
      await waitExpression(
        `document.documentElement.style.getPropertyValue('--primary')==='${primary}' && !document.documentElement.style.getPropertyValue('--app-font-size')`,
        "settings-general",
      );
      // Selecting the built-in design restores package geometry, then selection reapplies it.
      pilot(["click", "[data-appearance-theme] button"]);
      pilot(["click", '[role=option][data-value=""]']);
      await waitExpression(`!document.documentElement.style.getPropertyValue('--app-radius')`);
      pilot(["click", "[data-appearance-theme] button"]);
      pilot(["click", `[role=option][data-value="${themeId}"]`]);
      await waitExpression(
        `document.documentElement.style.getPropertyValue('--primary')==='${primary}'`,
      );
      await open("plugins");
      pilot(["click", ".plugin-management-tabs button:nth-of-type(1)"]);
      await waitExpression(`document.querySelectorAll(".official-plugin-card").length > 0`);
      assert.ok(
        evaluate(
          `!document.querySelector('.official-plugin-card[data-plugin-id="discord"], .official-plugin-card[data-plugin-id="telegram"]')`,
        ).includes("true"),
        "Built-in Discord and Telegram must not be offered as official plugins",
      );
      await open("channels");
      assert.ok(
        evaluate(
          `Boolean(document.querySelector('img[src="/assets/channels/discord.svg"]') && document.querySelector('img[src="/assets/channels/telegram.png"]'))`,
        ).includes("true"),
        "Built-in Discord and Telegram channel entries must remain available",
      );
      pilot([
        "wait",
        "--selector",
        `[data-integration-plugin="${integrationId}"]`,
        "--timeout",
        "20000",
      ]);
      pilot(["snapshot", "-i"]);
      pilot(["click", `[data-integration-plugin="${integrationId}"]`]);
      pilot(["wait", "--selector", '[data-config-field="account"]', "--timeout", "20000"]);
      evaluate(
        `window.__presentationProbe=${JSON.stringify({ primary, surface: theme === "light" ? "#fffaf5" : "#211b29", background: theme === "light" ? "rgb(255, 250, 245)" : "rgb(33, 27, 41)", name: language === "en" ? "Integration probe" : "集成测试", account: language === "en" ? "Account" : "账号" })}; true`,
      );
      pilot(["snapshot", "-i"]);
      pilot(["run", join(repo, "tests/blackbox/plugin-presentation.toml")]);
      // Let the ordinary autosave finish before switching surfaces.
      await operation(`const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');
        for(let i=0;i<100;i++){if((await c.invokeProduct('get_settings',{})).agent_plugins_enabled?.['${integrationId}']===false)return true; await new Promise(r=>setTimeout(r,100));}
        throw new Error('Integration disablement was not saved');`);
      const accountValue = `fixture-${theme}-${language}`;
      pilot(["fill", '[data-config-field="account"] input', accountValue]);
      pilot(["snapshot", "-i"]);
      evaluate(
        `document.querySelector('[data-integration-detail="${integrationId}"] [data-config-actions] button').click(); true`,
      );
      await operation(`const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');
        for(let i=0;i<100;i++){const saved=await c.invokeProduct('get_agent_plugin_configuration',{plugin_id:'${integrationId}'}); if(saved.values.account===${JSON.stringify(accountValue)})return true; await new Promise(r=>setTimeout(r,100));}
        throw new Error('Integration configuration was not persisted');`);
      captureBlackboxScreenshot(pilot, join(artifacts, `${theme}-${language}-integration.png`));
      await operation(`const {invoke}=await import('/src/lib/openagent/tauriClient.ts');
        await invoke('open_settings_window',{kind:'integrations',section:'channels'}); return true;`);
      await waitExpression(
        `getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()===${JSON.stringify(primary)}`,
        "settings-integrations",
      );
      pilot(["snapshot", "-i"], "settings-integrations");
      pilot(
        [
          "wait",
          "--selector",
          `[data-integration-plugin="${integrationId}"]`,
          "--timeout",
          "20000",
        ],
        "settings-integrations",
      );
      pilot(["click", `[data-integration-plugin="${integrationId}"]`], "settings-integrations");
      pilot(
        ["wait", "--selector", '[data-config-field="account"]', "--timeout", "20000"],
        "settings-integrations",
      );
      evaluate(
        `window.__TAURI_INTERNALS__.invoke('plugin:window|hide',{label:'settings-integrations'}); true`,
        "settings-integrations",
      );

      await open("plugins");
      await waitExpression(
        `document.querySelector('[data-plugin-id="${themeId}"] [data-plugin-type="theme"]')`,
      );
      pilot(["snapshot", "-i"]);
      pilot(["click", `[data-plugin-id="${themeId}"] .plugin-accordion-header [role=switch]`]);
      await waitExpression(
        `!document.documentElement.style.getPropertyValue('--primary') && !document.documentElement.style.getPropertyValue('--app-radius')`,
      );
      await waitExpression(
        `!document.documentElement.style.getPropertyValue('--primary') && !document.documentElement.style.getPropertyValue('--app-radius')`,
        "settings-integrations",
      );
      const restored = evaluate(
        "getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()",
      );
      assert(!restored.includes(primary), "Theme disablement did not restore the default palette");
      captureBlackboxScreenshot(pilot, join(artifacts, `${theme}-${language}-restored.png`));
      console.log(`Verified plugin presentation: ${theme}/${language}`);
    }
  }
  await open("channels");
  pilot(["snapshot", "-i"]);
  pilot(["click", `[data-integration-plugin="${integrationId}"]`]);
  await operation(`const {desktopOpenAgent:c,emit}=await import('/src/lib/openagent/tauriClient.ts');
    await c.uninstallAgentPlugin('${integrationId}'); await emit('agent-plugins-changed'); return true;`);
  installed.splice(installed.indexOf(integrationId), 1);
  await waitExpression(
    `!document.querySelector('[data-integration-plugin="${integrationId}"]') && document.querySelector('.channel-settings-item.active')`,
  );
  close();
  await operation(`const {desktopOpenAgent:c,emit}=await import('/src/lib/openagent/tauriClient.ts');
    const config=await c.invokeProduct('get_settings',{});
    config.agent_plugins_enabled={...config.agent_plugins_enabled, '${themeId}':true};
    await c.invokeProduct('save_settings',{config}); await emit('settings-changed'); return true;`);
  await waitExpression(`document.documentElement.style.getPropertyValue('--primary')==='#cc99ff'`);
  await operation(`const {desktopOpenAgent:c,emit}=await import('/src/lib/openagent/tauriClient.ts');
    await c.uninstallAgentPlugin('${themeId}'); await emit('agent-plugins-changed'); return true;`);
  installed.splice(installed.indexOf(themeId), 1);
  await waitExpression(
    `!document.documentElement.style.getPropertyValue('--primary') && !document.documentElement.style.getPropertyValue('--app-radius')`,
  );
  await open("general");
  await waitExpression(
    `document.querySelector('[data-appearance-theme] button')?.textContent.includes('${themeId}') && document.querySelector('[data-appearance-theme]')?.parentElement.querySelector('[role=status]')`,
  );
  await operation(
    `const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts'); const config=await c.invokeProduct('get_settings',{}); if(config.theme_plugin!=='${themeId}')throw new Error('Uninstall erased the selected theme preference'); return true;`,
  );
  for (const window of ["main", "settings-integrations", "settings-general"]) {
    const parsed = JSON.parse(pilot(["logs", "--level", "error", "--json"], window));
    const entries = Array.isArray(parsed) ? parsed : (parsed.entries ?? parsed.logs ?? []);
    assert.equal(entries.length, 0, `${window} logged errors: ${JSON.stringify(entries)}`);
  }
  console.log(`Plugin presentation native acceptance passed; artifacts: ${artifacts}`);
} catch (error) {
  acceptanceFailure = error;
} finally {
  try {
    close();
    for (const id of installed) {
      await operation(
        `const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts'); await c.uninstallAgentPlugin(${JSON.stringify(id)}); return true;`,
      );
    }
    await operation(`const {desktopOpenAgent:c,emit}=await import('/src/lib/openagent/tauriClient.ts');
    if(window.__presentationOriginal){const config=await c.invokeProduct('get_settings',{}); Object.assign(config,window.__presentationOriginal); await c.invokeProduct('save_settings',{config});}
    await emit('settings-changed'); await emit('agent-plugins-changed'); return true;`);
  } catch (error) {
    cleanupFailure = error;
    if (acceptanceFailure)
      console.error("Fixture cleanup also failed after native acceptance failure:", error);
  }
}
if (acceptanceFailure) throw acceptanceFailure;
if (cleanupFailure) throw cleanupFailure;

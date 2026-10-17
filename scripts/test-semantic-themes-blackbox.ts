import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { captureBlackboxScreenshot } from "./blackbox-screenshot.mjs";
import { themeCollection } from "./themes/collection";

if (!process.env.TAURI_PILOT_SOCKET || !process.env.OPENAGENT_HOME?.includes("plugin-presentation"))
  throw new Error("Select an isolated plugin-presentation home and explicit Pilot socket");
const root = resolve(import.meta.dirname, "..");
const artifacts = resolve(process.env.BLACKBOX_ARTIFACT_DIR ?? ".cache/semantic-theme-acceptance");
mkdirSync(artifacts, { recursive: true });
const candidates = themeCollection.map(({ id }) => ({ id, output: join("plugins", id) }));
const fromRelease = process.argv.includes("--release");
const modeFilter = process.argv.find((arg) => arg.startsWith("--mode="))?.slice(7);
const languageFilter = process.argv.find((arg) => arg.startsWith("--language="))?.slice(11);
if (modeFilter !== undefined && !["light", "dark"].includes(modeFilter))
  throw new Error("--mode must be light or dark");
if (languageFilter !== undefined && !["en", "zh"].includes(languageFilter))
  throw new Error("--language must be en or zh");
const modes = (["light", "dark"] as const).filter((mode) => !modeFilter || mode === modeFilter);
const languages = ["en", "zh"].filter((language) => !languageFilter || language === languageFilter);
const packageFamilies = [
  ...new Set(
    candidates.flatMap(({ output }) =>
      JSON.parse(
        readFileSync(join(root, output, "plugin.json"), "utf8"),
      ).extensions.openagent.theme.fonts.map((face: { family: string }) => face.family),
    ),
  ),
];
// Renderer CSS faces can be replaced during development stylesheet updates.
// Identify package families directly instead of comparing FontFace identity.
const packageFaces = `[...document.fonts].filter(face=>${JSON.stringify(packageFamilies)}.includes(face.family.replaceAll('"','')))`;

function pilot(args: string[]): string {
  if (["click", "fill"].includes(args[0])) pilot(["snapshot", "-i"]);
  const result = spawnSync("tauri-pilot", [...args, "--window", "main"], {
    encoding: "utf8",
    env: process.env,
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}
const evaluate = (script: string) => pilot(["eval", script]);
async function wait(expression: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (evaluate(`Boolean(${expression})`) === "true") return;
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error(
    `Timed out: ${expression}\n${evaluate(`JSON.stringify({chart:!!window.__themeEcharts?.getInstanceByDom(document.querySelector('#semantic-theme-renderers [_echarts_instance_]')),nodeFill:document.querySelector('#semantic-theme-renderers svg .node rect')&&getComputedStyle(document.querySelector('#semantic-theme-renderers svg .node rect')).fill,card:getComputedStyle(document.documentElement).getPropertyValue('--card')})`)}`,
  );
}
async function operation(script: string) {
  evaluate(
    `window.__themeDone=false;window.__themeError=null;(async()=>{try{${script}}catch(e){window.__themeError=String(e)}finally{window.__themeDone=true}})();true`,
  );
  await wait("window.__themeDone");
  assert.equal(evaluate("Boolean(window.__themeError)"), "false", evaluate("window.__themeError"));
}

async function closeAppearance() {
  await operation(
    `document.querySelector('[role=dialog] button[aria-label="Close"], [role=dialog] button[aria-label="关闭"]')?.click();`,
  );
  await wait("!document.querySelector('[data-appearance-theme]')");
}

async function openAppearance() {
  pilot(["click", "#application-edit-menu"]);
  await operation(
    `const item=[...document.querySelectorAll('[role=menuitem]')].find(e=>/Settings|设置/.test(e.textContent));if(!item)throw Error('Settings menu missing');item.click();`,
  );
  await wait("document.querySelector('[data-appearance-theme] button')");
}

function captureShell(filename: string) {
  evaluate("document.querySelector('#semantic-theme-renderers').hidden=true; true");
  captureBlackboxScreenshot(pilot, join(artifacts, filename));
  evaluate("document.querySelector('#semantic-theme-renderers').hidden=false; true");
}

// Vite can reload once when these optional renderer dependencies are first used.
// Warm them before capturing settings or installing any fixture package.
async function warmRenderers() {
  for (let round = 0; round < 5; round++) {
    evaluate(
      `window.__themeWarm=false;window.__themeWarmError=null;(async()=>{try{await import('/src/lib/devFixtures/ThemeRenderers.svelte');await import('/src/lib/streamdown/echartsRuntime.ts');await (await import('/src/lib/streamdown/mermaidRenderer.ts')).loadMermaid()}catch(e){window.__themeWarmError=String(e)}finally{window.__themeWarm=true}})();true`,
    );
    for (let attempt = 0; attempt < 100; attempt++) {
      if (evaluate("Boolean(window.__themeWarm)") === "true") {
        assert.equal(
          evaluate("Boolean(window.__themeWarmError)"),
          "false",
          evaluate("window.__themeWarmError"),
        );
        return;
      }
      await new Promise((done) => setTimeout(done, 250));
      if (evaluate("typeof window.__themeWarm") === "undefined") break;
    }
  }
  throw new Error("Renderer dependencies did not stabilize after Vite reloads");
}

pilot(["ping"]);
await warmRenderers();
const installed: string[] = [];
const results: Array<Record<string, unknown>> = [];
try {
  pilot(["ping"]);
  await operation(`
    const {mount}=await import('/node_modules/.vite/deps/svelte.js');
    const {default:Renderers}=await import('/src/lib/devFixtures/ThemeRenderers.svelte');
    window.__themeEcharts=await import('/node_modules/.vite/deps/echarts_core.js');
    window.__themePalette=(await import('/src/lib/streamdown/themePalette.ts')).readThemePalette;
    const target=document.createElement('section');target.id='semantic-theme-renderers';
    target.style.cssText='position:fixed;left:20px;top:55px;width:360px;padding:16px;background:var(--card);color:var(--card-foreground);border:1px solid var(--border);z-index:10';
    document.body.append(target);window.__themeRenderers=[mount(Renderers,{target})];
    const {default:Sidebar}=await import('/src/lib/components/CheckpointFlowStatus.svelte');
    const sidebar=document.createElement('div');sidebar.id='semantic-theme-sidebar';sidebar.style.display='contents';
    document.querySelector('.conversation-workspace').append(sidebar);
    window.__themeRenderers.push(mount(Sidebar,{target:sidebar,props:{flow:null,changes:[],width:300,collapsed:false,resizing:false,onResizeStart:()=>{},activePanel:'terminal',terminalAvailable:true,terminalPreviewSessions:[]}}));
    document.querySelector('#conversation-stage').classList.add('sidebar-open');
  `);
  await wait(
    "document.querySelector('#semantic-theme-renderers svg .node rect') && document.querySelector('#semantic-theme-renderers [_echarts_instance_]')",
  );
  await wait("document.querySelector('#semantic-theme-sidebar .flow-panel-surface')");
  await operation(
    `const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');window.__themeOriginal=await c.invokeProduct('get_settings',{});if((await c.listAgentPlugins()).some(p=>${JSON.stringify(candidates.map((item) => item.id))}.includes(p.id)))throw Error('Fixture theme already installed');`,
  );
  for (const candidate of candidates) {
    const manifest = JSON.parse(readFileSync(join(root, candidate.output, "plugin.json"), "utf8"));
    const source = fromRelease ? (manifest.repository as string) : join(root, candidate.output);
    const install = fromRelease
      ? `c.installOfficialAgentPlugin(${JSON.stringify(candidate.id)},${JSON.stringify(candidate.id)},${JSON.stringify(source)})`
      : `c.installAgentPlugin(${JSON.stringify(source)})`;
    await operation(
      `const {desktopOpenAgent:c,emit}=await import('/src/lib/openagent/tauriClient.ts');const installed=await ${install};if(installed.id!==${JSON.stringify(candidate.id)}||installed.version!==${JSON.stringify(manifest.version)})throw Error('Installed theme identity/version mismatch');await emit('agent-plugins-changed');`,
    );
    installed.push(candidate.id);
  }
  for (const mode of modes)
    for (const language of languages) {
      await operation(
        `document.querySelector('[role=dialog] button[aria-label="Close"], [role=dialog] button[aria-label="关闭"]')?.click();const {desktopOpenAgent:c,emit}=await import('/src/lib/openagent/tauriClient.ts');const config=await c.invokeProduct('get_settings',{});config.theme='${mode}';config.language='${language}';config.theme_plugin='';config.theme_overrides={light:{},dark:{},font_family:''};for(const id of ${JSON.stringify(installed)})config.agent_plugins_enabled[id]=true;await c.invokeProduct('save_settings',{config});await emit('settings-changed');await emit('agent-plugins-changed');`,
      );
      await wait(`document.documentElement.classList.contains('${mode}')`);
      evaluate("delete window.__nativeBackgroundGeometry; true");
      pilot(["run", join(root, "tests/blackbox/native-background.toml")]);
      captureShell(`shell-default-${mode}-${language}.png`);
      await openAppearance();
      for (const candidate of candidates) {
        const manifest = JSON.parse(
          readFileSync(join(root, candidate.output, "plugin.json"), "utf8"),
        );
        const expected = manifest.extensions.openagent.theme[mode];
        const inheritsSidebarCanvas =
          !expected["--workspace-canvas"] &&
          !manifest.extensions.openagent.theme.tokens["--workspace-canvas"];
        pilot(["click", "[data-appearance-theme] button"]);
        await wait(`document.querySelector('[role=option][data-value="${candidate.id}"]')`);
        pilot(["click", `[role=option][data-value="${candidate.id}"]`]);
        await wait(
          `getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()===${JSON.stringify(expected["--primary"])} && document.documentElement.style.getPropertyValue('--radius')===${JSON.stringify(manifest.extensions.openagent.theme.tokens["--radius"])}`,
        );
        const families = manifest.extensions.openagent.theme.fonts.map(
          (face: { family: string }) => face.family,
        );
        await wait(
          `JSON.stringify(${packageFaces}.filter(face=>face.status==='loaded').map(face=>face.family.replaceAll('"','')).sort())===${JSON.stringify(JSON.stringify([...families].sort()))}`,
        );
        await wait(
          `(()=>{const element=document.querySelector('#semantic-theme-renderers [_echarts_instance_]');const chart=window.__themeEcharts.getInstanceByDom(element);const probe=document.createElement('div');document.body.append(probe);const node=getComputedStyle(document.querySelector('#semantic-theme-renderers svg .node rect'));const palette=window.__themePalette();probe.style.color=palette.card;const fill=node.fill===getComputedStyle(probe).color;probe.style.color=palette.border;const border=node.stroke===getComputedStyle(probe).color;probe.remove();return chart && fill && border})()`,
        );
        await operation(`
        const root=getComputedStyle(document.documentElement);const expected=${JSON.stringify(expected)};
        for(const key of ['--primary','--primary-foreground','--background','--foreground','--chart-1','--chart-5'])if(root.getPropertyValue(key).trim()!==expected[key])throw Error('Token mismatch '+key);
        if(document.documentElement.classList.contains('native-window-material'))throw Error('Native material hid theme canvas');
        if(${inheritsSidebarCanvas} && getComputedStyle(document.querySelector('.main')).backgroundColor!==getComputedStyle(document.querySelector('.sidebar')).backgroundColor)throw Error('Theme workspace canvas differs from sidebar');
        const probe=document.createElement('div');document.body.append(probe);
        const computed=(property,value)=>{probe.style.setProperty(property,value);return getComputedStyle(probe).getPropertyValue(property)};
        const send=document.querySelector('.send-btn');if(!send)throw Error('Composer action missing');
        if(getComputedStyle(send).color!==computed('color','var(--primary-foreground)'))throw Error('Action foreground mismatch');
        const composer=document.querySelector('.conversation-input-surface');if(getComputedStyle(composer).borderTopLeftRadius!==computed('border-top-left-radius','var(--radius)'))throw Error('Radius did not reach composer');
        const requireFont=async(family,label)=>{for(let attempt=0;attempt<100;attempt++){if((await document.fonts.load('14px "'+family+'"')).length)return;await new Promise(done=>setTimeout(done,50));}throw Error(label+' '+family);};
        const font=root.getPropertyValue('--font-sans').split(',')[0].trim().replaceAll("'",'');
        await requireFont(font,'Offline font unavailable');
        for(const family of ${JSON.stringify(families)})await requireFont(family,'Package heading/body font unavailable');
        const {readThemePalette}=await import('/src/lib/streamdown/themePalette.ts');const palette=readThemePalette();
        const chart=window.__themeEcharts.getInstanceByDom(document.querySelector('#semantic-theme-renderers [_echarts_instance_]'));
        if(JSON.stringify(chart.getOption().color)!==JSON.stringify([1,2,3,4,5].map(i=>palette['chart-'+i])))throw Error('Mounted chart palette stale');
        probe.remove();
      `);
        pilot(["run", join(root, "tests/blackbox/native-background.toml")]);
        pilot(["click", "[data-appearance-theme] button"]);
        await operation(
          `const menu=document.querySelector('[role=listbox]');if(!menu)throw Error('Theme selector menu missing');const probe=document.createElement('div');probe.style.background='var(--menu-surface)';document.body.append(probe);if(getComputedStyle(menu).backgroundColor!==getComputedStyle(probe).backgroundColor)throw Error('Menu color mismatch');probe.remove();`,
        );
        pilot(["click", "[data-appearance-theme] button"]);
        const filename = `${candidate.id}-${mode}-${language}.png`;
        captureBlackboxScreenshot(pilot, join(artifacts, filename));
        await closeAppearance();
        const shell = `shell-${filename}`;
        captureShell(shell);
        results.push({ id: candidate.id, mode, language, screenshot: filename, shell });
        await openAppearance();
        console.log(`Verified ${candidate.id}/${mode}/${language}`);
      }
      await closeAppearance();
      captureBlackboxScreenshot(pilot, join(artifacts, `renderers-${mode}-${language}.png`));
      await openAppearance();
      // Use the same draft/save path as users; an external save can race the
      // Settings controller's final autosave when its dialog unmounts.
      pilot(["click", "[data-appearance-theme] button"]);
      pilot(["click", '[role=option][data-value=""]']);
      await wait(`${packageFaces}.length===0`);
      await operation(
        `const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');for(let i=0;i<100;i++){if(!(await c.invokeProduct('get_settings',{})).theme_plugin)return;await new Promise(r=>setTimeout(r,100))}throw Error('Default theme selection was not saved');`,
      );
      await closeAppearance();
    }
  const first = candidates[0];
  const firstManifest = JSON.parse(readFileSync(join(root, first.output, "plugin.json"), "utf8"));
  await operation(
    `const {desktopOpenAgent:c,emit}=await import('/src/lib/openagent/tauriClient.ts');const config=await c.invokeProduct('get_settings',{});config.theme_plugin=${JSON.stringify(first.id)};await c.invokeProduct('save_settings',{config});await emit('settings-changed');`,
  );
  await wait(`${packageFaces}.length===${firstManifest.extensions.openagent.theme.fonts.length}`);
  await operation(
    `const {desktopOpenAgent:c,emit}=await import('/src/lib/openagent/tauriClient.ts');const config=await c.invokeProduct('get_settings',{});config.agent_plugins_enabled[${JSON.stringify(first.id)}]=false;await c.invokeProduct('save_settings',{config});await emit('settings-changed');let rejected=false;try{await c.readAgentPluginAsset(${JSON.stringify(first.id)},${JSON.stringify(firstManifest.extensions.openagent.theme.fonts[0].entry)})}catch{rejected=true}if(!rejected)throw Error('Disabled font asset was readable');`,
  );
  await wait(`${packageFaces}.length===0`);
  await operation(
    `const {desktopOpenAgent:c,emit}=await import('/src/lib/openagent/tauriClient.ts');const config=await c.invokeProduct('get_settings',{});config.agent_plugins_enabled[${JSON.stringify(first.id)}]=true;await c.invokeProduct('save_settings',{config});await emit('settings-changed');`,
  );
  await wait(`${packageFaces}.length===${firstManifest.extensions.openagent.theme.fonts.length}`);
  await operation(
    `const {desktopOpenAgent:c,emit}=await import('/src/lib/openagent/tauriClient.ts');await c.uninstallAgentPlugin(${JSON.stringify(first.id)});await emit('agent-plugins-changed');`,
  );
  installed.splice(installed.indexOf(first.id), 1);
  await wait(`${packageFaces}.length===0`);
} finally {
  await operation(
    `const {unmount}=await import('/node_modules/.vite/deps/svelte.js');for(const renderer of window.__themeRenderers??[])await unmount(renderer);document.querySelector('#semantic-theme-renderers')?.remove();document.querySelector('#semantic-theme-sidebar')?.remove();document.querySelector('#conversation-stage')?.classList.remove('sidebar-open');const {desktopOpenAgent:c,emit}=await import('/src/lib/openagent/tauriClient.ts');document.querySelector('[role=dialog] button[aria-label="Close"], [role=dialog] button[aria-label="关闭"]')?.click();if(window.__themeOriginal)await c.invokeProduct('save_settings',{config:window.__themeOriginal});for(const id of ${JSON.stringify(installed)})await c.uninstallAgentPlugin(id);await emit('settings-changed');await emit('agent-plugins-changed');`,
  );
  writeFileSync(join(artifacts, "results.json"), JSON.stringify(results, null, 2) + "\n");
}
assert.equal(results.length, candidates.length * modes.length * languages.length);
console.log(
  `Verified ${results.length} installed theme/appearance/locale combinations. Artifacts: ${artifacts}`,
);

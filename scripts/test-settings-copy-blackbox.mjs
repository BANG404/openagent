// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { captureBlackboxScreenshot } from "./blackbox-screenshot.mjs";

const root = resolve(import.meta.dirname, "..");
let targetWindow = "main";
const home = process.env.OPENAGENT_HOME;
assert(
  home?.includes("settings-copy") && process.env.TAURI_PILOT_SOCKET,
  "Use a configured isolated settings-copy home and its explicit Pilot socket",
);
const artifacts = mkdtempSync(join(tmpdir(), "openagent-settings-copy-"));
const workspace = join(artifacts, "workspace");
const skill = join(workspace, ".agents", "skills", "copy-fixture");
mkdirSync(skill, { recursive: true });
writeFileSync(
  join(skill, "SKILL.md"),
  "---\nname: copy-fixture\ndescription: Settings inventory fixture\n---\n\nUseful skill instructions.\n",
);

/** @param {string[]} args */
function pilot(args) {
  if (["click", "fill", "press"].includes(args[0])) pilot(["snapshot", "-i"]);
  const result = spawnSync("tauri-pilot", [...args, "--window", targetWindow], {
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
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (evaluate(`Boolean(${expression})`) === "true") return;
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`Settings assertion timed out: ${expression}`);
}
/** @param {string} script */
async function operation(script) {
  evaluate(`window.__copyDone=false;window.__copyError=null;
    (async()=>{try{${script}}catch(e){window.__copyError=String(e)}finally{window.__copyDone=true}})();true`);
  await until("window.__copyDone");
  assert.equal(evaluate("Boolean(window.__copyError)"), "false", evaluate("window.__copyError"));
}
/** @param {string} section */
async function open(section) {
  if (targetWindow !== "main") {
    evaluate(
      "window.__TAURI_INTERNALS__.invoke('plugin:window|hide',{label:'settings-models'});true",
    );
    targetWindow = "main";
  }
  pilot(["snapshot", "-i"]);
  evaluate("document.querySelector('.fullscreen-surface-close')?.click();true");
  const shortcut = { general: ",", execution: "2", agents: "3", memory: "4" };
  if (section === "defaults") {
    await operation(`const {invoke}=await import('/src/lib/openagent/tauriClient.ts');
      await invoke('open_settings_window',{kind:'models',section:'defaults'});`);
    targetWindow = "settings-models";
  } else if (section === "skills") {
    pilot(["click", "#application-integrations-menu"]);
    await until(
      "[...document.querySelectorAll('[role=menuitem]')].some(e=>/Skills|技能/.test(e.textContent))",
    );
    pilot(["snapshot", "-i"]);
    evaluate(
      "[...document.querySelectorAll('[role=menuitem]')].find(e=>/Skills|技能/.test(e.textContent)).click();true",
    );
  } else {
    const key = shortcut[/** @type {keyof typeof shortcut} */ (section)];
    evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', {key:${JSON.stringify(key)},
      code:${JSON.stringify(key === "," ? "Comma" : `Digit${key}`)},ctrlKey:true,shiftKey:${key !== ","},bubbles:true}));true`);
  }
  await until(
    `document.querySelector('[role=tabpanel][data-value=${section}][data-state=active]')`,
  );
}
/** @param {string} name */
const scenario = (name) => {
  pilot(["snapshot", "-i"]);
  pilot(["run", join(root, "tests/blackbox", name)]);
};

pilot(["ping"]);
pilot(["wait", "--selector", "#application-integrations-menu", "--timeout", "30000"]);
await operation(`const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');
  window.__copyOriginal=await c.invokeProduct('get_settings',{});
  window.__copyWorkspace=await c.invokeProduct('get_workspace_context',{});
  await c.invokeProduct('set_workspace',{path:${JSON.stringify(workspace)}});`);
try {
  for (const theme of ["light", "dark"]) {
    for (const language of ["zh", "en"]) {
      evaluate("document.querySelector('.fullscreen-surface-close')?.click();true");
      await operation(`const {desktopOpenAgent:c,emit}=await import('/src/lib/openagent/tauriClient.ts');
        const config=await c.invokeProduct('get_settings',{});config.theme='${theme}';config.language='${language}';
        await c.invokeProduct('save_settings',{config});await emit('settings-changed');
        const {applyDocumentTheme}=await import('/src/lib/appTheme.ts');
        const {setLocale}=await import('/src/lib/i18n.ts');applyDocumentTheme('${theme}');setLocale('${language}');`);
      for (const section of ["general", "defaults", "agents", "execution", "memory", "skills"]) {
        await open(section);
        if (section === "memory") {
          await until("document.querySelector('.memory-editor:not(:disabled)')");
          if (theme === "light" && language === "zh") scenario("memory-management.toml");
          pilot(["fill", ".memory-search", ""]);
          await until("document.querySelector('.memory-agent-list[aria-busy=false]')");
        }
        if (section === "skills") {
          await until("document.querySelector('[data-skill-path]')");
          pilot(["fill", ".skill-search input", "copy-fixture"]);
          pilot(["click", "[data-skill-path]"]);
          await until(
            "document.querySelector('[data-skill-content]')?.textContent.includes('Useful skill instructions.')",
          );
          pilot(["click", "[data-value=skills] .list-footer button"]);
          await until(
            "!document.querySelector('[data-skills-list] [aria-busy]') && document.querySelector('[data-skill-content]')?.textContent.includes('Useful skill instructions.')",
          );
        }
        evaluate(
          `window.__copyProbe={section:'${section}',language:'${language}',theme:'${theme}'};true`,
        );
        scenario("settings-copy.toml");
        const screenshot = join(artifacts, `${section}-${theme}-${language}.png`);
        if (targetWindow === "main") captureBlackboxScreenshot(pilot, screenshot);
        else pilot(["screenshot", screenshot]);
      }
    }
  }
  // With no workspace, the disabled Project editor still explains its state.
  evaluate("document.querySelector('.fullscreen-surface-close')?.click();true");
  await operation(`const {desktopOpenAgent:c,invoke}=await import('/src/lib/openagent/tauriClient.ts');
    await c.invokeProduct('set_workspace',{path:null});
    await invoke('open_settings_window',{kind:'memory',section:'memory'});`);
  targetWindow = "settings-memory";
  await until("document.querySelector('.memory-scope-options:not(:disabled)')");
  pilot(["click", ".memory-scope-options [data-filter=local]"]);
  await until(
    "document.querySelector('.memory-editor:disabled') && document.querySelector('.memory-scope-control [role=status]')",
  );
  pilot(["click", ".memory-scope-options [data-filter=global]"]);
  await until("document.querySelector('.memory-editor:not(:disabled)')");
  pilot(["logs", "--level", "error"]);
  console.log(
    `Settings copy native acceptance passed: 6 surfaces, 4 appearances, editing/save, scope and skill refresh. Artifacts: ${artifacts}`,
  );
} finally {
  if (targetWindow !== "main") {
    evaluate(
      `window.__TAURI_INTERNALS__.invoke('plugin:window|hide',{label:${JSON.stringify(targetWindow)}});true`,
    );
    targetWindow = "main";
  }
  evaluate("document.querySelector('.fullscreen-surface-close')?.click();true");
  await operation(`const {desktopOpenAgent:c,emit}=await import('/src/lib/openagent/tauriClient.ts');
    await c.invokeProduct('set_workspace',{path:window.__copyWorkspace.path ?? null});
    await c.invokeProduct('save_settings',{config:window.__copyOriginal});await emit('settings-changed');`);
}

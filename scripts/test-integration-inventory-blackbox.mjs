// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { captureBlackboxScreenshot } from "./blackbox-screenshot.mjs";
import { resolveBlackboxHome } from "./tauri-test-environment.mjs";

const root = resolve(import.meta.dirname, "..");
const home = resolveBlackboxHome(process.env, { instanceName: "integration-provenance" });
assert(
  process.env.TAURI_PILOT_SOCKET && home.includes("integration-provenance"),
  "Use an isolated integration-provenance home and its explicit Pilot socket",
);
const artifacts = mkdtempSync(join(tmpdir(), "openagent-integration-inventory-"));
const workspace = join(artifacts, "workspace");
const localSkill = join(workspace, ".agents", "skills", "inventory-local");
mkdirSync(localSkill, { recursive: true });
const localContent =
  "---\nname: inventory-local\ndescription: Workspace inventory fixture\n---\n\nLocal skill instructions.\n";
writeFileSync(join(localSkill, "SKILL.md"), localContent);
const ids = ["inventory-one", "inventory-two"];
for (const id of ids) {
  const source = join(artifacts, id);
  mkdirSync(join(source, "skills", "inventory-skill"), { recursive: true });
  writeFileSync(
    join(source, "skills", "inventory-skill", "SKILL.md"),
    "---\nname: inventory-skill\ndescription: Plugin inventory fixture\n---\n\nPlugin skill instructions.\n",
  );
  writeFileSync(
    join(source, "plugin.json"),
    JSON.stringify({
      name: id,
      version: "1.0.0",
      description: "Inventory fixture",
      skills: "skills",
      extensions: {
        openagent: {
          type: "integration",
          compatibility: { plugin_protocol: { min: 1, max: 1 }, features: ["integration-v1"] },
          i18n: {
            supported_locales: ["en", "zh"],
            default_locale: "en",
            translations: {
              en: { display_name: `${id} plugin`, description: "Inventory fixture" },
              zh: { display_name: `${id} 插件`, description: "集成清单测试" },
            },
          },
        },
      },
    }),
  );
  writeFileSync(
    join(source, "mcp.json"),
    JSON.stringify({
      $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
      mcpServers: {
        shared: { type: "streamable-http", url: "http://127.0.0.1:9/mcp" },
      },
    }),
  );
}

/** @param {string[]} args @param {string} [window] */
function pilot(args, window = "main") {
  if (["click", "fill"].includes(args[0])) pilot(["snapshot", "-i"], window);
  const result = spawnSync("tauri-pilot", [...args, "--window", window], {
    cwd: artifacts,
    env: process.env,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}
/** @param {string} script @param {string} [window] */
const evaluate = (script, window = "main") => pilot(["eval", script], window);
/** @param {string} expression @param {string} [window] */
async function until(expression, window = "main") {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (evaluate(`Boolean(${expression})`, window).includes("true")) return;
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error(`Native assertion timed out: ${expression}`);
}
/** @param {string} script @param {string} [window] */
async function operation(script, window = "main") {
  evaluate(
    `window.__inventoryDone=false; window.__inventoryError=null;
    (async()=>{try{window.__inventoryResult=await(async()=>{${script}})();}
    catch(e){window.__inventoryError=String(e);}finally{window.__inventoryDone=true;}})(); true`,
    window,
  );
  await until("window.__inventoryDone", window);
  assert.equal(
    evaluate("Boolean(window.__inventoryError)", window),
    "false",
    evaluate("window.__inventoryError", window),
  );
}
const close = () => evaluate("document.querySelector('.fullscreen-surface-close')?.click(); true");
/** @param {"channels" | "extensions" | "skills" | "plugins"} section */
async function open(section) {
  close();
  pilot(["snapshot", "-i"]);
  const label = {
    channels: "/Channels|通道/",
    extensions: "/MCP/",
    skills: "/Skills|技能/",
    plugins: "/Plugins|插件/",
  }[section];
  await operation(`for(let attempt=0;attempt<20;attempt++){
    const trigger=document.querySelector('#application-integrations-menu');
    if(trigger.getAttribute('aria-expanded')!=='true')trigger.click();
    await new Promise(r=>setTimeout(r,100));
    const item=[...document.querySelectorAll('[role=menuitem]')].find(item=>${label}.test(item.textContent));
    if(item){item.click();return true;}
  } throw new Error('Integration menu did not expose ${section}');`);
  await until(`document.querySelector('[data-value="${section}"][data-state="active"]')`);
}
/** Verify the actual Explorer destination, then close only this fixture's window. @param {string} directory */
function assertExplorer(directory) {
  if (process.platform !== "win32") return;
  const shellDirectory = directory.startsWith("\\\\?\\UNC\\")
    ? `\\\\${directory.slice(8)}`
    : directory.replace(/^\\\\\?\\/, "");
  const result = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `
    $shell = New-Object -ComObject Shell.Application
    $deadline = (Get-Date).AddSeconds(10)
    do {
      foreach ($window in @($shell.Windows())) {
        try { if ($window.Document.Folder.Self.Path -eq $env:INVENTORY_DIRECTORY) { $window.Quit(); exit 0 } } catch {}
      }
      Start-Sleep -Milliseconds 200
    } while ((Get-Date) -lt $deadline)
    throw 'Explorer did not open the exact skill directory'
  `,
    ],
    {
      env: { ...process.env, INVENTORY_DIRECTORY: shellDirectory },
      encoding: "utf8",
      windowsHide: true,
    },
  );
  assert.equal(result.status, 0, result.stderr);
}

pilot(["ping"]);
pilot(["wait", "--selector", "#application-integrations-menu", "--timeout", "30000"]);
/** @type {string[]} */ const installed = [];
try {
  await operation(`const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');
    window.__inventoryOriginal=await c.invokeProduct('get_settings',{});
    window.__inventoryWorkspace=await c.invokeProduct('get_workspace_context',{});
    if((await c.listAgentPlugins()).some(p=>${JSON.stringify(ids)}.includes(p.id)))throw new Error('Fixture already installed');
    await c.invokeProduct('set_workspace',{path:${JSON.stringify(workspace)}}); return true;`);
  for (const id of ids) {
    await operation(`const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');
      const plugin=await c.installAgentPlugin(${JSON.stringify(join(artifacts, id))});
      if(plugin.error || plugin.mcp_servers.length!==1 || plugin.skills.length!==1)throw new Error(JSON.stringify(plugin)); return true;`);
    installed.push(id);
  }
  for (const theme of ["light", "dark"])
    for (const language of ["en", "zh"]) {
      close();
      await operation(`const {desktopOpenAgent:c,emit}=await import('/src/lib/openagent/tauriClient.ts');
      const config=await c.invokeProduct('get_settings',{}); config.theme='${theme}'; config.language='${language}';
      config.agent_plugins_enabled={...config.agent_plugins_enabled,'inventory-one':true,'inventory-two':true};
      await c.invokeProduct('save_settings',{config}); await emit('settings-changed'); await emit('agent-plugins-changed');
      const {applyDocumentTheme}=await import('/src/lib/appTheme.ts'); const {setLocale}=await import('/src/lib/i18n.ts');
      applyDocumentTheme('${theme}'); setLocale('${language}'); return true;`);
      await operation(`const {getCurrentWindow}=await import('/node_modules/@tauri-apps/api/window.js');
      await getCurrentWindow().show(); await getCurrentWindow().setFocus();
      await new Promise(r=>setTimeout(r,500)); return true;`);
      pilot(["run", join(root, "tests/blackbox/integration-shortcuts.toml")]);
      await open("channels");
      await until("document.querySelector('[data-integration-plugin=inventory-one]')");
      pilot(["click", "[data-integration-plugin=inventory-one]"]);
      pilot(["click", "[data-plugin-source=inventory-one] button"]);
      await until("document.querySelector('[data-plugin-id=inventory-one] [data-state=open]')");
      assert(
        evaluate(
          "document.querySelector('[data-plugin-skills=inventory-one]').textContent",
        ).includes("Plugin inventory fixture"),
      );

      await open("extensions");
      await until("document.querySelectorAll('[data-plugin-mcp]').length===2");
      pilot(["click", '[data-plugin-mcp="plugin:inventory-one:shared"]']);
      await until(
        "document.querySelector('[data-plugin-mcp-detail=\"plugin:inventory-one:shared\"] [data-plugin-source=inventory-one]')",
      );
      captureBlackboxScreenshot(pilot, join(artifacts, `${theme}-${language}-mcp.png`));
      pilot(["click", '[data-plugin-mcp="plugin:inventory-two:shared"]']);
      pilot(["click", "[data-plugin-source=inventory-two] button"]);
      await until("document.querySelector('[data-plugin-id=inventory-two] [data-state=open]')");

      await open("skills");
      await until(
        "[...document.querySelectorAll('[data-skill-path]')].some(e=>e.textContent.includes('inventory-local'))",
      );
      const rows = JSON.parse(
        evaluate(
          "JSON.stringify([...document.querySelectorAll('[data-skill-path]')].filter(e=>e.textContent.includes('inventory-skill')).map(e=>e.dataset.skillPath))",
        ),
      );
      const pluginPaths = typeof rows === "string" ? JSON.parse(rows) : rows;
      assert.equal(
        pluginPaths.length,
        2,
        "same-named skills from different plugins stay independent",
      );
      pilot(["fill", ".skill-search input", "inventory-local"]);
      pilot(["click", "[data-skill-path]"]);
      await until(
        `document.querySelector('[data-skill-content]')?.textContent===${JSON.stringify(localContent)}`,
      );
      pilot(["snapshot", "-i"]);
      evaluate(
        `window.__inventoryProbe=${JSON.stringify({ source: language === "en" ? "Workspace skill" : "工作区 Skill", globalSource: language === "en" ? "Global skill" : "全局 Skill", directory: localSkill, open: language === "en" ? "Open local directory" : "打开本地目录" })}; true`,
      );
      // A home workspace discovers one directory in two scopes. Project that
      // overlap using only fixture files, without writing global user skills.
      await operation(`const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');
        window.__inventoryInvokeProduct=c.invokeProduct;
        c.invokeProduct=async function(command,args){
          const result=await window.__inventoryInvokeProduct.call(this,command,args);
          if(command!=='list_skills')return result;
          const local=result.find(skill=>skill.name==='inventory-local' && skill.scope==='local');
          if(!local)throw new Error('Local inventory fixture missing');
          return [...result,{...local,scope:'global'}];
        }; return true;`);
      try {
        pilot(["click", '[data-value="skills"] .list-footer button']);
        await until(
          `document.querySelectorAll('[data-skill-path]').length===2 && !document.querySelector('[data-skills-list] [aria-busy]') && document.querySelector('[data-skill-content]')?.textContent===${JSON.stringify(localContent)}`,
        );
        pilot(["run", join(root, "tests/blackbox/integration-inventory.toml")]);
        for (const scope of ["global", "local", "plugin", "all"]) {
          pilot(["click", "#skill-scope-filter"]);
          pilot(["click", `[role=option][data-value=${scope}]`]);
          const count = scope === "all" ? 2 : scope === "plugin" ? 0 : 1;
          await until(`document.querySelectorAll('[data-skill-path]').length===${count}`);
          assert.equal(
            evaluate(`Boolean(document.querySelector('[data-skill-detail]'))`),
            String(count > 0),
          );
          if (scope === "global" || scope === "local")
            assert.equal(
              evaluate(`document.querySelector('[data-skill-path].active')?.dataset.skillScope`),
              scope,
            );
        }
        pilot(["click", "[data-skill-scope=local]"]);
      } finally {
        await operation(`const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');
          c.invokeProduct=window.__inventoryInvokeProduct; return true;`);
      }
      captureBlackboxScreenshot(pilot, join(artifacts, `${theme}-${language}-skills.png`));
      pilot(["click", "[data-open-skill-directory] button"]);
      assertExplorer(localSkill);
      renameSync(localSkill, `${localSkill}-missing`);
      try {
        pilot(["click", "[data-open-skill-directory] button"]);
        await until("document.querySelector('[data-skill-detail] [role=alert]')");
      } finally {
        renameSync(`${localSkill}-missing`, localSkill);
      }
      pilot(["click", '[data-value="skills"] .list-footer button']);
      await until(
        "document.querySelector('[data-skill-content]')?.textContent.includes('Local skill instructions.') && !document.querySelector('[data-skill-detail] [role=alert]')",
      );
      pilot(["fill", ".skill-search input", "plugin:inventory-one"]);
      pilot(["click", "[data-skill-path]"]);
      await until(
        "document.querySelector('[data-skill-content]')?.textContent.includes('Plugin skill instructions.')",
      );
      pilot(["click", "#skill-scope-filter"]);
      pilot(["click", "[role=option][data-value=plugin]"]);
      assert.equal(
        evaluate("document.querySelector('.skill-item-description')?.textContent"),
        "Plugin inventory fixture",
      );
      const displayedPath = evaluate("document.querySelector('.skill-path')?.textContent");
      assert(
        !displayedPath.startsWith("\\\\?\\"),
        "Visible plugin skill path must omit Windows namespace syntax",
      );
      pilot(["fill", ".skill-search input", "no-such-inventory-skill"]);
      await until(
        "!document.querySelector('[data-skill-detail]') && !document.querySelector('[data-skill-path]')",
      );
      pilot(["fill", ".skill-search input", "plugin:inventory-one"]);
      await until(
        "document.querySelector('[data-skill-content]')?.textContent.includes('Plugin skill instructions.')",
      );
      captureBlackboxScreenshot(pilot, join(artifacts, `${theme}-${language}-plugin-skills.png`));
      const skillPath = JSON.parse(
        evaluate(
          "JSON.stringify(document.querySelector('[data-skill-detail]').dataset.skillDetail)",
        ),
      );
      const exactPath = typeof skillPath === "string" ? skillPath : String(skillPath);
      pilot(["click", "[data-open-skill-directory] button"]);
      assertExplorer(exactPath);
      pilot(["click", "[data-plugin-source=inventory-one] button"]);
      await until("document.querySelector('[data-plugin-id=inventory-one] [data-state=open]')");
      pilot(["click", "[data-plugin-id=inventory-one] .plugin-accordion-actions [role=switch]"]);
      await operation(`const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');
      for(let i=0;i<100;i++){if((await c.invokeProduct('get_settings',{})).agent_plugins_enabled?.['inventory-one']===false)return true; await new Promise(r=>setTimeout(r,100));}
      throw new Error('Plugin disablement did not persist');`);
      await open("skills");
      await until(
        "document.querySelector('[data-skills-list]') && !document.querySelector('[data-skills-list] [aria-busy]')",
      );
      assert(
        !evaluate(
          "[...document.querySelectorAll('[data-skill-path]')].map(e=>e.textContent).join('|')",
        ).includes("plugin:inventory-one"),
      );
      console.log(`Verified integration inventory: ${theme}/${language}`);
    }
  await open("extensions");
  pilot(["click", '[data-plugin-mcp="plugin:inventory-one:shared"]']);
  await operation(`const {desktopOpenAgent:c,emit}=await import('/src/lib/openagent/tauriClient.ts');
    await c.uninstallAgentPlugin('inventory-one'); await emit('agent-plugins-changed'); return true;`);
  installed.splice(installed.indexOf("inventory-one"), 1);
  await until(
    "!document.querySelector('[data-plugin-mcp=\"plugin:inventory-one:shared\"]') && !document.querySelector('[data-plugin-mcp-detail=\"plugin:inventory-one:shared\"]')",
  );
  await open("skills");
  await operation(
    `const {invoke}=await import('/src/lib/openagent/tauriClient.ts'); await invoke('open_settings_window',{kind:'integrations',section:'skills'}); return true;`,
  );
  await until("document.querySelector('[data-skills-list]')", "settings-integrations");
  pilot(["snapshot", "-i"], "settings-integrations");
  captureBlackboxScreenshot(
    (args) => pilot(args, "settings-integrations"),
    join(artifacts, "standalone-skills.png"),
  );
  evaluate(
    "window.__TAURI_INTERNALS__.invoke('plugin:window|hide',{label:'settings-integrations'}); true",
    "settings-integrations",
  );
  console.log(`Integration inventory native acceptance passed; artifacts: ${artifacts}`);
} finally {
  close();
  for (const id of installed)
    await operation(
      `const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts'); await c.uninstallAgentPlugin('${id}'); return true;`,
    );
  await operation(`const {desktopOpenAgent:c,emit}=await import('/src/lib/openagent/tauriClient.ts');
    if(window.__inventoryOriginal)await c.invokeProduct('save_settings',{config:window.__inventoryOriginal});
    await c.invokeProduct('set_workspace',{path:window.__inventoryWorkspace?.path ?? null});
    await emit('settings-changed'); await emit('agent-plugins-changed'); return true;`);
}

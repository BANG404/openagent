// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { captureBlackboxScreenshot } from "./blackbox-screenshot.mjs";
import { themeCollection } from "./themes/collection";

assert(
  process.env.TAURI_PILOT_SOCKET && process.env.OPENAGENT_HOME?.includes("mermaid-theme"),
  "Select an isolated mermaid-theme home and explicit Pilot socket",
);
const root = resolve(import.meta.dirname, "..");
const modeFilter = process.argv.find((arg) => arg.startsWith("--mode="))?.slice(7);
const languageFilter = process.argv.find((arg) => arg.startsWith("--language="))?.slice(11);
const themeFilter = process.argv.find((arg) => arg.startsWith("--theme="))?.slice(8);
assert(modeFilter === undefined || ["light", "dark"].includes(modeFilter), "Invalid --mode");
assert(languageFilter === undefined || ["en", "zh"].includes(languageFilter), "Invalid --language");
const themes = ["", ...themeCollection.map(({ id }) => id)].filter(
  (id) => themeFilter === undefined || (id || "built-in") === themeFilter,
);
assert(themes.length, "Invalid --theme");
const modes = ["dark", "light"].filter((mode) => !modeFilter || mode === modeFilter);
const languages = ["en", "zh"].filter((language) => !languageFilter || language === languageFilter);
const artifacts = mkdtempSync(join(tmpdir(), "openagent-mermaid-themes-"));
const probe = readFileSync(join(root, "tests/fixtures/mermaid-theme-probe.js"), "utf8");
const html = readFileSync(join(root, "plugins/mermaid/ui/app.html"), "utf8").replace(
  "</body>",
  `<script>${probe}</script>${readFileSync(join(root, "tests/fixtures/mcp-ui-probe.html"), "utf8")}</body>`,
);
const server = createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/html", "access-control-allow-origin": "*" });
  response.end(html);
});
await new Promise((done) => server.listen(0, "127.0.0.1", () => done(undefined)));
const address = server.address();
assert(address && typeof address !== "string");
/** @param {string[]} args */
function pilot(args) {
  const result = spawnSync("tauri-pilot", [...args, "--window", "main"], {
    cwd: artifacts,
    env: process.env,
    encoding: "utf8",
    windowsHide: true,
    timeout: 60000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  return result.stdout.trim();
}
/** @param {string} script */
const evaluate = (script) => pilot(["eval", script]);
/** @param {string} expression */
async function until(expression) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (evaluate(`Boolean(${expression})`) === "true") return;
    await new Promise((done) => setTimeout(done, 100));
  }
  throw Error(`Mermaid theme assertion timed out: ${expression}`);
}
/** @param {string} script */
async function operation(script) {
  evaluate(
    `window.__themeTask={done:false};(async()=>{try{${script}}catch(error){window.__themeTask.error=String(error)}finally{window.__themeTask.done=true}})();true`,
  );
  await until("window.__themeTask?.done");
  assert.equal(evaluate("window.__themeTask.error ?? ''"), "");
}
/** @param {string} action @param {unknown} [value] @returns {Promise<any>} */
async function widget(action, value) {
  const id = crypto.randomUUID();
  evaluate(
    `window.__themeWidget=null;document.querySelector('#mermaid-theme-fixture iframe').contentWindow.postMessage(${JSON.stringify({ type: "mcp-test-request", id, action, value })},'*');true`,
  );
  await until(`window.__themeWidget?.id===${JSON.stringify(id)}`);
  const reply = JSON.parse(evaluate("JSON.stringify(window.__themeWidget)"));
  assert(!reply.error, reply.error);
  return reply.result;
}
const diagrams = {
  flowchart: "flowchart LR\nsubgraph Group\nStart -->|next|Done\nend",
  sequence:
    "sequenceDiagram\nparticipant A as Alice\nparticipant B as Bob\nA->>B: Hello\nNote over A,B: Note\nB-->>A: Reply",
  class: "classDiagram\nclass Account {\n+String name\n+save()\n}\nAccount --> User : owns",
  state: "stateDiagram-v2\n[*] --> Ready\nReady --> Done : finish\nDone --> [*]",
  er: "erDiagram\nUSER ||--o{ ORDER : places\nUSER {\nstring name\nint age\n}\nORDER {\nint id\nstring name\n}",
  gantt:
    "gantt\ntitle Schedule\ndateFormat YYYY-MM-DD\nsection Plan\nTask :a1, 2026-01-01, 3d\nsection Build\nNext :a2, after a1, 2d",
};
/** @type {string[]} */
const installed = [];
/** @type {Array<Record<string, any>>} */
const results = [];
pilot(["ping"]);
const originalUrl = pilot(["url"]);
let original;
try {
  // Optional dependency optimization may reload Vite once; finish it before saving fixtures.
  await operation(
    `await import('/src/lib/devFixtures/MermaidThemes.svelte');await(await import('/src/lib/streamdown/mermaidRenderer.ts')).loadMermaid();`,
  );
  await operation(
    `const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');window.__themeSettings=await c.invokeProduct('get_settings',{});`,
  );
  original = JSON.parse(evaluate("JSON.stringify(window.__themeSettings)"));
  for (const { id } of themeCollection) {
    await operation(
      `const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');if((await c.listAgentPlugins()).some(p=>p.id===${JSON.stringify(id)}))throw Error('Theme already installed');await c.installAgentPlugin(${JSON.stringify(join(root, "plugins", id))});`,
    );
    installed.push(id);
  }
  await operation(`const {mount}=await import('/node_modules/.vite/deps/svelte.js');const {default:Fixture}=await import('/src/lib/devFixtures/MermaidThemes.svelte');const target=document.createElement('div');target.id='mermaid-theme-target';document.body.append(target);window.__themeMount=mount(Fixture,{target,props:{html:await(await fetch('http://127.0.0.1:${address.port}/')).text()}});${probe}
    window.__themeMessage=e=>{if(e.source!==document.querySelector('#mermaid-theme-fixture iframe')?.contentWindow)return;if(e.data?.type==='mcp-test-response')window.__themeWidget=e.data;if(e.data?.method==='ui/update-model-context')window.__themeStatus=e.data.params?.structuredContent?.mermaid;};window.addEventListener('message',window.__themeMessage);`);
  await until(
    "window.__themeStatus?.status==='ready' && document.querySelectorAll('#mermaid-theme-fixture [data-mermaid-svg]>svg').length===3",
  );
  const frame = evaluate(
    "document.querySelector('#mermaid-theme-fixture iframe').dataset.themeIdentity='stable';true",
  );
  assert.equal(frame, "true");
  pilot(["snapshot", "-i"]);
  pilot(["run", join(root, "tests/blackbox/mermaid-themes.toml")]);
  for (const mode of modes)
    for (const language of languages)
      for (const id of themes) {
        await operation(
          `const {desktopOpenAgent:c,emit}=await import('/src/lib/openagent/tauriClient.ts');const config=await c.invokeProduct('get_settings',{});Object.assign(config,{theme:${JSON.stringify(mode)},language:${JSON.stringify(language)},theme_plugin:${JSON.stringify(id)},theme_overrides:{light:{},dark:{},font_family:''}});for(const id of ${JSON.stringify(installed)})config.agent_plugins_enabled[id]=true;await c.invokeProduct('save_settings',{config});await emit('settings-changed');await emit('agent-plugins-changed');`,
        );
        await until(`document.documentElement.classList.contains('dark')===${mode === "dark"}`);
        for (const [diagram, source] of Object.entries(diagrams)) {
          evaluate(
            `window.__themeStatus=null;window.__previousSvgs=[...document.querySelectorAll('#mermaid-theme-fixture [data-mermaid-svg]>svg')];window.dispatchEvent(new CustomEvent('mermaid-theme-source',{detail:${JSON.stringify(source)}}));true`,
          );
          await until(
            `window.__themeStatus?.status==='ready' && window.__themeStatus?.source===${JSON.stringify(source)} && document.querySelectorAll('#mermaid-theme-fixture [data-mermaid-svg]>svg').length===3 && [...document.querySelectorAll('#mermaid-theme-fixture [data-mermaid-svg]>svg')].every(s=>!window.__previousSvgs.includes(s))`,
          );
          // The host's render debounce follows the widget; sample after both settle.
          await new Promise((done) => setTimeout(done, 300));
          const host = JSON.parse(
            evaluate(
              "JSON.stringify([...document.querySelectorAll('#mermaid-theme-fixture [data-renderer]:not([data-renderer=plugin])')].map(e=>({renderer:e.dataset.renderer,...window.__inspectMermaidTheme(e)})))",
            ),
          );
          const app = await widget("inspect");
          writeFileSync(
            join(artifacts, "latest.json"),
            JSON.stringify({ id, mode, language, diagram, host, app }, null, 2),
          );
          assert.equal(app.dark, mode === "dark");
          assert.equal(app.language, language);
          assert.deepEqual(
            app.theme.bodyBackground,
            host[0].bodyBackground,
            "Plugin canvas did not follow the selected theme palette",
          );
          assert.equal(
            evaluate(
              "document.querySelector('#mermaid-theme-fixture iframe').dataset.themeIdentity",
            ),
            "stable",
            "Theme switching replaced the editor",
          );
          for (const rendered of [...host, { renderer: "plugin", ...app.theme }]) {
            assert(
              rendered.labels?.length,
              `${id}/${mode}/${language}/${diagram}/${rendered.renderer}: no labels`,
            );
            for (const label of rendered.labels)
              assert(
                label.contrast >= 4.5,
                `${id || "built-in"}/${mode}/${language}/${diagram}/${rendered.renderer}: ${label.text} contrast ${label.contrast.toFixed(2)}`,
              );
          }
          results.push({
            id: id || "built-in",
            mode,
            language,
            diagram,
            renderers: [...host, { renderer: "plugin", ...app.theme }],
          });
          if (diagram === "er") {
            captureBlackboxScreenshot(
              pilot,
              join(artifacts, `${id || "built-in"}-${mode}-${language}.png`),
            );
            evaluate("document.querySelector('#mermaid-theme-fixture').scrollTop=10000;true");
            captureBlackboxScreenshot(
              pilot,
              join(artifacts, `${id || "built-in"}-${mode}-${language}-plugin.png`),
            );
            evaluate("document.querySelector('#mermaid-theme-fixture').scrollTop=0;true");
          }
        }
        console.log(
          `Verified ${id || "built-in"}/${mode}/${language}: six diagrams, Markdown/AGUI/historical tool/MCP App`,
        );
      }
  // Palette changes must preserve edited source; unrelated context must preserve zoom.
  await widget("input", "flowchart LR\nLocalEdit --> Preserved");
  await widget("click", "render");
  await until(
    "window.__themeStatus?.source.includes('LocalEdit') && window.__themeStatus?.status==='ready'",
  );
  const editedSvg = (await widget("inspect")).theme.id;
  evaluate(
    "window.__themeStatus=null;document.documentElement.style.setProperty('--border','#64748b');true",
  );
  await until("window.__themeStatus?.status==='ready'");
  assert.notEqual(
    (await widget("inspect")).theme.id,
    editedSvg,
    "Live palette edit did not repaint the editor",
  );
  assert.equal((await widget("inspect")).source, "flowchart LR\nLocalEdit --> Preserved");
  await widget("input", "invalid Mermaid source");
  await widget("click", "render");
  await until("window.__themeStatus?.status==='failed'");
  await widget("input", diagrams.flowchart);
  await widget("click", "render");
  await until("window.__themeStatus?.status==='ready'");
  pilot(["logs", "--level", "error"]);
} finally {
  writeFileSync(join(artifacts, "results.json"), JSON.stringify(results, null, 2) + "\n");
  try {
    await operation(
      `const {unmount}=await import('/node_modules/.vite/deps/svelte.js');if(window.__themeMount)await unmount(window.__themeMount);document.querySelector('#mermaid-theme-target')?.remove();window.removeEventListener('message',window.__themeMessage);const {desktopOpenAgent:c,emit}=await import('/src/lib/openagent/tauriClient.ts');${original ? `await c.invokeProduct('save_settings',{config:${JSON.stringify(original)}});` : ""}for(const id of ${JSON.stringify(installed)})await c.uninstallAgentPlugin(id);await emit('settings-changed');await emit('agent-plugins-changed');`,
    );
  } finally {
    server.close();
    console.log(`Mermaid theme evidence: ${artifacts} (${results.length} combinations completed)`);
  }
}
assert.equal(
  results.length,
  themes.length * modes.length * languages.length * Object.keys(diagrams).length,
);
console.log(`Mermaid themes passed at ${originalUrl}`);

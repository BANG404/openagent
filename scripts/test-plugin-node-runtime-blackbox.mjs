// @ts-check
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { findAvailableLoopbackPort } from "./tauri-dev-port.mjs";
import { prepareNodeRuntime } from "./prepare-node-runtime.mjs";

if (process.platform !== "win32") throw new Error("This native fixture targets Windows");
const root = path.resolve(import.meta.dirname, "..");
const directory = await mkdtemp(path.join(os.tmpdir(), "openagent-plugin-node-"));
const home = path.join(directory, "data");
const workspace = path.join(directory, "workspace");
await mkdir(workspace);
await prepareNodeRuntime();
const port = await findAvailableLoopbackPort();
const environment = {
  ...process.env,
  OPENAGENT_HOME: home,
  OPENAGENT_DEV_MULTI_INSTANCE: "1",
  OPENAGENT_DEV_INSTANCE: "plugin-node-runtime",
  TAURI_PILOT_SOCKET: String.raw`\\.\pipe\tauri-pilot-com.iumm.openagent.dev.plugin-node-runtime`,
  BLACKBOX_ARTIFACT_DIR: path.join(directory, "artifacts"),
  CARGO_INCREMENTAL: "0",
};
delete environment.OPENAGENT_BOOTSTRAP_TEST;
delete environment.OPENAGENT_CUA_DRIVER_BIN;
// Retain ordinary native tools, but make the desktop's system Node lookup fail.
/** @type {NodeJS.ProcessEnv} */
const desktopEnvironment = { ...environment };
const pathKey =
  Object.keys(desktopEnvironment).find((key) => key.toLowerCase() === "path") ?? "PATH";
desktopEnvironment[pathKey] = (desktopEnvironment[pathKey] ?? "")
  .split(path.delimiter)
  .filter((entry) => !existsSync(path.join(entry, "node.exe")))
  .join(path.delimiter);
assert.notEqual(
  spawnSync("node", ["--version"], { env: desktopEnvironment, windowsHide: true }).status,
  0,
  "The fixture must not have system Node.js",
);
/** @type {string[]} */
const logs = [];
/** @param {string[]} args @param {NodeJS.ProcessEnv} env */
function start(args, env) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const stream of [child.stdout, child.stderr])
    stream?.on("data", (chunk) => {
      logs.push(String(chunk));
      process.stdout.write(String(chunk));
    });
  return child;
}
/** @param {string[]} args @param {string} [window] */
function pilot(args, window = "main") {
  const result = spawnSync("tauri-pilot", [...args, "--window", window], {
    cwd: directory,
    env: environment,
    windowsHide: true,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}
/** @param {string} script @param {number} [timeout] */
async function waitFor(script, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  const id = `${Date.now()}-${Math.random()}`;
  while (Date.now() < deadline) {
    // Keep long Runtime calls in the WebView. Pilot evaluations have a shorter
    // RPC budget than cold package provisioning and MCP refresh.
    if (
      pilot([
        "eval",
        `(() => {
      let probe=window.__pluginNodeWait;
      if(probe?.id!==${JSON.stringify(id)}) probe=window.__pluginNodeWait={id:${JSON.stringify(id)},pending:false,value:false};
      if(!probe.pending && probe.value!==true){
        probe.pending=true;
        Promise.resolve().then(()=>(${script})).then(value=>{probe.value=value;probe.pending=false;},error=>{probe.error=String(error);probe.pending=false;});
      }
      return probe.value===true;
    })()`,
      ]) === "true"
    )
      return;
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error(`Desktop assertion timed out: ${script}`);
}
/** Stop only process trees launched by this fixture, including Bun's Vite child.
 * @param {ReturnType<typeof start>} child
 */
function stop(child) {
  if (child.exitCode !== null || !child.pid) return;
  spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
}
const vite = start(["x", "vite", "--port", String(port), "--strictPort"], environment);
/** @type {ReturnType<typeof start> | undefined} */
let desktop;
try {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (
      await fetch(`http://localhost:${port}`)
        .then((response) => response.ok)
        .catch(() => false)
    )
      break;
    await new Promise((done) => setTimeout(done, 250));
  }
  desktop = start(
    [
      path.join(root, "node_modules/@tauri-apps/cli/tauri.js"),
      "dev",
      "--no-watch",
      "--config",
      JSON.stringify({ build: { beforeDevCommand: "", devUrl: `http://localhost:${port}` } }),
      "--",
      "--target-dir",
      path.join(root, "src-tauri/target"),
    ],
    desktopEnvironment,
  );
  const readyDeadline = Date.now() + 600_000;
  let ready = false;
  while (Date.now() < readyDeadline) {
    if (desktop.exitCode !== null) throw new Error(`Desktop exited: ${logs.join("").slice(-4000)}`);
    try {
      ready =
        pilot(["eval", "!!document.querySelector('#application-integrations-menu')"]) === "true";
      if (ready) break;
    } catch {
      /* Wait for this fixture's main WebView. */
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  assert(ready, "Fixture main window was not ready");
  pilot(["snapshot", "-i"]);
  pilot([
    "eval",
    `(async () => {
    const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');
    const config=await c.invokeProduct('get_settings',{});
    config.onboarding_completed=true; config.workspace=${JSON.stringify(workspace)};
    await c.invokeProduct('save_settings',{config});
    await window.__TAURI_INTERNALS__.invoke('plugin:window|hide',{label:'onboarding'}).catch(()=>{});
    return true;
  })()`,
  ]);
  for (const [theme, language] of [
    ["light", "en"],
    ["dark", "zh"],
    ["light", "zh"],
    ["dark", "en"],
  ]) {
    pilot(["snapshot", "-i"]);
    pilot(["eval", `document.querySelector('.fullscreen-surface-close')?.click(); true`]);
    await waitFor("!document.querySelector('.fullscreen-surface')");
    pilot([
      "eval",
      `window.dispatchEvent(new KeyboardEvent('keydown', {key:',', code:'Comma', ctrlKey:true, bubbles:true})); true`,
    ]);
    const general = '[role=tabpanel][data-value="general"]';
    await waitFor(`!!document.querySelector('${general} [data-appearance-mode] button')`);
    for (const [property, selector, value] of [
      ["theme", `${general} [data-appearance-mode] button`, theme],
      [
        "language",
        `${general} button[aria-label="Language"], ${general} button[aria-label="语言"]`,
        language,
      ],
    ]) {
      await waitFor(`!!document.querySelector(${JSON.stringify(selector)})`);
      pilot(["snapshot", "-i"]);
      pilot(["click", selector]);
      pilot(["snapshot", "-i"]);
      pilot(["click", `[role=option][data-value="${value}"]`]);
      await waitFor(`(async () => {
        const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');
        return (await c.invokeProduct('get_settings',{}))[${JSON.stringify(property)}] === ${JSON.stringify(value)};
      })()`);
    }
    pilot(["eval", `document.querySelector('.fullscreen-surface-close')?.click(); true`]);
    await waitFor("!document.querySelector('.fullscreen-surface')");
    await waitFor(
      `document.documentElement.classList.contains('${theme}') && document.querySelector('#application-integrations-menu')?.textContent.trim() === ${JSON.stringify(language === "zh" ? "集成" : "Integrations")}`,
    );
    pilot(["snapshot", "-i"]);
    pilot([
      "eval",
      `(async () => {
      document.querySelector('#application-integrations-menu').click();
      await new Promise(done => setTimeout(done, 0));
      [...document.querySelectorAll('[role=menuitem]')].find(item => /Plugins|插件/.test(item.textContent)).click();
      return true;
    })()`,
    ]);
    await waitFor("!!document.querySelector('.plugin-management-tabs button')");
    pilot(["eval", "document.querySelector('.plugin-management-tabs button').click(); true"]);
    await waitFor(
      "!!document.querySelector('.official-plugin-card[data-plugin-id=\"cua-driver\"]')",
    );
    if (theme === "light" && language === "en") {
      // Exercise the shared install UI with this checkout's package rather than
      // an older published archive. Installation still uses the real Runtime.
      pilot([
        "eval",
        `(async () => {
        window.__pluginLifecycleProbe = {ids:['cua-driver'], locale:'en'};
        const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');
        c.installOfficialAgentPlugin=async () => c.installAgentPlugin(${JSON.stringify(path.join(root, "plugins/cua-driver"))});
        return true;
      })()`,
      ]);
      pilot(["snapshot", "-i"]);
      pilot(["run", path.join(root, "tests/blackbox/plugin-install.toml")]);
      await waitFor(
        "!!document.querySelector('[data-plugin-host-access=\"cua-driver\"]')",
        180_000,
      );
      pilot(["snapshot", "-i"]);
      pilot(["run", path.join(root, "tests/blackbox/plugin-host-access-grant.toml")]);
      await waitFor("!document.querySelector('[data-plugin-host-access]')", 600_000);
    }
    await waitFor(`(async () => {
      const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');
      const config=await c.invokeProduct('get_settings',{});
      const plugins=await c.invokeProduct('list_agent_plugins',{});
      return !!config.agent_plugins_host_access?.['cua-driver'] && plugins.some(p=>p.id==='cua-driver' && p.enabled && !p.daemon && p.mcp_servers.length === 1 && p.mcp_servers[0].name === 'desktop' && p.mcp_servers[0].transport === 'stdio') && !config.mcp.servers.some(s=>s.id==='cua-driver');
    })()`);
    await waitFor(
      `(async () => {
      const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');
      try {
        const result=await c.invokeProduct('call_agent_plugin_tool',{plugin_id:'cua-driver',tool_name:'get_screen_size',arguments:{}});
        return !result.isError && result.structuredContent?.width > 0 && result.structuredContent?.height > 0;
      } catch {return false;}
    })()`,
      180_000,
    );
    pilot(["snapshot", "-i"]);
    pilot(["eval", "document.querySelectorAll('.plugin-management-tabs button')[1].click(); true"]);
    await waitFor("!!document.querySelector('#plugin-enable-cua-driver')");
    pilot(["snapshot", "-i"]);
    pilot(["click", "#plugin-enable-cua-driver"]);
    await waitFor(
      "document.querySelector('#plugin-enable-cua-driver')?.getAttribute('aria-checked') === 'false'",
    );
    await waitFor(`(async () => {
      const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');
      const config=await c.invokeProduct('get_settings',{});
      if (config.agent_plugins_enabled?.['cua-driver'] !== false) return false;
      try { await c.invokeProduct('call_agent_plugin_tool',{plugin_id:'cua-driver',tool_name:'get_screen_size',arguments:{}}); return false; }
      catch { return true; }
    })()`);
    pilot(["snapshot", "-i"]);
    pilot(["click", "#plugin-enable-cua-driver"]);
    await waitFor(
      "document.querySelector('#plugin-enable-cua-driver')?.getAttribute('aria-checked') === 'true'",
    );
    await waitFor(`(async () => {
      const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');
      return (await c.invokeProduct('get_settings',{})).agent_plugins_enabled?.['cua-driver'] === true;
    })()`);
    await waitFor(
      `(async () => {
      const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');
      try {
        const result=await c.invokeProduct('call_agent_plugin_tool',{plugin_id:'cua-driver',tool_name:'get_screen_size',arguments:{}});
        return !result.isError && result.structuredContent?.width > 0;
      } catch {return false;}
    })()`,
      60_000,
    );
    pilot(["snapshot", "-i"]);
    pilot(["screenshot", path.join(directory, `${theme}-${language}.png`)]);
    pilot(["eval", "document.querySelector('.fullscreen-surface-close')?.click(); true"]);
    await waitFor("!document.querySelector('.fullscreen-surface')");
    pilot(["snapshot", "-i"]);
    pilot([
      "eval",
      `(async () => {
      document.querySelector('#application-integrations-menu').click();
      await new Promise(done => setTimeout(done, 0));
      [...document.querySelectorAll('[role=menuitem]')].find(item => /MCP/.test(item.textContent)).click();
      return true;
    })()`,
    ]);
    await waitFor("!!document.querySelector('[data-plugin-mcp=\"plugin:cua-driver:desktop\"]')");
    pilot(["snapshot", "-i"]);
    pilot(["click", '[data-plugin-mcp="plugin:cua-driver:desktop"]']);
    await waitFor(
      "!!document.querySelector('[data-plugin-mcp-detail=\"plugin:cua-driver:desktop\"] [data-plugin-setup=cua-driver]') && !document.querySelector('.mcp-form-section')",
    );
    pilot(["snapshot", "-i"]);
    pilot(["screenshot", path.join(directory, `${theme}-${language}-mcp.png`)]);
  }
  const records = logs.join("");
  assert(!records.includes("command 'node' not found"), "No interpreter lookup failure is allowed");
  await writeFile(
    path.join(directory, "webview-errors.json"),
    pilot(["logs", "--level", "error", "--json"]),
  );
  console.log(`Plugin Node.js native black-box passed; fixture and artifacts: ${directory}`);
} catch (error) {
  try {
    await writeFile(path.join(directory, "failure-snapshot.txt"), pilot(["snapshot", "-i"]));
    pilot(["screenshot", path.join(directory, "failure.png")]);
    await writeFile(
      path.join(directory, "webview-errors.json"),
      pilot(["logs", "--level", "error", "--json"]),
    );
  } catch {
    /* Preserve the original failure if the window already exited. */
  }
  console.error(`Native fixture failed; artifacts: ${directory}`);
  throw error;
} finally {
  if (desktop && desktop.exitCode === null) {
    try {
      pilot(["eval", "window.__TAURI_INTERNALS__.invoke('quit_app').then(()=>true)"]);
    } catch {
      /* Fallback below owns this fixture only. */
    }
    await new Promise((done) => setTimeout(done, 1000));
    stop(desktop);
  }
  stop(vite);
  await writeFile(path.join(directory, "desktop.log"), logs.join(""));
}

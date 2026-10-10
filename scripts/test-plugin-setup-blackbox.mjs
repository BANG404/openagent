// @ts-check
import assert from "node:assert/strict";
import { spawn as spawnBun } from "bun";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBlackboxHome } from "./tauri-test-environment.mjs";
import { startMockProvider } from "../tests/fixtures/plugin-setup/mock-provider.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const home = resolveBlackboxHome(process.env);
if (!process.env.TAURI_PILOT_SOCKET || !home.includes("plugin-setup"))
  throw new Error("Use an isolated plugin-setup home and its explicit TAURI_PILOT_SOCKET");
const artifacts =
  process.env.BLACKBOX_ARTIFACT_DIR || mkdtempSync(join(tmpdir(), "oa-plugin-setup-"));
mkdirSync(artifacts, { recursive: true });
const fixture = join(artifacts, "package");
mkdirSync(fixture);
const provider = await startMockProvider();
const fields = [
  { key: "token", label: "Service token", type: "string", required: true, secret: true },
  { key: "port", label: "Port", type: "integer", default: 8787, minimum: 1, maximum: 65535 },
  { key: "active", label: "Active", type: "boolean", default: false },
  { key: "region", label: "Region", type: "enum", options: ["us", "eu"], default: "us" },
];
writeFileSync(
  join(fixture, "plugin.json"),
  JSON.stringify({
    $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    name: "setup-fixture",
    version: "1.0.0",
    extensions: {
      openagent: {
        compatibility: {
          plugin_protocol: { min: 1, max: 1 },
          features: ["configuration-v1", "plugin-oauth-v1"],
        },
        configuration: { version: 1, fields },
        i18n: {
          supported_locales: ["en", "zh"],
          default_locale: "en",
          translations: {
            en: {
              display_name: "Setup fixture",
              ...Object.fromEntries(
                fields.map((field) => [`configuration.${field.key}.label`, field.label]),
              ),
            },
            zh: {
              display_name: "配置验证",
              "configuration.token.label": "服务令牌",
              "configuration.port.label": "端口",
              "configuration.active.label": "启用",
              "configuration.region.label": "服务区域",
            },
          },
        },
      },
    },
  }),
);
writeFileSync(
  join(fixture, "mcp.json"),
  JSON.stringify({
    $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
    mcpServers: { primary: { type: "streamable-http", url: provider.base + "/mcp" } },
  }),
);
/** Async CLI calls let the local provider answer WebView requests. @param {string[]} args */
async function pilot(args) {
  const child = spawnBun(["tauri-pilot", ...args, "--window", "main"], {
    cwd: artifacts,
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [output, error, status] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (status) throw new Error(error || output);
  return output.trim();
}
/** @param {string} script */ const evaluate = (script) => pilot(["eval", script]);
/** @param {string} script */
async function operation(script) {
  await evaluate(
    `window.__setupResult=null; window.__setupDone=false; window.__setupError=null; (async()=>{try{const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts'); window.__setupResult=await (${script});}catch(e){window.__setupError=String(e)}finally{window.__setupDone=true}})(); true`,
  );
  for (let attempt = 0; attempt < 120; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const result = JSON.parse(
      await evaluate(
        "JSON.stringify({done:window.__setupDone,error:window.__setupError,result:window.__setupResult})",
      ),
    );
    const value = typeof result === "string" ? JSON.parse(result) : result;
    if (value.done) {
      if (value.error) throw new Error(value.error);
      return value.result;
    }
  }
  throw new Error("Native product operation timed out");
}
const form = '[data-plugin-setup="setup-fixture"]';
/** @param {string} expression */
async function waitExpression(expression) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if ((await evaluate(`Boolean(${expression})`)).includes("true")) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("Native assertion timed out: " + expression);
}
async function close() {
  await evaluate(
    `document.querySelector('[role=dialog] button[aria-label="Close"], [role=dialog] button[aria-label="关闭"]')?.click(); true`,
  );
}
async function open() {
  await pilot(["snapshot", "-i"]);
  await evaluate(
    `(async()=>{document.querySelector('#application-integrations-menu').click();await new Promise(r=>setTimeout(r,0));[...document.querySelectorAll('[role=menuitem]')].find(x=>/Plugins|插件/.test(x.textContent)).click();return true})()`,
  );
  await pilot(["wait", "--selector", ".plugin-management-tabs", "--timeout", "20000"]);
  await pilot(["click", ".plugin-management-tabs button:nth-of-type(2)"]);
  await pilot([
    "wait",
    "--selector",
    '[data-plugin-id="setup-fixture"] .plugin-accordion-trigger',
    "--timeout",
    "20000",
  ]);
  await pilot(["click", '[data-plugin-id="setup-fixture"] .plugin-accordion-trigger']);
  await pilot(["wait", "--selector", form + " [data-config-field]", "--timeout", "20000"]);
}
try {
  await pilot(["ping"]);
  await close();
  await operation(
    `c.invokeProduct('set_workspace',{path:${JSON.stringify(join(home, "workspace"))}})`,
  );
  await operation(
    `(async()=>{const config=await c.invokeProduct('get_settings',{}); config.permission_profile={enforcement:'managed',network:'enabled',file_system:{entries:[{path:{kind:'host_root'},access:'read'},{path:{kind:'workspace'},access:'write'}]}}; await c.invokeProduct('save_settings',{config});return true})()`,
  );
  await operation(
    "(async()=>{const plugins=await c.invokeProduct('list_agent_plugins',{});if(plugins.some(plugin=>plugin.id==='setup-fixture'))await c.invokeProduct('uninstall_agent_plugin',{id:'setup-fixture'});return true})()",
  );
  await operation(`c.invokeProduct('install_agent_plugin',{source:${JSON.stringify(fixture)}})`);
  // Uninstall preserves authorization; each fixture has a fresh loopback provider.
  await operation(
    "c.invokeProduct('revoke_agent_plugin_oauth',{plugin_id:'setup-fixture',server_name:'primary'})",
  );
  for (const theme of ["light", "dark"])
    for (const language of ["en", "zh"]) {
      await operation(
        `(async()=>{const config=await c.invokeProduct('get_settings',{});config.theme='${theme}';config.language='${language}';await c.invokeProduct('save_settings',{config});const {emit}=await import('/src/lib/openagent/tauriClient.ts');await emit('settings-changed');const {getCurrentWindow}=await import('/node_modules/@tauri-apps/api/window.js');await getCurrentWindow().setTheme('${theme}');const {applyDocumentTheme}=await import('/src/lib/appTheme.ts');const {setLocale}=await import('/src/lib/i18n.ts');applyDocumentTheme('${theme}');setLocale('${language}');return true})()`,
      );
      await open();
      await pilot(["snapshot", "-i"]);
      await pilot(["run", join(root, "tests/blackbox/plugin-setup.toml")]);
      assert(
        (
          await evaluate(
            `document.querySelector('${form} [data-config-field="token"] label').textContent.includes('${language === "zh" ? "服务令牌" : "Service token"}')`,
          )
        ).includes("true"),
      );
      await pilot(["fill", form + " input[type=password]", "disposable-fixture-token"]);
      await pilot(["fill", form + " input[type=number]", "9001"]);
      if (
        (
          await evaluate(
            `document.querySelector('${form} [role=switch]').getAttribute('aria-checked')`,
          )
        ).includes("false")
      )
        await pilot(["click", form + ' [data-config-field="active"] [role="switch"]']);
      await pilot(["click", form + ' [data-config-field="region"] button']);
      await pilot(["wait", "--selector", '[role="option"]', "--timeout", "5000"]);
      await pilot(["click", '[role="option"][data-value="eu"]']);
      await waitExpression(
        `document.querySelector('${form} [data-config-field="region"] button').textContent.includes('eu')`,
      );
      await pilot(["click", form + " [data-config-actions] button:first-of-type"]);
      await waitExpression(
        `document.querySelector('${form} input[type=password]').value==='' && document.querySelector('${form} [data-config-actions] button:first-of-type').disabled`,
      );
      const status = await operation(
        "c.invokeProduct('get_agent_plugin_configuration',{plugin_id:'setup-fixture'})",
      );
      assert.equal(status.values.port, 9001);
      assert.equal(status.values.active, true);
      assert.equal(status.values.region, "eu");
      assert.deepEqual(status.secrets_set, ["token"]);
      assert(!JSON.stringify(status).includes("disposable-fixture-token"));
      await close();
      await open();
      assert(
        (
          await evaluate(
            `document.querySelector('${form} [role=switch]').getAttribute('aria-checked')==='true' && document.querySelector('${form} [data-config-field="region"] button').textContent.includes('eu')`,
          )
        ).includes("true"),
      );
      assert(
        (
          await evaluate(`document.querySelector('${form} input[type=password]').value===''`)
        ).includes("true"),
      );
      await pilot(["screenshot", join(artifacts, `${theme}-${language}.png`), "--selector", form]);
      if (process.env.BLACKBOX_NATIVE_WINDOW_HANDLE) {
        const capture = spawnSync(
          "python",
          [
            join(root, "scripts/capture-windows-window.py"),
            "--hwnd",
            process.env.BLACKBOX_NATIVE_WINDOW_HANDLE,
            "--output",
            join(artifacts, `${theme}-${language}-native.png`),
          ],
          { encoding: "utf8", windowsHide: true },
        );
        assert.equal(capture.status, 0, capture.stderr);
        await evaluate(
          `document.querySelector('${form} [data-plugin-connector]').scrollIntoView({block:'end'});true`,
        );
        const connectorCapture = spawnSync(
          "python",
          [
            join(root, "scripts/capture-windows-window.py"),
            "--hwnd",
            process.env.BLACKBOX_NATIVE_WINDOW_HANDLE,
            "--output",
            join(artifacts, `${theme}-${language}-connector-native.png`),
          ],
          { encoding: "utf8", windowsHide: true },
        );
        assert.equal(connectorCapture.status, 0, connectorCapture.stderr);
      }
      await close();
    }
  await open();
  await pilot(["click", form + " [data-plugin-authorize] button"]);
  await waitExpression(
    `document.querySelector('${form} [data-plugin-connector]').textContent.includes('Authorized') || document.querySelector('${form} [data-plugin-connector]').textContent.includes('已授权')`,
  );
  const probe = await operation(
    "c.invokeProduct('test_agent_plugin_connector',{plugin_id:'setup-fixture',server_name:'primary'})",
  );
  assert(probe.probe?.tools.includes("authenticated_echo"));
  // Exercise the authenticated primary tool through the Runtime tool boundary.
  const primary = await operation(
    "c.invokeProduct('call_agent_plugin_tool',{plugin_id:'setup-fixture',tool_name:'authenticated_echo',arguments:{}})",
  );
  assert(JSON.stringify(primary).includes("authenticated fixture operation"));
  assert(provider.calls > 0);
  await new Promise((resolve) => setTimeout(resolve, 7000));
  await operation("c.invokeProduct('refresh_mcp_servers',{})");
  await operation(
    "c.invokeProduct('test_agent_plugin_connector',{plugin_id:'setup-fixture',server_name:'primary'})",
  );
  assert(provider.refreshes > 0, "token refresh did not reach the provider");
  await pilot(["click", form + " [data-plugin-revoke] button"]);
  await waitExpression(`!document.querySelector('${form} [data-plugin-revoke] button').disabled`);
  assert.equal(
    (
      await operation(
        "c.invokeProduct('get_agent_plugin_oauth_status',{plugin_id:'setup-fixture',server_name:'primary'})",
      )
    ).authorized,
    false,
  );
  provider.setMode("denied");
  await pilot(["click", form + " [data-plugin-authorize] button"]);
  await waitExpression(`document.querySelector('${form} [data-plugin-connector] .error')`);
  provider.setMode("pending");
  await pilot(["click", form + " [data-plugin-authorize] button"]);
  await pilot(["click", form + " [data-plugin-revoke] button"]);
  await waitExpression(`!document.querySelector('${form} [data-plugin-revoke] button').disabled`);
  await pilot(["click", form + " .plugin-secret-actions button"]);
  await pilot(["click", form + " [data-config-actions] button:first-of-type"]);
  await waitExpression(
    `document.querySelector('${form} [data-config-actions] button:first-of-type').disabled`,
  );
  assert.deepEqual(
    (
      await operation(
        "c.invokeProduct('get_agent_plugin_configuration',{plugin_id:'setup-fixture'})",
      )
    ).secrets_set,
    [],
  );
  const stored = readFileSync(join(home, "plugin-settings/setup-fixture.json"));
  assert(!stored.includes(Buffer.from("disposable-fixture-token")));
  writeFileSync(
    join(artifacts, "result.json"),
    JSON.stringify({
      passed: true,
      appearances: 4,
      refreshes: provider.refreshes,
      oauth: ["success", "denial", "cancel", "disconnect"],
      privateConfiguration: true,
    }),
  );
  console.log(`Plugin setup native verification passed. Artifacts: ${artifacts}`);
} finally {
  await close();
  provider.close();
}

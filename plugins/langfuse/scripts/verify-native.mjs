import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { captureBlackboxScreenshot } from '../../../scripts/blackbox-screenshot.mjs';

const root = path.resolve(import.meta.dirname, '../../..');
const home = process.env.OPENAGENT_HOME;
assert(home?.includes('openagent-langfuse-native-') && process.env.TAURI_PILOT_SOCKET,
  'Select the isolated Langfuse fixture home and its explicit pilot socket');
const artifacts = await mkdtemp(path.join(tmpdir(), 'openagent-langfuse-settings-'));
const workspace = path.join(home, 'workspace');
await mkdir(workspace, { recursive: true });
const form = '[data-plugin-setup="langfuse"]';
const report = { passed: false, package: path.join(root, 'plugins/langfuse'), checks: [], captures: [] };
async function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: process.env, windowsHide: true, cwd: artifacts });
    let output = '', error = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { error += chunk; });
    child.on('error', reject);
    child.on('close', code => code ? reject(new Error(error || output)) : resolve(output.trim()));
  });
}
const pilot = args => run('tauri-pilot', [...args, '--window', 'main']);
const evaluate = expression => pilot(['eval', expression]);
async function until(expression) {
  const deadline = Date.now() + 20000;
  for (;;) {
    if (await evaluate(expression) === 'true') return;
    assert(Date.now() < deadline, `UI timeout: ${expression}`);
    await new Promise(resolve => setTimeout(resolve, 150));
  }
}
async function operation(name, args = {}) {
  return JSON.parse(await evaluate(`(async()=>{const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');return JSON.stringify(await c.invokeProduct(${JSON.stringify(name)},${JSON.stringify(args)}));})()`));
}
async function close() {
  await evaluate(`document.querySelector('[role="dialog"] button[aria-label="Close"], [role="dialog"] button[aria-label="关闭"]')?.click();true`);
  await until(`!document.querySelector('[role="dialog"]')`);
}
async function open() {
  await pilot(['snapshot', '-i']);
  await pilot(['click', '#application-integrations-menu']);
  await until(`!![...document.querySelectorAll('[role=menuitem]')].find(x=>/Plugins|插件/.test(x.textContent))`);
  await evaluate(`[...document.querySelectorAll('[role=menuitem]')].find(x=>/Plugins|插件/.test(x.textContent)).click();true`);
  await until(`!!document.querySelector('.plugin-management-tabs')`);
  await pilot(['snapshot', '-i']);
  await pilot(['click', '.plugin-management-tabs button:nth-of-type(2)']);
  await until(`!!document.querySelector('[data-plugin-id="langfuse"] .plugin-accordion-trigger')`);
  if (await evaluate(`document.querySelector('[data-plugin-id="langfuse"] .plugin-accordion-trigger').getAttribute('aria-expanded')==='true'`) !== 'true')
    await pilot(['click', '[data-plugin-id="langfuse"] .plugin-accordion-trigger']);
  await until(`document.querySelectorAll('${form} [data-config-field]').length===8`);
  await until(`document.querySelector('[data-plugin-id="langfuse"] .plugin-accordion-trigger').getAttribute('aria-expanded')==='true'`);
  await new Promise(resolve => setTimeout(resolve, 350));
  await pilot(['snapshot', '-i']);
}
try {
  await pilot(['ping']);
  await operation('set_workspace', { path: workspace });
  const config = await operation('get_settings');
  config.onboarding_completed = true;
  await operation('save_settings', { config });
  await evaluate(`(async()=>{await window.__TAURI_INTERNALS__.invoke('plugin:window|hide',{label:'onboarding'});await window.__TAURI_INTERNALS__.invoke('plugin:window|show',{label:'main'});return true})()`);
  const plugins = await operation('list_agent_plugins');
  assert(!plugins.some(plugin => plugin.id === 'langfuse'), 'Use a fresh fixture');
  const installed = await operation('install_agent_plugin', { source: report.package });
  assert(!installed.error && !installed.warnings.length);
  for (const theme of ['light', 'dark']) for (const language of ['en', 'zh']) {
    await close();
    await evaluate(`(async()=>{const {desktopOpenAgent:c,emit}=await import('/src/lib/openagent/tauriClient.ts');const config=await c.invokeProduct('get_settings',{});config.theme='${theme}';config.language='${language}';await c.invokeProduct('save_settings',{config});await emit('settings-changed');const {applyDocumentTheme}=await import('/src/lib/appTheme.ts');const {setLocale}=await import('/src/lib/i18n.ts');applyDocumentTheme('${theme}');setLocale('${language}');const {getCurrentWindow}=await import('/node_modules/@tauri-apps/api/window.js');await getCurrentWindow().setTheme('${theme}');return true})()`);
    await open();
    await pilot(['run', path.join(root, 'plugins/langfuse/tests/blackbox/settings.toml')]);
    const label = language === 'en' ? 'Capture tool content' : '采集工具内容';
    assert.equal(await evaluate(`document.querySelector('${form} [data-config-field="capture-content"] label').textContent.includes(${JSON.stringify(label)})`), 'true');
    const savedBefore = await operation('get_agent_plugin_configuration', { plugin_id: 'langfuse' });
    if (!savedBefore.secrets_set.includes('secret-key')) {
      await pilot(['fill', `${form} [data-config-field="public-key"] input`, 'public-fixture']);
      await pilot(['fill', `${form} input[type=password]`, 'secret-fixture']);
    }
    if (!savedBefore.values.enabled) {
      await pilot(['click', `${form} [data-config-field="enabled"] [role=switch]`]);
    }
    await pilot(['fill', `${form} [data-config-field="environment"] input`, `${theme}-${language}`]);
    await pilot(['click', `${form} [data-config-actions] button:first-of-type`]);
    await until(`document.querySelector('${form} input[type=password]').value==='' && document.querySelector('${form} [data-config-actions] button:first-of-type').disabled`);
    const saved = await operation('get_agent_plugin_configuration', { plugin_id: 'langfuse' });
    assert.equal(saved.values.environment, `${theme}-${language}`);
    assert.equal(saved.values.enabled, true);
    assert.equal(saved.values['capture-content'], false);
    assert(saved.secrets_set.includes('secret-key'));
    assert(!JSON.stringify(saved).includes('secret-fixture'));
    await close();
    await open();
    assert.equal(await evaluate(`document.querySelector('${form} input[type=password]').value==='' && document.querySelector('${form} [data-config-field="enabled"] [role=switch]').getAttribute('aria-checked')==='true'`), 'true');
    if (process.env.BLACKBOX_NATIVE_WINDOW_HANDLE) {
      const capture = path.join(artifacts, `${theme}-${language}.png`);
      process.env.BLACKBOX_NATIVE_WINDOW_ID = process.env.BLACKBOX_NATIVE_WINDOW_HANDLE;
      captureBlackboxScreenshot(pilot, capture);
      report.captures.push(capture);
    }
    report.checks.push({ theme, language, saved: true, reopened: true, secret_redacted: true });
  }
  await pilot(['click', `${form} .plugin-secret-actions button`]);
  await pilot(['click', `${form} [data-config-actions] button:first-of-type`]);
  await until(`!document.querySelector('${form} .plugin-secret-actions')`);
  const cleared = await operation('get_agent_plugin_configuration', { plugin_id: 'langfuse' });
  assert(!cleared.secrets_set.includes('secret-key'));
  assert(cleared.missing_required.includes('secret-key'));
  report.checks.push({ secret_cleared: true, missing_credentials_reported: true });
  report.passed = true;
} catch (error) { report.error = error.message; process.exitCode = 1; }
finally {
  await close().catch(() => {});
  await operation('uninstall_agent_plugin', { id: 'langfuse' }).catch(() => {});
  await writeFile(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, report: path.join(artifacts, 'report.json') }, null, 2));
}

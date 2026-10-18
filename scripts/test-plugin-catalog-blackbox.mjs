// @ts-check
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { resolveBlackboxHome } from "./tauri-test-environment.mjs";
import { captureBlackboxScreenshot } from "./blackbox-screenshot.mjs";
import { en } from "../src/lib/i18n.en.ts";
import { zh } from "../src/lib/i18n.zh.ts";
import reviewedCatalog from "../src/lib/officialPluginRegistry.json";

const root = resolve(import.meta.dirname, "..");
const home = resolveBlackboxHome(process.env, { instanceName: "plugin-catalog" });
if (!process.env.TAURI_PILOT_SOCKET || !home.includes("plugin-catalog"))
  throw new Error("Use an isolated plugin-catalog instance with an explicit TAURI_PILOT_SOCKET");
const artifacts = mkdtempSync(join(tmpdir(), "openagent-plugin-catalog-"));

/** @param {string[]} args @param {string} [input] */
function pilot(args, input) {
  const result = spawnSync("tauri-pilot", [...args, "--window", "main"], {
    cwd: artifacts,
    env: process.env,
    encoding: "utf8",
    windowsHide: true,
    input,
  });
  if (result.error || result.status !== 0)
    throw new Error(result.stderr || result.stdout, { cause: result.error });
  return result.stdout.trim();
}
/** @param {string} script */
const evaluate = (script) => pilot(["eval", "-"], script);
const close = () => evaluate("document.querySelector('.fullscreen-surface-close')?.click(); true");

pilot(["ping"]);
pilot(["snapshot", "-i"]);
evaluate(`(async () => {
  const {desktopOpenAgent} = await import('/src/lib/openagent/tauriClient.ts');
  const config = await desktopOpenAgent.invokeProduct('get_settings', {});
  const {OFFICIAL_PLUGIN_REGISTRY_URL} = await import('/src/lib/officialPluginRegistry.ts');
  window.__catalogOriginal = {fetch:window.fetch, theme:config.theme, language:config.language};
  window.__catalogProbe = {requests:0, mode:'hold', plugins:[]};
  window.fetch = async (input, init) => {
    if (String(input) !== OFFICIAL_PLUGIN_REGISTRY_URL) return window.__catalogOriginal.fetch(input, init);
    const probe = window.__catalogProbe;
    probe.requests++;
    if (init?.cache !== 'no-store' || init?.credentials !== 'omit') throw new Error('catalog request was cached or credentialed');
    if (probe.mode === 'hold') return new Promise(resolve => {probe.resolve=resolve;});
    if (probe.mode === 'fail') return new Response('Unavailable', {status:503});
    if (probe.mode === 'invalid') return new Response('{"schema_version":2,"plugins":[]}');
    return new Response(JSON.stringify({schema_version:1,plugins:probe.plugins}));
  };
  return true;
})()`);
try {
  for (const theme of ["light", "dark"]) {
    for (const language of ["en", "zh"]) {
      close();
      const copy = language === "en" ? en : zh;
      evaluate(`(async () => {
        const {desktopOpenAgent, emit} = await import('/src/lib/openagent/tauriClient.ts');
        const config = await desktopOpenAgent.invokeProduct('get_settings', {});
        Object.assign(config, {theme:${JSON.stringify(theme)}, language:${JSON.stringify(language)}});
        await desktopOpenAgent.invokeProduct('save_settings', {config});
        await emit('settings-changed');
        const {applyDocumentTheme} = await import('/src/lib/appTheme.ts');
        const {setLocale} = await import('/src/lib/i18n.ts');
        applyDocumentTheme(config.theme); setLocale(config.language);
        window.__catalogProbe.mode='hold';
        window.__catalogCopy=${JSON.stringify({ loading: copy.pluginOfficialLoading, failed: copy.pluginOfficialLoadFailed })};
        document.querySelector('#application-integrations-menu').click();
        await new Promise(resolve => setTimeout(resolve, 0));
        [...document.querySelectorAll('[role=menuitem]')].find(item => /Plugins|插件/.test(item.textContent)).click();
        return true;
      })()`);
      pilot([
        "wait",
        "--selector",
        ".official-plugin-store .plugin-skeleton-grid",
        "--timeout",
        "20000",
      ]);
      pilot(["snapshot", "-i"]);
      pilot(["run", join(root, "tests/blackbox/plugin-catalog.toml")]);
      evaluate(`(() => {
        window.__reviewedPluginCatalog=${JSON.stringify(reviewedCatalog)};
        window.__catalogLanguage=${JSON.stringify(language)};
        window.__catalogProbe.plugins=window.__reviewedPluginCatalog.plugins;
        window.__officialCatalogCount=window.__reviewedPluginCatalog.plugins.length;
        document.querySelector('.official-plugin-store-toolbar button').click();
        return true;
      })()`);
      pilot(["wait", "--selector", '[data-plugin-id="goal"]', "--timeout", "20000"]);
      pilot(["snapshot", "-i"]);
      pilot(["run", join(root, "tests/blackbox/plugin-copy.toml")]);
      pilot(["snapshot", "-i"]);
      pilot(["run", join(root, "tests/blackbox/plugin-categories.toml")]);
      pilot(["snapshot", "-i"]);
      pilot(["run", join(root, "tests/blackbox/plugin-discovery-categories.toml")]);
      captureBlackboxScreenshot(pilot, join(artifacts, `${theme}-${language}.png`));
      // Reopening must fetch again rather than reuse the previous snapshot.
      const requests = Number(evaluate("window.__catalogProbe.requests"));
      close();
      evaluate(`(async () => {
        document.querySelector('#application-integrations-menu').click();
        await new Promise(resolve=>setTimeout(resolve,0));
        [...document.querySelectorAll('[role=menuitem]')].find(item=>/Plugins|插件/.test(item.textContent)).click();
        return true;
      })()`);
      pilot(["wait", "--selector", '[data-plugin-id="goal"]', "--timeout", "20000"]);
      if (Number(evaluate("window.__catalogProbe.requests")) !== requests + 1)
        throw new Error("Reopening did not fetch the catalog again");
    }
  }
  process.stdout.write(`Dynamic plugin catalog black-box passed. Artifacts: ${artifacts}\n`);
} finally {
  close();
  evaluate(`(async () => {
    const original=window.__catalogOriginal;
    window.fetch=original.fetch;
    const {desktopOpenAgent,emit}=await import('/src/lib/openagent/tauriClient.ts');
    const config=await desktopOpenAgent.invokeProduct('get_settings',{});
    Object.assign(config,{theme:original.theme,language:original.language});
    await desktopOpenAgent.invokeProduct('save_settings',{config});
    await emit('settings-changed');
    const {applyDocumentTheme}=await import('/src/lib/appTheme.ts');
    const {setLocale}=await import('/src/lib/i18n.ts');
    applyDocumentTheme(config.theme);setLocale(config.language);
    return true;
  })()`);
}

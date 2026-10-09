// @ts-check
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBlackboxHome } from "./tauri-test-environment.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const isolatedHome = resolveBlackboxHome(process.env);
if (!process.env.TAURI_PILOT_SOCKET || !isolatedHome.includes("skill-directory")) {
  throw new Error("Use an isolated skill-directory instance and set TAURI_PILOT_SOCKET");
}
const artifacts =
  process.env.BLACKBOX_ARTIFACT_DIR || mkdtempSync(join(tmpdir(), "openagent-skill-directory-"));
mkdirSync(artifacts, { recursive: true });
/** @param {string[]} args */
function pilot(args) {
  const result = spawnSync(
    process.env.TAURI_PILOT_BIN || "tauri-pilot",
    [...args, "--window", "main"],
    {
      cwd: artifacts,
      env: { ...process.env, OPENAGENT_HOME: isolatedHome },
      encoding: "utf8",
      windowsHide: true,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}
/** @param {string} script */
const evaluate = (script) => pilot(["eval", script]);
const close = () =>
  evaluate(
    `document.querySelector('[role=dialog] button[aria-label="Close"], [role=dialog] button[aria-label="关闭"]')?.click(); true`,
  );
pilot(["ping"]);
pilot(["snapshot", "-i"]);
close();
evaluate(`(async () => {
  const {desktopOpenAgent} = await import('/src/lib/openagent/tauriClient.ts');
  const config = await desktopOpenAgent.invokeProduct('get_settings', {});
  window.__skillDiscoveryAppearance = {theme:config.theme, language:config.language};
  return true;
})()`);
try {
  for (const theme of ["light", "dark"]) {
    for (const language of ["en", "zh"]) {
      pilot(["snapshot", "-i"]);
      evaluate(`(async () => {
        const {desktopOpenAgent,emit} = await import('/src/lib/openagent/tauriClient.ts');
        const config = await desktopOpenAgent.invokeProduct('get_settings', {});
        config.theme = '${theme}'; config.language = '${language}';
        await desktopOpenAgent.invokeProduct('save_settings', {config});
        await emit('settings-changed');
        const {applyDocumentTheme} = await import('/src/lib/appTheme.ts');
        const {setLocale} = await import('/src/lib/i18n.ts');
        applyDocumentTheme('${theme}'); setLocale('${language}');
        window.__skillDiscoveryLocale = '${language}';
        window.dispatchEvent(new KeyboardEvent('keydown', {key:'3',code:'Digit3',ctrlKey:true,shiftKey:true,bubbles:true}));
        return true;
      })()`);
      pilot(["wait", "--selector", '[data-value="agents"] .flash-task-card', "--timeout", "20000"]);
      pilot(["snapshot", "-i"]);
      pilot(["run", join(root, "tests/blackbox/skill-discovery-settings.toml")]);
      evaluate(
        `document.querySelector('[aria-labelledby="automation-flash-tasks"]').scrollIntoView({block:'center'}); true`,
      );
      pilot(["snapshot", "-i"]);
      pilot([
        "screenshot",
        join(artifacts, `${theme}-${language}.png`),
        "--selector",
        '[aria-labelledby="automation-flash-tasks"]',
      ]);
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
        if (capture.error || capture.status !== 0)
          throw new Error(capture.stderr, { cause: capture.error });
      }
      close();
    }
  }
} finally {
  close();
  evaluate(`(async () => {
    const {desktopOpenAgent,emit} = await import('/src/lib/openagent/tauriClient.ts');
    const config = await desktopOpenAgent.invokeProduct('get_settings', {});
    Object.assign(config, window.__skillDiscoveryAppearance);
    await desktopOpenAgent.invokeProduct('save_settings', {config}); await emit('settings-changed');
    return true;
  })()`);
}
pilot(["logs", "--level", "error"]);
process.stdout.write(
  `Skill discovery settings verification passed in light/dark and Chinese/English. Artifacts: ${artifacts}\n`,
);

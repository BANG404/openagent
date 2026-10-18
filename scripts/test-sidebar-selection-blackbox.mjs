// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { captureBlackboxScreenshot } from "./blackbox-screenshot.mjs";
import { themeCollection } from "./themes/collection";

assert(process.env.TAURI_PILOT_SOCKET, "Select the task-owned isolated debug window explicitly");
const artifacts = mkdtempSync(join(tmpdir(), "openagent-sidebar-selection-"));
const scenario = fileURLToPath(
  new URL("../tests/blackbox/sidebar-selection.toml", import.meta.url),
);
const collection = process.argv.includes("--collection");
const candidates = themeCollection.filter(({ id }) => collection || id === "openagent-theme-rhea");

/** @param {string[]} args */
function pilot(args) {
  const result = spawnSync("tauri-pilot", [...args, "--window", "main"], {
    cwd: artifacts,
    env: process.env,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(
    result.status,
    0,
    `${args[0]}: ${result.stderr || result.stdout || String(result.error)}`,
  );
  return result.stdout.trim();
}

pilot(["ping"]);
pilot(["snapshot", "-i"]);
const original = pilot(["url"]);
const base = new URL(original);
assert(["localhost", "127.0.0.1"].includes(base.hostname), "A local source frontend is required");
try {
  for (const { id } of candidates) {
    const theme = JSON.parse(
      readFileSync(new URL(`../plugins/${id}/plugin.json`, import.meta.url), "utf8"),
    ).extensions.openagent.theme;
    for (const mode of ["light", "dark"]) {
      for (const locale of ["en", "zh"]) {
        process.stdout.write(`Verifying sidebar selection: ${id}/${mode}/${locale}\n`);
        const preview = new URL(base.origin);
        preview.search = new URLSearchParams({
          "desktop-shell-preview": "",
          "desktop-shell-preview-existing": "",
          "desktop-shell-preview-theme": mode,
          "desktop-shell-preview-locale": locale,
        }).toString();
        pilot(["snapshot", "-i"]);
        pilot(["navigate", preview.href]);
        pilot(["wait", ".desktop-shell-preview .conv-item.active"]);
        const tokens = { ...theme.tokens, ...theme[mode] };
        pilot([
          "eval",
          `(async()=>{const {resolveThemeTokens}=await import('/src/lib/themeTokens.ts');const {applyPluginThemeTokens}=await import('/src/lib/pluginPresentation.ts');window.__sidebarThemeCleanup=applyPluginThemeTokens(document.documentElement,resolveThemeTokens(${JSON.stringify(tokens)}));return true;})()`,
        ]);
        pilot(["snapshot", "-i"]);
        pilot(["run", scenario]);
        pilot(["eval", "window.__assertSidebarSelection(true)"]);
        if (collection && id !== "openagent-theme-rhea") {
          pilot([
            "eval",
            `(() => {
            const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
            const context = canvas.getContext('2d', {willReadFrequently:true});
            const style = getComputedStyle(document.documentElement);
            const luminance = (token) => {
              context.fillStyle = style.getPropertyValue(token).trim();
              context.fillRect(0,0,1,1);
              const channels = [...context.getImageData(0,0,1,1).data].slice(0,3).map(value => {
                value /= 255; return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
              });
              return channels[0]*0.2126 + channels[1]*0.7152 + channels[2]*0.0722;
            };
            const contrast = (a,b) => (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
            const fill = luminance('--sidebar-accent');
            if (contrast(fill,luminance('--sidebar')) < ${mode === "light" ? 1.25 : 1.45}) throw Error('Sidebar highlight contrast too low');
            if (contrast(fill,luminance('--sidebar-accent-foreground')) < 7) throw Error('Sidebar text contrast too low');
            return true;
          })()`,
          ]);
        }
        captureBlackboxScreenshot(pilot, join(artifacts, `${id}-${mode}-${locale}.png`));

        if (collection) {
          pilot(["eval", "window.__sidebarThemeCleanup();true"]);
          continue;
        }

        // A selected-only overlay must leave hover colors intact and survive navigation.
        const selected =
          mode === "light"
            ? { "--sidebar-selected": "#1e40af", "--sidebar-selected-foreground": "#ffffff" }
            : { "--sidebar-selected": "#bfdbfe", "--sidebar-selected-foreground": "#172554" };
        pilot([
          "eval",
          `(async()=>{const {applyPluginThemeTokens}=await import('/src/lib/pluginPresentation.ts');window.__sidebarSelectedCleanup=applyPluginThemeTokens(document.documentElement,${JSON.stringify(selected)});return true;})()`,
        ]);
        pilot(["snapshot", "-i"]);
        pilot(["run", scenario]);
        captureBlackboxScreenshot(pilot, join(artifacts, `independent-${mode}-${locale}.png`));
        pilot([
          "eval",
          `(async()=>{window.__sidebarSelectedCleanup();await window.__assertSidebarSelection(true);document.documentElement.style.removeProperty('--sidebar-selected');document.documentElement.style.removeProperty('--sidebar-selected-foreground');await window.__assertSidebarSelection(true);window.__sidebarThemeCleanup();return true;})()`,
        ]);
      }
    }
  }
  pilot(["logs", "--level", "error"]);
} finally {
  pilot(["eval", "window.__sidebarSelectedCleanup?.();window.__sidebarThemeCleanup?.();true"]);
  pilot(["navigate", original]);
}
process.stdout.write(`Sidebar selection black-box passed. Artifacts: ${artifacts}\n`);

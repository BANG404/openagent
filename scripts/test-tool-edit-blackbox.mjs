// @ts-check
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { captureBlackboxScreenshot } from "./blackbox-screenshot.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
if (!process.env.TAURI_PILOT_SOCKET || !process.env.OPENAGENT_HOME?.includes("edit-tools"))
  throw new Error(
    "Use an isolated edit-tools instance with explicit TAURI_PILOT_SOCKET and OPENAGENT_HOME",
  );
const artifacts =
  process.env.BLACKBOX_ARTIFACT_DIR || mkdtempSync(join(tmpdir(), "openagent-tool-edit-"));
/** @param {string[]} args */
function pilot(args) {
  const result = spawnSync("tauri-pilot", [...args, "--window", "main"], {
    cwd: artifacts,
    env: process.env,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error(result.stderr || result.stdout, { cause: result.error });
  return result.stdout.trim();
}
const original = pilot(["url"]);
const windowModule = "/node_modules/@tauri-apps/api/window.js";
const originalNativeTheme = pilot([
  "eval",
  `(async()=>{const {getCurrentWindow}=await import('${windowModule}');return getCurrentWindow().theme()})()`,
]).replace(/^"|"$/g, "");
/** @param {string | null} theme */
function setNativeTheme(theme) {
  pilot([
    "eval",
    `(async()=>{const {getCurrentWindow}=await import('${windowModule}');await getCurrentWindow().setTheme(${JSON.stringify(theme)});return true})()`,
  ]);
}
const base = original.match(/https?:\/\/[^/\s"']+/)?.[0];
if (!base) throw new Error("Could not identify the isolated Vite URL");
/** @param {string} url */
async function navigate(url) {
  pilot(["eval", `setTimeout(()=>location.href=${JSON.stringify(url)},100);true`]);
  await new Promise((resolve) => setTimeout(resolve, 500));
}
try {
  for (const theme of ["light", "dark"]) {
    for (const locale of ["en", "zh"]) {
      await navigate(
        `${base}/?tool-diff-preview&tool-diff-preview-theme=${theme}&tool-diff-preview-locale=${locale}`,
      );
      pilot([
        "wait",
        "--selector",
        ".tool-diff-preview-stage .tool-call-card",
        "--timeout",
        "30000",
      ]);
      setNativeTheme(theme);
      pilot(["snapshot", "-i"]);
      pilot(["run", join(root, "tests/blackbox/tool-edit.toml")]);
      pilot(["click", ".tool-call-card:first-child .tool-toggle"]);
      pilot(["snapshot", "-i"]);
      captureBlackboxScreenshot(pilot, join(artifacts, `${theme}-${locale}.png`));
    }
  }
  const errors = pilot(["logs", "--level", "error"]);
  if (/\[error\]/i.test(errors)) throw new Error(errors);
  process.stdout.write(`File edit tool black-box passed. Artifacts: ${artifacts}\n`);
} finally {
  await navigate(original);
  setNativeTheme(["light", "dark"].includes(originalNativeTheme) ? originalNativeTheme : null);
}

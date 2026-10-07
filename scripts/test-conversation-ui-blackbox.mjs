// @ts-check
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { captureBlackboxScreenshot } from "./blackbox-screenshot.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
if (!process.env.TAURI_PILOT_SOCKET || !process.env.OPENAGENT_HOME?.includes("checkpoint-ui"))
  throw new Error(
    "Use an isolated checkpoint-ui instance with explicit TAURI_PILOT_SOCKET and OPENAGENT_HOME",
  );
const artifacts =
  process.env.BLACKBOX_ARTIFACT_DIR || mkdtempSync(join(tmpdir(), "openagent-conversation-ui-"));
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
const base = process.env.OPENAGENT_DEV_URL || original.match(/https?:\/\/[^/\s"']+/)?.[0];
if (!base) throw new Error("Could not identify the isolated Vite URL");
/** @param {string} url */
async function navigate(url) {
  pilot(["eval", `setTimeout(()=>location.href=${JSON.stringify(url)},1000);true`]);
  await new Promise((resolve) => setTimeout(resolve, 1500));
}
try {
  for (const theme of ["light", "dark"]) {
    for (const locale of ["en", "zh"]) {
      pilot(["eval", "sessionStorage.removeItem('openagent-conversation-ui-preview');true"]);
      await navigate(
        `${base}/?conversation-ui-preview&conversation-ui-preview-theme=${theme}&conversation-ui-preview-locale=${locale}`,
      );
      pilot(["wait", "--selector", ".conversation-ui-preview iframe", "--timeout", "30000"]);
      pilot(["eval", `window.__uiTheme='${theme}';window.__uiLocale='${locale}';true`]);
      pilot(["snapshot", "-i"]);
      pilot(["run", join(root, "tests/blackbox/conversation-ui.toml")]);
      await navigate(
        `${base}/?conversation-ui-preview&conversation-ui-preview-theme=${theme}&conversation-ui-preview-locale=${locale}&restore=1`,
      );
      pilot(["wait", "--selector", ".conversation-ui-preview iframe", "--timeout", "30000"]);
      pilot([
        "eval",
        `(async()=>{for(let i=0;i<100;i++){const data=JSON.parse(document.querySelector('main').dataset.probe||'{}');if(data.type==='fixture:context'&&data.count===1)return true;await new Promise(resolve=>setTimeout(resolve,50));}throw new Error('saved checkpoint did not restore');})()`,
      ]);
      captureBlackboxScreenshot(pilot, join(artifacts, `${theme}-${locale}.png`));
    }
  }
  pilot(["logs", "--level", "error"]);
  process.stdout.write(`Conversation UI black-box passed. Artifacts: ${artifacts}\n`);
} finally {
  pilot(["eval", "sessionStorage.removeItem('openagent-conversation-ui-preview');true"]);
  await navigate(`${base}/`);
}

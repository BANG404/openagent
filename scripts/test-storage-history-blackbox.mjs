// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { captureBlackboxScreenshot } from "./blackbox-screenshot.mjs";
import { selectStorageNativeRecovery } from "./select-storage-native-recovery.mjs";

assert(process.env.TAURI_PILOT_SOCKET, "select the isolated storage window");
assert(process.env.OPENAGENT_HOME?.includes("trace-export-storage"));
const artifacts = mkdtempSync(join(tmpdir(), "openagent-storage-history-blackbox-"));
const scenario = fileURLToPath(new URL("../tests/blackbox/storage-history.toml", import.meta.url));
/** @param {string[]} args */
function pilot(args) {
  const result = spawnSync("tauri-pilot", [...args, "--window", "main"], {
    cwd: artifacts,
    env: process.env,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  return result.stdout.trim();
}
/** @param {string} script */
const evaluate = (script) => pilot(["eval", script]);
/** @param {string} condition */
async function until(condition) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (evaluate(condition) === "true") return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Storage history native assertion timed out: ${condition}`);
}
const original = pilot(["url"]);
const base = new URL(process.env.BLACKBOX_BASE_URL || original);
assert(["localhost", "127.0.0.1"].includes(base.hostname));
try {
  for (const theme of ["light", "dark"])
    for (const locale of ["en", "zh"]) {
      selectStorageNativeRecovery(process.env.OPENAGENT_HOME);
      pilot(["navigate", base.origin]);
      await until("!!document.querySelector('.conv-item,.workspace-conversation-row')");
      evaluate(
        "window.dispatchEvent(new KeyboardEvent('keydown',{key:',',code:'Comma',ctrlKey:true,bubbles:true})); true",
      );
      pilot(["wait", '[role=tabpanel][data-value="general"]']);
      pilot(["snapshot", "-i"]);
      pilot([
        "click",
        '[role=tabpanel][data-value="general"] .settings-card-row:nth-child(1) button',
      ]);
      pilot(["wait", `[role=option][data-value=${theme}]`]);
      pilot(["click", `[role=option][data-value=${theme}]`]);
      pilot(["snapshot", "-i"]);
      pilot([
        "click",
        '[role=tabpanel][data-value="general"] button[aria-label="Language"], [role=tabpanel][data-value="general"] button[aria-label="语言"]',
      ]);
      pilot(["wait", `[role=option][data-value=${locale}]`]);
      pilot(["click", `[role=option][data-value=${locale}]`]);
      pilot(["snapshot", "-i"]);
      evaluate(
        "document.querySelector('[role=tabpanel][data-value=general]').closest('[role=dialog]').querySelector('button[aria-label=Close],button[aria-label=关闭]').click(); true",
      );
      await until("!document.querySelector('[role=tabpanel][data-value=general]')");
      await until(`document.documentElement.classList.contains('dark')===${theme === "dark"}`);
      await until(`document.body.innerText.includes('${locale === "en" ? "New chat" : "新聊天"}')`);
      pilot(["snapshot", "-i"]);
      evaluate(
        "(()=>{const item=[...document.querySelectorAll('.conv-item,.workspace-conversation-row')].find(item=>item.textContent.includes('Native storage branches'));if(!item)throw new Error('fixture conversation absent');item.click();return true})()",
      );
      await until(
        "document.body.textContent.includes('Branch A preserved screenshot') && !!document.querySelector('.branch-nav-btn:not([disabled])')",
      );
      const view = JSON.parse(
        evaluate(
          "(async()=>{const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');return JSON.stringify(await c.invokeProduct('get_checkpoint_view',{convId:'native-storage-history'}))})()",
        ),
      );
      assert.equal(view.length, 2);
      assert.equal(
        view.filter((/** @type {{data_loaded:boolean}} */ item) => item.data_loaded).length,
        1,
      );
      assert.equal(
        view.find((/** @type {{data_loaded:boolean}} */ item) => item.data_loaded)?.meta
          .checkpoint_id,
        "native-tip-a",
      );
      const hidden = JSON.parse(
        evaluate(
          "(async()=>{const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');return JSON.stringify(await c.invokeProduct('get_checkpoint_view',{convId:'native-storage-history',checkpointId:'native-live-recovery'}))})()",
        ),
      );
      assert(hidden.every((/** @type {{data_loaded:boolean}} */ item) => !item.data_loaded));
      assert(!JSON.stringify(view).includes("iVBORw0KGgo"));
      pilot(["snapshot", "-i"]);
      pilot(["run", scenario]);
      captureBlackboxScreenshot(pilot, join(artifacts, `${theme}-${locale}-branches.png`));
      const inspector = new URL(base.origin);
      inspector.searchParams.set("dev-inspector", "1");
      pilot(["navigate", inspector.href]);
      await until("document.querySelectorAll('.conversation-list button').length===101");
      pilot(["snapshot", "-i"]);
      const older = evaluate(
        "(()=>{const b=[...document.querySelectorAll('.conversation-list button')].find(b=>b.textContent.includes('Load older requests'));b?.click();return !!b})()",
      );
      assert.equal(older, "true");
      await until("document.querySelectorAll('.conversation-list button').length===105");
      pilot(["snapshot", "-i"]);
      pilot(["click", ".conversation-list button:last-child"]);
      await until(
        "document.querySelector('.message-timeline')?.textContent.includes('Synthetic trace 0') === true",
      );
      captureBlackboxScreenshot(pilot, join(artifacts, `${theme}-${locale}-trace-detail.png`));
    }
  pilot(["logs", "--level", "error"]);
} finally {
  pilot(["navigate", original]);
}
process.stdout.write(`Native stored history and trace pages passed. Artifacts: ${artifacts}\n`);

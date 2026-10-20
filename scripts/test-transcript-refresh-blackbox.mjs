// @ts-check
import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { captureBlackboxScreenshot } from "./blackbox-screenshot.mjs";

const root = resolve(import.meta.dirname, "..");
const home = resolve(process.env.OPENAGENT_HOME || "");
assert(
  process.env.OPENAGENT_HOME && process.env.TAURI_PILOT_SOCKET,
  "Select an isolated home and socket",
);
assert(
  ![".openagent", ".openagent-dev"].some((name) => home === resolve(homedir(), name)),
  "Preserve developer and release state",
);
const artifacts = mkdtempSync(join(tmpdir(), "openagent-transcript-refresh-"));
const execute = promisify(execFile);
/** @param {string[]} args */
async function pilot(args) {
  const { stdout } = await execute("tauri-pilot", [...args, "--window", "main"], {
    cwd: artifacts,
    env: process.env,
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  });
  return stdout.trim();
}
/** @param {string} script */
const evaluate = (script) => pilot(["eval", script]);
/** @param {string} operation @param {unknown} args @returns {Promise<any>} */
async function invoke(operation, args) {
  return JSON.parse(
    await evaluate(
      `(async()=>{const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');return JSON.stringify(await c.invokeProduct(${JSON.stringify(operation)},${JSON.stringify(args)}));})()`,
    ),
  );
}
/** @param {string} expression */
async function until(expression) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if ((await evaluate(expression)) === "true") return;
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`Transcript fixture timed out: ${expression}`);
}
/** @param {string} id */
async function openConversation(id) {
  await evaluate(
    `(async()=>{const {emitTo}=await import('/node_modules/@tauri-apps/api/event.js');await emitTo('main','settings-open-conversation',{conversationId:${JSON.stringify(id)}});return true;})()`,
  );
}

const responseText =
  "Refresh fixture\n\n```mermaid\nflowchart LR\n A[Start] --> B[Keep zoom]\n B --> C[End]\n```";
let requests = 0;
const model = createServer(async (request, response) => {
  for await (const chunk of request) void chunk;
  requests++;
  response.writeHead(200, { "content-type": "application/x-ndjson" });
  response.end(
    JSON.stringify({
      model: "refresh-model",
      created_at: new Date().toISOString(),
      message: { role: "assistant", content: responseText },
      done: true,
      done_reason: "stop",
      prompt_eval_count: 40,
      eval_count: 12,
    }) + "\n",
  );
});
await new Promise((done) => model.listen(0, "127.0.0.1", () => done(null)));
const address = model.address();
assert(address && typeof address !== "string");
await pilot(["ping"]);
const original = await invoke("get_settings", {});
assert.equal(
  resolve(original.workspace),
  resolve(join(home, "workspace")),
  "Socket and isolated home differ",
);
const config = structuredClone(original);
config.onboarding_completed = true;
config.providers = [
  {
    id: "refresh-fixture",
    name: "Local refresh fixture",
    provider: "ollama",
    api_key: "",
    base_url: `http://127.0.0.1:${address.port}`,
    enabled: true,
    models: ["refresh-model"],
    model_context_compaction_thresholds: {},
    model_reasoning_efforts: {},
    model_reasoning_effort_enabled: {},
    model_vision_enabled: {},
  },
];
config.defaults.chat_model = config.defaults.flash_model = {
  provider_id: "refresh-fixture",
  model: "refresh-model",
};
config.memory_retrieval_enabled = false;
config.context_compaction_enabled = false;
config.approval_mode = "off";
for (const agent of Object.values(config.flash_agents))
  if (agent && typeof agent === "object" && "enabled" in agent) agent.enabled = false;
mkdirSync(original.workspace, { recursive: true });
/** @type {string[]} */
const conversations = [];
try {
  for (const theme of ["light", "dark"])
    for (const language of ["en", "zh"]) {
      await invoke("save_settings", { config: { ...config, theme, language } });
      const id = crypto.randomUUID();
      const otherId = crypto.randomUUID();
      conversations.push(id, otherId);
      for (const convId of [id, otherId])
        await invoke("create_conversation", {
          id: convId,
          title: `Transcript refresh ${convId}`,
          workspace: original.workspace,
        });
      await evaluate("setTimeout(()=>location.reload(),100); true");
      await new Promise((done) => setTimeout(done, 500));
      await until("!!document.querySelector('[contenteditable=true][role=textbox]')");
      await openConversation(id);
      await until(
        `document.body.textContent.includes(${JSON.stringify(`Transcript refresh ${id}`)})`,
      );
      await pilot(["snapshot", "-i"]);
      await evaluate(`(async()=>{
        const editor=document.querySelector('[contenteditable=true][role=textbox]');
        editor.focus();const clipboard=new DataTransfer();
        clipboard.setData('text/plain','Edit this message / 编辑这条消息');
        editor.dispatchEvent(new ClipboardEvent('paste',{clipboardData:clipboard,bubbles:true,cancelable:true}));
        await new Promise(resolve=>setTimeout(resolve,100));
        document.querySelector('.send-btn').click();return true;
      })()`);
      await until(
        "!!document.querySelector('[data-mermaid-svg] > svg') && !document.querySelector('.stop-btn')",
      );
      for (const pass of ["initial", "reload"]) {
        if (pass === "reload") {
          await evaluate("setTimeout(()=>location.reload(),100); true");
          await new Promise((done) => setTimeout(done, 500));
          await until("!!document.querySelector('[data-mermaid-svg] > svg')");
        }
        await pilot(["snapshot", "-i"]);
        await pilot([
          "run",
          join(root, "tests/blackbox/transcript-refresh.toml"),
          "--junit",
          join(artifacts, `${theme}-${language}-${pass}.xml`),
        ]);
        captureBlackboxScreenshot(
          (args) => spawnSync("tauri-pilot", args, { env: process.env, windowsHide: true }),
          join(artifacts, `${theme}-${language}-${pass}.png`),
        );
        // Only a real conversation switch may discard the staged edit.
        await openConversation(otherId);
        await until("!document.querySelector('.user-msg')");
        await openConversation(id);
        await until("!!document.querySelector('.user-msg')");
        assert.equal(await evaluate("!!document.querySelector('.user-content-edit')"), "false");
        assert.equal(await evaluate("!!document.querySelector('.edit-actions.show')"), "false");
      }
      await pilot(["logs", "--level", "error"]);
    }
  assert.equal(requests, 4, "Polling or navigation submitted an unintended turn");
} finally {
  for (const convId of conversations) {
    await invoke("cancel_chat_message", { convId }).catch(() => {});
    await invoke("delete_conversation", { convId }).catch(() => {});
  }
  await invoke("save_settings", { config: original });
  model.closeAllConnections();
  model.close();
}
console.log(
  `Normal chat polling preserved embedded/fullscreen Mermaid zoom and user edits in four themes/locales before and after reload. Artifacts: ${artifacts}`,
);

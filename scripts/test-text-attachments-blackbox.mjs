// @ts-check
import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { captureBlackboxScreenshot } from "./blackbox-screenshot.mjs";

const root = resolve(import.meta.dirname, "..");
const home = resolve(process.env.OPENAGENT_HOME || "");
assert(
  process.env.OPENAGENT_HOME && process.env.TAURI_PILOT_SOCKET,
  "Select the isolated home and socket",
);
assert(![".openagent", ".openagent-dev"].some((name) => home === resolve(homedir(), name)));
const artifacts = mkdtempSync(join(tmpdir(), "openagent-text-attachments-"));
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
  throw new Error(`Text attachment assertion timed out: ${expression}`);
}
/** @param {string} name */
async function screenshot(name) {
  captureBlackboxScreenshot(
    (args) =>
      spawnSync("tauri-pilot", args, {
        env: process.env,
        windowsHide: true,
        encoding: "utf8",
      }),
    join(artifacts, name),
  );
}
/** @type {string[]} */
const providerRequests = [];
/** @type {string[]} */
const referencePaths = [];
const model = createServer(async (request, response) => {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  const body = JSON.parse(raw);
  providerRequests.push(raw);
  const contents = (body.messages ?? [])
    .map((/** @type {any} */ message) => message.content)
    .flat();
  const reference = contents
    .map((/** @type {any} */ part) => (typeof part === "string" ? part : (part?.text ?? "")))
    .join("\n");
  const match = reference.match(/saved at ("(?:\\.|[^"\\])*")/);
  if (match) referencePaths.push(JSON.parse(match[1]));
  response.writeHead(200, { "content-type": "application/x-ndjson" });
  response.end(
    JSON.stringify({
      model: "text-fixture",
      created_at: new Date().toISOString(),
      message: { role: "assistant", content: "Text attachment received." },
      done: true,
      done_reason: "stop",
      prompt_eval_count: 30,
      eval_count: 5,
    }) + "\n",
  );
});
await new Promise((done) => model.listen(0, "127.0.0.1", () => done(null)));
const address = model.address();
assert(address && typeof address !== "string");
await pilot(["ping"]);
await pilot(["snapshot", "-i"]);
const original = await invoke("get_settings", {});
assert(
  existsSync(original.workspace) &&
    resolve(original.workspace) === resolve(join(home, "workspace")),
  "Socket must belong to the isolated fixture",
);
/** @type {string[]} */
const conversations = [];
try {
  const config = structuredClone(original);
  config.onboarding_completed = true;
  config.providers = [
    {
      id: "text-fixture",
      name: "Text fixture",
      provider: "ollama",
      api_key: "",
      base_url: `http://127.0.0.1:${address.port}`,
      enabled: true,
      models: ["text-fixture"],
      model_context_compaction_thresholds: {},
      model_reasoning_efforts: {},
      model_reasoning_effort_enabled: {},
      model_vision_enabled: {},
    },
  ];
  config.defaults.chat_model = config.defaults.flash_model = {
    provider_id: "text-fixture",
    model: "text-fixture",
  };
  config.memory_retrieval_enabled = false;
  config.context_compaction_enabled = false;
  config.approval_mode = "off";
  for (const agent of Object.values(config.flash_agents))
    if (agent && typeof agent === "object" && "enabled" in agent) agent.enabled = false;
  for (const theme of ["light", "dark"])
    for (const language of ["en", "zh"]) {
      await invoke("save_settings", { config: { ...config, theme, language } });
      const id = crypto.randomUUID();
      conversations.push(id);
      await invoke("create_conversation", {
        id,
        title: `Text ${theme}/${language}`,
        workspace: original.workspace,
      });
      await evaluate("setTimeout(()=>location.reload(),100); true");
      await new Promise((done) => setTimeout(done, 500));
      await until("!!document.querySelector('.input-wrapper [contenteditable=true]')");
      await evaluate(
        `(async()=>{const {emitTo}=await import('/node_modules/@tauri-apps/api/event.js');await emitTo('main','settings-open-conversation',{conversationId:${JSON.stringify(id)}});return true;})()`,
      );
      await until(
        `document.body.textContent.includes(${JSON.stringify(`Text ${theme}/${language}`)})`,
      );
      await pilot(["snapshot", "-i"]);
      await screenshot(`${theme}-${language}-before.png`);
      const before = providerRequests.length;
      await pilot([
        "run",
        join(root, "tests/blackbox/text-attachments.toml"),
        "--junit",
        join(artifacts, `${theme}-${language}.xml`),
      ]);
      await until(
        "document.querySelectorAll('.user-msg .attachment-preview').length === 1 && document.body.textContent.includes('Text attachment received.') && !document.querySelector('.stop-btn')",
      );
      assert.equal(
        providerRequests.length,
        before + 1,
        "Paste or saving state submitted an extra request",
      );
      assert(
        !providerRequests.at(-1)?.includes("PASTED_PAYLOAD_SENTINEL"),
        "Provider received the entire pasted body",
      );
      const path = referencePaths.at(-1);
      assert(path, "Provider must receive a file path");
      assert(
        resolve(path).startsWith(home + "/") || resolve(path).startsWith(home + "\\"),
        "Provider path must belong to the isolated home",
      );
      assert.equal(
        readFileSync(path, "utf8"),
        "PASTED_PAYLOAD_SENTINEL\r\n" + "你好😀".repeat(400),
      );
      await screenshot(`${theme}-${language}-sent.png`);
      // A missing materialized file must be rebuilt from the durable checked blob.
      unlinkSync(path);
      await evaluate("setTimeout(()=>location.reload(),100); true");
      await new Promise((done) => setTimeout(done, 500));
      await until("document.querySelectorAll('.user-msg .attachment-preview').length === 1");
      // Rendering reads blob metadata; restoring provider history hydrates the file.
      await evaluate(`(() => {
        const editor = document.querySelector('.input-wrapper [role=textbox]');
        editor.focus(); const clipboard = new DataTransfer();
        clipboard.setData('text/plain', 'Recheck the saved file when needed.');
        editor.dispatchEvent(new ClipboardEvent('paste', {clipboardData: clipboard, bubbles: true, cancelable: true}));
        setTimeout(() => document.querySelector('.send-btn').click(), 100); return true;
      })()`);
      await until(
        "document.querySelectorAll('.user-msg').length === 2 && (document.body.innerText.match(/Text attachment received[.]/g) ?? []).length === 2 && !document.querySelector('.stop-btn')",
      );
      assert.equal(providerRequests.length, before + 2);
      assert(!providerRequests.at(-1)?.includes("PASTED_PAYLOAD_SENTINEL"));
      assert.equal(referencePaths.at(-1), path);
      assert.equal(
        readFileSync(path, "utf8"),
        "PASTED_PAYLOAD_SENTINEL\r\n" + "你好😀".repeat(400),
      );
      const checkpoints = await invoke("get_renderable_checkpoints", { convId: id });
      const serialized = JSON.stringify(checkpoints);
      assert(serialized.includes('"kind":"text_reference"'));
      assert(
        !serialized.includes("PASTED_PAYLOAD_SENTINEL"),
        "Renderable checkpoints leaked pasted bytes",
      );
      const collected = await execute(
        process.execPath,
        [
          join(
            root,
            "runtime/.agents/skills/inspect-conversation-checkpoints/scripts/inspect-conversation-records.ts",
          ),
          "--db",
          join(home, "messages.db"),
          "--conversation",
          id,
          "--json",
        ],
        { windowsHide: true },
      );
      const report = JSON.parse(collected.stdout);
      assert(
        report.checkpoints.some(
          (/** @type {any} */ checkpoint) => checkpoint.phase === "final_completed",
        ),
      );
      writeFileSync(join(artifacts, `${theme}-${language}-checkpoints.json`), collected.stdout);
      await screenshot(`${theme}-${language}-reload.png`);
    }
  await pilot(["logs", "--level", "error"]);
} finally {
  for (const id of conversations) {
    await invoke("cancel_chat_message", { convId: id }).catch(() => {});
    await invoke("delete_conversation", { convId: id }).catch(() => {});
  }
  await invoke("save_settings", { config: original });
  model.closeAllConnections();
  model.close();
}
console.log(
  `Text attachments passed: paste, preview/removal, failure recovery, provider path-only delivery and checkpoint reload in four appearances. Artifacts: ${artifacts}`,
);

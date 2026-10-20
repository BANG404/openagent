// @ts-check
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const root = resolve(import.meta.dirname, "..");
const home = resolve(process.env.OPENAGENT_HOME || "");
assert(
  process.env.OPENAGENT_HOME && process.env.TAURI_PILOT_SOCKET,
  "Select an isolated home and socket",
);
assert(
  ![".openagent", ".openagent-dev"].some((name) => home === resolve(homedir(), name)),
  "Preserve developer data",
);
const artifacts = mkdtempSync(join(tmpdir(), "openagent-interrupt-turn-"));
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
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if ((await evaluate(expression)) === "true") return;
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`Interrupt fixture timed out: ${expression}`);
}
let round = 0;
const model = createServer(async (request, response) => {
  for await (const chunk of request) void chunk;
  round++;
  const message =
    round === 1
      ? {
          role: "assistant",
          content: "Before the question",
          tool_calls: [
            {
              function: {
                name: "ask_user",
                arguments: {
                  title: "Turn question",
                  fields: [{ name: "proceed", type: "confirm", label: "Continue?" }],
                  submit_label: "Answer fixture",
                  cancel_label: "Cancel fixture",
                },
              },
            },
          ],
        }
      : round === 2
        ? {
            role: "assistant",
            content: "After the question",
            tool_calls: ["first", "second"].map((name) => ({
              function: {
                name: "create_file",
                arguments: { path: `${name}-${crypto.randomUUID()}.txt`, content: "fixture" },
              },
            })),
          }
        : { role: "assistant", content: "Interrupt Turn finished." };
  response.writeHead(200, { "content-type": "application/x-ndjson" });
  response.end(
    JSON.stringify({
      model: "interrupt-model",
      created_at: new Date().toISOString(),
      message,
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
const config = structuredClone(original);
config.workspace = join(home, "workspace");
config.onboarding_completed = true;
config.providers = [
  {
    id: "interrupt-fixture",
    name: "Local interrupt fixture",
    provider: "ollama",
    api_key: "",
    base_url: `http://127.0.0.1:${address.port}`,
    enabled: true,
    models: ["interrupt-model"],
    model_context_compaction_thresholds: {},
    model_reasoning_efforts: {},
    model_reasoning_effort_enabled: {},
    model_vision_enabled: {},
  },
];
config.defaults.chat_model = config.defaults.flash_model = {
  provider_id: "interrupt-fixture",
  model: "interrupt-model",
};
config.memory_retrieval_enabled = false;
config.context_compaction_enabled = false;
config.approval_mode = "manual";
for (const agent of Object.values(config.flash_agents))
  if (agent && typeof agent === "object" && "enabled" in agent) agent.enabled = false;
mkdirSync(config.workspace, { recursive: true });
/** @type {string[]} */
const conversations = [];
try {
  for (const theme of ["light", "dark"])
    for (const language of ["en", "zh"]) {
      round = 0;
      await invoke("save_settings", { config: { ...config, theme, language } });
      await invoke("set_workspace", { path: config.workspace });
      const id = crypto.randomUUID();
      conversations.push(id);
      await invoke("create_conversation", {
        id,
        title: `Interrupt ${id}`,
        workspace: config.workspace,
      });
      await invoke("create_branch", { id: crypto.randomUUID(), convId: id });
      await evaluate("setTimeout(()=>location.reload(),100); true");
      await new Promise((done) => setTimeout(done, 500));
      await until("!!document.querySelector('[contenteditable=true][role=textbox]')");
      await evaluate(
        "(async()=>{await window.__TAURI_INTERNALS__.invoke('plugin:window|show',{label:'main'});return true;})()",
      );
      await evaluate(
        `(async()=>{const {emitTo}=await import('/node_modules/@tauri-apps/api/event.js');await emitTo('main','settings-open-conversation',{conversationId:${JSON.stringify(id)}});return true;})()`,
      );
      await until(`document.body.textContent.includes(${JSON.stringify(`Interrupt ${id}`)})`);
      await pilot(["snapshot", "-i"]);
      await evaluate(
        `(async()=>{const editor=document.querySelector('[contenteditable=true][role=textbox]');editor.focus();const clipboard=new DataTransfer();clipboard.setData('text/plain','interrupt-turn-fixture');editor.dispatchEvent(new ClipboardEvent('paste',{clipboardData:clipboard,bubbles:true,cancelable:true}));await new Promise(resolve=>setTimeout(resolve,100));document.querySelector('.send-btn').click();return true;})()`,
      );
      await until(
        "!!document.querySelector('[role=dialog][aria-label=\"Turn question\"]') && !!document.querySelector('[data-waiting=true]')",
      );
      await pilot(["run", join(root, "tests/blackbox/interrupt-turn.toml")]);
      // Reload while waiting: recovery must retain the original Turn clock.
      await evaluate("setTimeout(()=>location.reload(),100); true");
      await new Promise((done) => setTimeout(done, 500));
      await until(
        "!!document.querySelector('[role=dialog][aria-label=\"Turn question\"]') && !!document.querySelector('[data-waiting=true]')",
      );
      await pilot(["snapshot", "-i"]);
      await pilot(["run", join(root, "tests/blackbox/interrupt-turn.toml")]);
      console.log(`Checking ${theme}/${language}: recovered question`);
      await evaluate(
        `document.querySelector('[role=dialog][aria-label="Turn question"] button:${language === "en" ? "last" : "first"}-child').click(); true`,
      );
      await until(
        "!!document.querySelector('.tool-approval-approve') && !!document.querySelector('[data-waiting=true]')",
      );
      await pilot(["snapshot", "-i"]);
      await pilot([
        "run",
        join(root, "tests/blackbox/interrupt-turn.toml"),
        "--junit",
        join(artifacts, `${theme}-${language}.xml`),
      ]);
      await pilot(["screenshot", join(artifacts, `${theme}-${language}-waiting.png`)]);
      for (const decision of ["approve", "deny"]) {
        await pilot(["snapshot", "-i"]);
        await evaluate(`document.querySelector('.tool-approval-${decision}').click(); true`);
        if (decision === "approve") {
          await until(
            "!!document.querySelector('.tool-approval-deny') && !!document.querySelector('[data-waiting=true]')",
          );
          await pilot(["run", join(root, "tests/blackbox/interrupt-turn.toml")]);
        }
      }
      await until(
        "document.body.textContent.includes('Interrupt Turn finished.') && !!document.querySelector('[data-summary=true]')",
      );
      assert.equal(await evaluate("document.querySelectorAll('.process-records').length"), "1");
      await evaluate("setTimeout(()=>location.reload(),100); true");
      await new Promise((done) => setTimeout(done, 500));
      await until(
        "document.body.textContent.includes('Interrupt Turn finished.') && !!document.querySelector('[data-summary=true]')",
      );
      assert.equal(await evaluate("document.querySelectorAll('.process-records').length"), "1");
      assert.equal(round, 3, "interrupt resume repeated a model request or lost a tool result");
    }
  await pilot(["logs", "--level", "error"]);
} finally {
  for (const convId of conversations) {
    await invoke("cancel_chat_message", { convId }).catch(() => {});
    await invoke("delete_conversation", { convId }).catch(() => {});
  }
  await invoke("save_settings", { config: original });
  await invoke("set_workspace", { path: original.workspace || null });
  model.closeAllConnections();
  model.close();
}
console.log(
  `Interrupt Turn black-box passed in four themes/locales, including ask_user answer/cancel, batched approvals, allow/deny and reload. Artifacts: ${artifacts}`,
);

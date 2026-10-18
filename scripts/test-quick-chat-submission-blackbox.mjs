// @ts-check
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, rmdir, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

const home = resolve(process.env.OPENAGENT_HOME || ".");
assert(process.env.TAURI_PILOT_SOCKET && home.includes("quick-chat"));
assert(![".openagent", ".openagent-dev"].some((name) => home === resolve(homedir(), name)));
const artifacts = await mkdtemp(join(tmpdir(), "quick-chat-submission-"));
const workspaceRoot = join(home, `workspaces-${Date.now()}`);
/** @type {string[]} */
const requestedModels = [];
const model = createServer(async (request, response) => {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  const body = JSON.parse(raw);
  requestedModels.push(body.model);
  response.writeHead(200, { "content-type": "application/x-ndjson" });
  response.end(
    JSON.stringify({
      model: body.model,
      created_at: new Date().toISOString(),
      message: { role: "assistant", content: "QUICK_CHAT_ACCEPTED" },
      done: true,
      done_reason: "stop",
      prompt_eval_count: 10,
      eval_count: 5,
    }) + "\n",
  );
});
await new Promise((done) => model.listen(0, "127.0.0.1", () => done(undefined)));
const address = model.address();
assert(address && typeof address !== "string");
/** @param {string[]} args @param {string} [window] */
async function pilot(args, window = "quick-chat") {
  const child = spawn("tauri-pilot", [...args, "--window", window], {
    cwd: artifacts,
    env: process.env,
    windowsHide: true,
  });
  let output = "",
    error = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    error += chunk;
  });
  const code = await new Promise((done, reject) => {
    child.once("error", reject);
    child.once("close", done);
  });
  assert.equal(code, 0, error || output);
  return output.trim();
}
/** @param {string} script @param {string} [window] */
const evaluate = (script, window) => pilot(["eval", script], window);
/** @param {string} command @param {unknown} args @returns {Promise<any>} */
async function invoke(command, args) {
  return JSON.parse(
    await evaluate(
      `(async()=>{const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');return JSON.stringify(await c.invokeProduct(${JSON.stringify(command)},${JSON.stringify(args)}));})()`,
    ),
  );
}
/** @param {string} expression @param {string} [window] */
async function until(expression, window) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if ((await evaluate(expression, window)) === "true") return;
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`Quick chat timed out: ${expression}`);
}
await pilot(["ping"]);
const original = await invoke("get_settings", {});
const originalPreferences = await evaluate(
  "localStorage.getItem('openagent.quick-chat-preferences:v1')",
);
try {
  const config = structuredClone(original);
  config.providers = [
    {
      id: "quick-chat-submission",
      name: "Fixture",
      provider: "ollama",
      api_key: "",
      base_url: `http://127.0.0.1:${address.port}`,
      enabled: true,
      models: ["default-model", "selected-model"],
      model_context_compaction_thresholds: {},
      model_reasoning_efforts: {},
      model_reasoning_effort_enabled: {},
      model_vision_enabled: {},
    },
  ];
  config.defaults.chat_model = config.defaults.flash_model = {
    provider_id: "quick-chat-submission",
    model: "default-model",
  };
  for (const theme of ["light", "dark"]) {
    for (const language of ["en", "zh"]) {
      const workspace = join(workspaceRoot, `${theme}-${language}`);
      await mkdir(workspace, { recursive: true });
      config.theme = theme;
      config.language = language;
      await invoke("save_settings", { config });
      await evaluate(
        "(async()=>{const {emit}=await import('/src/lib/openagent/tauriClient.ts');await emit('settings-changed');return true;})()",
      );
      await until(
        `document.querySelector('.send-btn')?.getAttribute('aria-label') === ${JSON.stringify(language === "en" ? "Send" : "发送")} && document.documentElement.classList.contains('dark') === ${theme === "dark"}`,
        "main",
      );
      // Return to the original workspace so each pass targets an unregistered one.
      await invoke("set_workspace", { path: original.workspace });
      await evaluate(
        `localStorage.setItem('openagent.quick-chat-preferences:v1', JSON.stringify({model:JSON.stringify(['quick-chat-submission','selected-model']),role:'openagent',workspace:${JSON.stringify(workspace)}}));window.__quickReload=true;setTimeout(()=>location.reload(),100);true`,
      );
      await until(
        `!window.__quickReload && document.querySelector('.model-select button')?.textContent.includes('selected-model') && document.querySelector('.send-btn')?.getAttribute('aria-label') === ${JSON.stringify(language === "en" ? "Send" : "发送")} && document.documentElement.classList.contains('dark') === ${theme === "dark"}`,
      );
      await evaluate(
        "(async()=>{const w=await import('/src/lib/quickChatWindow.ts');await w.showQuickChatWindow();return true;})()",
      );
      await pilot(["snapshot", "-i"]);
      const modelRequestStart = requestedModels.length;
      await evaluate(
        `window.__quickChatSubmissionText=${JSON.stringify(`QUICK_CHAT_${theme}_${language}`)};true`,
      );
      // A removed directory fails before acceptance and must retain the draft.
      await rmdir(workspace);
      await pilot([
        "run",
        join(import.meta.dirname, "../tests/blackbox/quick-chat-submission.toml"),
      ]);
      await until(
        "!document.querySelector('.send-btn').disabled && !!document.querySelector('.toast')",
      );
      assert.equal(
        await evaluate(
          "window.__TAURI_INTERNALS__.invoke('plugin:window|is_visible',{label:'quick-chat'})",
        ),
        "true",
      );
      assert(
        (await pilot(["text", ".quick-chat [contenteditable=true]"])).includes(
          `QUICK_CHAT_${theme}_${language}`,
        ),
      );
      await pilot(["screenshot", join(artifacts, `${theme}-${language}-retry.png`)]);
      await mkdir(workspace);
      await evaluate(
        "window.__TAURI_INTERNALS__.invoke('plugin:window|hide',{label:'main'}).then(()=>true)",
      );
      await pilot(["snapshot", "-i"]);
      await pilot(["click", ".quick-chat .send-btn"]);
      await until(
        "window.__TAURI_INTERNALS__.invoke('plugin:window|is_visible',{label:'quick-chat'}).then(visible=>!visible)",
      );
      await until(
        "window.__TAURI_INTERNALS__.invoke('plugin:window|is_visible',{label:'main'})",
        "main",
      );
      await until(
        `document.querySelector('.user-msg')?.textContent.includes(${JSON.stringify(`QUICK_CHAT_${theme}_${language}`)}) && document.body.textContent.includes('QUICK_CHAT_ACCEPTED')`,
        "main",
      );
      const context = await invoke("get_workspace_context", {});
      assert.equal(context.path, workspace);
      const conversations = await invoke("get_conversations", { workspace });
      assert.equal(conversations.length, 1, "failure did not leave an orphan conversation");
      const conversation = conversations[0];
      assert(conversation, "submission created a durable conversation");
      await writeFile(
        join(artifacts, `${theme}-${language}.json`),
        JSON.stringify({
          conversationId: conversation.id,
          workspace,
          model: requestedModels.at(-1),
        }),
      );
      assert(
        requestedModels.slice(modelRequestStart).includes("selected-model"),
        "the selected model reached the provider",
      );
      await pilot(["snapshot", "-i"], "main");
      await pilot(["screenshot", join(artifacts, `${theme}-${language}.png`)], "main");
      await evaluate(
        "window.__quickReload=true;setTimeout(()=>location.reload(),100);true",
        "main",
      );
      await until(
        `!window.__quickReload && document.querySelector('.user-msg')?.textContent.includes(${JSON.stringify(`QUICK_CHAT_${theme}_${language}`)}) && document.body.textContent.includes('QUICK_CHAT_ACCEPTED')`,
        "main",
      );
    }
  }
  process.stdout.write(await pilot(["logs", "--level", "error"], "main"));
  process.stdout.write(`Quick chat submission black-box passed. Artifacts: ${artifacts}\n`);
} finally {
  await invoke("save_settings", { config: original });
  await evaluate(
    `localStorage.${originalPreferences === "null" ? "removeItem('openagent.quick-chat-preferences:v1')" : `setItem('openagent.quick-chat-preferences:v1',${JSON.stringify(originalPreferences)})`};true`,
  );
  model.closeAllConnections();
  await new Promise((done) => model.close(done));
}

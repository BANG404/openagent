// @ts-check
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { resolveBlackboxHome } from "./tauri-test-environment.mjs";

const home = resolveBlackboxHome(process.env, { instanceName: "terminal-hooks" });
assert(
  ![".openagent", ".openagent-dev"].some(
    (name) => resolve(home) === resolve(join(homedir(), name)),
  ),
);
assert(process.env.TAURI_PILOT_SOCKET, "Select the isolated terminal-hooks window");
const artifacts = mkdtempSync(join(tmpdir(), "openagent-terminal-hooks-"));
/** @param {string[]} args */
async function pilot(args) {
  const process_ = spawn("tauri-pilot", [...args, "--window", "main"], {
    cwd: artifacts,
    env: process.env,
    windowsHide: true,
  });
  let output = "",
    error = "";
  process_.stdout.on("data", (chunk) => {
    output += chunk;
  });
  process_.stderr.on("data", (chunk) => {
    error += chunk;
  });
  const code = await new Promise((done, reject) => {
    process_.once("error", reject);
    process_.once("close", done);
  });
  assert.equal(code, 0, error || output);
  return output.trim();
}
/** @param {string} name */
async function captureNative(name) {
  const handle = process.env.BLACKBOX_NATIVE_WINDOW_HANDLE;
  if (handle) {
    const result = spawnSync(
      "python",
      [
        resolve("scripts/capture-windows-window.py"),
        "--hwnd",
        handle,
        "--output",
        join(artifacts, `${name}-native.png`),
      ],
      { encoding: "utf8", windowsHide: true },
    );
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    return;
  }
  const session = process.env.BLACKBOX_APPIUM_SESSION;
  if (!session) return;
  const response = await fetch(
    `${process.env.BLACKBOX_APPIUM_URL || "http://127.0.0.1:4723"}/session/${encodeURIComponent(session)}/screenshot`,
  );
  assert(response.ok, `Appium screenshot failed: ${response.status}`);
  const body = await response.json();
  writeFileSync(join(artifacts, `${name}-native.png`), Buffer.from(body.value, "base64"));
}
/** @param {() => Promise<boolean>} predicate */
async function until(predicate) {
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    if (await predicate()) return;
    await new Promise((done) => setTimeout(done, 150));
  }
  throw new Error("Terminal hook fixture timed out");
}
/** @param {string} operation @param {unknown} args @returns {Promise<any>} */
async function invoke(operation, args) {
  const output = await pilot([
    "eval",
    `(async () => {
    try { const {desktopOpenAgent:client}=await import('/src/lib/openagent/tauriClient.ts');
      return JSON.stringify({value:await client.invokeProduct(${JSON.stringify(operation)},${JSON.stringify(args)})});
    } catch(error) { return JSON.stringify({error:String(error)}); }
  })()`,
  ]);
  const result = JSON.parse(output);
  assert(!result.error, result.error);
  return result.value;
}

/** @type {Map<string, number>} */
const wakes = new Map();
const model = createServer(async (request, response) => {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  /** @type {any} */ const body = JSON.parse(raw || "{}");
  const messages = body.messages || [];
  const lastUserIndex = messages.findLastIndex(
    (/** @type {any} */ message) => message.role === "user",
  );
  const prompt = JSON.stringify(messages[lastUserIndex]?.content || "");
  const marker = JSON.stringify(messages).match(
    /TERMINAL_FIXTURE:(exit|output|mismatch|cancel|child):([a-f0-9-]+)/,
  );
  assert(marker, "Fixture model received unrelated input");
  const [, mode, id] = marker;
  console.log(
    `Fixture model: ${mode} ${prompt.includes("PRIVATE_TERMINAL_WAKE") ? "wake" : "ordinary"}`,
  );
  /** @type {any} */ let message = { role: "assistant", content: `TERMINAL_ARMED_${id}` };
  const toolResults = messages
    .slice(lastUserIndex + 1)
    .filter((/** @type {any} */ item) => item.role === "tool");
  if (prompt.includes("CHILD_TASK")) {
    await new Promise((done) => setTimeout(done, 2000));
    message.content = `CHILD_COMPLETED_${id}`;
  } else if (prompt.includes("PRIVATE_TERMINAL_WAKE")) {
    if (mode !== "child")
      assert(prompt.includes("TERMINAL_READY"), "provider wake omitted actual terminal output");
    else assert(prompt.includes("completed"), "provider wake omitted child lifecycle condition");
    wakes.set(id, (wakes.get(id) || 0) + 1);
    message.content = `TERMINAL_RESUMED_${id}`;
  } else if (toolResults.length === 0) {
    const command =
      process.platform === "win32"
        ? "Start-Sleep -Seconds 2; Write-Output TERMINAL_READY; Start-Sleep -Milliseconds 200"
        : "sleep 2; printf 'TERMINAL_READY\\n'; sleep 0.2";
    message = {
      role: "assistant",
      content: "",
      tool_calls: [
        {
          function: {
            name: mode === "child" ? "spawn_agent" : "exec_command",
            arguments:
              mode === "child"
                ? {
                    task_name: "hook_worker",
                    fork_turns: "none",
                    message: `CHILD_TASK TERMINAL_FIXTURE:child:${id}`,
                  }
                : { cmd: command, yield_time_ms: 0 },
          },
        },
      ],
    };
  } else if (toolResults.length === 1) {
    const source = JSON.parse(toolResults[0].content);
    const condition =
      mode === "child"
        ? {
            kind: "subagent",
            target: source.agent_id,
            event: "completed",
          }
        : {
            kind: "terminal",
            session_id: source.session_id ?? source.metadata.session_id,
            event: mode === "output" ? "output" : "exit",
            ...(mode === "output"
              ? { pattern: "TERMINAL_READY" }
              : mode === "mismatch"
                ? { pattern: "NEVER_MATCH" }
                : {}),
          };
    message = {
      role: "assistant",
      content: "",
      tool_calls: [
        {
          function: {
            name: "schedule_chat_hook",
            arguments: { message: `PRIVATE_TERMINAL_WAKE ${id}`, condition },
          },
        },
      ],
    };
  } else if (mode === "cancel") {
    await new Promise((done) => setTimeout(done, 5000));
    if (response.destroyed) return;
  }
  response.writeHead(200, { "content-type": "application/x-ndjson" });
  response.end(
    JSON.stringify({
      model: "test-model",
      created_at: new Date().toISOString(),
      message,
      done: true,
      done_reason: "stop",
      prompt_eval_count: 30,
      eval_count: 8,
    }) + "\n",
  );
});
await new Promise((done) => model.listen(0, "127.0.0.1", () => done(null)));
const address = model.address();
assert(address && typeof address !== "string");
await pilot(["ping"]);
await pilot(["snapshot", "-i"]);
await until(
  async () =>
    (await pilot([
      "eval",
      "Boolean(document.querySelector('[contenteditable=true][role=textbox]'))",
    ])) === "true",
);
const original = await invoke("get_settings", {});
assert.equal(
  resolve(original.workspace),
  resolve(join(home, "workspace")),
  "The pilot socket must belong to the isolated fixture",
);
/** @type {string[]} */ const conversations = [];
try {
  const config = structuredClone(original);
  config.providers = [
    {
      id: "terminal-fixture",
      name: "Local terminal fixture",
      provider: "ollama",
      api_key: "",
      base_url: `http://127.0.0.1:${address.port}`,
      enabled: true,
      models: ["test-model"],
      model_context_compaction_thresholds: {},
      model_reasoning_efforts: {},
      model_reasoning_effort_enabled: {},
      model_vision_enabled: {},
    },
  ];
  config.defaults.chat_model = { provider_id: "terminal-fixture", model: "test-model" };
  config.defaults.flash_model = config.defaults.chat_model;
  config.approval_mode = "off";
  config.memory_retrieval_enabled = false;
  config.context_compaction_enabled = false;
  config.permission_profile = { enforcement: "disabled" };
  config.multi_agent_v2 = { ...config.multi_agent_v2, enabled: true };
  for (const agent of Object.values(config.flash_agents)) {
    if (agent && typeof agent === "object" && "enabled" in agent) agent.enabled = false;
  }
  for (const [theme, language, mode] of [
    ["light", "en", "exit"],
    ["dark", "zh", "output"],
    ["light", "zh", "mismatch"],
    ["dark", "en", "cancel"],
    ["light", "en", "child"],
    ["dark", "zh", "child"],
  ]) {
    console.log(`Checking ${theme}/${language}/${mode}`);
    await invoke("save_settings", { config: { ...config, theme, language } });
    await pilot([
      "eval",
      "window.__terminalReloadPending=true; setTimeout(() => location.reload(), 100); true",
    ]);
    await until(
      async () =>
        (await pilot([
          "eval",
          "window.__terminalReloadPending !== true && Boolean(document.querySelector('[contenteditable=true][role=textbox]'))",
        ])) === "true",
    );
    const id = crypto.randomUUID();
    conversations.push(id);
    await invoke("create_conversation", {
      id,
      title: `Terminal ${mode}`,
      workspace: original.workspace,
    });
    await invoke("create_branch", { id: crypto.randomUUID(), convId: id });
    await pilot([
      "eval",
      "window.__terminalReloadPending=true; setTimeout(() => location.reload(), 100); true",
    ]);
    await until(
      async () =>
        (await pilot([
          "eval",
          `window.__terminalReloadPending !== true && document.body.textContent.includes('Terminal ${mode}') && Boolean(document.querySelector('[contenteditable=true][role=textbox]'))`,
        ])) === "true",
    );
    await pilot([
      "eval",
      `(async () => {const {emitTo}=await import('/node_modules/@tauri-apps/api/event.js'); await emitTo('main','settings-open-conversation',{conversationId:${JSON.stringify(id)}}); return true;})()`,
    ]);
    await until(
      async () =>
        (await pilot([
          "eval",
          `document.body.textContent.includes('conversation: ${id}') && Boolean(document.querySelector('[contenteditable=true][role=textbox]'))`,
        ])) === "true",
    );
    await new Promise((done) => setTimeout(done, 400));
    const probe = { id, mode, theme, language, marker: `TERMINAL_FIXTURE:${mode}:${id}` };
    await pilot(["eval", `window.__terminalHookProbe=${JSON.stringify(probe)}; true`]);
    await pilot(["snapshot", "-i"]);
    await captureNative(`${theme}-${language}-${mode}-before`);
    try {
      await pilot(["run", resolve("tests/blackbox/terminal-hooks.toml")]);
    } catch (error) {
      console.error(await pilot(["eval", "document.body.innerText"]));
      throw error;
    }
    if (mode === "exit" || mode === "output" || mode === "child") {
      assert.equal(wakes.get(id), 1, "Each hook must wake exactly once");
      const checkpoints = await invoke("get_renderable_checkpoints", { convId: id });
      const records = checkpoints.at(-1).data.messages;
      const hidden = records.filter((/** @type {any} */ record) =>
        record.tags.includes("hook_wake"),
      );
      assert.equal(hidden.length, 1);
      assert.equal(hidden[0].role, "user");
      assert(JSON.stringify(hidden[0]).includes("PRIVATE_TERMINAL_WAKE"));
      const inspection = spawnSync(
        process.execPath,
        [
          resolve(
            "sdk/.agents/skills/inspect-conversation-checkpoints/scripts/inspect-conversation-records.ts",
          ),
          "--db",
          join(home, "messages.db"),
          "--conversation",
          id,
          "--json",
          "--include-content",
        ],
        { encoding: "utf8", windowsHide: true },
      );
      assert.equal(inspection.status, 0, inspection.stderr);
      const report = JSON.parse(inspection.stdout);
      assert(
        report.checkpoints.some(
          (/** @type {any} */ checkpoint) =>
            checkpoint.checkpoint_id === report.conversation.active_tip_checkpoint_id &&
            checkpoint.checkpoint.phase === "final_completed",
        ),
      );
      await pilot([
        "eval",
        "window.__terminalReloadPending=true; setTimeout(() => location.reload(), 100); true",
      ]);
      await until(
        async () =>
          (await pilot([
            "eval",
            `window.__terminalReloadPending !== true && document.body.textContent.includes('TERMINAL_RESUMED_${id}') && !document.querySelector('.stop-btn')`,
          ])) === "true",
      );
      assert.equal(
        await pilot(["eval", "document.body.textContent.includes('PRIVATE_TERMINAL_WAKE')"]),
        "false",
      );
      assert.equal(await pilot(["eval", "document.querySelectorAll('.user-msg').length"]), "1");
    } else {
      await new Promise((done) => setTimeout(done, 3500));
      assert.equal(wakes.get(id) || 0, 0, "Nonmatching and cancelled hooks must not wake");
    }
    await pilot(["screenshot", join(artifacts, `${theme}-${language}-${mode}.png`)]);
    await captureNative(`${theme}-${language}-${mode}-after`);
  }
} finally {
  await invoke("save_settings", { config: original });
  for (const convId of conversations) await invoke("delete_conversation", { convId });
  model.closeAllConnections();
  model.close();
}
console.log(`Terminal hook black-box verification passed. Artifacts: ${artifacts}`);

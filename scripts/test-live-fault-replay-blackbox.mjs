// @ts-check
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, resolve } from "node:path";
import { readFrontendCapture } from "./fault-capture-files.ts";

const root = resolve(import.meta.dirname, "..");
const home = resolve(process.env.OPENAGENT_HOME || "");
assert(process.env.OPENAGENT_HOME && process.env.TAURI_PILOT_SOCKET, "select an isolated fixture");
assert(
  home.includes("fault-replay") &&
    ![".openagent", ".openagent-dev"].some((name) => home === resolve(homedir(), name)),
);
const artifacts = mkdtempSync(join(tmpdir(), "openagent-live-fault-replay-"));
/** @param {string} command @param {string[]} args @param {string} [cwd] */
async function run(command, args, cwd = artifacts) {
  const child = spawn(command, args, { cwd, env: process.env, windowsHide: true });
  let stdout = "",
    stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const timer = setTimeout(() => child.kill(), 60000);
  try {
    const code = await new Promise((done, reject) => {
      child.once("error", reject);
      child.once("close", done);
    });
    assert.equal(code, 0, stderr || stdout);
    return stdout.trim();
  } finally {
    clearTimeout(timer);
  }
}
/** @param {string[]} args */
const pilot = (args) => run("tauri-pilot", [...args, "--window", "main"]);
/** @param {string} script */
const evaluate = (script) => pilot(["eval", script]);
/** @param {string} operation @param {unknown} args @returns {Promise<any>} */
async function invoke(operation, args) {
  return JSON.parse(
    await evaluate(
      `(async()=>{const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');return JSON.stringify({value:await c.invokeProduct(${JSON.stringify(operation)},${JSON.stringify(args)})});})()`,
    ),
  ).value;
}
async function readySettings() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      return await invoke("get_settings", {});
    } catch (error) {
      if (!String(error).includes("Runtime is draining for a supervised restart")) throw error;
      await new Promise((done) => setTimeout(done, 100));
    }
  }
  throw new Error("Fixture Runtime did not finish its supervised restart");
}
/** @param {string} expression */
async function until(expression) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if ((await evaluate(expression)) === "true") return;
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`Live fault replay timed out: ${expression}`);
}
const prompts = new Set();
const model = createServer(async (request, response) => {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  const body = JSON.parse(raw);
  const userContent = body.messages?.findLast(
    (/** @type {any} */ message) => message.role === "user",
  )?.content;
  const prompt = JSON.stringify(userContent || "").match(
    /LIVE_REPLAY:(?:complete|cancel):[a-f0-9-]+/,
  )?.[0];
  if (!prompt) {
    writeFileSync(
      join(artifacts, "unexpected-provider-input.json"),
      JSON.stringify({ url: request.url, keys: Object.keys(body), messages: body.messages }),
    );
    response.writeHead(400);
    response.end("Unexpected fixture input");
    return;
  }
  prompts.add(prompt);
  response.writeHead(200, { "Content-Type": "application/x-ndjson" });
  response.write(
    JSON.stringify({
      model: "test-model",
      created_at: "2026-10-09T00:00:00Z",
      message: {
        role: "assistant",
        content: prompt.includes(":cancel:") ? "LIVE_PARTIAL" : "LIVE_COMPLETED",
      },
      done: false,
    }) + "\n",
  );
  if (!prompt.includes(":cancel:"))
    response.end(
      JSON.stringify({
        model: "test-model",
        created_at: "2026-10-09T00:00:00Z",
        message: { role: "assistant", content: "" },
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
const original = await readySettings();
process.stdout.write(`Fixture artifacts: ${artifacts}\n`);
assert.equal(resolve(original.workspace), resolve(join(home, "workspace")), "wrong fixture socket");
/** @type {string[]} */ const conversations = [];
try {
  const config = structuredClone(original);
  config.providers = [
    {
      id: "live-replay-fixture",
      name: "Local replay fixture",
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
  config.defaults.chat_model = config.defaults.flash_model = {
    provider_id: "live-replay-fixture",
    model: "test-model",
  };
  config.approval_mode = "off";
  config.memory_retrieval_enabled = false;
  for (const agent of Object.values(config.flash_agents))
    if (agent && typeof agent === "object" && "enabled" in agent) agent.enabled = false;
  await invoke("save_settings", { config });
  await readySettings();
  for (const theme of ["light", "dark"])
    for (const language of ["en", "zh"])
      for (const outcome of ["complete", "cancel"]) {
        await invoke("save_settings", { config: { ...config, theme, language } });
        await readySettings();
        const id = crypto.randomUUID();
        conversations.push(id);
        await invoke("create_conversation", {
          id,
          title: `Live replay ${outcome}`,
          workspace: original.workspace,
        });
        await invoke("create_branch", { id: crypto.randomUUID(), convId: id });
        await evaluate("window.__liveFaultReload=true;setTimeout(()=>location.reload(),100);true");
        await until(
          "window.__liveFaultReload!==true && !!window.openagentFaultCapture && !!document.querySelector('[contenteditable=true][role=textbox]')",
        );
        await evaluate(
          `(async()=>{const {emitTo}=await import('/node_modules/@tauri-apps/api/event.js');await emitTo('main','settings-open-conversation',{conversationId:${JSON.stringify(id)}});return true;})()`,
        );
        await until(
          `document.body.textContent.includes('conversation: ${id}') && !!document.querySelector('[contenteditable=true][role=textbox]')`,
        );
        await until(
          "(async()=>{const {desktopRecordingTransport:t}=await import('/src/lib/openagent/tauriClient.ts');return t.idle;})()",
        );
        const started = JSON.parse(
          await evaluate(
            `(async()=>JSON.stringify(await window.openagentFaultCapture.start({conversations:[${JSON.stringify(id)}],includePrivateContent:true})))()`,
          ),
        );
        const prompt = `LIVE_REPLAY:${outcome}:${id}`;
        await evaluate(`window.__liveFaultReplay=${JSON.stringify({ prompt })};true`);
        await pilot(["snapshot", "-i"]);
        await pilot(["run", join(root, "tests/blackbox/live-fault-replay-submit.toml")]);
        const content = outcome === "cancel" ? "LIVE_PARTIAL" : "LIVE_COMPLETED";
        await until(`document.body.textContent.includes(${JSON.stringify(content)})`);
        if (outcome === "cancel") {
          await pilot(["snapshot", "-i"]);
          await pilot(["run", join(root, "tests/blackbox/live-fault-replay-stop.toml")]);
        }
        await until("!document.querySelector('.stop-btn')");
        await until(
          "(async()=>{const {desktopRecordingTransport:t}=await import('/src/lib/openagent/tauriClient.ts');return t.idle;})()",
        );
        await evaluate("(async()=>JSON.stringify(await window.openagentFaultCapture.stop()))()");
        assert(prompts.has(prompt), "ordinary composer must reach the real Runtime/provider");
        const capturePath = join(home, "diagnostics/replay", started.session_id);
        const capture = await readFrontendCapture(capturePath);
        assert.equal(
          capture.manifest.completeness,
          "complete",
          JSON.stringify(capture.manifest.reasons),
        );
        const assertions = join(artifacts, `${id}-assertions.json`);
        const expectations = [
          {
            id: "user-preserved",
            path: ["conversations", id, "messages", "0", "content"],
            equals: prompt,
          },
          {
            id: "reply-preserved",
            path: ["conversations", id, "messages", "1", "content"],
            equals: content,
          },
          {
            id: "exact-record-count",
            path: ["conversations", id, "messages", "length"],
            equals: outcome === "cancel" ? 3 : 2,
          },
          { id: "stream-cleaned", path: ["streaming"], equals: {} },
          { id: "awaiting-cleaned", path: ["awaiting_output"], equals: {} },
        ];
        if (outcome === "cancel")
          expectations.push(
            {
              id: "durable-interruption-notice",
              path: ["conversations", id, "messages", "2", "items", "0", "type"],
              equals: "runtime_notice",
            },
            {
              id: "interruption-kind",
              path: ["conversations", id, "messages", "2", "items", "0", "kind"],
              equals: "interrupted",
            },
          );
        writeFileSync(assertions, JSON.stringify(expectations));
        const output = join(artifacts, `${id}-case.json`);
        const extracted = await run(
          process.execPath,
          [
            join(root, "scripts/fault-extract.ts"),
            "--capture",
            capturePath,
            "--assertions",
            assertions,
            "--out",
            output,
            "--id",
            `live-${theme}-${language}-${outcome}`,
            "--private-reviewed",
          ],
          root,
        );
        assert.equal(JSON.parse(extracted).status, "extracted");
        for (let repeat = 0; repeat < 5; repeat++) {
          const replay = await run(
            process.execPath,
            [join(root, "scripts/fault-replay.ts"), "replay", "--case", output],
            root,
          );
          assert.equal(JSON.parse(replay).status, "passed");
        }
        await pilot(["screenshot", join(artifacts, `${theme}-${language}-${outcome}.png`)]);
        process.stdout.write(
          `Live ${theme}/${language}/${outcome}: capture, extraction and 5 offline replays passed.\n`,
        );
      }
} finally {
  // This fixture owns only the conversations it created and its temporary provider.
  try {
    await evaluate(
      "(async()=>{try{await window.openagentFaultCapture?.stop();}catch{}return true;})()",
    );
    for (const convId of conversations) {
      await invoke("cancel_chat_message", { convId });
      await invoke("delete_conversation", { convId });
    }
    await invoke("save_settings", { config: original });
  } finally {
    model.closeAllConnections();
    await new Promise((done) => model.close(done));
  }
}

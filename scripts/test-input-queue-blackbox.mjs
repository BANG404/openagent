// @ts-check
import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, existsSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { captureBlackboxScreenshot } from "./blackbox-screenshot.mjs";

const root = resolve(import.meta.dirname, "..");
const home = resolve(process.env.OPENAGENT_HOME || "");
assert(
  process.env.OPENAGENT_HOME && process.env.TAURI_PILOT_SOCKET,
  "Select this fixture's isolated home and Pilot socket",
);
assert(
  ![".openagent", ".openagent-dev"].some((name) => home === resolve(homedir(), name)),
  "Preserve developer and release state",
);
const artifacts = mkdtempSync(join(tmpdir(), "openagent-input-queue-native-"));
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
/** @param {string} name */
async function screenshot(name) {
  const path = join(artifacts, name);
  if (process.env.BLACKBOX_NATIVE_WINDOW_ID)
    captureBlackboxScreenshot(
      (args) => spawnSync("tauri-pilot", args, { env: process.env, windowsHide: true }),
      path,
    );
  else await pilot(["screenshot", path]);
}
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
  throw new Error(`Input queue assertion timed out: ${expression}`);
}
/** @type {Array<{ marker: string; content: string }>} */
const requests = [];
/** @type {Array<() => void>} */
const releases = [];
let hold = true;
const model = createServer(async (request, response) => {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  const body = JSON.parse(raw);
  const content = JSON.stringify(
    body.messages?.findLast((/** @type {any} */ item) => item.role === "user")?.content ?? "",
  );
  const marker = content.match(/QUEUE(?:\\+)?_FIXTURE:([a-f0-9-]+)/)?.[1];
  if (!marker) {
    response.writeHead(400);
    response.end("Unrelated fixture input");
    return;
  }
  requests.push({ marker, content });
  response.writeHead(200, { "content-type": "application/x-ndjson" });
  const chunk = (/** @type {string} */ text, done = false) =>
    response.write(
      JSON.stringify({
        model: "queue-model",
        created_at: new Date().toISOString(),
        message: { role: "assistant", content: text },
        done,
        ...(done ? { done_reason: "stop", prompt_eval_count: 40, eval_count: 12 } : {}),
      }) + "\n",
    );
  chunk(`Queue response ${marker}: `);
  const finish = () => {
    if (!response.destroyed) {
      chunk("complete suffix", true);
      response.end();
    }
  };
  if (hold) releases.push(finish);
  else finish();
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
  "The socket must belong to the isolated queue fixture",
);
await screenshot("before.png");
/** @type {string[]} */
const conversations = [];
try {
  const config = structuredClone(original);
  config.onboarding_completed = true;
  config.providers = [
    {
      id: "queue-fixture",
      name: "Local queue fixture",
      provider: "ollama",
      api_key: "",
      base_url: `http://127.0.0.1:${address.port}`,
      enabled: true,
      models: ["queue-model"],
      model_context_compaction_thresholds: {},
      model_reasoning_efforts: {},
      model_reasoning_effort_enabled: {},
      model_vision_enabled: {},
    },
  ];
  config.defaults.chat_model = config.defaults.flash_model = {
    provider_id: "queue-fixture",
    model: "queue-model",
  };
  config.memory_retrieval_enabled = false;
  config.context_compaction_enabled = false;
  config.approval_mode = "off";
  for (const agent of Object.values(config.flash_agents))
    if (agent && typeof agent === "object" && "enabled" in agent) agent.enabled = false;
  for (const theme of ["light", "dark"])
    for (const language of ["en", "zh"]) {
      await invoke("save_settings", { config: { ...config, theme, language } });
      const marker = crypto.randomUUID();
      /** @param {string} suffix */
      async function openConversation(suffix) {
        const id = `${marker}-${suffix}`;
        conversations.push(id);
        await invoke("create_conversation", {
          id,
          title: `Queue ${theme}/${language} ${suffix}`,
          workspace: original.workspace,
        });
        const emptyQueue = JSON.parse(
          await evaluate(
            `(async()=>{const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');return JSON.stringify(await c.getInputQueue(${JSON.stringify(id)}));})()`,
          ),
        );
        assert.deepEqual(
          emptyQueue.items,
          [],
          "A conversation without branches has an empty queue",
        );
        await evaluate(
          `sessionStorage.setItem('input-queue-fixture',${JSON.stringify(JSON.stringify({ marker, convId: id, language }))}); setTimeout(()=>location.reload(),100); true`,
        );
        await new Promise((done) => setTimeout(done, 500));
        await until("!!document.querySelector('[contenteditable=true][role=textbox]')");
        await evaluate(
          `(async()=>{const {emitTo}=await import('/node_modules/@tauri-apps/api/event.js');await emitTo('main','settings-open-conversation',{conversationId:${JSON.stringify(id)}});return true;})()`,
        );
        await until(
          `document.body.textContent.includes(${JSON.stringify(`Queue ${theme}/${language} ${suffix}`)}) && !!document.querySelector('[contenteditable=true][role=textbox]')`,
        );
        return id;
      }
      hold = true;
      await openConversation("stop");
      await pilot(["snapshot", "-i"]);
      await pilot([
        "run",
        join(root, "tests/blackbox/input-queue.toml"),
        "--junit",
        join(artifacts, `${theme}-${language}-queue.xml`),
      ]);
      await screenshot(`${theme}-${language}.png`);
      hold = false;
      releases.splice(0).forEach((release) => release());
      await evaluate("setTimeout(()=>location.reload(),100); true");
      await new Promise((done) => setTimeout(done, 500));
      await until("document.querySelectorAll('.chat-queue [data-queue-id]').length === 2");
      await pilot(["snapshot", "-i"]);
      await pilot(["run", join(root, "tests/blackbox/input-queue-resume.toml")]);
      const ordered = requests.filter((request) => request.marker === marker);
      assert.equal(ordered.length, 3, "Stop or reload dispatched an extra input");
      assert(
        ordered[1].content.includes("third") && ordered[2].content.includes("edited-second"),
        "Runtime ignored native edit or ordering",
      );
      hold = true;
      const steeringId = await openConversation("steer");
      const beforeSteer = requests.length;
      await pilot(["snapshot", "-i"]);
      await pilot(["run", join(root, "tests/blackbox/input-queue-steer.toml")]);
      await screenshot(`${theme}-${language}-streaming-actions.png`);
      await evaluate("document.querySelector('.input-wrapper').style.width='280px'; true");
      await screenshot(`${theme}-${language}-streaming-actions-narrow.png`);
      await evaluate("document.querySelector('.input-wrapper').style.width=''; true");
      releases.splice(0).forEach((release) => release());
      for (const suffix of ["correction", "next-turn"]) {
        const expected = beforeSteer + (suffix === "correction" ? 2 : 3);
        const deadline = Date.now() + 15000;
        while (requests.length < expected && Date.now() < deadline)
          await new Promise((done) => setTimeout(done, 50));
        assert.equal(requests.length, expected, "The next provider stream did not start");
        await evaluate(
          `sessionStorage.setItem('input-queue-live-input',${JSON.stringify(suffix)}); true`,
        );
        await pilot(["snapshot", "-i"]);
        await pilot([
          "run",
          join(root, "tests/blackbox/input-queue-live-user.toml"),
          "--junit",
          join(artifacts, `${theme}-${language}-${suffix}-live-user.xml`),
        ]);
        await screenshot(`${theme}-${language}-${suffix}-live-user.png`);
        if (suffix === "next-turn") hold = false;
        releases.splice(0).forEach((release) => release());
      }
      await until(
        "!document.querySelector('.chat-queue') && !document.querySelector('.input-wrapper-streaming') && !document.querySelector('.stop-btn') && !document.querySelector('.steer-btn') && document.querySelector('[contenteditable=true][role=textbox]')?.textContent.includes('unsent-steering-draft')",
      );
      await screenshot(`${theme}-${language}-settled-actions.png`);
      await evaluate(
        `(()=>{const ids=JSON.parse(sessionStorage.getItem('input-queue-live-user-ids'));for(const id of Object.values(ids)){if([...document.querySelectorAll('.user-msg')].filter(row=>row.dataset.messageId===id).length!==1)throw new Error('terminal hydration duplicated or lost a queued user bubble');}if([...document.querySelectorAll('.user-msg')].some(row=>/clear-before-consume|delete-before-consume/.test(row.textContent)))throw new Error('terminal hydration restored removed steering');return true;})()`,
      );
      const steered = requests.slice(beforeSteer);
      assert.equal(steered.length, 3, "Steering did not remain inside the current run");
      assert(steered[1].content.includes("correction") && steered[2].content.includes("next-turn"));
      const checkpoints = await invoke("get_renderable_checkpoints", { convId: steeringId });
      const messages = checkpoints.at(-1)?.data.messages || [];
      assert(
        !messages.some((/** @type {any} */ message) =>
          /clear-before-consume|delete-before-consume/.test(JSON.stringify(message.content)),
        ),
        "Removed steering entered the durable transcript",
      );
      assert.equal(
        messages.filter(
          (/** @type {any} */ message) =>
            message.role === "user" && JSON.stringify(message.content).includes("correction"),
        ).length,
        2,
      );
      const { stdout: records } = await execute(
        process.execPath,
        [
          join(
            root,
            "runtime/.agents/skills/inspect-conversation-checkpoints/scripts/inspect-conversation-records.ts",
          ),
          "--db",
          join(home, "messages.db"),
          "--conversation",
          steeringId,
          "--json",
        ],
        { cwd: join(root, "runtime"), env: process.env, windowsHide: true },
      );
      writeFileSync(join(artifacts, `${theme}-${language}-checkpoints.json`), records);
      for (const command of ["renderability", "diagnose"]) {
        const { stdout } = await execute(
          "python",
          [
            join(root, "runtime/.agents/skills/openagent-dev-chat/scripts/openagent_dev.py"),
            command,
            steeringId,
          ],
          {
            cwd: join(root, "runtime"),
            env: { ...process.env, OPENAGENT_CONFIG_DIR: home },
            windowsHide: true,
          },
        );
        const result = JSON.parse(stdout);
        assert(
          !(result.renderability ?? result).errors?.length,
          `${command} reported checkpoint rendering errors`,
        );
        writeFileSync(join(artifacts, `${theme}-${language}-${command}.json`), stdout);
      }
      try {
        await pilot([
          "run",
          join(root, "tests/blackbox/input-queue-first-send.toml"),
          "--junit",
          join(artifacts, `${theme}-${language}-first-send.xml`),
        ]);
        await screenshot(`${theme}-${language}-first-send.png`);
      } finally {
        const firstSendId = await evaluate("sessionStorage.getItem('input-queue-first-send-id')");
        if (firstSendId && firstSendId !== "null") conversations.push(firstSendId);
        await evaluate("sessionStorage.removeItem('input-queue-first-send-id'); true");
      }
      await pilot(["logs", "--level", "error"]);
    }
} finally {
  hold = false;
  releases.splice(0).forEach((release) => release());
  for (const id of conversations) {
    await invoke("cancel_chat_message", { convId: id }).catch(() => {});
    await invoke("delete_conversation", { convId: id }).catch(() => {});
  }
  await invoke("save_settings", { config: original });
  model.closeAllConnections();
  model.close();
}
console.log(
  `Native input queue: branchless reads, slow first send, ordering, editing, Stop/reload/resume and steering passed in four theme/locale combinations. Artifacts: ${artifacts}`,
);

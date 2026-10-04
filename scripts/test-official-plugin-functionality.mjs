// @ts-check
// Qualify explicitly selected plugin checkouts against the real desktop Runtime.
// A deterministic Ollama endpoint supplies tool decisions, never provider credentials.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";
import assert from "node:assert/strict";
import { resolveBlackboxHome } from "./tauri-test-environment.mjs";
import { readPluginDevIndex, resolvePluginDevPath } from "./plugin-dev-paths.mjs";

const fixture = resolveBlackboxHome(process.env, { instanceName: "plugin-lifecycle" });
assert(
  ![".openagent", ".openagent-dev"].some(
    (name) => resolve(fixture) === resolve(join(homedir(), name)),
  ),
  "use an isolated OPENAGENT_HOME",
);
const pluginIndex = readPluginDevIndex();
const selectedPlugins = ["goal", "graph", "chat-groups"].filter(
  (id) =>
    !process.env.BLACKBOX_PLUGIN_IDS || process.env.BLACKBOX_PLUGIN_IDS.split(",").includes(id),
);
assert(selectedPlugins.length, "BLACKBOX_PLUGIN_IDS must select goal, graph or chat-groups");
const checkouts = selectedPlugins.map((id) => resolvePluginDevPath(pluginIndex, id));
const workspace = join(fixture, "workspace");
const pilotEnv = {
  ...process.env,
  OPENAGENT_HOME: fixture,
  OPENAGENT_DEV_INSTANCE: process.env.OPENAGENT_DEV_INSTANCE || "plugin-lifecycle",
};
/** @param {string} scenario */
async function runScenario(scenario) {
  const child = spawn("tauri-pilot", ["run", resolve(scenario), "--window", "main"], {
    env: pilotEnv,
    cwd: tmpdir(),
    windowsHide: true,
    stdio: "inherit",
  });
  const code = await new Promise((done, reject) => {
    child.once("error", reject);
    child.once("close", done);
  });
  assert.equal(code, 0, `${scenario} failed`);
}
/** @param {string} script */
async function evaluate(script) {
  const child = spawn("tauri-pilot", ["eval", script, "--window", "main"], {
    env: pilotEnv,
    windowsHide: true,
  });
  let stdout = "",
    stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const code = await new Promise((done, reject) => {
    child.once("error", reject);
    child.once("close", done);
  });
  assert.equal(code, 0, stderr || stdout);
  return stdout.trim();
}
/** @param {string} expression */
async function client(expression) {
  const key = crypto.randomUUID();
  await evaluate(
    `window.__pluginQualification ??= {}; void (async () => { const {desktopOpenAgent: client}=await import('/src/lib/openagent/tauriClient.ts'); try { window.__pluginQualification[${JSON.stringify(key)}] = JSON.stringify({value: await (${expression})}); } catch(error) { window.__pluginQualification[${JSON.stringify(key)}] = JSON.stringify({error:String(error)}); } })(); true`,
  );
  await until(
    async () =>
      (await evaluate(
        `typeof window.__pluginQualification[${JSON.stringify(key)}] === 'string'`,
      )) === "true",
    "Runtime operation did not finish during plugin qualification",
  );
  const output = await evaluate(
    `(() => {const result=window.__pluginQualification[${JSON.stringify(key)}]; delete window.__pluginQualification[${JSON.stringify(key)}]; return result;})()`,
  );
  const result = JSON.parse(output);
  assert(!result.error, result.error);
  return result.value;
}
/** @param {string} operation @param {unknown} args */
function invoke(operation, args) {
  return client(`client.invokeProduct(${JSON.stringify(operation)}, ${JSON.stringify(args)})`);
}
/** @param {() => Promise<boolean> | boolean} predicate @param {string} message */
async function until(predicate, message) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((done) => setTimeout(done, 150));
  }
  throw new Error(message);
}

let modelRequests = 0;
const model = createServer(async (request, response) => {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  const body = JSON.parse(raw || "{}");
  modelRequests++;
  const messages = body.messages || [];
  const lastUser = [...messages]
    .reverse()
    .find((/** @type {any} */ message) => message.role === "user");
  const prompt = JSON.stringify(lastUser?.content || "");
  if (prompt.includes("Stop the active Goal")) {
    await new Promise((done) => setTimeout(done, 5000));
    if (response.destroyed) return;
  }
  const lastUserIndex = messages.findLastIndex(
    (/** @type {any} */ message) => message.role === "user",
  );
  const currentRound = messages.slice(lastUserIndex + 1);
  const hasToolResult = currentRound.some((/** @type {any} */ message) => message.role === "tool");
  /** @type {any} */
  const message = { role: "assistant", content: "Plugin qualification node completed." };
  const goalWork =
    prompt.includes("You are running the OpenAgent Goal plugin.") ||
    prompt.includes("private control continuation from the OpenAgent Goal plugin.");
  const goalAction = prompt.match(/The user requested Goal (\w+)/)?.[1];
  if (goalAction) message.content = `Goal ${goalAction} confirmed.`;
  if (!hasToolResult && goalWork) {
    const tool = body.tools?.find((/** @type {any} */ entry) =>
      entry.function.name.endsWith("update_goal"),
    );
    const run = prompt.match(/run=\\?"([a-f0-9]+)\\?"/)?.[1];
    if (tool && run) {
      message.content = "";
      message.tool_calls = [
        {
          function: {
            name: tool.function.name,
            arguments: {
              run,
              todos: [
                {
                  id: "verify",
                  task: "Complete the deterministic qualification",
                  status: "completed",
                },
              ],
            },
          },
        },
      ];
    }
  } else if (!hasToolResult && prompt.includes("You are running the OpenAgent Graph plugin.")) {
    const tool = body.tools?.find((/** @type {any} */ entry) =>
      entry.function.name.endsWith("create_goal_graph"),
    );
    if (tool) {
      message.content = "";
      message.tool_calls = [
        {
          function: {
            name: tool.function.name,
            arguments: {
              objective: "Official plugin qualification",
              graph: {
                nodes: [{ id: "verify", task: "Return the deterministic qualification result" }],
              },
            },
          },
        },
      ];
    }
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
await evaluate(
  `document.querySelector('[role="dialog"] button[aria-label="Close"], [role="dialog"] button[aria-label="关闭"]')?.click(); true`,
);
await until(
  async () => (await evaluate("!document.querySelector('[role=dialog]')")) === "true",
  "close settings before changing fixture configuration",
);
const original = await invoke("get_settings", {});
/** @type {string[]} */ const installed = [];
/** @type {string[]} */ const conversations = [];
/** @type {Array<Record<string, unknown>>} */ const report = [];
/** @type {unknown[]} */
const cleanupErrors = [];
try {
  const config = structuredClone(original);
  let provider = config.providers.find((/** @type {any} */ item) => item.provider === "ollama");
  if (!provider) {
    provider = {
      id: "plugin-qualification-local",
      name: "Local qualification",
      provider: "ollama",
      api_key: "",
      base_url: "",
      enabled: true,
      models: [],
      model_context_compaction_thresholds: {},
      model_reasoning_efforts: {},
      model_reasoning_effort_enabled: {},
      model_vision_enabled: {},
    };
    config.providers.push(provider);
  }
  provider.base_url = `http://127.0.0.1:${address.port}`;
  provider.models = ["test-model"];
  provider.enabled = true;
  config.defaults.chat_model = { provider_id: provider.id, model: "test-model" };
  config.defaults.flash_model = { provider_id: provider.id, model: "test-model" };
  config.approval_mode = "off";
  config.memory_retrieval_enabled = false;
  for (const agent of Object.values(config.flash_agents)) {
    if (agent && typeof agent === "object" && "enabled" in agent) agent.enabled = false;
  }
  const saved = await invoke("save_settings", { config });
  assert.equal(
    saved.providers.find((/** @type {any} */ item) => item.id === provider.id)?.enabled,
    true,
  );
  for (const { id, directory: source } of checkouts) {
    assert(
      !existsSync(join(fixture, "plugins", id)),
      `${id} is already installed; preserve it and use a fresh fixture`,
    );
    const summary = await client(`client.installAgentPlugin(${JSON.stringify(source)})`);
    installed.push(id);
    assert(!summary.error, `${id}: ${summary.error}`);
    const convId = crypto.randomUUID(),
      branchId = crypto.randomUUID();
    conversations.push(convId);
    await invoke("create_conversation", { id: convId, title: `Qualify ${id}`, workspace });
    await invoke("create_branch", { id: branchId, convId });
    const context = { conversation_id: convId, branch_id: branchId, workspace };
    /** @param {string} tool @param {Record<string, unknown>} args */
    async function call(tool, args) {
      let result;
      await until(async () => {
        try {
          result = await invoke("call_agent_plugin_tool", {
            plugin_id: id,
            tool_name: tool,
            arguments: { ...args, _openagent: context },
          });
          return true;
        } catch (error) {
          if (!String(error).includes("not connected")) throw error;
          return false;
        }
      }, `${id} MCP did not connect`);
      assert(!result.isError, JSON.stringify(result));
      return JSON.parse(
        result.content
          .filter((/** @type {any} */ entry) => entry.type === "text")
          .map((/** @type {any} */ entry) => entry.text)
          .join("\n"),
      );
    }
    if (id === "chat-groups") {
      const group = await call("chat_group_create", { title: "Official plugin qualification" });
      const member = await call("chat_group_add_member", {
        group_id: group.id,
        conversation_id: convId,
      });
      assert.equal(member.conversation_id, convId);
      await call("chat_group_send_message", {
        group_id: group.id,
        content: "Qualification message",
        mentions: [],
      });
      const messages = await call("chat_group_read_messages", {
        group_id: group.id,
        from_seq: 0,
        wait_secs: 0,
      });
      assert(JSON.stringify(messages).includes("Qualification message"));
      const groups = await call("chat_group_list", {});
      assert(groups.some((/** @type {any} */ entry) => entry.id === group.id));
      const before = modelRequests;
      const sent = await call("chat_send_message", {
        conversation_id: convId,
        content: "Complete the private-message qualification",
      });
      assert.equal(sent.accepted, true);
      await until(
        () => modelRequests > before,
        "Chat Groups did not submit a private message to the Agent",
      );
      report.push({
        id,
        version: summary.version,
        conversationId: convId,
        checks: [
          "create",
          "member host bridge",
          "send",
          "read",
          "list",
          "private agent submission",
        ],
      });
    } else {
      assert(
        summary.commands.includes(`/${id}:${id}`),
        `${id} did not expose its portable command: ${summary.commands}`,
      );
      await client(
        `client.submitInput(${JSON.stringify({ convId, branchId, modelBinding: { providerId: provider.id, model: "test-model" }, userMessageId: crypto.randomUUID(), assistantMessageId: crypto.randomUUID(), text: `/${id}:${id} Official plugin qualification` })})`,
      );
      const directory = join(fixture, "plugin-data", id, id === "goal" ? "runs" : "graphs");
      /** @type {any} */ let state;
      await until(() => {
        if (!existsSync(directory)) return false;
        for (const file of readdirSync(directory)) {
          if (!file.endsWith(".json")) continue;
          const candidate = JSON.parse(readFileSync(join(directory, file), "utf8"));
          if (candidate.conversation_id === convId) state = candidate;
        }
        return state?.status === "completed";
      }, `${id} command did not complete its package-owned run`);
      const progress = await call(id === "goal" ? "read_goal" : "graph_read", {
        run: state.run_id,
        wait_secs: 0,
      });
      assert.equal(progress.status, "completed");
      report.push({
        id,
        version: summary.version,
        conversationId: convId,
        checks: [
          "portable command",
          "model tool dispatch",
          "host bridge",
          "completed package state",
          "read progress",
        ],
      });
      if (id === "goal" && process.env.BLACKBOX_GOAL_APPROVAL === "1") {
        for (const [theme, language] of [
          ["light", "en"],
          ["dark", "zh"],
        ]) {
          const manual = structuredClone(config);
          manual.approval_mode = "manual";
          manual.theme = theme;
          manual.language = language;
          await invoke("save_settings", { config: manual });
          await call("read_goal", { run: state.run_id });
          const marker = crypto.randomUUID();
          await evaluate(`window.__goalApprovalProbe = ${JSON.stringify({ marker })}; true`);
          try {
            await runScenario("tests/blackbox/goal-approval.toml");
          } finally {
            for (const file of readdirSync(directory).filter((file) => file.endsWith(".json"))) {
              const state = JSON.parse(readFileSync(join(directory, file), "utf8"));
              if (
                [`Native approval ${marker}`, `Stop the active Goal ${marker}`].includes(
                  state.objective,
                )
              ) {
                conversations.push(state.conversation_id);
              }
            }
          }
          await until(() => {
            const states = readdirSync(directory)
              .filter((file) => file.endsWith(".json"))
              .map((file) => JSON.parse(readFileSync(join(directory, file), "utf8")));
            const approval = states.find(
              (state) => state.objective === `Native approval ${marker}`,
            );
            const stopped = states.find(
              (state) => state.objective === `Stop the active Goal ${marker}`,
            );
            return approval?.status === "cancelled" && stopped?.status === "cancelled";
          }, "Goal cancellation did not persist for both command and Stop action");
          assert.equal(await evaluate("!document.querySelector('.stop-btn')"), "true");
          if (process.env.BLACKBOX_GOAL_CONTROLS === "1") {
            manual.approval_mode = "off";
            await invoke("save_settings", { config: manual });
            await call("read_goal", { run: state.run_id });
            /** @type {string | undefined} */ let controlConversation;
            const controlSteps = [
              { command: `/goal Native controls ${marker}`, status: "completed", newChat: true },
              { command: "/goal", status: "completed", confirmation: "view" },
              {
                command: `/goal edit Revised controls ${marker}`,
                status: "paused",
                confirmation: "edit",
              },
              { command: "/goal pause", status: "paused", confirmation: "pause" },
              { command: "/goal edit", status: "paused", confirmation: "edit" },
              { command: "/goal resume", status: "completed" },
              { command: "/goal clear", status: "cleared", confirmation: "clear", noFlow: true },
              { command: "/goal", status: "cleared", confirmation: "view", noFlow: true },
            ];
            for (const step of controlSteps) {
              await evaluate(`window.__goalControls = ${JSON.stringify(step)}; true`);
              try {
                await runScenario("tests/blackbox/goal-controls.toml");
              } finally {
                if (!controlConversation) {
                  const initial = readdirSync(directory)
                    .filter((file) => file.endsWith(".json"))
                    .map((file) => JSON.parse(readFileSync(join(directory, file), "utf8")))
                    .find((state) => state.objective === `Native controls ${marker}`);
                  if (initial) {
                    controlConversation = initial.conversation_id;
                    conversations.push(initial.conversation_id);
                  }
                }
              }
              assert(controlConversation, "Goal control conversation was not created");
              /** @type {any} */ let current;
              await until(() => {
                current = readdirSync(directory)
                  .filter((file) => file.endsWith(".json"))
                  .map((file) => JSON.parse(readFileSync(join(directory, file), "utf8")))
                  .find((state) => state.conversation_id === controlConversation);
                return current?.status === step.status;
              }, `${step.command} did not persist ${step.status}`);
              assert.equal(
                current?.status,
                step.status,
                `${step.command} did not persist ${step.status}`,
              );
              if (step.status === "cleared") {
                assert.equal(current.objective, "");
                assert.deepEqual(current.todos, []);
              }
            }
          }
        }
        report.push({
          id,
          checks: [
            "manual approval remains pending",
            "approve once",
            "cancel command",
            "Stop cancels durable Goal",
            "light/en",
            "dark/zh",
            ...(process.env.BLACKBOX_GOAL_CONTROLS === "1"
              ? ["bare view", "edit", "pause", "resume", "clear", "cleared projection"]
              : []),
          ],
        });
      }
    }
    await client(`client.uninstallAgentPlugin(${JSON.stringify(id)})`);
    installed.splice(installed.indexOf(id), 1);
    assert(!existsSync(join(fixture, "plugins", id)), `${id} enabled uninstall failed`);
    process.stdout.write(`${id} ${summary.version}: functional qualification passed.\n`);
  }
  assert(modelRequests > 0, "qualification did not exercise the model boundary");
  mkdirSync(join(fixture, "qualification"), { recursive: true });
  writeFileSync(
    process.env.BLACKBOX_FUNCTIONAL_REPORT || join(fixture, "qualification", "functional.json"),
    JSON.stringify({ checkouts, modelRequests, plugins: report }, null, 2),
  );
} finally {
  for (const id of installed)
    await client(`client.uninstallAgentPlugin(${JSON.stringify(id)})`).catch((error) =>
      cleanupErrors.push(error),
    );
  if (process.env.BLACKBOX_KEEP_CONVERSATIONS !== "1") {
    for (const convId of new Set(conversations))
      await invoke("delete_conversation", { convId }).catch((error) => cleanupErrors.push(error));
  }
  await invoke("save_settings", { config: original }).catch((error) => cleanupErrors.push(error));
  model.closeAllConnections();
  await new Promise((done) => model.close(done));
  if (cleanupErrors.length) console.error("Plugin fixture cleanup failed", cleanupErrors);
}
if (cleanupErrors.length) throw new AggregateError(cleanupErrors, "Plugin fixture cleanup failed");

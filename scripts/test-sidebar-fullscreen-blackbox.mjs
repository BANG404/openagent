// @ts-check
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { captureBlackboxScreenshot } from "./blackbox-screenshot.mjs";
import { resolveBlackboxHome } from "./tauri-test-environment.mjs";

const repo = resolve(import.meta.dirname, "..");
const home = resolve(resolveBlackboxHome(process.env, { instanceName: "sidebar-activation" }));
assert(
  process.env.OPENAGENT_HOME && process.env.TAURI_PILOT_SOCKET,
  "select an isolated fixture and its pilot socket",
);
assert(![".openagent", ".openagent-dev"].some((name) => home === resolve(homedir(), name)));
assert(
  !existsSync(join(home, "plugins/chat-groups")),
  "use a fresh fixture; preserve installed packages",
);
const artifacts = mkdtempSync(join(tmpdir(), "sidebar-fullscreen-"));
const workspace = join(home, "workspace");
mkdirSync(workspace, { recursive: true });

/** @param {string[]} args */
async function pilot(args) {
  const child = spawn("tauri-pilot", [...args, "--window", "main"], {
    env: process.env,
    cwd: artifacts,
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
/** @param {string} expression */
async function until(expression) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if ((await evaluate(expression)) === "true") return;
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`Sidebar activation timed out: ${expression}`);
}
/** @param {string} text */
async function submit(text) {
  await pilot(["snapshot", "-i"]);
  await evaluate(`window.__sidebarActivationInput=${JSON.stringify(text)};true`);
  await pilot(["run", join(repo, "tests/blackbox/plugin-sidebar-activation-submit.toml")]);
}
async function reload() {
  await evaluate("window.__activationReload=true;setTimeout(()=>location.reload(),100);true");
  await until(
    "!window.__activationReload && !!document.querySelector('[contenteditable=true][role=textbox]')",
  );
}
const model = createServer(async (request, response) => {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  const body = JSON.parse(raw);
  const messages = body.messages ?? [];
  const index = messages.findLastIndex((/** @type {any} */ message) => message.role === "user");
  const prompt = JSON.stringify(messages[index]?.content ?? "");
  const trigger = prompt.includes("SIDEBAR_TRIGGER");
  const called = messages
    .slice(index + 1)
    .some((/** @type {any} */ message) => message.role === "tool");
  // Leave enough time to inspect the tool-call stream before its final answer.
  if (called) await new Promise((done) => setTimeout(done, 800));
  response.writeHead(200, { "content-type": "application/x-ndjson" });
  response.end(
    JSON.stringify({
      model: "test-model",
      created_at: new Date().toISOString(),
      message:
        trigger && !called
          ? {
              role: "assistant",
              content: "",
              tool_calls: [
                {
                  function: { name: "chat_group_create", arguments: { title: "Activation group" } },
                },
              ],
            }
          : { role: "assistant", content: trigger ? "SIDEBAR_TOOL_DONE" : "SIDEBAR_PLAIN_DONE" },
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
let original;
try {
  await pilot(["ping"]);
  await pilot(["snapshot", "-i"]);
  original = await invoke("get_settings", {});
} catch (error) {
  await new Promise((done) => model.close(() => done(null)));
  throw error;
}
/** @type {string[]} */ const conversations = [];
let installed = false;
const visible =
  "!!document.querySelector('#checkpoint-flow-panel:not(.collapsed) .panel-cache-slot:not([hidden]) iframe')";
const fullscreen =
  "document.querySelector('#conversation-stage')?.classList.contains('conversation-collapsed') && !document.querySelector('#checkpoint-flow-panel')?.classList.contains('collapsed')";
async function currentTitle() {
  const title = await evaluate(
    "document.querySelector('.workspace-conversation-row.active .sidebar-conversation-title-copy,.conv-item.active .sidebar-conversation-title-copy')?.textContent.trim()",
  );
  assert(title, "active conversation needs a visible title");
  return title;
}
/** @param {string} title */
async function openConversation(title) {
  await evaluate(`window.__sidebarNavigationTitle=${JSON.stringify(title)};true`);
  await pilot(["snapshot", "-i"]);
  await pilot(["run", join(repo, "tests/blackbox/sidebar-fullscreen-navigation.toml")]);
}
/** @param {string} title */
async function createConversation(title) {
  const id = crypto.randomUUID();
  conversations.push(id);
  await invoke("create_conversation", { id, title, workspace });
  await invoke("create_branch", { id: crypto.randomUUID(), convId: id });
  await reload();
  await openConversation(title);
}
async function assertChatVisible() {
  await pilot(["snapshot", "-i"]);
  await pilot(["run", join(repo, "tests/blackbox/sidebar-fullscreen-chat-visible.toml")]);
}
try {
  const config = structuredClone(original);
  config.workspace = workspace;
  config.onboarding_completed = true;
  config.providers = [
    {
      id: "sidebar-activation-fixture",
      name: "Local sidebar activation fixture",
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
    provider_id: "sidebar-activation-fixture",
    model: "test-model",
  };
  config.approval_mode = "off";
  config.memory_retrieval_enabled = false;
  config.agent_plugins_enabled = {
    ...config.agent_plugins_enabled,
    "chat-groups": true,
    "cua-driver": false,
  };
  config.agent_plugins_mcp_tool_modes = {
    ...config.agent_plugins_mcp_tool_modes,
    "chat-groups": "direct",
  };
  config.permission_profile = {
    enforcement: "managed",
    network: "enabled",
    file_system: {
      entries: [
        { access: "read", path: { kind: "host_root" } },
        { access: "write", path: { kind: "workspace" } },
      ],
    },
  };
  for (const agent of Object.values(config.flash_agents))
    if (agent && typeof agent === "object" && "enabled" in agent) agent.enabled = false;
  await invoke("set_workspace", { path: workspace });
  await invoke("save_settings", { config });
  const summary = await invoke("install_agent_plugin", {
    source: join(repo, "plugins/chat-groups"),
  });
  installed = true;
  assert(summary.sidebar_views[0]?.activation_tools?.includes("chat_group_create"));
  assert.deepEqual(summary.warnings, []);

  for (const theme of ["light", "dark"])
    for (const language of ["en", "zh"]) {
      process.stdout.write(`Verifying sidebar fullscreen navigation: ${theme}/${language}\n`);
      await evaluate(
        "(async()=>{await window.__TAURI_INTERNALS__.invoke('plugin:window|show',{label:'main'});await window.__TAURI_INTERNALS__.invoke('plugin:window|set_focus',{label:'main'});return true;})()",
      );
      const passId = crypto.randomUUID();
      await evaluate("localStorage.removeItem('openagent.conversation-panel-collapsed');true");
      await invoke("save_settings", { config: { ...config, theme, language } });
      const plainTitle = `Plain ${theme}/${language}`;
      await createConversation(plainTitle);
      await submit(`SIDEBAR_PLAIN ${theme}/${language} ${passId}`);
      await until(
        "document.querySelector('#conversation-stage')?.textContent.includes('SIDEBAR_PLAIN_DONE') && !document.querySelector('.stop-btn')",
      );
      const savedPlainTitle = await currentTitle();
      await createConversation(`Sidebar ${theme}/${language}`);
      await submit(`SIDEBAR_TRIGGER ${theme}/${language} ${passId}`);
      await until(visible);
      await until(
        "document.body.textContent.includes('SIDEBAR_TOOL_DONE') && !document.querySelector('.stop-btn')",
      );
      const savedSidebarTitle = await currentTitle();
      await pilot(["snapshot", "-i"]);
      await pilot(["click", ".conversation-toggle"]);
      await until(fullscreen);
      captureBlackboxScreenshot(pilot, join(artifacts, `${theme}-${language}-fullscreen.png`));
      await openConversation(savedPlainTitle);
      await assertChatVisible();
      await until(
        "document.querySelector('#conversation-stage')?.textContent.includes('SIDEBAR_PLAIN_DONE')",
      );
      captureBlackboxScreenshot(pilot, join(artifacts, `${theme}-${language}-plain-chat.png`));
      await reload();
      await assertChatVisible();
      await until(
        "document.querySelector('#conversation-stage')?.textContent.includes('SIDEBAR_PLAIN_DONE')",
      );
      await openConversation(savedSidebarTitle);
      await until(fullscreen);
      await pilot(["snapshot", "-i"]);
      await pilot(["click", ".sidebar-primary-action"]);
      await assertChatVisible();
      await openConversation(savedSidebarTitle);
      await until(fullscreen);
      await invoke("save_settings", {
        config: {
          ...config,
          theme,
          language,
          agent_plugins_enabled: { ...config.agent_plugins_enabled, "chat-groups": false },
        },
      });
      await evaluate(
        "(async()=>{const {emit}=await import('/src/lib/openagent/tauriClient.ts');await emit('settings-changed');return true;})()",
      );
      await assertChatVisible();
      await invoke("save_settings", { config: { ...config, theme, language } });
      await reload();
      await until(fullscreen);
      await pilot(["snapshot", "-i"]);
      await pilot(["click", ".conversation-toggle"]);
      await until(
        "!document.querySelector('#conversation-stage')?.classList.contains('conversation-collapsed')",
      );
      process.stdout.write(`Passed sidebar fullscreen navigation: ${theme}/${language}\n`);
    }
  writeFileSync(
    join(artifacts, "result.json"),
    JSON.stringify({ passed: true, conversations, version: summary.version }),
  );
  const logs = await pilot(["logs", "--level", "error"]);
  assert(!/TypeError|effect_update_depth_exceeded|Unhandled/i.test(logs), logs);
  process.stdout.write(`Sidebar fullscreen navigation passed. Artifacts: ${artifacts}\n`);
} catch (error) {
  writeFileSync(join(artifacts, "failure-snapshot.txt"), await pilot(["snapshot", "-i"]));
  writeFileSync(join(artifacts, "failure-logs.txt"), await pilot(["logs", "--level", "error"]));
  process.stderr.write(`Sidebar fullscreen failure artifacts: ${artifacts}\n`);
  throw error;
} finally {
  try {
    if (installed) await invoke("uninstall_agent_plugin", { id: "chat-groups" });
    for (const id of conversations) await invoke("delete_conversation", { convId: id });
    await invoke("save_settings", { config: original });
  } finally {
    await new Promise((done) => model.close(() => done(null)));
  }
}

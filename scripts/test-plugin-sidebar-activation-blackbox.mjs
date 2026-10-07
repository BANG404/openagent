// @ts-check
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
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
const artifacts = mkdtempSync(join(tmpdir(), "plugin-sidebar-activation-"));
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
const absent =
  "!document.querySelector('#checkpoint-flow-panel iframe') && !document.querySelector('#checkpoint-flow-panel .panel-navigation')";
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
      await invoke("save_settings", { config: { ...config, theme, language } });
      const id = crypto.randomUUID();
      conversations.push(id);
      await invoke("create_conversation", {
        id,
        title: `Activation ${theme}/${language}`,
        workspace,
      });
      await invoke("create_branch", { id: crypto.randomUUID(), convId: id });
      await reload();
      await pilot(["snapshot", "-i"]);
      const title = `Activation ${theme}/${language}`;
      await evaluate(
        `(()=>{const b=[...document.querySelectorAll('.conv-item,.workspace-conversation-row')].find(b=>b.textContent.includes(${JSON.stringify(title)}));if(!b)throw new Error('fixture conversation missing');b.click();return true;})()`,
      );
      await until(
        `[...document.querySelectorAll('.conv-item.active,.workspace-conversation-row.active')].some(b=>b.textContent.includes(${JSON.stringify(title)}))`,
      );
      await until(absent);
      await pilot(["snapshot", "-i"]);
      await evaluate(
        `window.__activationInactiveCopy=${JSON.stringify(language === "zh" ? "当前分支调用匹配工具后显示" : "Appears when this branch uses a matching tool")};true`,
      );
      await pilot(["run", join(repo, "tests/blackbox/plugin-sidebar-activation-settings.toml")]);
      // A tool name in plain user/assistant prose cannot reveal the panel.
      await submit("SIDEBAR_PLAIN chat_group_create");
      await until(
        "document.body.textContent.includes('SIDEBAR_PLAIN_DONE') && !document.querySelector('.stop-btn')",
      );
      assert.equal(await evaluate(absent), "true");
      // Edit the first turn to fork at the same root, then execute a real MCP tool.
      await pilot(["snapshot", "-i"]);
      await evaluate("document.querySelector('.user-content[role=button]').click();true");
      await until("!!document.querySelector('textarea.user-content-edit')");
      await evaluate(
        "(async()=>{const e=document.querySelector('textarea.user-content-edit');e.value='SIDEBAR_TRIGGER';e.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,100));document.querySelector('.edit-confirm-btn').click();return true;})()",
      );
      await until(visible);
      await until(
        "document.body.textContent.includes('SIDEBAR_TOOL_DONE') && !document.querySelector('.stop-btn')",
      );
      await until("document.querySelector('.branch-nav-label')?.textContent.trim()==='2 / 2'");
      // User collapse survives another actual call and all its stream updates.
      await pilot(["snapshot", "-i"]);
      await evaluate(
        "(()=>{const b=[...document.querySelectorAll('button')].find(b=>/^(Collapse right sidebar|收起右侧栏)$/.test(b.getAttribute('aria-label')||''));if(!b)throw new Error('collapse missing');b.click();return true;})()",
      );
      await until(
        "document.querySelector('#checkpoint-flow-panel')?.classList.contains('collapsed')",
      );
      await submit("SIDEBAR_TRIGGER again");
      await until(
        "document.querySelectorAll('.tool-call-card').length>=2 && !document.querySelector('.stop-btn')",
      );
      assert.equal(
        await evaluate(
          "document.querySelector('#checkpoint-flow-panel')?.classList.contains('collapsed')",
        ),
        "true",
      );
      await reload();
      await until(visible);
      await pilot(["snapshot", "-i"]);
      await evaluate("window.__activationDirection='previous';true");
      await pilot(["run", join(repo, "tests/blackbox/plugin-sidebar-activation-branch.toml")]);
      await until(absent);
      await evaluate("window.__activationDirection='next';true");
      await pilot(["snapshot", "-i"]);
      await pilot(["run", join(repo, "tests/blackbox/plugin-sidebar-activation-branch.toml")]);
      await until(visible);
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
      await until(absent);
      await invoke("save_settings", { config: { ...config, theme, language } });
      await reload();
      await until(visible);
      await pilot(["snapshot", "-i"]);
      const screenshot = join(artifacts, `${theme}-${language}.png`);
      if (process.env.BLACKBOX_NATIVE_WINDOW_ID) {
        captureBlackboxScreenshot(pilot, screenshot);
      } else await pilot(["screenshot", screenshot]);
      const tip = await invoke("get_active_branch_tip", { convId: id });
      assert(tip, "qualified branch must have a durable checkpoint");
      const records = spawnSync(
        "bun",
        [
          ".agents/skills/inspect-conversation-checkpoints/scripts/inspect-conversation-records.ts",
          "--checkpoint",
          tip,
          "--db",
          join(home, "messages.db"),
        ],
        { cwd: join(repo, "sdk"), encoding: "utf8", windowsHide: true },
      );
      assert.equal(records.status, 0, records.stderr);
      const evidence = JSON.parse(records.stdout);
      assert(evidence.checkpoints.length > 0, "selected checkpoint must be readable");
      writeFileSync(join(artifacts, `${theme}-${language}-checkpoint.json`), records.stdout);
    }
  writeFileSync(
    join(artifacts, "result.json"),
    JSON.stringify({ passed: true, conversations, version: summary.version }),
  );
  const logs = await pilot(["logs", "--level", "error"]);
  assert(!/TypeError|effect_update_depth_exceeded|Unhandled/i.test(logs), logs);
  process.stdout.write(`Plugin sidebar activation passed. Artifacts: ${artifacts}\n`);
} catch (error) {
  writeFileSync(join(artifacts, "failure-snapshot.txt"), await pilot(["snapshot", "-i"]));
  writeFileSync(join(artifacts, "failure-logs.txt"), await pilot(["logs", "--level", "error"]));
  process.stderr.write(`Sidebar activation failure artifacts: ${artifacts}\n`);
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

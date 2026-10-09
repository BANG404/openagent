// @ts-check
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { resolveBlackboxHome } from "./tauri-test-environment.mjs";

const repo = resolve(import.meta.dirname, "..");
const home = resolve(resolveBlackboxHome(process.env, { instanceName: "chat-groups-wake" }));
assert(process.env.OPENAGENT_HOME && process.env.TAURI_PILOT_SOCKET, "select an isolated fixture");
assert(![".openagent", ".openagent-dev"].some((name) => home === resolve(homedir(), name)));
assert(!existsSync(join(home, "plugins/chat-groups")), "preserve installed packages");
const artifacts =
  process.env.BLACKBOX_ARTIFACT_DIR || mkdtempSync(join(tmpdir(), "chat-groups-wake-"));
mkdirSync(artifacts, { recursive: true });

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
  throw new Error(`Chat Groups wake timed out: ${expression}`);
}
/** @type {string[]} */
const providerPrompts = [];
let holdStartupWakes = false;
/** @type {Array<() => void>} */
const startupWakeReleases = [];
const model = createServer(async (request, response) => {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  const body = JSON.parse(raw),
    lastUser = body.messages?.findLast((/** @type {any} */ m) => m.role === "user");
  const prompt = JSON.stringify(lastUser?.content || "");
  const marker = prompt.match(/GROUP_WAKE_FIXTURE:([a-f0-9-]+)/)?.[1];
  if (!marker) {
    response.writeHead(400);
    response.end("Unrelated fixture input");
    return;
  }
  providerPrompts.push(prompt);
  if (prompt.includes("GROUP_STOP_HOLD") && !prompt.includes("Resume after Stop")) {
    // Keep actual member turns running until the native sidebar cancels them.
    response.writeHead(200, { "content-type": "application/x-ndjson" });
    response.flushHeaders();
    return;
  }
  const hidden = prompt.includes("[chat_group:");
  if (hidden && holdStartupWakes)
    await new Promise((done) => startupWakeReleases.push(() => done(null)));
  await new Promise((done) => setTimeout(done, 300));
  response.writeHead(200, { "content-type": "application/x-ndjson" });
  response.end(
    JSON.stringify({
      model: "test-model",
      created_at: new Date().toISOString(),
      message: {
        role: "assistant",
        content: `${prompt.includes("Resume after Stop") ? "GROUP_RESUMED" : hidden ? "GROUP_WOKE" : "GROUP_MANUAL_REPLY"}_${marker}`,
      },
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
const original = await invoke("get_settings", {});
assert.equal(resolve(original.workspace), resolve(join(home, "workspace")), "wrong fixture socket");
/** @type {string[]} */ const conversations = [];
/** @type {any[]} */ const discussionRoles = [];
let installed = false;
try {
  const config = structuredClone(original);
  config.providers = [
    {
      id: "group-wake-fixture",
      name: "Local group wake fixture",
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
    provider_id: "group-wake-fixture",
    model: "test-model",
  };
  config.approval_mode = "off";
  config.memory_retrieval_enabled = false;
  config.agent_plugins_enabled = {
    ...config.agent_plugins_enabled,
    "chat-groups": true,
    "cua-driver": false,
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
  await invoke("save_settings", { config });
  // Hidden wakes and Stop are exercised independently of branch tool activation.
  // The activation runner qualifies the unmodified package manifest.
  const panelFixture = join(artifacts, "chat-groups-wake-fixture");
  cpSync(join(repo, "plugins/chat-groups"), panelFixture, {
    recursive: true,
    filter: (source) => !source.endsWith(".git"),
  });
  const manifest = JSON.parse(readFileSync(join(panelFixture, "plugin.json"), "utf8"));
  delete manifest.extensions.openagent.sidebar[0].activation_tools;
  writeFileSync(join(panelFixture, "plugin.json"), JSON.stringify(manifest));
  const summary = await invoke("install_agent_plugin", { source: panelFixture });
  installed = true;
  for (const name of ["Product reviewer", "Developer reviewer", "News reviewer"]) {
    discussionRoles.push(
      await invoke("save_agent_role", {
        id: null,
        name,
        description: "Reply concisely to the fixture message.",
        skillIds: [],
        mcpServerIds: [],
      }),
    );
  }
  for (const theme of ["light", "dark"])
    for (const language of ["en", "zh"]) {
      await invoke("save_settings", { config: { ...config, theme, language } });
      const id = crypto.randomUUID(),
        branchId = crypto.randomUUID();
      conversations.push(id);
      await invoke("create_conversation", {
        id,
        title: `Group wake ${theme}/${language}`,
        workspace: original.workspace,
      });
      await invoke("create_branch", { id: branchId, convId: id });
      await evaluate("window.__groupWakeReload=true; setTimeout(()=>location.reload(),100); true");
      await until(
        "window.__groupWakeReload!==true && !!document.querySelector('[contenteditable=true][role=textbox]')",
      );
      await evaluate(
        `(async()=>{const {emitTo}=await import('/node_modules/@tauri-apps/api/event.js');await emitTo('main','settings-open-conversation',{conversationId:${JSON.stringify(id)}});return true;})()`,
      );
      await until(
        `document.body.textContent.includes('conversation: ${id}') && !!document.querySelector('[contenteditable=true][role=textbox]')`,
      );
      const probe = {
        id,
        theme,
        language,
        marker: `GROUP_WAKE_FIXTURE:${id}`,
        draft: "Unsent group wake draft",
      };
      await evaluate(`window.__groupWakeProbe=${JSON.stringify(probe)}; true`);
      await pilot(["snapshot", "-i"]);
      await pilot(["run", join(repo, "tests/blackbox/chat-groups-wake-submit.toml")]);
      await until(
        `document.body.textContent.includes('GROUP_MANUAL_REPLY_${id}') && !document.querySelector('.stop-btn')`,
      );
      await evaluate(
        `(()=>{const e=document.querySelector('[contenteditable=true][role=textbox]');e.focus();e.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:window.__groupWakeProbe.draft}));return true;})()`,
      );
      /** @param {string} tool @param {Record<string, unknown>} args @param {string} [sender] */
      async function call(tool, args, sender) {
        const result = await invoke("call_agent_plugin_tool", {
          plugin_id: "chat-groups",
          tool_name: tool,
          arguments: {
            ...args,
            _openagent: {
              workspace: original.workspace,
              conversation_id: sender ?? (tool === "chat_group_send_message" ? "" : id),
              branch_id: branchId,
              locale: language,
            },
          },
        });
        assert(!result.isError, JSON.stringify(result));
        return JSON.parse(result.content[0].text);
      }
      const group = await call("chat_group_create", { title: `Wake ${id}` });
      assert.equal(group.created_by_conversation_id, id);
      const related = await call("chat_group_list", { conversation_id: id });
      assert(related.some((/** @type {any} */ item) => item.id === group.id));
      const member = await call("chat_group_add_member", {
        group_id: group.id,
        conversation_id: id,
      });
      assert.equal(member.member_type, "owner");
      assert.equal(member.role_name, language === "zh" ? "群主" : "Group owner");
      const joined = await call("chat_group_start", {
        group_id: group.id,
        title: group.title,
        roles: [discussionRoles[0].id, ...discussionRoles.slice(1).map((role) => role.name)],
        content: `Join the discussion ${probe.marker}`,
        start_discussion: false,
      });
      assert.equal(joined.members.length, 4);
      assert.equal(joined.discussion_started, false);
      await until("document.querySelectorAll('.sub-conv-item').length === 3");
      assert.equal(
        await evaluate("document.querySelectorAll('.sub-conv-item.streaming').length"),
        "0",
      );
      holdStartupWakes = true;
      const started = await call("chat_group_start", {
        group_id: group.id,
        title: group.title,
        content: `Begin the discussion ${probe.marker}`,
      });
      assert.deepEqual(
        started.members.map((/** @type {any} */ item) => item.id),
        joined.members.map((/** @type {any} */ item) => item.id),
      );
      assert.equal(started.group.id, group.id, "start created a duplicate group");
      assert.equal(started.members.length, 4, "selected roles were not actually joined");
      assert.equal(started.members[0].id, member.id, "owner membership changed");
      assert.equal(started.discussion_started, true);
      assert.equal(started.message.mentions.length, 3);
      const childIds = started.members.slice(1).map((/** @type {any} */ m) => m.conversation_id);
      conversations.push(...childIds);
      const children = await invoke("get_child_conversations", {
        parentConvId: id,
        workspace: original.workspace,
      });
      assert.equal(
        children.length,
        3,
        "group participants were not linked to their owner conversation",
      );
      assert.deepEqual(
        children.map((/** @type {any} */ child) => child.id).sort(),
        [...childIds].sort(),
      );
      assert(
        children.every((/** @type {any} */ child) => child.parent_conv_id === id && child.role_id),
        "role or parent binding missing",
      );
      const startupDeadline = Date.now() + 30000;
      while (startupWakeReleases.length < childIds.length && Date.now() < startupDeadline)
        await new Promise((done) => setTimeout(done, 100));
      assert.equal(
        startupWakeReleases.length,
        childIds.length,
        "startup wakes never reached provider",
      );
      await evaluate(`window.__groupHistoryProbe=${JSON.stringify({ childIds })}; true`);
      await pilot(["snapshot", "-i"]);
      await pilot(["run", join(repo, "tests/blackbox/chat-groups-wake-history.toml")]);
      for (const childId of childIds) {
        // Exercise an older surface that has not received live events too.
        for (const checkpointId of [null, "stale-navigation-checkpoint"]) {
          await assert.rejects(
            invoke("restore_agent_history", { convId: childId, checkpointId }),
            /chat run is active/,
          );
        }
      }
      holdStartupWakes = false;
      for (const release of startupWakeReleases.splice(0)) release();
      await until(`(async()=>{
        const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');
        for(const id of ${JSON.stringify(childIds)}){
          const checkpoints=await c.invokeProduct('get_renderable_checkpoints',{convId:id});
          const messages=checkpoints.at(-1)?.data?.messages||[];
          if(!messages.some(m=>m.plugin_tags?.includes('plugin:chat-groups:control')&&m.plugin_user_visible===false))return false;
          if(!messages.some(m=>m.role==='assistant'&&JSON.stringify(m.content).includes(${JSON.stringify(`GROUP_WOKE_${id}`)})))return false;
        }
        return true;
      })()`);
      console.log(`Joined roles and startup wakes passed: ${theme}/${language}`);
      await evaluate(
        `(async()=>{const {emitTo}=await import('/node_modules/@tauri-apps/api/event.js');await emitTo('main','settings-open-conversation',{conversationId:${JSON.stringify(id)}});return true;})()`,
      );
      await until(`document.body.textContent.includes('conversation: ${id}')`);
      console.log(`Navigation preserves hidden startup snapshots: ${theme}/${language}`);
      const beforeHandoff = await invoke("get_renderable_checkpoints", { convId: childIds[0] });
      await invoke("restore_agent_history", {
        convId: childIds[0],
        checkpointId: beforeHandoff.at(-1).meta.checkpoint_id,
      });
      const roleReply = await call(
        "chat_group_send_message",
        {
          group_id: group.id,
          content: `@"Product reviewer": please take over ${probe.marker}`,
        },
        childIds[1],
      );
      assert.deepEqual(roleReply.mentions, [started.members[1].id]);
      await until(`(async()=>{
        const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');
        const checkpoints=await c.invokeProduct('get_renderable_checkpoints',{convId:${JSON.stringify(childIds[0])}});
        const last=checkpoints.at(-1);
        return last?.meta.checkpoint_id!==${JSON.stringify(beforeHandoff.at(-1)?.meta.checkpoint_id)} && last?.data.phase==='final_completed' && last.data.messages.some(m=>m.role==='assistant'&&JSON.stringify(m.content).includes(${JSON.stringify(`GROUP_WOKE_${id}`)}));
      })()`);
      const handedOff = await invoke("get_renderable_checkpoints", { convId: childIds[0] });
      assert.equal(
        handedOff
          .at(-1)
          .data.messages.filter((/** @type {any} */ m) =>
            m.plugin_tags?.includes("plugin:chat-groups:control"),
          ).length,
        2,
      );
      console.log(`Agent role mention handoff passed: ${theme}/${language}`);
      await call(
        "chat_group_send_message",
        {
          group_id: group.id,
          content: `@owner Please reply ${probe.marker}`,
        },
        childIds[0],
      );
      await until(
        `document.body.textContent.includes('GROUP_WOKE_${id}') && !document.querySelector('.stop-btn')`,
      );
      await pilot(["snapshot", "-i"]);
      await pilot(["run", join(repo, "tests/blackbox/chat-groups-wake-visible.toml")]);
      console.log(`Live hidden wake passed: ${theme}/${language}`);
      const checkpoints = await invoke("get_renderable_checkpoints", { convId: id });
      const hidden = checkpoints
        .at(-1)
        .data.messages.filter((/** @type {any} */ m) =>
          m.plugin_tags?.includes("plugin:chat-groups:control"),
        );
      assert.equal(hidden.length, 1);
      assert.equal(hidden[0].role, "user");
      assert.equal(hidden[0].plugin_user_visible, false);
      assert.equal(hidden[0].plugin_model_visible, true);
      assert(JSON.stringify(hidden[0].content).includes(probe.marker));
      assert(
        providerPrompts.some((prompt) => prompt.includes("[chat_group:") && prompt.includes(id)),
      );
      await evaluate("window.__groupWakeReload=true; setTimeout(()=>location.reload(),100); true");
      await until(
        `window.__groupWakeReload!==true && document.body.textContent.includes('GROUP_WOKE_${id}')`,
      );
      await until("document.querySelectorAll('.sub-conv-item').length === 3");
      await evaluate(
        `window.__groupWakeProbe=${JSON.stringify({ ...probe, restored: true })}; true`,
      );
      await pilot(["snapshot", "-i"]);
      await pilot(["run", join(repo, "tests/blackbox/chat-groups-wake-visible.toml")]);
      if (process.env.BLACKBOX_NATIVE_WINDOW_HANDLE) {
        await evaluate(
          `(async()=>{const {getCurrentWindow}=await import('/node_modules/@tauri-apps/api/window.js');const {PhysicalSize}=await import('/node_modules/@tauri-apps/api/dpi.js');const w=getCurrentWindow(),s=await w.innerSize();try{await w.setSize(new PhysicalSize(s.width+1,s.height));await new Promise(r=>setTimeout(r,200));}finally{await w.setSize(new PhysicalSize(s.width,s.height));}await new Promise(r=>setTimeout(r,200));return true;})()`,
        );
        const capture = spawnSync(
          process.env.PYTHON_BIN || "python",
          [
            join(repo, "scripts/capture-windows-window.py"),
            "--hwnd",
            process.env.BLACKBOX_NATIVE_WINDOW_HANDLE,
            "--output",
            join(artifacts, `${theme}-${language}-hidden-wake.png`),
          ],
          { encoding: "utf8", windowsHide: true },
        );
        assert.equal(capture.status, 0, capture.stderr || String(capture.error));
      }
      const stopMembers = [...childIds, id];
      await evaluate(
        `window.__groupStopProbe=${JSON.stringify({ groupTitle: group.title, stopMembers })}; true`,
      );
      await pilot(["snapshot", "-i"]);
      await pilot(["run", join(repo, "tests/blackbox/chat-groups-wake-idle.toml")]);
      await call("chat_group_send_message", {
        group_id: group.id,
        content: `@all GROUP_STOP_HOLD ${probe.marker}`,
      });
      const holdDeadline = Date.now() + 30000;
      while (
        providerPrompts.filter(
          (prompt) => prompt.includes("GROUP_STOP_HOLD") && prompt.includes(id),
        ).length < stopMembers.length &&
        Date.now() < holdDeadline
      )
        await new Promise((done) => setTimeout(done, 100));
      assert.equal(
        providerPrompts.filter(
          (prompt) => prompt.includes("GROUP_STOP_HOLD") && prompt.includes(id),
        ).length,
        stopMembers.length,
        "member turns did not reach the held provider requests",
      );
      await evaluate(
        `window.__groupStopProbe=${JSON.stringify({ groupTitle: group.title, stopMembers })}; true`,
      );
      await pilot(["snapshot", "-i"]);
      await pilot(["run", join(repo, "tests/blackbox/chat-groups-wake-stop.toml")]);
      await until(`(async()=>{
        const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');
        for(const convId of ${JSON.stringify(stopMembers)}){
          const checkpoints=await c.invokeProduct('get_renderable_checkpoints',{convId});
          if(checkpoints.at(-1)?.data.phase!=='final_cancelled')return false;
        }
        return true;
      })()`);
      const stoppedGroups = await call("chat_group_list", { conversation_id: id });
      assert.equal(
        stoppedGroups.find((/** @type {any} */ item) => item.id === group.id).discussion_stopped,
        true,
      );
      await call("chat_group_send_message", {
        group_id: group.id,
        content: `@owner Resume after Stop ${probe.marker}`,
      });
      await until(`(async()=>{
        const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');
        const checkpoints=await c.invokeProduct('get_renderable_checkpoints',{convId:${JSON.stringify(id)}});
        const last=checkpoints.at(-1);
        return last?.data.phase==='final_completed' && last.data.messages.some(m=>m.role==='assistant'&&JSON.stringify(m.content).includes(${JSON.stringify(`GROUP_RESUMED_${id}`)}));
      })()`);
      const resumedGroups = await call("chat_group_list", { conversation_id: id });
      assert.equal(
        resumedGroups.find((/** @type {any} */ item) => item.id === group.id).discussion_stopped,
        false,
      );
      await pilot(["snapshot", "-i"]);
      await pilot(["run", join(repo, "tests/blackbox/chat-groups-wake-idle.toml")]);
      console.log(`Stop and resume running members passed: ${theme}/${language}`);
    }
  const runtimeLogs = readdirSync(join(home, "logs"))
    .filter((name) => name.startsWith("openagent.") && name.endsWith(".jsonl"))
    .flatMap((name) =>
      readFileSync(join(home, "logs", name), "utf8")
        .trim()
        .split(/\r?\n/),
    )
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert(
    runtimeLogs.some((entry) => entry.reason === "active_run"),
    "restore rejection log missing",
  );
  assert(
    runtimeLogs.some((entry) => entry.message === "agent history restore applied"),
    "restore application log missing",
  );
  assert(
    runtimeLogs.some(
      (entry) => entry.message === "chat terminal snapshot persisted" && entry.message_count > 0,
    ),
    "terminal snapshot counts missing",
  );
  assert(
    !runtimeLogs.some((entry) =>
      ["missing_live_snapshot", "empty_terminal_snapshot"].includes(entry.reason),
    ),
    "navigation lost a live snapshot",
  );
  writeFileSync(
    join(artifacts, "wake-report.json"),
    JSON.stringify(
      {
        version: summary.version,
        themes: ["light", "dark"],
        locales: ["en", "zh"],
        providerRequests: providerPrompts.length,
        passed: true,
      },
      null,
      2,
    ),
  );
  console.log(`Chat Groups hidden wake passed: ${artifacts}`);
} finally {
  holdStartupWakes = false;
  for (const release of startupWakeReleases.splice(0)) release();
  writeFileSync(join(artifacts, "provider-prompts.json"), JSON.stringify(providerPrompts, null, 2));
  for (const id of conversations) await invoke("delete_conversation", { convId: id });
  for (const role of discussionRoles) await invoke("delete_agent_role", { id: role.id });
  if (installed) await invoke("uninstall_agent_plugin", { id: "chat-groups" });
  await invoke("save_settings", { config: original });
  model.closeAllConnections();
  model.close();
}

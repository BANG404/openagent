// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { captureBlackboxScreenshot } from "./blackbox-screenshot.mjs";
import { resolveBlackboxHome } from "./tauri-test-environment.mjs";

const repo = resolve(import.meta.dirname, "..");
const fixture = resolve(resolveBlackboxHome(process.env, { instanceName: "chat-groups-sidebar" }));
assert(
  process.env.OPENAGENT_HOME && process.env.TAURI_PILOT_SOCKET,
  "set isolated OPENAGENT_HOME and its TAURI_PILOT_SOCKET",
);
assert(
  ![".openagent", ".openagent-dev"].some((name) => fixture === resolve(homedir(), name)),
  "use a fixture home",
);
assert(
  !existsSync(join(fixture, "plugins/chat-groups")),
  "preserve the installed package and use a fresh fixture",
);
const artifacts =
  process.env.BLACKBOX_ARTIFACT_DIR ||
  mkdtempSync(join(tmpdir(), "openagent-chat-groups-sidebar-report-"));
mkdirSync(artifacts, { recursive: true });
const workspace = join(fixture, "workspace");
mkdirSync(workspace, { recursive: true });
const dataRoot = join(fixture, "plugin-data/chat-groups");
mkdirSync(dataRoot, { recursive: true });
const group = { id: "saved-group", title: "Saved group", workspace, created_at: 1, updated_at: 2 };
writeFileSync(
  join(dataRoot, "chat-groups.json"),
  JSON.stringify({
    groups: [
      group,
      {
        ...group,
        id: "second-group",
        title: "Second group",
        updated_at: 1,
        owner_conversation_id: "other-chat",
        created_by_conversation_id: "other-chat",
      },
      {
        ...group,
        id: "role-owner-group",
        title: "Role owner group",
        updated_at: 1,
        owner_conversation_id: "role-owner-chat",
      },
      {
        ...group,
        id: "foreign-group",
        title: "Foreign group",
        workspace: join(fixture, "other-workspace"),
      },
    ],
    members: [
      {
        id: "owner",
        group_id: "second-group",
        conversation_id: "other-chat",
        role_id: null,
        role_name: "创建聊天组讨论今日科技新闻",
        joined_at: 1,
      },
      {
        id: "role-owner",
        group_id: "role-owner-group",
        conversation_id: "role-owner-chat",
        role_id: "lead-role",
        role_name: "Research Lead",
        joined_at: 1,
      },
      {
        id: "member",
        group_id: group.id,
        conversation_id: "reviewer",
        branch_id: "branch",
        role_id: "role",
        role_name: "Reviewer",
        joined_at: 1,
      },
      {
        id: "lead",
        group_id: group.id,
        conversation_id: "lead-chat",
        branch_id: "lead-branch",
        role_id: "lead-role",
        role_name: "Research Lead",
        joined_at: 2,
      },
    ],
    messages: Array.from({ length: 205 }, (_, index) => ({
      id: `saved-${index}`,
      group_id: group.id,
      seq: index + 1,
      sender_type: index === 202 || index === 203 ? "agent" : "user",
      sender_id: index === 202 || index === 203 ? "reviewer" : null,
      content:
        index === 203
          ? [
              "## Markdown report",
              "",
              "**Bold** and *italic*, ~~removed~~, `inline code` &amp; entities",
              "",
              "- First",
              "  - Nested",
              "- Second",
              "",
              "3. Third",
              "4. Fourth",
              "",
              "> Quoted text",
              "",
              "```js",
              'const html = "<script>literal</script>";',
              'const wide = "' + "x".repeat(100) + '";',
              "```",
              "",
              "| Name | Result |",
              "| --- | --- |",
              "| Alpha | **Ready** |",
              "",
              "[Safe link](https://example.com/docs) [unsafe](javascript:alert(1))",
              "",
              '<img src="x" onerror="window.__markdownExecuted=true"><script>window.__markdownExecuted=true</script>',
              "",
              "![Image alt](https://example.com/image.png)",
            ].join("\n")
          : index === 204
            ? `Long message ${"preserved content ".repeat(30)}\nSecond line <script>visible text only</script>`
            : `Saved message ${index + 1}`,
      mentions: [],
      created_at: index + 1,
    })),
    rosters: {},
  }),
);

/** @param {string[]} args */
function pilot(args) {
  const result = spawnSync("tauri-pilot", [...args, "--window", "main"], {
    env: process.env,
    cwd: artifacts,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  return result.stdout.trim();
}
/** @param {string} script */
const evaluate = (script) => pilot(["eval", script]);
/** @param {string} operation @param {unknown} args @returns {any} */
function invoke(operation, args) {
  return JSON.parse(
    evaluate(
      `(async()=>{const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts');return JSON.stringify({value:await c.invokeProduct(${JSON.stringify(operation)},${JSON.stringify(args)})});})()`,
    ),
  ).value;
}
/** @param {string} expression @param {string} message */
async function until(expression, message) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (evaluate(expression) === "true") return;
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(message);
}
const original = invoke("get_settings", {});
let installed = false;
const conversations = ["reviewer", "other-chat", "unrelated-chat"];
try {
  invoke("set_workspace", { path: workspace });
  for (const id of conversations) {
    invoke("create_conversation", { id, title: `Sidebar ${id}`, workspace });
    invoke("create_branch", { id: crypto.randomUUID(), convId: id });
  }
  const config = {
    ...original,
    workspace,
    onboarding_completed: true,
    providers: [
      {
        id: "sidebar-fixture",
        name: "Sidebar fixture",
        provider: "ollama",
        api_key: "",
        base_url: "http://127.0.0.1:1",
        enabled: true,
        models: ["test-model"],
        model_context_compaction_thresholds: {},
        model_reasoning_efforts: {},
        model_reasoning_effort_enabled: {},
        model_vision_enabled: {},
      },
    ],
    defaults: {
      ...original.defaults,
      chat_model: { provider_id: "sidebar-fixture", model: "test-model" },
      flash_model: { provider_id: "sidebar-fixture", model: "test-model" },
    },
    agent_plugins_enabled: {
      ...original.agent_plugins_enabled,
      "chat-groups": true,
      "cua-driver": false,
    },
    permission_profile: {
      enforcement: "managed",
      file_system: {
        entries: [
          { access: "read", path: { kind: "host_root" } },
          { access: "write", path: { kind: "workspace" } },
        ],
      },
      network: "enabled",
    },
  };
  invoke("save_settings", { config });
  const summary = invoke("install_agent_plugin", { source: join(repo, "plugins/chat-groups") });
  installed = true;
  assert.equal(summary.sidebar_views.length, 1);
  assert.deepEqual(summary.warnings, []);
  evaluate("window.location.reload(); true");
  await until(
    "!!document.querySelector('[contenteditable=true][role=textbox]') && !!document.querySelector('.conversation-stage')?.textContent.includes('test-model')",
    "fixture startup failed",
  );
  evaluate(
    "(()=>{const b=[...document.querySelectorAll('button')].find(b=>/^(New chat|新聊天)$/.test((b.textContent||'').trim()));b.click();return true;})()",
  );
  // The scenario uses the real shell's navigation and the package document.
  pilot(["snapshot", "-i"]);
  pilot(["run", join(repo, "tests/blackbox/chat-groups-sidebar.toml")]);
  for (const theme of ["light", "dark"]) {
    for (const language of ["en", "zh"]) {
      invoke("save_settings", { config: { ...config, theme, language } });
      evaluate(
        `(async()=>{const {emit}=await import('/src/lib/openagent/tauriClient.ts');await emit('settings-changed');return true;})()`,
      );
      await until(
        `(()=>{const d=document.querySelector('#checkpoint-flow-panel iframe')?.contentDocument;return d?.documentElement.lang===${JSON.stringify(language)}&&d.documentElement.dataset.theme===${JSON.stringify(theme)};})()`,
        "frame did not follow live language/theme",
      );
      evaluate(`window.__chatGroupsSidebarPass=${JSON.stringify({ theme, language })}; true`);
      pilot(["snapshot", "-i"]);
      pilot(["run", join(repo, "tests/blackbox/chat-groups-sidebar-owner.toml")]);
      pilot(["run", join(repo, "tests/blackbox/chat-groups-sidebar-messages.toml")]);
      pilot(["run", join(repo, "tests/blackbox/chat-groups-sidebar-style.toml")]);
      pilot(["run", join(repo, "tests/blackbox/chat-groups-sidebar-markdown.toml")]);
      pilot(["run", join(repo, "tests/blackbox/chat-groups-sidebar-mentions.toml")]);
      pilot(["run", join(repo, "tests/blackbox/chat-groups-sidebar-conversation.toml")]);
      for (const surface of ["markdown", "mentions", "scrollbar", "conversation"]) {
        if (surface === "conversation") {
          evaluate(
            "(async()=>{const {emitTo}=await import('/node_modules/@tauri-apps/api/event.js');await emitTo('main','settings-open-conversation',{conversationId:'reviewer'});return true;})()",
          );
          await until(
            "(()=>{const d=document.querySelector('#checkpoint-flow-panel iframe')?.contentDocument;return d?.querySelector('#choices').children.length===1&&d.querySelector('#group-title').textContent==='Saved group'&&!d.querySelector('#draft').disabled;})()",
            "conversation screenshot did not follow selection",
          );
        }
        evaluate(`(()=>{
        const d=document.querySelector('#checkpoint-flow-panel iframe').contentDocument;
        const box=d.querySelector('#messages'), message=d.querySelector('[data-message-id="saved-203"]');
        box.scrollTop=message.offsetTop;
        const draft=d.querySelector('#draft');draft.focus();draft.value=${JSON.stringify(surface === "mentions" ? "@" : "")};draft.setSelectionRange(draft.value.length,draft.value.length);draft.dispatchEvent(new Event('input',{bubbles:true}));
        if(${JSON.stringify(surface)}==='mentions'){
          const palette=d.querySelector('#mention-palette'), r=palette.getBoundingClientRect(), composer=d.querySelector('#composer').getBoundingClientRect();
          if(palette.hidden||r.top<0||r.bottom>composer.top||r.right>d.documentElement.clientWidth)throw new Error('mention popup does not fit above the composer');
        }
        if(${JSON.stringify(surface)}==='scrollbar'){
          box.scrollTop=box.scrollHeight;
          const last=[...box.querySelectorAll('article')].at(-1);
          last.tabIndex=-1;last.focus({preventScroll:true});
          if(box.getBoundingClientRect().bottom>d.querySelector('#composer').getBoundingClientRect().top)throw new Error('input overlaps the scrollbar');
        }
        return true;
      })()`);
        // Native captures need the WebView to paint after the DOM assertions.
        evaluate(
          "(async()=>{await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));return true;})()",
        );
        await new Promise((done) => setTimeout(done, 500));
        const screenshot = join(artifacts, `${theme}-${language}-${surface}.png`);
        if (process.env.BLACKBOX_NATIVE_WINDOW_HANDLE) {
          // Resize and restore the fixture to invalidate WebView2's native
          // backing buffer before PrintWindow captures the current appearance.
          evaluate(`(async()=>{
          const {getCurrentWindow}=await import('/node_modules/@tauri-apps/api/window.js');
          const {PhysicalSize}=await import('/node_modules/@tauri-apps/api/dpi.js');
          const current=getCurrentWindow(), size=await current.innerSize();
          try {
            await current.setSize(new PhysicalSize(size.width+1,size.height));
            await new Promise(done=>setTimeout(done,200));
          } finally {
            await current.setSize(new PhysicalSize(size.width,size.height));
          }
          await new Promise(done=>setTimeout(done,200));
          return true;
        })()`);
          const captureArguments = [
            join(repo, "scripts/capture-windows-window.py"),
            "--hwnd",
            process.env.BLACKBOX_NATIVE_WINDOW_HANDLE,
            "--output",
            screenshot,
          ];
          const capture = spawnSync(process.env.PYTHON_BIN || "python", captureArguments, {
            encoding: "utf8",
            windowsHide: true,
          });
          assert.equal(capture.status, 0, capture.stderr || String(capture.error));
        } else captureBlackboxScreenshot(pilot, screenshot);
      }
      evaluate(
        "(()=>{const b=[...document.querySelectorAll('button')].find(b=>/^(New chat|新聊天)$/.test((b.textContent||'').trim()));b.click();return true;})()",
      );
      await until(
        "document.querySelector('#checkpoint-flow-panel iframe')?.contentDocument?.querySelector('#choices').children.length===3",
        "workspace group list did not return",
      );
    }
  }
  const stored = JSON.parse(readFileSync(join(dataRoot, "chat-groups.json"), "utf8"));
  assert.equal(stored.messages.length, 213);
  assert(
    stored.messages
      .slice(205)
      .every((/** @type {any} */ item) => item.sender_type === "user" && item.sender_id === null),
    "sidebar impersonated an Agent sender",
  );
  // A tool failure must preserve the draft, then a manual Refresh recovers.
  pilot(["run", join(repo, "tests/blackbox/chat-groups-sidebar-recovery.toml")]);
  evaluate("window.location.reload(); true");
  await until(
    "document.querySelector('#checkpoint-flow-panel iframe')?.contentDocument?.querySelectorAll('article').length===213",
    "sent messages did not survive reload",
  );
  pilot(["snapshot", "-i"]);
  pilot(["run", join(repo, "tests/blackbox/chat-groups-sidebar-lifecycle.toml")]);
  writeFileSync(
    join(artifacts, "report.json"),
    JSON.stringify(
      {
        version: summary.version,
        messages: stored.messages.length,
        themes: ["light", "dark"],
        locales: ["en", "zh"],
        passed: true,
      },
      null,
      2,
    ),
  );
  console.log(`Chat Groups sidebar passed: ${artifacts}`);
} catch (error) {
  console.error(
    evaluate(
      `(()=>{const d=document.querySelector('#checkpoint-flow-panel iframe')?.contentDocument;return JSON.stringify({error:d?.querySelector('#error')?.textContent,draft:d?.querySelector('#draft')?.value,sendDisabled:d?.querySelector('#send')?.disabled,articles:d?.querySelectorAll('article').length});})()`,
    ),
  );
  throw error;
} finally {
  if (installed) invoke("uninstall_agent_plugin", { id: "chat-groups" });
  for (const convId of conversations) invoke("delete_conversation", { convId });
  invoke("save_settings", { config: original });
}

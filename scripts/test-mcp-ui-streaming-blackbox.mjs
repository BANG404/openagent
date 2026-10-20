// @ts-check
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { captureBlackboxScreenshot } from "./blackbox-screenshot.mjs";

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
const resourceBytes = statSync(join(root, "plugins/mermaid/ui/app.html")).size;
assert(
  resourceBytes > 1024 * 1024 && resourceBytes <= 4 * 1024 * 1024,
  "Use the real large Mermaid resource",
);
const artifacts = mkdtempSync(join(tmpdir(), "openagent-mcp-ui-streaming-"));
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
/** @param {string} source */
const evaluate = (source) => pilot(["eval", source]);
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
  throw new Error(`MCP streaming assertion timed out: ${expression}`);
}
let round = 0;
/** @type {import('node:http').ServerResponse | undefined} */
let continuation;
/** @type {Error | undefined} */
let modelError;
/** @param {unknown} message */
function completion(message) {
  return (
    JSON.stringify({
      model: "mcp-stream-model",
      message,
      done: true,
      done_reason: "stop",
      prompt_eval_count: 40,
      eval_count: 12,
    }) + "\n"
  );
}
const model = createServer(async (request, response) => {
  try {
    let body = "";
    for await (const chunk of request) body += chunk;
    round++;
    response.writeHead(200, { "content-type": "application/x-ndjson" });
    if (round === 1) {
      const tools = JSON.parse(body).tools;
      const tool = tools?.find((/** @type {any} */ entry) =>
        entry.function?.name.endsWith("render_mermaid"),
      );
      assert(tool, "The real Mermaid tool must reach the provider catalog");
      response.end(
        completion({
          role: "assistant",
          content: "Preparing the editor",
          tool_calls: [
            {
              function: {
                name: tool.function.name,
                arguments: {
                  source: "flowchart LR\nStreaming --> Visible",
                  title: "Streaming fixture",
                },
              },
            },
          ],
        }),
      );
    } else {
      assert.equal(round, 2, "The fixture must complete in one tool round");
      assert(
        !body.includes("text/html;profile=mcp-app"),
        "UI resources must stay out of provider history",
      );
      // Hold the follow-up request open until the native scenario observes
      // the rendered editor. Terminal checkpoint hydration cannot make it pass.
      response.flushHeaders();
      continuation = response;
    }
  } catch (error) {
    modelError = error instanceof Error ? error : new Error(String(error));
    response.end();
  }
});
await new Promise((done) => model.listen(0, "127.0.0.1", () => done(null)));
const address = model.address();
assert(address && typeof address !== "string");
await pilot(["ping"]);
await pilot(["snapshot", "-i"]);
const original = await invoke("get_settings", {});
const config = structuredClone(original);
config.workspace = join(home, "workspace");
mkdirSync(config.workspace, { recursive: true });
config.onboarding_completed = true;
config.providers = [
  {
    id: "mcp-stream-fixture",
    name: "Local MCP streaming fixture",
    provider: "ollama",
    api_key: "",
    base_url: `http://127.0.0.1:${address.port}`,
    enabled: true,
    models: ["mcp-stream-model"],
    model_context_compaction_thresholds: {},
    model_reasoning_efforts: {},
    model_reasoning_effort_enabled: {},
    model_vision_enabled: {},
  },
];
config.defaults.chat_model = config.defaults.flash_model = {
  provider_id: "mcp-stream-fixture",
  model: "mcp-stream-model",
};
config.mcp.servers = [
  {
    id: "mermaid-stream-fixture",
    name: "Mermaid streaming fixture",
    enabled: true,
    tool_mode: "direct",
    transport: "stdio",
    command: "node",
    args: [join(root, "plugins/mermaid/server/index.mjs")],
  },
];
config.memory_retrieval_enabled = false;
config.context_compaction_enabled = false;
config.approval_mode = "off";
for (const agent of Object.values(config.flash_agents))
  if (agent && typeof agent === "object" && "enabled" in agent) agent.enabled = false;
/** @type {string[]} */
const conversations = [];
try {
  for (const theme of ["light", "dark"])
    for (const language of ["en", "zh"]) {
      round = 0;
      continuation = undefined;
      modelError = undefined;
      await invoke("save_settings", { config: { ...config, theme, language } });
      await invoke("set_workspace", { path: config.workspace });
      const id = crypto.randomUUID();
      conversations.push(id);
      await invoke("create_conversation", {
        id,
        title: `MCP stream ${id}`,
        workspace: config.workspace,
      });
      await invoke("create_branch", { id: crypto.randomUUID(), convId: id });
      await evaluate("setTimeout(()=>location.reload(),100); true");
      await new Promise((done) => setTimeout(done, 500));
      await until("!!document.querySelector('[contenteditable=true][role=textbox]')");
      await evaluate(
        `(async()=>{const {emitTo}=await import('/node_modules/@tauri-apps/api/event.js');await emitTo('main','settings-open-conversation',{conversationId:${JSON.stringify(id)}});return true;})()`,
      );
      await until(`document.body.textContent.includes(${JSON.stringify(`MCP stream ${id}`)})`);
      await evaluate(
        `window.__mcpRenderStatus=null;window.addEventListener('message',e=>{const frame=document.querySelector('.mcp-app-frame iframe');if(e.source===frame?.contentWindow && e.data?.method==='ui/update-model-context')window.__mcpRenderStatus=e.data.params?.structuredContent?.mermaid;}); true`,
      );
      await pilot(["snapshot", "-i"]);
      await evaluate(
        `(async()=>{const editor=document.querySelector('[contenteditable=true][role=textbox]');editor.focus();const clipboard=new DataTransfer();clipboard.setData('text/plain','mcp-stream-fixture');editor.dispatchEvent(new ClipboardEvent('paste',{clipboardData:clipboard,bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,100));document.querySelector('.send-btn').click();return true;})()`,
      );
      await until("window.__mcpRenderStatus?.status==='ready'");
      assert.ifError(modelError);
      assert(
        continuation && !continuation.writableEnded,
        "The editor must render before the model finishes",
      );
      await pilot(["snapshot", "-i"]);
      await pilot([
        "run",
        join(root, "tests/blackbox/mcp-ui-streaming.toml"),
        "--junit",
        join(artifacts, `${theme}-${language}.xml`),
      ]);
      if (process.platform === "win32" && process.env.BLACKBOX_NATIVE_WINDOW_ID) {
        captureBlackboxScreenshot(pilot, join(artifacts, `${theme}-${language}-streaming.png`));
      } else {
        await pilot(["screenshot", join(artifacts, `${theme}-${language}-streaming.png`)]);
      }
      continuation.end(
        completion({ role: "assistant", content: "MCP streaming fixture finished." }),
      );
      await until(
        "document.body.textContent.includes('MCP streaming fixture finished.') && !!document.querySelector('[data-summary=true]')",
      );
      assert.equal(
        await evaluate(
          "document.querySelector('.mcp-app-frame iframe')===window.__mcpStreamingFrame && window.__mcpStreamingFrame.isConnected",
        ),
        "true",
        "Terminal reconciliation must retain the mounted editor",
      );
      await evaluate("setTimeout(()=>location.reload(),100); true");
      await new Promise((done) => setTimeout(done, 500));
      await until(
        "!!document.querySelector('.mcp-app-frame iframe') && document.body.textContent.includes('MCP streaming fixture finished.')",
      );
      assert.equal(round, 2, "Finalization or reload repeated the provider request");
      const checkpointId = await invoke("get_active_branch_tip", { convId: id });
      const checkpoints = await invoke("get_checkpoint_view", { convId: id, checkpointId });
      assert(
        checkpoints.some((/** @type {any} */ checkpoint) =>
          checkpoint.data.messages.some((/** @type {any} */ message) =>
            message.content.some((/** @type {any} */ part) => part.meta?.mcp_ui?.resource?.text),
          ),
        ),
        "The completed checkpoint must retain the MCP resource",
      );
      console.log(
        `Passed ${theme}/${language}: ${resourceBytes} byte editor rendered during streaming and survived completion/reload`,
      );
    }
  await pilot(["logs", "--level", "error"]);
} catch (error) {
  console.error("MCP streaming failure", {
    round,
    modelError: modelError?.message,
    ui: await evaluate(
      "JSON.stringify({status:window.__mcpRenderStatus,text:document.querySelector('.message-list')?.textContent?.slice(-2000),frames:document.querySelectorAll('.mcp-app-frame').length})",
    ).catch(() => "unavailable"),
    artifacts,
  });
  throw error;
} finally {
  continuation?.end();
  for (const convId of conversations) {
    await invoke("cancel_chat_message", { convId }).catch(() => {});
    await invoke("delete_conversation", { convId }).catch(() => {});
  }
  await invoke("save_settings", { config: original });
  await invoke("set_workspace", { path: original.workspace || null });
  model.closeAllConnections();
  model.close();
}
console.log(`MCP UI streaming black-box passed. Artifacts: ${artifacts}`);

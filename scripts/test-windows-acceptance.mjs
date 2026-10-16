// @ts-check
import { build, serve, file, sleep } from "bun";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ACCEPTANCE_PIPE, safeName, verifyCandidate } from "./windows-acceptance-artifacts.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const REPLY = "Acceptance streamed reply: installed application works.";

/** @param {() => Promise<boolean> | boolean} predicate @param {string} label @param {number} [timeout] */
async function until(predicate, label, timeout = 120_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(250);
  }
  throw new Error(`Timed out: ${label}`);
}

/** Real installers, packaged frontend and supervised Runtime; no Vite or debug app.
 * @param {{directory: string; mode: 'online' | 'offline'; reportDirectory: string}} options
 */
export async function testWindowsAcceptance({ directory, mode, reportDirectory }) {
  assert(process.platform === "win32", "Windows is required");
  const candidate = await verifyCandidate(directory);
  // Keep the denied-write probe outside the implicitly writable system temp root.
  const fixture = await mkdtemp(path.join(path.dirname(tmpdir()), `openagent-acceptance-${mode}-`));
  const installation = path.join(fixture, "installed");
  const home = path.join(fixture, "data");
  const workspace = path.join(fixture, "workspace");
  const temporary = path.join(fixture, "tmp");
  await mkdir(workspace);
  await mkdir(temporary);
  await mkdir(reportDirectory, { recursive: true });
  /** @type {NodeJS.ProcessEnv} */
  const environment = {
    ...process.env,
    OPENAGENT_HOME: home,
    TEMP: temporary,
    TMP: temporary,
    TAURI_PILOT_SOCKET: ACCEPTANCE_PIPE,
    ACCEPTANCE_INSTALLATION: installation,
    ACCEPTANCE_INSTALLER: path.join(directory, candidate.installers[mode]),
    ACCEPTANCE_FIREWALL_GROUP: `OpenAgent acceptance ${randomUUID()}`,
    OPENAGENT_DEV_RUNTIME_SOURCE: undefined,
    OPENAGENT_DEV_INSTANCE: undefined,
    OPENAGENT_BOOTSTRAP_TEST: undefined,
    OPENAGENT_RUNTIME_TARGET: undefined,
  };
  /** @param {string} action @param {Record<string, string>} [extra] */
  function native(action, extra = {}) {
    const result = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        path.join(root, "scripts/windows-acceptance-native.ps1"),
        "-Action",
        action,
      ],
      { env: { ...environment, ...extra }, encoding: "utf8", windowsHide: true, timeout: 300_000 },
    );
    assert(
      result.status === 0,
      `${result.stdout ?? ""}${result.stderr ?? ""}` || `Native ${action} failed`,
    );
  }
  /** @param {string[]} args @param {string} [window] */
  function pilot(args, window = "main") {
    const result = spawnSync(
      path.join(directory, "tauri-pilot.exe"),
      [...args, "--window", window],
      { env: environment, encoding: "utf8", windowsHide: true, timeout: 40_000 },
    );
    assert(result.status === 0, result.stderr || result.stdout || "Pilot command failed");
    return result.stdout.trim();
  }
  /** @param {string} script @returns {any} */
  function evaluate(script) {
    // A string envelope bypasses Pilot's human-readable formatting for null/status objects.
    return JSON.parse(pilot(["eval", `(async()=>JSON.stringify({value:await(${script})}))()`]))
      .value;
  }
  // Bundle the checked-in shared SDK to drive product operations in the installed WebView.
  const entry = path.join(root, ".cache/acceptance-client.ts");
  await mkdir(path.dirname(entry), { recursive: true });
  await writeFile(
    entry,
    'import {desktopOpenAgent} from "../sdk/typescript/src/tauriClient"; Object.assign(window, {__acceptanceClient: desktopOpenAgent});',
  );
  const bundled = await build({ entrypoints: [entry], target: "browser", minify: true });
  assert(bundled.success, "Shared SDK acceptance driver did not bundle");
  const clientScript = await bundled.outputs[0].text();
  /** @param {string} method @param {unknown[]} [args] @returns {any} */
  function client(method, args = []) {
    return evaluate(
      `(async()=>{${clientScript}; return await window.__acceptanceClient[${JSON.stringify(method)}](...${JSON.stringify(args)});})()`,
    );
  }
  /** @param {string} operation @param {object} [args] */
  const invoke = (operation, args = {}) => client("invokeProduct", [operation, args]);
  let allowDownloads = mode === "offline";
  let downloadCount = 0;
  let modelRequests = 0;
  let toolRequested = false;
  const downloads = new Set();
  const service = serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/v1/")) {
        /** @type {{tools?: {function?: {name: string}}[]; messages?: {role: string; content: unknown}[]}} */
        const body = await request.json();
        modelRequests++;
        await writeFile(
          path.join(fixture, `model-request-${modelRequests}.json`),
          JSON.stringify(body),
        );
        const chunk = {
          id: "acceptance",
          object: "chat.completion.chunk",
          created: 1,
          model: "acceptance",
          choices: [],
        };
        /** @param {object} delta @param {string | null} [finish] */
        const event = (delta, finish = null) =>
          `data: ${JSON.stringify({ ...chunk, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
        /** @param {string} name @param {object} args */
        const toolResponse = (name, args) =>
          new Response(
            event({
              role: "assistant",
              tool_calls: [
                {
                  index: 0,
                  id: `acceptance-command-${modelRequests}`,
                  type: "function",
                  function: { name, arguments: JSON.stringify(args) },
                },
              ],
            }) +
              event({}, "tool_calls") +
              "data: [DONE]\n\n",
            { headers: { "content-type": "text/event-stream" } },
          );
        if (!toolRequested && body.tools?.some((tool) => tool.function?.name === "exec_command")) {
          toolRequested = true;
          const nodeScript = `
const fs = require('node:fs');
const actual = fs.statSync(process.execPath);
const expected = fs.statSync(${JSON.stringify(path.join(installation, "node-runtime/node.exe"))});
if (actual.dev !== expected.dev || actual.ino !== expected.ino) process.exit(24);
fs.writeFileSync('acceptance-tool.txt', 'acceptance tool result');
let blocked = false;
try { fs.writeFileSync(${JSON.stringify(path.join(fixture, "outside-workspace.txt"))}, 'forbidden'); }
catch { blocked = true; }
if (!blocked) process.exit(23);
fs.writeFileSync('acceptance-tool-success.txt', 'sandbox and bundled tools verified');`;
          await writeFile(path.join(workspace, "acceptance-tool.cjs"), nodeScript);
          const command =
            "node acceptance-tool.cjs && where rg > acceptance-rg-path.txt && rg acceptance acceptance-tool.txt > acceptance-rg-result.txt";
          return toolResponse("exec_command", {
            cmd: command,
            workdir: workspace,
            shell: "cmd",
            login: false,
            yield_time_ms: 10000,
            max_output_tokens: 1000,
          });
        }
        const lastTool = body.messages?.findLast((message) => message.role === "tool");
        if (
          lastTool &&
          typeof lastTool.content === "string" &&
          lastTool.content.trimStart().startsWith("{")
        ) {
          const result = JSON.parse(lastTool.content);
          const session = result.session_id ?? result.metadata?.session_id;
          if (result.status === "running" && session) {
            return toolResponse("write_stdin", {
              session_id: session,
              chars: "",
              yield_time_ms: 1000,
              max_output_tokens: 1000,
            });
          }
        }
        return new Response(
          new ReadableStream({
            async start(controller) {
              controller.enqueue(
                event({ role: "assistant", content: "Acceptance streamed reply: " }),
              );
              await sleep(1500);
              controller.enqueue(event({ content: "installed application works." }));
              controller.enqueue(event({}, "stop") + "data: [DONE]\n\n");
              controller.close();
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        );
      }
      downloadCount++;
      if (!allowDownloads)
        return new Response("Deliberate acceptance download outage", { status: 503 });
      try {
        const name = safeName(decodeURIComponent(url.pathname.slice(1)));
        const asset = candidate.assets.find((asset) => asset.file === name);
        if (!asset || Object.values(candidate.installers).includes(name))
          return new Response(null, { status: 404 });
        downloads.add(name);
        return new Response(file(path.join(directory, name)));
      } catch {
        return new Response(null, { status: 404 });
      }
    },
  });
  environment.OPENAGENT_ACCEPTANCE_DISTRIBUTION_URL = `http://127.0.0.1:${service.port}/openagent-distribution.json`;
  /** @type {ReturnType<typeof spawn> | undefined} */
  let app;
  let installed = false;
  /** @type {string[]} */
  const checks = [];
  const report = {
    mode,
    version: candidate.version,
    source_sha: candidate.source_sha,
    sdk_sha: candidate.sdk_sha,
    checks,
    passed: false,
  };
  /** @param {string} name */
  const passed = (name) => {
    checks.push(name);
    console.log(`PASS ${mode}: ${name}`);
  };
  const executable = path.join(installation, "openagent.exe");
  const runtimeManifest = JSON.parse(
    await readFile(path.join(directory, "openagent-sdk-manifest.json"), "utf8"),
  );
  const offlinePrograms = [
    executable,
    path.join(installation, "node-runtime/node.exe"),
    path.join(
      home,
      "resources/runtime",
      runtimeManifest.version,
      "windows-x64",
      runtimeManifest.artifacts["windows-x64"].file,
    ),
  ];
  const start = () => {
    app = spawn(executable, [], {
      cwd: workspace,
      env: environment,
      windowsHide: true,
      stdio: "ignore",
    });
    app.on("error", () => {});
  };
  const stop = () => {
    if (app?.pid) native("Stop", { ACCEPTANCE_PID: String(app.pid) });
    app = undefined;
  };
  /** @type {unknown[]} */
  const cleanupErrors = [];
  try {
    native("Check");
    native("Install");
    installed = true;
    assert((await stat(executable)).size > 0);
    /** @type {[string, string[]][]} */
    const bundledTools = [
      ["node-runtime/node.exe", ["--version"]],
      ["terminal-tools/rg.exe", ["--version"]],
      ["terminal-tools/fd.exe", ["--version"]],
      ["terminal-tools/bat.exe", ["--version"]],
      ["terminal-tools/sd.exe", ["--version"]],
    ];
    for (const [name, args] of bundledTools) {
      const result = spawnSync(path.join(installation, name), args, {
        windowsHide: true,
        timeout: 15_000,
      });
      assert(result.status === 0, `Bundled tool failed: ${name}`);
    }
    const offlineManifest = await stat(
      path.join(installation, "bootstrap-release/openagent-distribution.json"),
    ).catch(() => null);
    assert(
      Boolean(offlineManifest) === (mode === "offline"),
      "Installer contains the wrong resource set",
    );
    passed("installer layout and bundled tools execute");
    if (mode === "offline")
      native("BlockNetwork", { ACCEPTANCE_PROGRAMS: JSON.stringify(offlinePrograms) });
    start();
    if (mode === "online") {
      await until(() => {
        try {
          return evaluate(
            "window.__TAURI_INTERNALS__.invoke('shell_resource_status').then(s=>s.phase === 'failed')",
          );
        } catch {
          return false;
        }
      }, "online first-download failure");
      assert(downloadCount > 0, "Online installer did not request resources");
      pilot(["snapshot", "-i"]);
      pilot(["screenshot", path.join(reportDirectory, "online-download-failure.png")]);
      allowDownloads = true;
      pilot([
        "eval",
        "(()=>{const b=[...document.querySelectorAll('button')].find(b=>/^(Retry|重试)$/.test(b.textContent.trim())); if(!b||b.disabled) throw new Error('Retry control missing'); b.click(); return true;})()",
      ]);
      passed("download failure is visible and retry works through the UI");
    }
    await until(
      () => {
        assert(app?.exitCode === null, "Installed application exited during startup");
        try {
          return (
            pilot(["url"]).includes("openagent-ui") &&
            evaluate(
              "!window.__acceptanceReloading && !!document.querySelector('[data-module=onboarding]')",
            )
          );
        } catch {
          return false;
        }
      },
      "installed frontend and onboarding",
      240_000,
    );
    pilot(["snapshot", "-i"]);
    const config = invoke("get_settings");
    assert(
      config.onboarding_completed === false,
      "First use must start without preseeded settings",
    );
    passed("fresh data reaches the actual packaged welcome wizard");
    await until(
      () => invoke("get_embedding_resource_status").state === "ready",
      "installed Runtime verifies and initializes the embedding resource",
    );
    passed("the installed Runtime reports a verified embedding model");
    Object.assign(config, {
      workspace: await realpath(workspace),
      context_compaction_enabled: false,
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
      memory_retrieval_enabled: false,
      diagnostic_log_collection_enabled: false,
      providers: [
        {
          id: "acceptance",
          name: "Acceptance local service",
          provider: "openai",
          api_key: "fixture-only",
          base_url: `http://127.0.0.1:${service.port}/v1`,
          openai_api_mode: "chat_completions",
          enabled: true,
          models: ["acceptance"],
        },
      ],
      defaults: {
        ...config.defaults,
        chat_model: { provider_id: "acceptance", model: "acceptance" },
        flash_model: { provider_id: "acceptance", model: "acceptance" },
      },
      flash_agents: Object.fromEntries(
        Object.entries(config.flash_agents).map(([key, value]) => [
          key,
          { ...value, enabled: false },
        ]),
      ),
    });
    invoke("save_settings", { config });
    invoke("set_workspace", { path: await realpath(workspace) });
    // Reload the real onboarding controller with the fixture's model configuration.
    pilot([
      "eval",
      "(()=>{window.__acceptanceReloading=true; setTimeout(()=>location.reload(),100); return true;})()",
    ]);
    await until(() => {
      try {
        return evaluate(
          "!window.__acceptanceReloading && [...document.querySelectorAll('[data-module=onboarding] footer button')].some(b=>/^(Continue|继续)$/.test(b.textContent.trim()) && !b.disabled)",
        );
      } catch {
        return false;
      }
    }, "welcome hydration");
    pilot(["snapshot", "-i"]);
    pilot(["run", path.join(root, "tests/blackbox/onboarding-welcome-finish.toml")]);
    await until(() => {
      try {
        return (
          invoke("get_settings").onboarding_completed &&
          evaluate(
            "!window.__acceptanceReloading && !!document.querySelector('[contenteditable=true]')",
          )
        );
      } catch {
        return false;
      }
    }, "main composer after first-use setup");
    passed("welcome wizard completes and persists settings");
    for (const theme of ["light", "dark"]) {
      for (const language of ["en", "zh"]) {
        const settings = invoke("get_settings");
        invoke("save_settings", { config: { ...settings, theme, language } });
        pilot([
          "eval",
          "(()=>{window.__acceptanceReloading=true; setTimeout(()=>location.reload(),100); return true;})()",
        ]);
        await until(() => {
          try {
            return evaluate(
              `!window.__acceptanceReloading && document.querySelector('[contenteditable=true]')?.getAttribute('data-placeholder')?.startsWith(${JSON.stringify(language === "en" ? "Message" : "发送消息")}) && document.documentElement.classList.contains('dark') === ${theme === "dark"}`,
            );
          } catch {
            return false;
          }
        }, `${theme}/${language} main window`);
        pilot(["snapshot", "-i"]);
        pilot(["screenshot", path.join(reportDirectory, `${mode}-${theme}-${language}.png`)]);
      }
    }
    passed("installed UI renders in light/dark and Chinese/English");
    // Send via the real composer, whose normal handler uses the shared SDK.
    pilot(["snapshot", "-i"]);
    evaluate(
      "(()=>{const e=document.querySelector('[contenteditable=true][role=textbox]'); e.focus(); e.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:'Verify the installed application.'})); return true;})()",
    );
    await until(
      () => evaluate("!document.querySelector('button.send-btn').disabled"),
      "composer input",
    );
    pilot(["snapshot", "-i"]);
    pilot(["click", "button.send-btn"]);
    await until(() => {
      try {
        return evaluate(
          `document.body.innerText.includes('Acceptance streamed reply:') && !document.body.innerText.includes(${JSON.stringify(REPLY)})`,
        );
      } catch {
        return false;
      }
    }, "incremental streaming before completion");
    await until(() => {
      try {
        return evaluate(`document.body.innerText.includes(${JSON.stringify(REPLY)})`);
      } catch {
        return false;
      }
    }, "streamed model reply");
    assert(modelRequests > 0, "No request reached the model fixture");
    assert(
      toolRequested &&
        (await readFile(path.join(workspace, "acceptance-tool.txt"), "utf8")) ===
          "acceptance tool result",
      "Real terminal tool did not run in the workspace",
    );
    assert(
      (await readFile(path.join(workspace, "acceptance-tool-success.txt"), "utf8")) ===
        "sandbox and bundled tools verified",
      "Terminal tool failed its environment or confinement checks",
    );
    assert(
      (await readFile(path.join(workspace, "acceptance-rg-result.txt"), "utf8")).includes(
        "acceptance tool result",
      ),
      "Terminal rg search did not succeed",
    );
    const selectedRg = (await readFile(path.join(workspace, "acceptance-rg-path.txt"), "utf8"))
      .trim()
      .split(/\r?\n/)[0];
    assert(
      (await realpath(selectedRg)).toLowerCase() ===
        (await realpath(path.join(installation, "terminal-tools/rg.exe"))).toLowerCase(),
      "Terminal PATH did not select bundled rg",
    );
    assert(
      !(await stat(path.join(fixture, "outside-workspace.txt")).catch(() => null)),
      "Sandbox permitted an outside-workspace write",
    );
    passed("managed terminal executes bundled Node/rg and blocks outside-workspace writes");
    passed("composer submission and real Runtime streaming render the model reply");
    const selection = JSON.parse(
      await readFile(path.join(home, "resources/frontend/active.json"), "utf8"),
    );
    assert(
      selection.version === candidate.version && !selection.pending_confirmation,
      "Frontend activation was not confirmed",
    );
    assert(
      mode === "online"
        ? downloads.has("openagent-distribution.json") &&
            downloads.has("openagent-frontend.tar.gz") &&
            downloads.has("openagent-server-windows-x64.exe")
        : downloadCount === 0,
      "Resource source did not match installer mode",
    );
    passed(
      mode === "offline"
        ? "offline startup succeeds with host Internet blocked and zero resource requests"
        : "online installer downloads and activates signed resources",
    );
    const requestsBeforeRestart = downloadCount;
    stop();
    allowDownloads = false;
    native("BlockNetwork", { ACCEPTANCE_PROGRAMS: JSON.stringify(offlinePrograms) });
    start();
    await until(() => {
      try {
        return (
          pilot(["url"]).includes("openagent-ui") &&
          evaluate(`document.body.innerText.includes(${JSON.stringify(REPLY)})`)
        );
      } catch {
        return false;
      }
    }, "restart restores the conversation without downloads");
    assert(downloadCount === requestsBeforeRestart, "Restart fetched resources again");
    assert(invoke("get_settings").onboarding_completed, "Restart lost first-use state");
    passed("offline restart restores settings and the persisted conversation");
    pilot(["snapshot", "-i"]);
    pilot(["screenshot", path.join(reportDirectory, `${mode}-restored.png`)]);
    stop();
    const settingsBeforeUninstall = await readFile(path.join(home, "config.toml"));
    native("Uninstall");
    installed = false;
    assert(
      (await readFile(path.join(home, "config.toml"))).equals(settingsBeforeUninstall),
      "Uninstall changed the retained user settings",
    );
    passed("uninstall removes binaries and retains user data");
    report.passed = true;
  } catch (error) {
    try {
      pilot(["snapshot", "-i"]);
      pilot(["screenshot", path.join(reportDirectory, `${mode}-failure.png`)]);
    } catch {
      /* No window may exist after install failure. */
    }
    await writeFile(path.join(fixture, "failure.txt"), String(error));
    throw error;
  } finally {
    for (const cleanup of [
      stop,
      () => native("UnblockNetwork"),
      () => {
        if (installed) native("Uninstall");
      },
    ]) {
      try {
        cleanup();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    await service.stop(true);
    report.passed = report.passed && cleanupErrors.length === 0;
    await writeFile(
      path.join(reportDirectory, `${mode}-report.json`),
      `${JSON.stringify(report, null, 2)}\n`,
    );
  }
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, "Acceptance cleanup failed");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  /** @param {string} name */
  const option = (name) => {
    const index = process.argv.indexOf(name);
    assert(index >= 0 && process.argv[index + 1], `${name} is required`);
    return process.argv[index + 1];
  };
  const mode = option("--mode");
  assert(mode === "online" || mode === "offline", "Invalid installer mode");
  await testWindowsAcceptance({
    directory: path.resolve(option("--artifacts")),
    mode,
    reportDirectory: path.resolve(option("--reports")),
  });
}

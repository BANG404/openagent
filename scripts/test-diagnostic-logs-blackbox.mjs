// @ts-check
import { serve, sleep } from "bun";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { resolveBlackboxHome } from "./tauri-test-environment.mjs";

const home = resolveBlackboxHome(process.env);
if (path.resolve(home) === path.join(os.homedir(), ".openagent")) {
  throw new Error("Diagnostic verification requires an isolated application home");
}
const port = Number(process.env.DIAGNOSTIC_BLACKBOX_PORT || "19418");
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid collector port");
const endpoint = `http://127.0.0.1:${port}/v1/logs`;
if (process.env.OPENAGENT_LOGS_ENDPOINT !== endpoint) {
  throw new Error(`Start the isolated desktop with OPENAGENT_LOGS_ENDPOINT=${endpoint}`);
}
const token = "diagnostic-blackbox-token";
if (process.env.OPENAGENT_LOGS_INGEST_TOKEN !== token) {
  throw new Error("Start the isolated desktop with the fixture-only diagnostic credential");
}
let productionToken = "";
if (process.env.DIAGNOSTIC_BLACKBOX_FORWARD_PRODUCTION === "1") {
  const relative = path.relative(os.tmpdir(), path.resolve(home));
  if (!process.env.OPENAGENT_HOME || relative.startsWith("..") || path.isAbsolute(relative))
    throw new Error("Production diagnostic verification requires a temporary fixture home");
  const credential = spawnSync(
    "ssh",
    [
      "-p",
      "53922",
      "-o",
      "BatchMode=yes",
      "uxxiee@192.168.123.47",
      "cat /home/uxxiee/Document/opentelemetry/secrets/otlp_bearer_token",
    ],
    { encoding: "utf8", windowsHide: true },
  );
  if (credential.status !== 0) throw new Error("Could not read verification credential");
  productionToken = credential.stdout.trim();
}
/** @type {Buffer[]} */
const batches = [];
const collector = serve({
  hostname: "127.0.0.1",
  port,
  async fetch(request) {
    if (request.headers.get("authorization") !== `Bearer ${token}`) {
      return new Response(null, { status: 401 });
    }
    if (new URL(request.url).pathname !== "/v1/logs") return new Response(null, { status: 404 });
    const body = Buffer.from(await request.arrayBuffer());
    if (productionToken) {
      const response = await fetch("https://openagentlogs.ibat.ac.cn/v1/logs", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${productionToken}`,
          "Content-Type": request.headers.get("content-type") || "application/x-protobuf",
          "User-Agent": "",
        },
        body,
      });
      if (response.status !== 200) return new Response(null, { status: 502 });
    }
    batches.push(body);
    return new Response(null, { status: 200 });
  },
});
/** @param {string[]} args @param {string | undefined} [input] */
function pilot(args, input) {
  const result = spawnSync(process.env.TAURI_PILOT_BIN || "tauri-pilot", args, {
    env: { ...process.env, OPENAGENT_HOME: home, TAURI_PILOT_WINDOW: "main" },
    windowsHide: true,
    encoding: "utf8",
    input,
  });
  if (result.error || result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "Pilot failed", { cause: result.error });
  }
  return result.stdout;
}
/** @param {string} script */
function evaluate(script) {
  return pilot(["eval", "-"], script);
}
const operationHelper = `async function operation(operation, args = {}) {
  const response = await window.__TAURI_INTERNALS__.invoke('proxy_runtime_request', {
    request: { method: 'POST', path: '/api/desktop/operations',
      body: JSON.stringify({ operation, args }) }
  });
  if (response.status !== 200) throw new Error('Runtime operation failed');
  return JSON.parse(response.body);
}`;
/** @param {boolean} enabled */
function collection(enabled) {
  evaluate(`(async () => { ${operationHelper}
    const baseConfig = await operation('get_settings');
    await operation('save_settings', { config: {
      ...baseConfig, diagnostic_log_collection_enabled: ${enabled}
    }, baseConfig }); return true;
  })()`);
}
/** @param {string} kind @param {string} marker */
function error(kind, marker) {
  evaluate(`window.dispatchEvent(new ErrorEvent('error', {
    error: new ${kind}(${JSON.stringify(marker)}), message: ${JSON.stringify(marker)}
  }))`);
}
/** @param {string} text */
function exportedCount(text) {
  return Buffer.concat(batches).toString().split(text).length - 1;
}
/** @param {() => boolean} ready @param {string} description */
async function waitFor(ready, description) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (ready()) return;
    await sleep(100);
  }
  throw new Error(description);
}
try {
  pilot(["ping"]);
  pilot(["snapshot", "-i"]);
  collection(true);
  const baseline = exportedCount("frontend_uncaught_error");
  let count = baseline;
  for (const theme of ["light", "dark"]) {
    for (const language of ["en", "zh"]) {
      evaluate(`(async () => { ${operationHelper}
        const baseConfig = await operation('get_settings');
        await operation('save_settings', { config: {
          ...baseConfig, theme: ${JSON.stringify(theme)}, language: ${JSON.stringify(language)}
        }, baseConfig }); return true;
      })()`);
      pilot(["snapshot", "-i"]);
      error("TypeError", `DO_NOT_EXPORT_${theme}_${language}`);
      count++;
      await waitFor(
        () => exportedCount("frontend_uncaught_error") >= count,
        `Frontend diagnostic did not reach the collector for ${theme}/${language}`,
      );
    }
  }
  collection(false);
  error("RangeError", "DO_NOT_EXPORT_DISABLED");
  await sleep(6000);
  if (exportedCount("RangeError")) throw new Error("Disabled diagnostics were uploaded");
  collection(true);
  error("SyntaxError", "DO_NOT_EXPORT_REENABLED");
  await waitFor(() => exportedCount("SyntaxError") > 0, "Reenabled diagnostics were not uploaded");
  evaluate(`window.__TAURI_INTERNALS__.invoke('report_frontend_diagnostic', {
    eventName: 'DO_NOT_EXPORT_EVENT', component: 'DO_NOT_EXPORT_PATH', errorKind: 'DO_NOT_EXPORT_KIND'
  })`);
  await waitFor(
    () => exportedCount("unknown_error_type") > 0,
    "Native adapter did not forward diagnostics",
  );
  if (Buffer.concat(batches).includes("DO_NOT_EXPORT"))
    throw new Error("Raw error values were exported");
  const date = new Date().toISOString().slice(0, 10);
  const logs = await readFile(path.join(home, "logs", `openagent.${date}.jsonl`), "utf8");
  if (!logs.includes('"error_type":"RangeError"'))
    throw new Error("Disabled upload lost its local diagnostic");
  if (logs.includes("DO_NOT_EXPORT"))
    throw new Error("Raw frontend error values entered local diagnostics");
  console.log(
    "Diagnostic black-box verification passed: native frontend forwarding, four theme/locale combinations, live collection switch, local retention and field filtering.",
  );
} finally {
  collector.stop(true);
}

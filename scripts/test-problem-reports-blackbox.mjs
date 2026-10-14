// @ts-check
import { serve, sleep } from "bun";
import { Database } from "bun:sqlite";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { appendFile, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { resolveBlackboxHome } from "./tauri-test-environment.mjs";

const home = resolveBlackboxHome(process.env);
const fixtureRelative = path.relative(os.tmpdir(), path.resolve(home));
if (
  !process.env.OPENAGENT_HOME ||
  fixtureRelative.startsWith("..") ||
  path.isAbsolute(fixtureRelative)
)
  throw new Error("Support verification requires an explicit temporary application home");
const endpoint = "http://127.0.0.1:19419/v1/support/reports";
if (
  process.env.OPENAGENT_SUPPORT_ENDPOINT !== endpoint ||
  process.env.OPENAGENT_LOGS_INGEST_TOKEN !== "diagnostic-blackbox-token"
)
  throw new Error("Start the isolated desktop with the fixture support endpoint and credential");
/** @type {Array<{description: string, conversationTrace: Record<string, unknown> | null, logs: Array<{fileName: string, content: string, truncated: boolean}>}>} */
const records = [];
const receipts = [];
let failNext = false;
let productionToken = "";
if (process.env.SUPPORT_BLACKBOX_FORWARD_PRODUCTION === "1") {
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
const receiver = serve({
  hostname: "127.0.0.1",
  port: 19419,
  async fetch(request) {
    if (request.headers.get("authorization") !== "Bearer diagnostic-blackbox-token")
      return new Response(null, { status: 401 });
    if (failNext) {
      failNext = false;
      return new Response(null, { status: 503 });
    }
    if (request.headers.get("content-encoding") !== "gzip")
      throw new Error("Support report was not compressed");
    const compressed = Buffer.from(await request.arrayBuffer());
    const payload = JSON.parse(gunzipSync(compressed).toString("utf8"));
    if (!payload.description.startsWith("SYNTHETIC_SUPPORT_FIXTURE_"))
      return new Response(null, { status: 400 });
    if (
      payload.schemaVersion !== 2 ||
      !Array.isArray(payload.logs) ||
      payload.logs.length > 4 ||
      payload.logs.some(
        /** @param {{content: string}} log */ (log) => Buffer.byteLength(log.content) > 1024 * 1024,
      ) ||
      !payload.logs.some(
        /** @param {{content: string}} log */ (log) =>
          log.content.includes("SUPPORT_RUNTIME_LOG_FIXTURE"),
      ) ||
      !payload.logs.some(
        /** @param {{content: string}} log */ (log) =>
          log.content.includes("SUPPORT_HOST_LOG_FIXTURE"),
      )
    )
      return new Response(null, { status: 400 });
    if (
      payload.conversationTrace &&
      (payload.conversationTrace.conversation?.id !== "support-fixture-conversation" ||
        payload.conversationTrace.task_traces.some(
          /** @param {{id: string}} row */ (row) => !row.id.startsWith("support-fixture-"),
        ))
    )
      return new Response(null, { status: 400 });
    records.push(payload);
    if (productionToken) {
      const response = await fetch("https://openagentlogs.ibat.ac.cn/v1/support/reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Encoding": "gzip",
          Authorization: `Bearer ${productionToken}`,
          "User-Agent": "",
        },
        body: compressed,
      });
      if (response.status !== 201) throw new Error("Production support receiver rejected fixture");
      const receipt = await response.json();
      receipts.push(receipt.reportId);
      return Response.json(receipt, { status: 201 });
    }
    const reportId = randomUUID();
    receipts.push(reportId);
    return Response.json({ reportId }, { status: 201 });
  },
});
/** @param {string[]} args @param {string | undefined} [input] */
function pilot(args, input) {
  const result = spawnSync("tauri-pilot", args, {
    encoding: "utf8",
    input,
    windowsHide: true,
    env: { ...process.env, OPENAGENT_HOME: home, TAURI_PILOT_WINDOW: "main" },
  });
  if (result.error || result.status !== 0)
    throw new Error(result.stderr || result.stdout || "Pilot failed");
  return result.stdout;
}
/** @param {string} script */
function evaluate(script) {
  return pilot(["eval", "-"], script);
}
const helper = `async function operation(operation, args = {}) {
  const r = await window.__TAURI_INTERNALS__.invoke('proxy_runtime_request', { request: {
    method: 'POST', path: '/api/desktop/operations', body: JSON.stringify({operation, args}) }});
  if (r.status !== 200) throw new Error('Fixture Runtime operation failed');
  return JSON.parse(r.body);
}`;
function openReport() {
  pilot(["snapshot", "-i"]);
  pilot(["click", "#application-help-menu"]);
  const snapshot = pilot(["snapshot", "-i"]);
  const ref = snapshot.match(/menuitem "(?:上报问题|Report a problem).*?\[ref=(e\d+)\]/)?.[1];
  if (!ref) throw new Error("Help report menu was not available");
  pilot(["click", `@${ref}`]);
  pilot(["wait", "#problem-description"]);
  pilot(["snapshot", "-i"]);
  const unchecked = evaluate(
    `document.querySelector('#problem-include-trace').getAttribute('aria-checked') === 'false'`,
  );
  if (!unchecked.includes("true")) throw new Error("Full trace was enabled without consent");
  const menus = evaluate(`document.querySelectorAll('[role=menu]').length`);
  if (!menus.trim().endsWith("0")) throw new Error("Help menu overlapped the report dialog");
}
/** @param {string} suffix */
function fill(suffix) {
  pilot(["fill", "#problem-description", `SYNTHETIC_SUPPORT_FIXTURE_${suffix}`]);
}
function submit() {
  pilot(["snapshot", "-i"]);
  pilot(["click", ".problem-report-dialog .settings-action.primary"]);
}
function close() {
  pilot(["snapshot", "-i"]);
  pilot(["click", ".problem-report-dialog .settings-action"]);
}
/** @param {() => boolean} ready */
async function waitFor(ready) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (ready()) return;
    await sleep(100);
  }
  throw new Error("Support report receipt did not arrive");
}
try {
  pilot(["ping"]);
  const previousDay = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  await appendFile(
    path.join(home, "logs", `openagent.${previousDay}.jsonl`),
    '{"message":"SUPPORT_RUNTIME_LOG_FIXTURE"}\n',
  );
  await appendFile(
    path.join(home, "logs", `openagent-host.jsonl.${previousDay}`),
    '{"message":"SUPPORT_HOST_LOG_FIXTURE"}\n',
  );
  // Only the explicitly isolated application home is writable by this scenario.
  const fixtureId = "support-fixture-conversation";
  const database = new Database(path.join(home, "messages.db"));
  database.run(
    "INSERT OR IGNORE INTO conversations (id, title, workspace, created_at, updated_at) VALUES (?, ?, ?, 1, 1)",
    [fixtureId, "Support fixture conversation", process.cwd()],
  );
  for (let index = 0; index < 205; index++) {
    database.run(
      "INSERT OR REPLACE INTO task_traces (id, conv_id, task_kind, model, system_prompt, tools, prompt, completion, status, created_at) VALUES (?, ?, 'chat_request', 'fixture', 'synthetic system prompt', '[{\"name\":\"fixture_tool\"}]', 'synthetic request', 'synthetic response', 'completed', ?)",
      [`support-fixture-trace-${index}`, fixtureId, index + 1],
    );
  }
  for (const branch of ["support-fixture-main", "support-fixture-fork"])
    database.run(
      "INSERT OR IGNORE INTO branches (id, conv_id, created_at, updated_at) VALUES (?, ?, 1, 1)",
      [branch, fixtureId],
    );
  database.run(
    "INSERT OR REPLACE INTO checkpoints (thread_id, checkpoint_id, metadata, checkpoint, created_at) VALUES (?, 'support-fixture-internal', '{}', ?, 1)",
    [
      fixtureId,
      JSON.stringify({
        messages: [],
        file_change_ids: [],
        phase: "before_completion",
        synthetic_tool_result: "fixture-only",
      }),
    ],
  );
  database.close();
  pilot(["navigate", pilot(["url"]).trim()]);
  await sleep(1500);
  const conversation = pilot(["snapshot", "-i"]).match(
    /button "Support fixture conversation" \[ref=(e\d+)\]/,
  )?.[1];
  if (!conversation) throw new Error("Synthetic support conversation was not listed");
  pilot(["click", `@${conversation}`]);
  await sleep(500);
  for (const theme of ["light", "dark"]) {
    for (const language of ["en", "zh"]) {
      evaluate(`(async () => { ${helper} const baseConfig = await operation('get_settings');
        await operation('save_settings', { baseConfig, config: { ...baseConfig,
          theme: '${theme}', language: '${language}', diagnostic_log_collection_enabled: false } }); return true; })()`);
      pilot(["navigate", pilot(["url"]).trim()]);
      await waitFor(() =>
        evaluate(`Boolean(document.querySelector('#application-help-menu'))`).includes("true"),
      );
      await waitFor(() =>
        evaluate(
          `document.querySelector('#application-help-menu').textContent.trim() === '${language === "zh" ? "帮助" : "Help"}' && document.documentElement.classList.contains('${theme}')`,
        ).includes("true"),
      );
      const selected = pilot(["snapshot", "-i"]).match(
        /button "Support fixture conversation" \[ref=(e\d+)\]/,
      )?.[1];
      if (selected) {
        pilot(["click", `@${selected}`]);
        await sleep(250);
      }
      openReport();
      pilot([
        "assert",
        "contains",
        ".report-logs-copy",
        language === "zh"
          ? "报告会附带最近两份运行日志和两份桌面日志"
          : "Your report includes the two latest Runtime logs",
      ]);
      fill(`${theme}_${language}`);
      pilot(["screenshot", path.join(home, `support-${theme}-${language}.png`)]);
      const before = records.length;
      submit();
      await waitFor(() => records.length > before);
      await waitFor(() =>
        evaluate(`Boolean(document.querySelector(".report-success"))`).includes("true"),
      );
      if (records.at(-1)?.conversationTrace !== null)
        throw new Error("Default report uploaded a trace");
      close();
      const sizeFixture = new Database(path.join(home, "messages.db"));
      try {
        sizeFixture.run(
          "INSERT OR REPLACE INTO task_traces (id, conv_id, task_kind, model, system_prompt, tools, prompt, status, created_at) VALUES ('support-fixture-oversized', ?, 'chat_request', 'fixture', '', '', ?, 'completed', 1000)",
          [fixtureId, "x".repeat(17 * 1024 * 1024)],
        );
        openReport();
        fill(`SIZE_LIMIT_${theme}_${language}`);
        pilot(["click", "#problem-include-trace"]);
        const beforeOversized = records.length;
        submit();
        await waitFor(() =>
          evaluate(`Boolean(document.querySelector(".report-error"))`).includes("true"),
        );
        pilot(["assert", "contains", ".report-error", "256 MB"]);
        pilot(["assert", "contains", ".report-error", "16 MB"]);
        pilot([
          "assert",
          "value",
          "#problem-description",
          `SYNTHETIC_SUPPORT_FIXTURE_SIZE_LIMIT_${theme}_${language}`,
        ]);
        if (records.length !== beforeOversized) throw new Error("An oversized trace was uploaded");
        pilot(["screenshot", path.join(home, `support-size-${theme}-${language}.png`)]);
        close();
      } finally {
        sizeFixture.run("DELETE FROM task_traces WHERE id = 'support-fixture-oversized'");
        sizeFixture.close();
      }
    }
  }
  openReport();
  fill("RETRY");
  failNext = true;
  submit();
  await waitFor(() =>
    evaluate(`Boolean(document.querySelector(".report-error"))`).includes("true"),
  );
  pilot(["assert", "value", "#problem-description", "SYNTHETIC_SUPPORT_FIXTURE_RETRY"]);
  submit();
  await waitFor(() =>
    evaluate(`Boolean(document.querySelector(".report-success"))`).includes("true"),
  );
  close();
  openReport();
  fill("LOG_READ_RETRY");
  const unreadableLog = path.join(home, "logs", "openagent.2099-12-31.jsonl");
  const beforeLogFailure = records.length;
  try {
    await writeFile(unreadableLog, Buffer.from([0xff, 0x0a]));
    submit();
    await waitFor(() =>
      evaluate(`Boolean(document.querySelector(".report-error"))`).includes("true"),
    );
    pilot(["assert", "value", "#problem-description", "SYNTHETIC_SUPPORT_FIXTURE_LOG_READ_RETRY"]);
    if (records.length !== beforeLogFailure)
      throw new Error("A log-read failure still uploaded a report");
  } finally {
    await rm(unreadableLog, { force: true });
  }
  submit();
  await waitFor(() =>
    evaluate(`Boolean(document.querySelector(".report-success"))`).includes("true"),
  );
  close();
  openReport();
  fill("FULL_TRACE");
  pilot(["click", "#problem-include-trace"]);
  pilot(["snapshot", "-i"]);
  submit();
  await waitFor(() =>
    evaluate(`Boolean(document.querySelector(".report-success"))`).includes("true"),
  );
  const trace = records.at(-1)?.conversationTrace;
  if (!trace || !Array.isArray(trace.task_traces) || trace.task_traces.length < 205)
    throw new Error("Complete trace was absent or truncated");
  close();
  const logs = await readFile(
    path.join(home, "logs", `openagent.${new Date().toISOString().slice(0, 10)}.jsonl`),
    "utf8",
  );
  if (logs.includes("SYNTHETIC_SUPPORT_FIXTURE_"))
    throw new Error("Support content entered application logs");
  console.log(
    `Support native verification passed: four theme/locale combinations, gzip transport, localized size limits, default-off trace, bounded Runtime/host logs, log-read and upload retries, complete trace and receipts. ${receipts.join(", ")}`,
  );
} finally {
  receiver.stop(true);
}

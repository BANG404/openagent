// @ts-check
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  performanceOptions,
  performancePreviewUrl,
  performanceDistribution,
} from "./conversation-performance-options.mjs";

const options = performanceOptions(process.argv.slice(2));
const root = fileURLToPath(new URL("..", import.meta.url));
const source = {
  revision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  dirty: Boolean(
    execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim(),
  ),
  platform: process.platform,
  bun: process.versions.bun,
};
const artifacts = options.output ?? mkdtempSync(join(tmpdir(), "openagent-performance-browser-"));
mkdirSync(artifacts, { recursive: true });
const session = `conversation-perf-${process.pid}`;
const windows = process.platform === "win32";
const wrapper = join(
  root,
  `.agents/skills/playwright/scripts/playwright_cli.${windows ? "ps1" : "sh"}`,
);
let commandNumber = 0;
/** @param {string[]} args */
function browser(args) {
  const result = spawnSync(
    windows ? "powershell.exe" : "bash",
    [
      ...(windows ? ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"] : []),
      wrapper,
      "--session",
      session,
      ...args,
    ],
    { cwd: artifacts, encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  writeFileSync(
    join(artifacts, `browser-command-${++commandNumber}.log`),
    `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
  );
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  assert(!result.stdout.includes("### Error"), result.stdout);
  return result.stdout;
}
/** @type {ReturnType<typeof spawn> | null} */
let vite = null;
if (!process.argv.includes("--base-url")) {
  const url = new URL(options.baseUrl);
  vite = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "dev",
      "--host",
      url.hostname,
      "--port",
      url.port,
      "--strictPort",
    ],
    { cwd: root, stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
  );
  vite.stderr?.on("data", (chunk) => process.stderr.write(chunk));
  vite.stdout?.on("data", () => {});
}
let opened = false;
try {
  let ready = false;
  for (let attempt = 0; attempt < 150; attempt++) {
    assert(vite?.exitCode == null, "Vite exited before the preview was ready");
    try {
      if ((await fetch(options.baseUrl)).ok) {
        ready = true;
        break;
      }
    } catch {
      /* starting */
    }
    await delay(200);
  }
  assert(ready, "Local preview did not start");
  for (const theme of ["light", "dark"])
    for (const locale of ["en", "zh"]) {
      const url = performancePreviewUrl(options, theme, locale);
      if (!opened) {
        browser(["open", "about:blank"]);
        opened = true;
        browser(["snapshot"]);
      }
      const scenarioFile = join(artifacts, `scenario-${theme}-${locale}.js`);
      writeFileSync(
        scenarioFile,
        `async (page) => {
      const errors = [];
      page.setDefaultTimeout(600000);
      page.setDefaultNavigationTimeout(600000);
      page.on('pageerror', error => errors.push(String(error)));
      await page.goto(${JSON.stringify(url)}, {waitUntil: 'commit', timeout: 600000});
      await page.waitForFunction(() => ['passed', 'failed'].includes(document.querySelector('[data-performance-phase]')?.getAttribute('data-performance-phase')), null, { timeout: 600000 });
      const result = await page.locator('[data-conversation-performance]').evaluate(el => {
        const error = el.getAttribute('data-performance-error'); if (error) throw new Error(error);
        return JSON.parse(el.getAttribute('data-conversation-performance'));
      });
      if (errors.length) throw new Error(errors.join('\\n'));
      result.browser_version = page.context().browser()?.version() ?? null;
      result.viewport = page.viewportSize();
      await page.screenshot({path:${JSON.stringify(join(artifacts, `${theme}-${locale}.png`))}});
      console.log('PERFORMANCE_RESULT=' + JSON.stringify(result));
      return result;
    }`,
      );
      const output = browser(["run-code", "--filename", scenarioFile]);
      writeFileSync(join(artifacts, `${theme}-${locale}.log`), output);
      const match = output.match(/### Result\r?\n(\{[^\n]+\})/);
      assert(match, "Browser did not return performance metrics");
      const result = JSON.parse(match[1]);
      result.source = source;
      result.streaming_frame_distribution_ms = performanceDistribution(result.streaming_frame_ms);
      result.streaming_frame_p95_ms = result.streaming_frame_distribution_ms.p95;
      result.scroll_frame_distribution_ms = performanceDistribution(result.scroll_frame_ms);
      writeFileSync(join(artifacts, `${theme}-${locale}.json`), JSON.stringify(result, null, 2));
      // Snapshot only the metrics surface; serializing thousands of transcript
      // accessibility nodes would measure the driver after the workload finished.
      browser(["snapshot", "output[data-conversation-performance]"]);
      if (options.maxFrameP95)
        assert(
          result.streaming_frame_p95_ms <= options.maxFrameP95,
          "streaming frame p95 exceeded",
        );
      console.log(`Browser performance passed: ${theme}/${locale}`);
    }
} finally {
  try {
    if (opened) browser(["close"]);
  } finally {
    vite?.kill();
  }
}
console.log(`Browser reports: ${artifacts}`);

// @ts-check

import { spawn, spawnSync } from "node:child_process";
import { access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("..", import.meta.url));
const port = Number(process.env.OPENAGENT_BROWSER_PREVIEW_PORT || 5187);
const baseUrl = `http://127.0.0.1:${port}`;
const previewUrl = `${baseUrl}/?streaming-transcript-preview`;
const session = `openagent-browser-${process.pid}`;
const playwrightCli = join(
  workspaceRoot,
  ".agents",
  "skills",
  "playwright",
  "scripts",
  "playwright_cli.sh",
);

/** @param {string[]} args */
function runPlaywright(args) {
  const result = spawnSync(playwrightCli, ["--session", session, ...args], {
    cwd: workspaceRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`playwright-cli ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

async function waitForVite() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (viteExited) throw new Error(`Vite exited before serving ${baseUrl}`);
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await delay(200);
  }
  throw new Error(`Vite did not start on ${baseUrl}`);
}

await access(playwrightCli);
const vite = spawn(
  "bun",
  ["run", "dev", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  {
    cwd: workspaceRoot,
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let viteExited = false;
vite.on("exit", () => {
  viteExited = true;
});
vite.stderr.on("data", (chunk) => process.stderr.write(String(chunk)));

try {
  await waitForVite();
  runPlaywright(["open", previewUrl]);
  runPlaywright([
    "run-code",
    `async (page) => {
      await page.waitForFunction(
        () => document.body.innerText.includes("streamed chunk 480"),
        { timeout: 10000 },
      );
    }`,
  ]);
  runPlaywright([
    "eval",
    `(() => {
      const text = document.body.innerText;
      const required = [
        "Turn 18: keep this transcript long enough to exercise scrolling.",
        "A language-tagged fence keeps its compact header:",
        "Preparing the live response.",
        "streamed chunk 480",
        "发送",
      ];
      const missing = required.filter((value) => !text.includes(value));
      if (missing.length > 0) throw new Error("preview is missing: " + missing.join(", "));
      const turns = (text.match(/Completed answer \\d+\\./g) ?? []).length;
      if (turns < 19) throw new Error("preview rendered only " + turns + " completed turns");
      return { turns };
    })()`,
  ]);
  runPlaywright([
    "screenshot",
    "--filename",
    join(tmpdir(), `openagent-streaming-preview-${process.pid}.png`),
    "--full-page",
  ]);
} finally {
  try {
    runPlaywright(["close"]);
  } finally {
    vite.kill("SIGTERM");
  }
}

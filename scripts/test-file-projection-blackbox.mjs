// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBlackboxHome } from "./tauri-test-environment.mjs";
import { captureBlackboxScreenshot } from "./blackbox-screenshot.mjs";

const repo = resolve(fileURLToPath(new URL("..", import.meta.url)));
const isolatedHome = resolveBlackboxHome(process.env, { instanceName: "file-diff" });
const artifacts = mkdtempSync(join(tmpdir(), "openagent-file-projection-"));

/** @param {string} command @param {string[]} args */
function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: artifacts,
    env: { ...process.env, OPENAGENT_HOME: isolatedHome, TAURI_PILOT_WINDOW: "main" },
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")}: ${result.stderr || result.stdout || String(result.error)}`,
  );
  return result.stdout.trim();
}
/** @param {string[]} args */
const pilot = (args) => run(process.env.TAURI_PILOT_BIN || "tauri-pilot", args);
/** @param {string} action */
const fixture = (action) =>
  run("python", [
    join(repo, "runtime/scripts/file-projection-blackbox-fixture.py"),
    "--home",
    isolatedHome,
    "--action",
    action,
  ]);
/** @param {string} expression */
async function waitFor(expression) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (
      pilot([
        "eval",
        `document.documentElement.dataset.fileProjectionReload !== "pending" && (${expression})`,
      ]) === "true"
    )
      return;
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`Timed out: ${expression}`);
}

async function reload() {
  pilot(["snapshot", "-i"]);
  pilot([
    "eval",
    "document.documentElement.dataset.fileProjectionReload = 'pending'; setTimeout(() => location.reload(), 100); true",
  ]);
  await waitFor(
    "!document.querySelector('.skeleton') && document.querySelectorAll('.file-row').length === 1",
  );
}

pilot(["ping"]);
const url = new URL(pilot(["url"]));
assert(!url.search, "Run against the ordinary desktop conversation surface");
fixture("seed");
pilot(["snapshot", "-i"]);
pilot([
  "eval",
  "document.documentElement.dataset.fileProjectionReload = 'pending'; setTimeout(() => location.reload(), 100); true",
]);
await waitFor(
  "[...document.querySelectorAll('.conv-item')].some(item => item.textContent.includes('File projection regression'))",
);
pilot(["snapshot", "-i"]);
pilot([
  "eval",
  "[...document.querySelectorAll('.conv-item')].find(item => item.textContent.includes('File projection regression')).click(); true",
]);
await waitFor(
  "document.querySelectorAll('.file-row').length === 1 && document.querySelectorAll('.file-panel .diff-row.full-file').length === 4",
);
for (const language of ["en", "zh"]) {
  for (const theme of ["light", "dark"]) {
    pilot(["snapshot", "-i"]);
    pilot([
      "eval",
      `(async () => {
      const { desktopOpenAgent, emit } = await import('/src/lib/openagent/tauriClient.ts');
      const config = await desktopOpenAgent.invokeProduct('get_settings', {});
      config.theme = '${theme}'; config.language = '${language}';
      await desktopOpenAgent.invokeProduct('save_settings', { config });
      await emit('settings-changed');
      const { applyDocumentTheme } = await import('/src/lib/appTheme.ts');
      const { setLocale } = await import('/src/lib/i18n.ts');
      applyDocumentTheme(config.theme); setLocale(config.language);
      return true;
    })()`,
    ]);
    await reload();
    await waitFor(`document.documentElement.classList.contains('${theme}')`);
    pilot(["snapshot", "-i"]);
    await waitFor("document.querySelectorAll('.file-panel .diff-row.add').length === 4");
    pilot(["snapshot", "-i"]);
    pilot(["run", join(repo, "tests/blackbox/file-projection.toml")]);
    captureBlackboxScreenshot(pilot, join(artifacts, `inferred-${theme}-${language}.png`));
    await reload();
    await waitFor("document.querySelectorAll('.file-panel .diff-row.add').length === 4");
    assert.equal(
      pilot(["eval", "document.querySelector('.file-panel .revert-button') === null"]),
      "true",
    );
    fixture("verify");
    pilot(["snapshot", "-i"]);
    pilot(["run", join(repo, "tests/blackbox/file-streaming.toml")]);
    captureBlackboxScreenshot(pilot, join(artifacts, `streaming-${theme}-${language}.png`));
    await reload();
    await waitFor(
      "!document.querySelector('.stop-btn') && document.querySelectorAll('.file-panel .diff-row.add').length === 4",
    );
  }
}
// Exercise the shared authenticated branch operation through the real desktop
// transport, then refresh the ordinary surface and verify sibling isolation.
for (const [tip, expected] of [
  ["fixture-sibling", "one\nsibling"],
  ["fixture-tip", "one\nTWO\nthree\nFOUR"],
]) {
  pilot(["snapshot", "-i"]);
  pilot([
    "eval",
    `(async () => {
    const { desktopOpenAgent } = await import('/src/lib/openagent/tauriClient.ts');
    await desktopOpenAgent.switchRemoteConversationBranch('file-projection-blackbox', '${tip}');
    return true;
  })()`,
  ]);
  await reload();
  await waitFor(
    `[...document.querySelectorAll('.file-panel .diff-row code')].map(row => row.textContent).join(String.fromCharCode(10)) === ${JSON.stringify(expected)}`,
  );
  fixture("verify");
}
pilot(["logs", "--level", "error"]);
process.stdout.write(`Checkpoint tool inference verification passed. Artifacts: ${artifacts}\n`);

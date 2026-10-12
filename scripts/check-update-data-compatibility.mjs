import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireArtifact, verifyArtifactBytes, verifySignedBytes } from "./signed-artifacts.mjs";
import { RELEASE_RUNTIME_ARTIFACTS, validateReleaseRuntime } from "./stage-release-runtime.mjs";

const USER_TEXT = "保留升级前的会话正文 / Keep this conversation after updating";
const ASSISTANT_TEXT = "Persisted compatibility reply";
const MEMORY_TEXT = "User-maintained memory must survive updates.\n";
const ATTACHMENT_TEXT = "Attachment before update\n";

/** Compare existing values while allowing additive object fields.
 * @param {unknown} expected @param {unknown} actual @param {string} [label]
 */
export function assertPreserved(expected, actual, label = "data") {
  if (Array.isArray(expected)) {
    assert(Array.isArray(actual), `${label}: missing array`);
    assert.equal(actual.length, expected.length, `${label}: record count changed`);
    expected.forEach((value, index) => assertPreserved(value, actual[index], `${label}[${index}]`));
  } else if (expected !== null && typeof expected === "object") {
    assert(actual !== null && typeof actual === "object", `${label}: missing object`);
    for (const [key, value] of Object.entries(expected)) {
      assertPreserved(value, Reflect.get(actual, key), `${label}.${key}`);
    }
  } else {
    assert.deepEqual(actual, expected, `${label}: persisted value changed`);
  }
}

/** @param {string} binary @param {string} home @param {string} [expectedStatus] */
export function inspectHome(binary, home, expectedStatus = "ready") {
  const result = spawnSync(binary, ["--desktop-bootstrap", "inspect"], {
    env: { ...process.env, OPENAGENT_HOME: home },
    encoding: "utf8",
    windowsHide: true,
    timeout: 60_000,
  });
  assert.equal(result.status, 0, "Runtime bootstrap inspection failed");
  const response = JSON.parse(result.stdout);
  assert.equal(response.schema_version, 1, "Unsupported bootstrap response");
  assert.equal(response.status, expectedStatus, "Unexpected startup data transition");
  return response;
}

/** @param {string[]} args */
function gh(args) {
  const result = spawnSync("gh", args, { encoding: "utf8", windowsHide: true, timeout: 180_000 });
  assert.equal(result.status, 0, "Published compatibility baseline could not be retrieved");
  return result.stdout;
}

/** Download only the current platform from a signed immutable published baseline.
 * @param {string} tag @param {string} target @param {string} directory
 */
export async function downloadBaseline(tag, target, directory) {
  assert(
    /^v\d+\.\d+\.\d+(?:-(?:beta|rc)\.\d+)?$/.test(tag),
    "Missing immutable previous release tag",
  );
  const file = RELEASE_RUNTIME_ARTIFACTS[target];
  assert(file, "Unsupported compatibility target");
  const release = JSON.parse(gh(["release", "view", tag, "--json", "isDraft,tagName"]));
  assert.equal(release.isDraft, false, "Compatibility baseline must be published");
  assert.equal(release.tagName, tag);
  await mkdir(directory, { recursive: true });
  gh([
    "release",
    "download",
    tag,
    "--dir",
    directory,
    "--pattern",
    "openagent-sdk-manifest.json",
    "--pattern",
    "openagent-sdk-manifest.json.sig",
    "--pattern",
    file,
  ]);
  const bytes = await readFile(path.join(directory, "openagent-sdk-manifest.json"));
  verifySignedBytes(
    bytes,
    await readFile(path.join(directory, "openagent-sdk-manifest.json.sig"), "utf8"),
  );
  const manifest = JSON.parse(bytes.toString("utf8"));
  assert.equal(manifest.schema_version, 1);
  assert.equal(
    manifest.release_version,
    tag.slice(1),
    "Baseline manifest belongs to another release",
  );
  const artifact = requireArtifact(manifest.artifacts?.[target]);
  assert.equal(artifact.file, file);
  const binary = path.join(directory, file);
  verifyArtifactBytes(await readFile(binary), artifact);
  if (process.platform !== "win32") await chmod(binary, 0o755);
  return binary;
}

/** @param {string} binary @param {string} home @param {string} workspace */
async function startRuntime(binary, home, workspace) {
  const token = randomUUID() + randomUUID();
  const child = spawn(
    binary,
    ["--desktop-api", "--workspace", workspace, "--listen", "127.0.0.1:0", "--output", "json"],
    {
      env: { ...process.env, OPENAGENT_HOME: home, OPENAGENT_DESKTOP_RUNTIME_TOKEN: token },
      stdio: ["pipe", "pipe", "ignore"],
      windowsHide: true,
    },
  );
  const exited = new Promise((resolve) => child.once("close", (code) => resolve(code)));
  // Install handlers immediately; every timeout/error path still reaps the child.
  try {
    const endpoint = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Runtime startup timed out")), 60_000);
      let output = "";
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("exit", () => {
        clearTimeout(timer);
        reject(new Error("Runtime exited before readiness"));
      });
      child.stdout.on("data", (chunk) => {
        output += chunk.toString();
        const line = output
          .split(/\r?\n/)
          .find((value) => value.startsWith('{"type":"ready"') || value.includes('"type":"ready"'));
        if (!line || !output.includes("\n")) return;
        try {
          const ready = JSON.parse(line);
          const url = new URL(ready.endpoint);
          assert.equal(url.hostname, "127.0.0.1");
          clearTimeout(timer);
          resolve(url.origin);
        } catch {
          /* Wait for a complete JSON line. */
        }
      });
    });
    /** @param {string} route @param {unknown} [body] */
    const request = async (route, body) => {
      const response = await fetch(`${endpoint}${route}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
      assert(response.ok, `Runtime operation failed: ${route} (${response.status})`);
      return response.json();
    };
    /** @param {string} operation @param {object} [args] */
    const invoke = (operation, args = {}) =>
      request("/api/desktop/operations", { operation, args });
    return {
      request,
      invoke,
      stop: async () => {
        child.stdin.end("shutdown\n");
        const timer = setTimeout(() => child.kill(), 15_000);
        try {
          assert.equal(await exited, 0, "Runtime did not shut down cleanly");
        } finally {
          clearTimeout(timer);
        }
      },
    };
  } catch (error) {
    child.kill();
    await exited;
    throw error;
  }
}

async function startModelFixture() {
  const server = createServer((request, response) => {
    request.resume();
    request.on("end", () => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      const chunk = {
        id: "compatibility",
        object: "chat.completion.chunk",
        created: 1,
        model: "compatibility",
        choices: [
          { index: 0, delta: { role: "assistant", content: ASSISTANT_TEXT }, finish_reason: null },
        ],
      };
      response.end(
        `data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify({ ...chunk, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`,
      );
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(undefined)));
  const address = server.address();
  assert(address && typeof address !== "string");
  return {
    url: `http://127.0.0.1:${address.port}/v1`,
    stop: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve(undefined))),
      ),
  };
}

/** @param {Awaited<ReturnType<typeof startRuntime>>} runtime @param {string} id @param {string} locator */
async function snapshot(runtime, id, locator) {
  const config = await runtime.invoke("get_settings");
  return {
    config: Object.fromEntries(
      [
        "providers",
        "defaults",
        "theme",
        "language",
        "onboarding_completed",
        "permission_profile",
      ].map((key) => [key, config[key]]),
    ),
    conversation: await runtime.invoke("get_conversation_meta", { convId: id }),
    history: await runtime.request(`/api/conversations/${id}/history`),
    memory: await runtime.invoke("get_memory", { scope: "global" }),
    attachment: await runtime.invoke("read_attachment_preview", {
      locator,
      name: "compatibility.txt",
    }),
  };
}

/** @param {string} home */
async function assertNoReset(home) {
  const backups = await readdir(path.join(home, "backups")).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  assert.equal(backups.length, 0, "Supported update unexpectedly backed up and reset user data");
}

/** Runs released bytes only, against a new task-owned home; never accepts a user's data root.
 * @param {{baselineBinary: string; candidateBinary: string}} options
 */
export async function checkUpdateDataCompatibility({ baselineBinary, candidateBinary }) {
  const fixture = await mkdtemp(path.join(tmpdir(), "openagent-update-data-"));
  const home = path.join(fixture, "home");
  const workspaceDirectory = path.join(fixture, "workspace");
  const model = await startModelFixture();
  try {
    await mkdir(home);
    await mkdir(workspaceDirectory);
    // HTTP workspace-scoped creation resolves real paths. Use that same spelling
    // for launch/configuration so runner temp aliases do not invalidate the baseline.
    const workspace = await realpath(workspaceDirectory);
    inspectHome(baselineBinary, home);
    const baseline = await startRuntime(baselineBinary, home, workspace);
    let expected;
    let id;
    let locator;
    try {
      const original = await baseline.invoke("get_settings");
      const binding = { provider_id: "compatibility", model: "compatibility" };
      await baseline.invoke("save_settings", {
        config: {
          ...original,
          workspace,
          theme: "dark",
          language: "zh",
          onboarding_completed: true,
          context_compaction_enabled: false,
          memory_retrieval_enabled: false,
          diagnostic_log_collection_enabled: false,
          providers: [
            {
              id: "compatibility",
              name: "Compatibility fixture",
              provider: "openai",
              api_key: "fixture-only-key",
              base_url: model.url,
              openai_api_mode: "chat_completions",
              enabled: true,
              models: ["compatibility"],
            },
          ],
          defaults: { ...original.defaults, chat_model: binding, flash_model: binding },
          flash_agents: Object.fromEntries(
            Object.entries(original.flash_agents).map(([key, value]) => [
              key,
              { ...value, enabled: false },
            ]),
          ),
        },
      });
      await baseline.invoke("save_memory", { scope: "global", content: MEMORY_TEXT });
      const attachment = await baseline.request("/api/attachments", {
        name: "compatibility.txt",
        content_base64: Buffer.from(ATTACHMENT_TEXT).toString("base64"),
      });
      locator = attachment.path;
      const workspaces = await baseline.request("/api/workspaces");
      assert.equal(workspaces.length, 1);
      const created = await baseline.request("/api/conversations", {
        workspace_id: workspaces[0].id,
      });
      id = created.conv_id;
      await baseline.invoke("update_conversation", {
        convId: id,
        patch: { title: "升级前的记录 / Before update", pinned: true },
      });
      await baseline.request(`/api/conversations/${id}/runs`, {
        text: USER_TEXT,
        user_message_id: randomUUID(),
        assistant_message_id: randomUUID(),
        attachments: [locator],
      });
      const deadline = Date.now() + 60_000;
      while (true) {
        const history = await baseline.request(`/api/conversations/${id}/history`);
        const text = JSON.stringify(history.checkpoints);
        if (text.includes(USER_TEXT) && text.includes(ASSISTANT_TEXT) && history.active_branch_tip)
          break;
        assert(Date.now() < deadline, "Baseline did not persist a complete conversation");
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const bootstrap = await baseline.request("/api/desktop/bootstrap");
      assert(
        bootstrap.conversations.some((conversation) => conversation.id === id),
        "Baseline startup omitted the fixture conversation",
      );
      expected = await snapshot(baseline, id, locator);
      assert(expected.history.checkpoints.length > 0, "Empty history cannot qualify compatibility");
      assert.equal(expected.memory, MEMORY_TEXT);
      assert(JSON.stringify(expected.attachment).includes(ATTACHMENT_TEXT.trim()));
    } finally {
      await baseline.stop();
    }

    for (let restart = 0; restart < 2; restart += 1) {
      inspectHome(candidateBinary, home);
      const candidate = await startRuntime(candidateBinary, home, workspace);
      try {
        assertPreserved(expected, await snapshot(candidate, id, locator));
        const bootstrap = await candidate.request("/api/desktop/bootstrap");
        assert(
          bootstrap.conversations.some((conversation) => conversation.id === id),
          "Startup omitted persisted conversation",
        );
      } finally {
        await candidate.stop();
      }
      await assertNoReset(home);
    }

    // Declining an unsupported transition must leave the original data intact.
    const incompatible = path.join(fixture, "incompatible");
    await cp(home, incompatible, { recursive: true });
    const configFile = path.join(incompatible, "config.toml");
    const originalConfig = await readFile(configFile, "utf8");
    assert(/^config_version\s*=\s*\d+/m.test(originalConfig), "Fixture has no config version");
    const config = originalConfig.replace(
      /^config_version\s*=\s*\d+/m,
      "config_version = 4294967295",
    );
    await writeFile(configFile, config);
    // A current config.toml.bak legitimately recovers an invalid primary.
    // Make both copies future-versioned to exercise an unsupported transition.
    const backupConfigFile = path.join(incompatible, "config.toml.bak");
    await writeFile(backupConfigFile, config);
    const database = await readFile(path.join(incompatible, "messages.db"));
    const status = inspectHome(candidateBinary, incompatible, "transition_required");
    assert.equal(status.transition.reset_config, true);
    assert.equal(status.transition.reset_conversations, false);
    assert.equal(await readFile(configFile, "utf8"), config);
    assert.equal(await readFile(backupConfigFile, "utf8"), config);
    assert.deepEqual(await readFile(path.join(incompatible, "messages.db")), database);
    await assertNoReset(incompatible);
  } finally {
    await model.stop();
    await rm(fixture, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [artifactsDirectory, sdkSha, previousTag, target] = process.argv.slice(2);
  assert(
    artifactsDirectory && sdkSha && previousTag && target,
    "Usage: check-update-data-compatibility.mjs <candidate-artifacts> <sdk-sha> <previous-tag> <target>",
  );
  const candidate = await validateReleaseRuntime({ artifactsDirectory, sdkSha });
  assert(candidate.sources[target], "Unsupported compatibility target");
  const directory = await mkdtemp(path.join(tmpdir(), "openagent-update-baseline-"));
  try {
    const baselineBinary = await downloadBaseline(previousTag, target, directory);
    const candidateBinary = candidate.sources[target];
    if (process.platform !== "win32") await chmod(candidateBinary, 0o755);
    await checkUpdateDataCompatibility({ baselineBinary, candidateBinary });
    process.stdout.write("Published-version data compatibility passed.\n");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

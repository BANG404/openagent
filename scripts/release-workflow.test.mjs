import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { runtimeChannelArtifacts, stageRuntimeChannel } from "./runtime-channel-artifacts.mjs";
import { signingFixture } from "../tests/fixtures/minisign.mjs";

const workflowPath = new URL("../.github/workflows/release.yml", import.meta.url);

/**
 * @param {string} jobName
 * @param {string} nextJobName
 */
async function releaseJobSource(jobName, nextJobName) {
  const source = (await readFile(workflowPath, "utf8")).replaceAll("\r\n", "\n");
  const start = source.indexOf(`  ${jobName}:\n`);
  const end = source.indexOf(`  ${nextJobName}:\n`, start + 1);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("release workflow publication gates", () => {
  test("Runtime channels stage the manifest-selected files before uploading", async () => {
    const job = await releaseJobSource("publish", "archive-prerelease");
    const step = job.slice(
      job.indexOf("      - name: Update signed runtime component channel"),
      job.indexOf("      - name: Update signed frontend component channel"),
    );
    expect(step).toContain(
      'node scripts/runtime-channel-artifacts.mjs "$RELEASE_TAG" "$component_dir"',
    );
    expect(step.indexOf("node scripts/runtime-channel-artifacts.mjs")).toBeLessThan(
      step.indexOf('gh release upload "$component_channel"'),
    );
    expect(step).not.toContain("expected_count=6");
    expect(step).not.toContain("--pattern 'openagent-server-*'");
  });

  test("plugin tag setup excludes the separately checked-out private SDK", async () => {
    const source = (
      await readFile(new URL("../.github/workflows/plugin-releases.yml", import.meta.url), "utf8")
    ).replaceAll("\r\n", "\n");
    const step = source.slice(
      source.indexOf("      - name: Initialize pinned standard package sources"),
    );
    const runSource = step.match(/ {8}run: \|\n((?: {10}.*\n|\n)+)/)?.[1].replace(/^ {10}/gm, "");
    expect(runSource).toBeDefined();
    const mockGit = `
git() {
  if [[ "$1 $2" == "submodule update" ]]; then return 0; fi
  if [[ "$1 $2" == "submodule foreach" ]]; then
    local displaypath
    for displaypath in plugins/chat-groups plugins/goal/nested sdk; do
      eval "$4" || return $?
    done
  elif [[ "$1" == "fetch" ]]; then
    if [[ "$displaypath" == sdk ]]; then echo 'private SDK fetch denied' >&2; return 128; fi
    echo "$displaypath"
  else
    return 2
  fi
}
`;
    const result = spawnSync(
      "bash",
      ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", mockGit + (runSource ?? "")],
      {
        encoding: "utf8",
        timeout: 5000,
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("plugins/chat-groups\nplugins/goal/nested\n");
    expect(result.stderr).toBe("");
  });

  test("Runtime publication credentials fail before expensive qualification", async () => {
    const detect = await releaseJobSource("detect", "sdk-release");
    const credentialStep = detect.slice(
      detect.indexOf("      - name: Require private release credentials"),
    );
    const runSource = credentialStep
      .match(/ {8}run: \|\n((?: {10}.*\n|\n)+)/)?.[1]
      .replace(/^ {10}/gm, "");
    expect(runSource).toBeDefined();

    for (const [runtime, token, expectedStatus] of [
      ["true", "", 1],
      ["true", "fixture-token", 0],
      ["false", "", 0],
    ]) {
      const result = spawnSync(
        "bash",
        ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", runSource ?? ""],
        {
          encoding: "utf8",
          timeout: 5000,
          env: {
            ...process.env,
            OPENAGENT_CI_REPORTER_APP_ID: "fixture-app",
            OPENAGENT_CI_REPORTER_PRIVATE_KEY: "fixture-key",
            OPENAGENT_SDK_RELEASE_TOKEN: "fixture-sdk-token",
            TAURI_SIGNING_PRIVATE_KEY: "fixture-signing-key",
            OPENAGENT_PLUGIN_RELEASE_TOKEN: String(token),
            RUNTIME: String(runtime),
            PRERELEASE: "true",
            NATIVE_SHELL: "false",
          },
        },
      );
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(expectedStatus);
      if (expectedStatus === 1) {
        expect(result.stderr).toContain(
          "OPENAGENT_PLUGIN_RELEASE_TOKEN is required for Runtime releases",
        );
      }
    }
  });

  test("overlapping complete resources cannot upload concurrently with component publishers", async () => {
    const job = await releaseJobSource(
      "publish-distribution-resources",
      "publish-runtime-components",
    );
    const dependencies = job.slice(0, job.indexOf("    if:"));
    expect(dependencies).toContain("- publish-runtime-components");
    expect(dependencies).toContain("- publish-frontend-components");
    expect(job).toContain("always()");
    expect(job).toContain("needs.distribution-resources.result == 'success'");
    for (const publisher of ["publish-runtime-components", "publish-frontend-components"]) {
      expect(job).toContain(
        `(needs.${publisher}.result == 'success' || needs.${publisher}.result == 'skipped')`,
      );
    }
  });

  test("tagging accepts skipped candidate jobs for unselected components", async () => {
    const job = await releaseJobSource("tag", "create-draft");

    expect(job).toContain("always()");
    for (const dependency of ["build", "runtime-components", "frontend-components"]) {
      expect(job).toContain(
        `(needs.${dependency}.result == 'success' || needs.${dependency}.result == 'skipped')`,
      );
    }
  });

  test("draft creation continues after unselected component jobs are skipped", async () => {
    const job = await releaseJobSource("create-draft", "build");

    expect(job).toContain("always()");
    expect(job).toContain("needs.detect.result == 'success'");
    expect(job).toContain("needs.tag.result == 'success'");
  });

  test("selected publication jobs evaluate after skipped candidate ancestors", async () => {
    /** @type {Array<[string, string, string]>} */
    const jobs = [
      ["publish-native-assets", "publish-runtime-components", "build"],
      ["publish-runtime-components", "publish-frontend-components", "runtime-components"],
      ["publish-frontend-components", "publish-store", "frontend-components"],
      ["publish-store", "publish-sdk-release", "build"],
    ];

    for (const [jobName, nextJobName, candidateJob] of jobs) {
      const job = await releaseJobSource(jobName, nextJobName);
      expect(job).toContain("always()");
      expect(job).toContain("needs.detect.result == 'success'");
      expect(job).toContain("needs.create-draft.result == 'success'");
      expect(job).toContain(`needs.${candidateJob}.result == 'success'`);
    }
  });

  test("selected component publishers cannot be skipped before publication", async () => {
    /** @type {Array<[string, string]>} */
    const finalPublicationJobs = [
      ["publish-sdk-release", "publish"],
      ["publish", "archive-prerelease"],
    ];

    for (const [jobName, nextJobName] of finalPublicationJobs) {
      const job = await releaseJobSource(jobName, nextJobName);
      expect(job).toContain(
        "needs.detect.outputs.native_shell != 'true' || needs.publish-native-assets.result == 'success'",
      );
      expect(job).toContain(
        "needs.detect.outputs.runtime != 'true' || needs.publish-runtime-components.result == 'success'",
      );
      expect(job).toContain(
        "needs.detect.outputs.frontend != 'true' || needs.publish-frontend-components.result == 'success'",
      );
      expect(job).not.toContain(
        "needs.publish-frontend-components.result == 'success' || needs.publish-frontend-components.result == 'skipped'",
      );
      expect(job).toContain(
        "needs.detect.outputs.prerelease == 'true' || needs.publish-store.result == 'success'",
      );
    }
  });
});

describe("Runtime channel asset admission", () => {
  const signer = signingFixture();
  /** @param {(directory: string, files: Map<string, Buffer>) => Promise<void>} run */
  async function withChannelFixture(run) {
    const directory = await mkdtemp(path.join(tmpdir(), "openagent-runtime-channel-"));
    const { files } = channelFixture();
    try {
      await run(directory, files);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  function channelFixture() {
    const files = new Map([
      ["openagent-server-windows-x64.exe", Buffer.from("windows Runtime")],
      ["openagent-server-linux-x64", Buffer.from("linux Runtime")],
      ["codex-command-runner.exe", Buffer.from("command runner")],
      ["codex-windows-sandbox-setup.exe", Buffer.from("sandbox setup")],
      ["codex-bwrap-linux-x64", Buffer.from("linux sandbox")],
    ]);
    /** @param {string} file */
    const descriptor = (file) => {
      const bytes = files.get(file);
      if (!bytes) throw new Error(`Missing fixture: ${file}`);
      return { file, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
    };
    const manifest = {
      schema_version: 1,
      artifacts: {
        "windows-x64": descriptor("openagent-server-windows-x64.exe"),
        "linux-x64": descriptor("openagent-server-linux-x64"),
      },
      helpers: {
        "windows-x64": {
          "codex-command-runner.exe": descriptor("codex-command-runner.exe"),
          "codex-windows-sandbox-setup.exe": descriptor("codex-windows-sandbox-setup.exe"),
        },
        "linux-x64": { "codex-bwrap-linux-x64": descriptor("codex-bwrap-linux-x64") },
      },
    };
    files.set("openagent-sdk-manifest.json", Buffer.from(JSON.stringify(manifest)));
    files.set(
      "openagent-sdk-manifest.json.sig",
      Buffer.from(signer.sign(files.get("openagent-sdk-manifest.json"))),
    );
    return { files, manifest };
  }

  /** @param {Map<string, Buffer>} files */
  function fixtureDownload(files) {
    /** @param {string} release @param {string} directory @param {string[]} names */
    return async (release, directory, names) => {
      expect(release).toBe("v1.2.3-beta.1");
      for (const name of names) {
        const bytes = files.get(name);
        if (!bytes) throw new Error(`Release asset missing: ${name}`);
        await writeFile(path.join(directory, name), bytes);
      }
    };
  }

  test("copies all declared servers and helpers with unchanged manifest and signature", async () => {
    await withChannelFixture(async (directory, files) => {
      await stageRuntimeChannel({
        release: "v1.2.3-beta.1",
        directory,
        publicKey: signer.publicKey,
        download: fixtureDownload(files),
      });
      for (const [name, bytes] of files) {
        expect(await readFile(path.join(directory, name))).toEqual(bytes);
      }
    });
  });

  test("missing helper aborts channel staging", async () => {
    await withChannelFixture(async (directory, files) => {
      files.delete("codex-command-runner.exe");
      await expect(
        stageRuntimeChannel({
          release: "v1.2.3-beta.1",
          directory,
          publicKey: signer.publicKey,
          download: fixtureDownload(files),
        }),
      ).rejects.toThrow("Release asset missing: codex-command-runner.exe");
    });
  });

  for (const name of ["openagent-server-windows-x64.exe", "codex-command-runner.exe"]) {
    test(`rejects wrong size and same-size corruption of ${name}`, async () => {
      await withChannelFixture(async (directory, files) => {
        const original = files.get(name);
        if (!original) throw new Error("Missing fixture bytes");
        files.set(name, Buffer.concat([original, Buffer.from("corrupt")]));
        await expect(
          stageRuntimeChannel({
            release: "v1.2.3-beta.1",
            directory,
            publicKey: signer.publicKey,
            download: fixtureDownload(files),
          }),
        ).rejects.toThrow(`Runtime artifact size mismatch: ${name}`);
        files.set(name, Buffer.alloc(original.length));
        await expect(
          stageRuntimeChannel({
            release: "v1.2.3-beta.1",
            directory,
            publicKey: signer.publicKey,
            download: fixtureDownload(files),
          }),
        ).rejects.toThrow(`Runtime artifact SHA-256 mismatch: ${name}`);
      });
    });
  }

  test("rejects unsafe filenames and collisions with signed manifest files", () => {
    for (const file of [
      "../runner.exe",
      "runner*.exe",
      "--runner.exe",
      "openagent-sdk-manifest.json",
    ]) {
      const { manifest } = channelFixture();
      manifest.helpers["windows-x64"]["codex-command-runner.exe"].file = file;
      expect(() => runtimeChannelArtifacts(manifest)).toThrow();
    }
  });

  test("rejects a missing signature or modified manifest before downloading binaries", async () => {
    await withChannelFixture(async (directory, files) => {
      files.set("openagent-sdk-manifest.json.sig", Buffer.alloc(0));
      await expect(
        stageRuntimeChannel({
          release: "v1.2.3-beta.1",
          directory,
          publicKey: signer.publicKey,
          download: fixtureDownload(files),
        }),
      ).rejects.toThrow("Invalid signature encoding");
      const { files: signedFiles } = channelFixture();
      files.set(
        "openagent-sdk-manifest.json.sig",
        signedFiles.get("openagent-sdk-manifest.json.sig"),
      );
      files.set("openagent-sdk-manifest.json", Buffer.from("{}"));
      await expect(
        stageRuntimeChannel({
          release: "v1.2.3-beta.1",
          directory,
          publicKey: signer.publicKey,
          download: fixtureDownload(files),
        }),
      ).rejects.toThrow("signature verification failed");
    });
  });
});

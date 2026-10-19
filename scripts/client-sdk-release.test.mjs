import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { signingFixture } from "../tests/fixtures/minisign.mjs";
import {
  planClientVersion,
  prepareClientRelease,
  standaloneRuntimeManifest,
} from "./client-sdk-release.mjs";

test("SDK ordering reuses identical kits and advances independently of software versions", () => {
  const plan = (channel, versions, fingerprint = "new") =>
    planClientVersion({ baseVersion: "0.3.0", channel, fingerprint, versions });
  expect(plan("beta", {})).toEqual({ version: "0.3.0-beta.1", reuse: false });
  const versions = { "0.3.0-beta.1": { openagent: { fingerprint: "same" } }, "0.3.0-beta.2": {} };
  expect(plan("beta", versions)).toEqual({ version: "0.3.0-beta.3", reuse: false });
  expect(plan("beta", versions, "same")).toEqual({ version: "0.3.0-beta.1", reuse: true });
  expect(plan("rc", versions)).toEqual({ version: "0.3.0-rc.1", reuse: false });
  expect(plan("stable", versions)).toEqual({ version: "0.3.0", reuse: false });
  expect(plan("beta", { "0.3.0": {} })).toEqual({ version: "0.3.1-beta.1", reuse: false });
  expect(plan("stable", { "0.3.0": {} })).toEqual({ version: "0.3.1", reuse: false });
  expect(() => plan("alpha", {})).toThrow("channel/version");
});

test("desktop installation metadata does not create a different standalone kit", () => {
  const base = {
    schema_version: 1,
    version: "4.0.0+desktop.0.86.0-beta.1",
    release_version: "0.86.0-beta.1",
    sdk_sha: "a".repeat(40),
    protocol: { min: 3, max: 3 },
    artifacts: {},
    helpers: {},
  };
  expect(standaloneRuntimeManifest(base)).toEqual(
    standaloneRuntimeManifest({
      ...base,
      version: "4.0.0+desktop.0.87.0-beta.1",
      release_version: "0.87.0-beta.1",
    }),
  );
});

test("builds a real installable Node ESM package from signed qualified artifacts and rejects tampering", async () => {
  const directory = await mkdtemp(join(tmpdir(), "openagent-npm-candidate-"));
  const signer = signingFixture();
  try {
    const input = join(directory, "input");
    await mkdir(input);
    const descriptor = async (file) => {
      const bytes = Buffer.from(`fixture-${file}`);
      await writeFile(join(input, file), bytes);
      return { file, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
    };
    const artifacts = {};
    for (const target of ["windows-x64", "linux-x64", "macos-arm64", "macos-x64"])
      artifacts[target] = await descriptor(`server-${target}`);
    const helpers = { "windows-x64": {}, "linux-x64": {} };
    for (const file of ["codex-command-runner.exe", "codex-windows-sandbox-setup.exe"])
      helpers["windows-x64"][file] = await descriptor(file);
    helpers["linux-x64"]["codex-bwrap-linux-x64"] = await descriptor("codex-bwrap-linux-x64");
    const bytes = Buffer.from(
      JSON.stringify({
        schema_version: 1,
        version: "4.0.0+desktop.0.86.0-beta.1",
        sdk_sha: "a".repeat(40),
        protocol: { min: 3, max: 3 },
        artifacts,
        helpers,
      }),
    );
    await writeFile(join(input, "openagent-sdk-manifest.json"), bytes);
    await writeFile(join(input, "openagent-sdk-manifest.json.sig"), signer.sign(bytes));
    const output = join(directory, "candidate");
    const result = await prepareClientRelease({
      runtimeDirectory: input,
      outputDirectory: output,
      channel: "beta",
      registry: { versions: {} },
      publicKey: signer.publicKey,
    });
    expect(result.version).toBe("0.3.0-beta.1");
    expect(result.runtime.version).toBe("4.0.0");
    const consumer = join(directory, "consumer");
    await mkdir(consumer);
    execFileSync("tar", ["-xzf", "-", "-C", consumer], {
      input: await readFile(join(output, "openagent-sdk.tgz")),
    });
    const manifest = JSON.parse(await readFile(join(consumer, "package/package.json"), "utf8"));
    expect(manifest.scripts).toBeUndefined();
    expect(manifest.private).not.toBe(true);
    const code =
      "const a=await import('./package/dist/index.js'); const b=await import('./package/dist/runtime.js'); if(typeof a.OpenAgentClient!=='function'||typeof b.ensureRuntime!=='function'||!b.runtimeRelease.manifestSha256) process.exit(1);";
    execFileSync("node", ["--input-type=module", "-e", code], { cwd: consumer });
    await writeFile(join(input, artifacts["windows-x64"].file), "tampered");
    await expect(
      prepareClientRelease({
        runtimeDirectory: input,
        outputDirectory: join(directory, "invalid"),
        channel: "beta",
        registry: { versions: {} },
        publicKey: signer.publicKey,
      }),
    ).rejects.toThrow("size mismatch");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30000);

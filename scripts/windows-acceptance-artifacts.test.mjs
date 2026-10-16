import { expect, test } from "bun:test";
import { TOML } from "bun";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { signingFixture } from "../tests/fixtures/minisign.mjs";
import { createDistribution } from "./distribution-artifacts.mjs";
import {
  describe,
  safeName,
  verifyCandidate,
  writeCandidate,
} from "./windows-acceptance-artifacts.mjs";

test("acceptance candidates bind both installers and reject changed, missing or extra bytes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "acceptance-contract-"));
  const signer = signingFixture();
  const sourceSha = "a".repeat(40);
  const sdkSha = "b".repeat(40);
  const version = "0.83.0-beta.1";
  const dirs = Object.fromEntries(
    ["runtime", "frontend", "model", "helpers", "candidate"].map((name) => [
      name,
      path.join(root, name),
    ]),
  );
  const signed = async (directory, file, value) => {
    const bytes = Buffer.from(JSON.stringify(value));
    await writeFile(path.join(directory, file), bytes);
    await writeFile(path.join(directory, `${file}.sig`), signer.sign(bytes));
  };
  try {
    for (const dir of Object.values(dirs)) await mkdir(dir);
    await writeFile(path.join(dirs.runtime, "runtime.exe"), "Runtime bytes");
    await signed(dirs.runtime, "openagent-sdk-manifest.json", {
      schema_version: 1,
      version: "0.1.1",
      protocol: { min: 2, max: 2 },
      artifacts: { "windows-x64": await describe(dirs.runtime, "runtime.exe") },
    });
    await writeFile(path.join(dirs.frontend, "frontend.tar.gz"), "Frontend archive");
    await signed(dirs.frontend, "openagent-frontend-manifest.json", {
      schema_version: 2,
      version,
      compatibility: { shell: { min: 2, max: 2 }, runtime: { min: 2, max: 2 } },
      artifact: await describe(dirs.frontend, "frontend.tar.gz"),
    });
    for (const file of [
      "model_quantized.onnx",
      "config.json",
      "tokenizer.json",
      "tokenizer_config.json",
      "special_tokens_map.json",
      "LICENSE",
    ])
      await writeFile(path.join(dirs.model, file), file);
    for (const file of ["codex-windows-sandbox-setup.exe", "codex-command-runner.exe"])
      await writeFile(path.join(dirs.helpers, file), file);
    const distribution = await createDistribution({
      directory: dirs.candidate,
      runtimeDirectory: dirs.runtime,
      frontendDirectory: dirs.frontend,
      modelDirectory: dirs.model,
      helperDirectory: dirs.helpers,
      version,
      sdkSha,
      targets: ["windows-x64"],
    });
    await signed(dirs.candidate, "openagent-distribution.json", distribution);
    const installers = {
      online: "acceptance-online-setup.exe",
      offline: "acceptance-offline-setup.exe",
    };
    for (const file of Object.values(installers))
      await writeFile(path.join(dirs.candidate, file), file);
    const identity = {
      version,
      source_sha: sourceSha,
      sdk_sha: sdkSha,
      public_key: signer.publicKey,
      installers,
    };
    await writeCandidate(dirs.candidate, identity);
    expect((await verifyCandidate(dirs.candidate)).source_sha).toBe(sourceSha);
    await writeFile(path.join(dirs.candidate, installers.online), "corrupted");
    await expect(verifyCandidate(dirs.candidate)).rejects.toThrow("mismatch");
    await writeFile(path.join(dirs.candidate, installers.online), installers.online);
    await writeFile(path.join(dirs.candidate, "unexpected.exe"), "unexpected");
    await expect(verifyCandidate(dirs.candidate)).rejects.toThrow("Unexpected");
    await rm(path.join(dirs.candidate, "unexpected.exe"));
    await writeCandidate(dirs.candidate, { ...identity, public_key: signingFixture().publicKey });
    await expect(verifyCandidate(dirs.candidate)).rejects.toThrow("signing key");
    await writeCandidate(dirs.candidate, { ...identity, sdk_sha: "c".repeat(40) });
    await expect(verifyCandidate(dirs.candidate)).rejects.toThrow("identity mismatch");
    await writeCandidate(dirs.candidate, identity);
    await rm(path.join(dirs.candidate, installers.offline));
    await expect(verifyCandidate(dirs.candidate)).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("transfer filenames cannot escape the fixture or alias Windows paths", () => {
  for (const file of [
    "../outside.exe",
    "..",
    "a/b.exe",
    "C:secret",
    "file.exe:stream",
    "trailing.",
    "trailing ",
    "\\server\\share",
    "CON.exe",
    "LPT1",
  ])
    expect(() => safeName(file)).toThrow();
  expect(safeName("OpenAgent Acceptance_0.83.0-beta.1_online-setup.exe")).toContain("setup.exe");
});

test("acceptance compiles only Pilot with debug assertions; ordinary release remains uninstrumented", async () => {
  const manifest = TOML.parse(
    await readFile(new URL("../src-tauri/Cargo.toml", import.meta.url), "utf8"),
  );
  const config = TOML.parse(
    await readFile(new URL("../.cargo/acceptance.toml", import.meta.url), "utf8"),
  );
  expect(config.profile.release["debug-assertions"]).toBe(false);
  expect(config.profile.release.package["tauri-plugin-pilot"]["debug-assertions"]).toBe(true);
  expect(manifest.profile.release["debug-assertions"]).toBeUndefined();
  expect(manifest.features.default ?? []).not.toContain("acceptance");
});

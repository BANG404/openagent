import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  bootstrapInputs,
  fingerprintPolicy,
  componentArchives,
  componentFingerprints,
  normalizeComponentInput,
  selectReleaseComponents,
  COMPONENTS,
  bindRuntimeSource,
  verifyComponentReceipt,
} from "./release-component-reuse.mjs";
import { selectCiModules } from "./ci-reuse.mjs";
import { stageReleaseIdentity } from "./stage-release-identity.mjs";
import { signingFixture } from "../tests/fixtures/minisign.mjs";

/** @type {string[]} */
const directories = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "openagent-component-reuse-"));
  directories.push(directory);
  return directory;
}
const identity = { desktop_sha: "1".repeat(40), sdk_sha: "2".repeat(40), version: "1.0.0-beta.1" };
const fingerprints = Object.fromEntries(
  COMPONENTS.map((name, index) => [name, String(index + 1).repeat(64)]),
);

describe("independently qualified release components", () => {
  test("first publication qualifies everything and later releases retain original build identities", () => {
    const first = selectReleaseComponents(fingerprints, identity, "v1.0.0-beta.1", null);
    expect(Object.values(first.components).every((item) => !item.reused)).toBe(true);
    const baseline = { ...first, artifacts: {} };
    const next = selectReleaseComponents(
      { ...fingerprints, frontend: "f".repeat(64) },
      { ...identity, desktop_sha: "3".repeat(40), version: "1.0.1-beta.1" },
      "v1.0.1-beta.1",
      baseline,
    );
    expect(next.components.frontend.reused).toBe(false);
    for (const name of ["shell", "embedding", "runtime"]) {
      expect(next.components[name].reused).toBe(true);
      expect(next.components[name].identity).toEqual(identity);
    }
    const third = selectReleaseComponents(fingerprints, identity, "v1.0.2-beta.1", {
      ...next,
      artifacts: {},
    });
    expect(third.components.shell.identity).toEqual(identity);
  });

  test("full release qualification skips only capabilities covered by verified receipts", () => {
    const requested = {
      automation: true,
      frontend: true,
      nativeQuality: true,
      nativePlatform: true,
      embedding: true,
    };
    expect(
      selectCiModules(
        requested,
        { frontend: false, nativeQuality: true, nativePlatform: true, embedding: true },
        true,
      ),
    ).toEqual({
      automation: true,
      frontend: true,
      nativeQuality: false,
      nativePlatform: false,
      embedding: false,
    });
    expect(selectCiModules(requested, {}, true)).toEqual(requested);
    expect(() =>
      selectReleaseComponents(fingerprints, identity, "v1.0.1", {
        schema_version: 1,
        tag: "v1.0.0",
        source_sha: identity.desktop_sha,
        components: {},
      }),
    ).toThrow("receipt");
  });

  test("receipts require trusted signatures, exact sources, complete archives and matching policies", () => {
    const signer = signingFixture();
    const runtimeSource = "3".repeat(40);
    const baseline = selectReleaseComponents(
      bindRuntimeSource(fingerprints, runtimeSource),
      identity,
      "v1.0.0-beta.1",
      null,
    );
    baseline.runtime_source = runtimeSource;
    baseline.artifacts = {};
    for (const name of COMPONENTS)
      for (const file of componentArchives(name))
        baseline.artifacts[file] = {
          file,
          size: 1,
          sha256: createHash("sha256").update("x").digest("hex"),
        };
    const bytes = Buffer.from(JSON.stringify(baseline));
    const options = {
      bytes,
      signature: signer.sign(bytes),
      publicKey: signer.publicKey,
      tag: baseline.tag,
      sourceSha: identity.desktop_sha,
      fingerprints,
    };
    expect(verifyComponentReceipt(options)).toEqual(baseline);
    for (const changed of [
      { bytes: Buffer.from("{}") },
      { signature: signer.sign(Buffer.from("changed")) },
      { sourceSha: "4".repeat(40) },
      { tag: "v1.0.1" },
      { fingerprints: { ...fingerprints, shell: "f".repeat(64) } },
    ])
      expect(() => verifyComponentReceipt({ ...options, ...changed })).toThrow();
    delete baseline.artifacts["shell-build-windows-x64.tar.gz"];
    const incomplete = Buffer.from(JSON.stringify(baseline));
    expect(() =>
      verifyComponentReceipt({ ...options, bytes: incomplete, signature: signer.sign(incomplete) }),
    ).toThrow("artifact metadata");
    expect(bindRuntimeSource(fingerprints, "4".repeat(40)).runtime).not.toBe(
      bindRuntimeSource(fingerprints, runtimeSource).runtime,
    );
  });

  test("input closure ignores release stamps but invalidates dependencies, policies, deletions and channel changes", async () => {
    const directory = await fixture();
    const git = (/** @type {string[]} */ args) =>
      execFileSync("git", args, { cwd: directory, stdio: "pipe", windowsHide: true });
    const put = async (/** @type {string} */ file, /** @type {string} */ bytes) => {
      await mkdir(path.dirname(path.join(directory, file)), { recursive: true });
      await writeFile(path.join(directory, file), bytes);
    };
    const commit = () => {
      git(["add", "."]);
      git([
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.com",
        "commit",
        "-m",
        "fixture",
        "--quiet",
      ]);
      return componentFingerprints(directory);
    };
    git(["init", "--quiet"]);
    await put("package.json", JSON.stringify({ version: "1.0.0", dependencies: { svelte: "5" } }));
    await put(
      "src-tauri/tauri.conf.json",
      JSON.stringify({ version: "1.0.0", plugins: { updater: { endpoints: ["beta"] } } }),
    );
    await put("src-tauri/Cargo.toml", '[package]\nname = "openagent"\nversion = "1.0.0"\n');
    await put("src-tauri/Cargo.lock", '[[package]]\nname = "openagent"\nversion = "1.0.0"\n');
    await put("src/lib/app.ts", "const a = 1; const b = 2; export const total = a + b;");
    await put("src/bootstrap/index.html", "bootstrap");
    await put("src/bootstrap/main.ts", 'import "../lib/shared";');
    await put("src/lib/shared.ts", "const a = 1; const b = 2; export const total = a + b;");
    await put("scripts/fetch-embedding-model.mjs", "model revision one");
    await put(".github/workflows/check-native.yml", "checks");
    const initial = commit();
    const initialPolicy = fingerprintPolicy(directory);
    for (const file of [
      "package.json",
      "src-tauri/tauri.conf.json",
      "src-tauri/Cargo.toml",
      "src-tauri/Cargo.lock",
    ]) {
      await put(
        file,
        (await readFile(path.join(directory, file), "utf8")).replaceAll("1.0.0", "1.0.1"),
      );
    }
    await put(".github/release.json", '{"version":"1.0.1"}');
    await put("CHANGELOG.md", "new release");
    expect(commit()).toEqual(initial);
    expect(fingerprintPolicy(directory)).toBe(initialPolicy);
    await put("src/lib/app.ts", "const a = 1; const b = 2; export const total = b + a;");
    const frontend = commit();
    expect(frontend.frontend).not.toBe(initial.frontend);
    expect(frontend.shell).toBe(initial.shell);
    expect(frontend.runtime).toBe(initial.runtime);
    expect(frontend.embedding).toBe(initial.embedding);
    await put("src/lib/shared.ts", "const a = 1; const b = 2; export const total = b + a;");
    const shared = commit();
    expect(shared.shell).not.toBe(frontend.shell);
    await put("scripts/fetch-embedding-model.mjs", "model revision two");
    const model = commit();
    for (const name of COMPONENTS) expect(model[name]).not.toBe(shared[name]);
    git(["rm", "src/bootstrap/index.html"]);
    const deleted = commit();
    expect(deleted.shell).not.toBe(model.shell);
    await put("package.json", '{"version":"1.0.1","dependencies":{"svelte":"6"}}');
    const dependency = commit();
    expect(fingerprintPolicy(directory)).not.toBe(initialPolicy);
    for (const name of COMPONENTS) expect(dependency[name]).not.toBe(deleted[name]);
    await put(
      "src-tauri/tauri.conf.json",
      '{"version":"1.0.1","plugins":{"updater":{"endpoints":["stable"]}}}',
    );
    expect(commit().shell).not.toBe(dependency.shell);
  });

  test("bootstrap closure follows shared imports and global Tailwind candidates", () => {
    const sources = new Map([
      ["src/bootstrap/main.ts", 'import "../lib/shared.js";'],
      ["src/lib/shared.ts", 'export { value } from "./value";'],
      ["src/lib/value.ts", "export const value = 1;"],
      ["src/lib/product.svelte", '<div class="rounded-3xl"></div>'],
    ]);
    const result = bootstrapInputs(sources);
    expect([...result.files]).toEqual([
      "src/bootstrap/main.ts",
      "src/lib/shared.ts",
      "src/lib/value.ts",
    ]);
    expect(result.candidates).toContain("rounded-3xl");
    sources.set("src/lib/value.ts", "export const value = import(variable);");
    expect(bootstrapInputs(sources).files.has("src/lib/product.svelte")).toBe(true);
  });

  test("preserves dependency package versions while normalizing the shell's generated version", () => {
    const lock =
      '[[package]]\nname = "openagent"\nversion = "1.0.0"\n[[package]]\nname = "dependency"\nversion = "2.0.0"';
    expect(normalizeComponentInput("src-tauri/Cargo.lock", lock)).toContain('version = "2.0.0"');
    expect(componentArchives("shell")).toHaveLength(4);
  });

  test("stages only a signed installation identity and rejects corruption before copying", async () => {
    const source = await fixture();
    const destination = path.join(source, "staged");
    const signer = signingFixture();
    const bytes = Buffer.from(
      JSON.stringify({ schema_version: 1, version: "1.1.0", shell_version: "1.0.0" }),
    );
    await writeFile(path.join(source, "openagent-distribution.json"), bytes);
    await writeFile(path.join(source, "openagent-distribution.json.sig"), signer.sign(bytes));
    await stageReleaseIdentity(source, destination, signer.publicKey);
    expect(await readFile(path.join(destination, "openagent-distribution.json"))).toEqual(bytes);
    await writeFile(path.join(source, "openagent-distribution.json"), '{"version":"2.0.0"}');
    await expect(stageReleaseIdentity(source, destination, signer.publicKey)).rejects.toThrow(
      "signature verification",
    );
    expect(await readFile(path.join(destination, "openagent-distribution.json"))).toEqual(bytes);
  });
});

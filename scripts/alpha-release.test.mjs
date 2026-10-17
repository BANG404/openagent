import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { signingFixture } from "../tests/fixtures/minisign.mjs";
import { alphaReleasePlan, stampAlphaBuild } from "./alpha-release-plan.mjs";
import {
  createAlphaRuntimeManifest,
  verifyAlphaDistribution,
  writeAlphaCandidate,
  verifyAlphaCandidate,
} from "./alpha-artifacts.mjs";
import { bindRuntimeHelpers } from "./bind-runtime-helpers.mjs";
import { createDistribution } from "./distribution-artifacts.mjs";
import { stageDistribution } from "./stage-distribution.mjs";
import { getLatestReleaseTag } from "./release-version.mjs";

test("Alpha advances past the formal version but cannot become its release baseline", () => {
  const tags = ["v0.80.0-beta.1", "v0.80.1-alpha.1", "v0.80.1-alpha.3", "v99.0.0-alpha.1"];
  expect(alphaReleasePlan("0.80.0-beta.1", tags)).toEqual({
    version: "0.80.1-alpha.4",
    tag: "v0.80.1-alpha.4",
    baselineTag: "v0.80.0-beta.1",
  });
  expect(getLatestReleaseTag(tags)).toBe("v0.80.0-beta.1");
  expect(alphaReleasePlan("0.79.0", tags).version).toBe("0.80.1-alpha.4");
  expect(() => alphaReleasePlan("0.80.0", ["v0.80.1-alpha.1"])).toThrow("baseline");
});

test("Alpha stamps only disposable shell identity and leaves formal release metadata intact", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "alpha-stamp-"));
  try {
    await mkdir(path.join(root, "src-tauri"));
    await mkdir(path.join(root, ".github"));
    const config = {
      version: "0.80.0-beta.1",
      identifier: "com.iumm.openagent",
      productName: "OpenAgent",
      app: { windows: [{ title: "OpenAgent" }] },
      plugins: { updater: { endpoints: ["production"] } },
    };
    await writeFile(path.join(root, "package.json"), JSON.stringify({ version: config.version }));
    await writeFile(path.join(root, "src-tauri/tauri.conf.json"), JSON.stringify(config));
    await writeFile(
      path.join(root, "src-tauri/Cargo.toml"),
      '[package]\nname = "openagent"\nversion = "0.80.0-beta.1"\n',
    );
    await writeFile(
      path.join(root, "src-tauri/Cargo.lock"),
      '[[package]]\nname = "openagent"\nversion = "0.80.0-beta.1"\n',
    );
    await writeFile(path.join(root, ".github/release.json"), "formal release marker");
    await stampAlphaBuild(root, "0.80.1-alpha.1");
    const stamped = JSON.parse(
      await readFile(path.join(root, "src-tauri/tauri.conf.json"), "utf8"),
    );
    expect(stamped.version).toBe("0.80.1-alpha.1");
    expect(stamped.identifier).toBe("com.iumm.openagent.alpha");
    expect(stamped.productName).toBe("OpenAgent Alpha");
    expect(stamped.plugins.updater.endpoints[0]).toContain("/alpha/latest.json");
    expect(await readFile(path.join(root, ".github/release.json"), "utf8")).toBe(
      "formal release marker",
    );
    await expect(stampAlphaBuild(root, "0.80.1-beta.1")).rejects.toThrow("Alpha");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Windows-only Alpha signs complete resources and rejects corruption, identity drift and missing installers", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "alpha-resource-"));
  const fixture = signingFixture();
  const version = "0.80.1-alpha.1";
  const sdkSha = "a".repeat(40);
  const sourceSha = "b".repeat(40);
  const directories = Object.fromEntries(
    ["runtime", "frontend", "helpers", "model", "distribution", "seed"].map((name) => [
      name,
      path.join(root, name),
    ]),
  );
  const saveSigned = async (directory, file, value) => {
    const bytes = Buffer.from(JSON.stringify(value));
    await writeFile(path.join(directory, file), bytes);
    await writeFile(path.join(directory, `${file}.sig`), fixture.sign(bytes));
  };
  try {
    for (const directory of Object.values(directories)) await mkdir(directory);
    const binary = path.join(root, "source-runtime.exe");
    await writeFile(binary, "candidate runtime");
    await createAlphaRuntimeManifest({
      directory: directories.runtime,
      binary,
      sdkSha,
      version,
      sdkVersion: "0.1.1",
      protocol: 2,
    });
    for (const name of ["codex-command-runner.exe", "codex-windows-sandbox-setup.exe"])
      await writeFile(path.join(directories.helpers, name), `Windows helper ${name}`);
    const runtime = await bindRuntimeHelpers(directories.runtime, directories.helpers, [
      "windows-x64",
    ]);
    expect(runtime.helpers["linux-x64"]).toBeUndefined();
    await saveSigned(directories.runtime, "openagent-sdk-manifest.json", runtime);
    const frontendBytes = Buffer.from("frontend archive");
    const frontend = {
      schema_version: 2,
      version,
      compatibility: { shell: { min: 2, max: 2 }, runtime: { min: 2, max: 2 } },
      artifact: {
        file: "openagent-frontend.tar.gz",
        size: frontendBytes.length,
        sha256: createHash("sha256").update(frontendBytes).digest("hex"),
        unpacked_size: 20,
        files: 1,
      },
    };
    await writeFile(path.join(directories.frontend, frontend.artifact.file), frontendBytes);
    await saveSigned(directories.frontend, "openagent-frontend-manifest.json", frontend);
    for (const name of [
      "LICENSE",
      "model_quantized.onnx",
      "config.json",
      "tokenizer.json",
      "tokenizer_config.json",
      "special_tokens_map.json",
    ])
      await writeFile(path.join(directories.model, name), `model ${name}`);
    const distribution = await createDistribution({
      directory: directories.distribution,
      runtimeDirectory: directories.runtime,
      frontendDirectory: directories.frontend,
      helperDirectory: directories.helpers,
      modelDirectory: directories.model,
      version,
      sdkSha,
      targets: ["windows-x64"],
    });
    await saveSigned(directories.distribution, "openagent-distribution.json", distribution);
    const options = {
      directory: directories.distribution,
      version,
      sdkSha,
      publicKey: fixture.publicKey,
    };
    await expect(verifyAlphaDistribution(options)).resolves.toHaveProperty("version", version);
    await stageDistribution({
      source: directories.distribution,
      destination: directories.seed,
      target: "windows-x64",
      publicKey: fixture.publicKey,
    });
    expect(
      await readFile(path.join(directories.seed, "openagent-server-windows-x64.exe"), "utf8"),
    ).toBe("candidate runtime");
    await expect(
      verifyAlphaDistribution({ ...options, version: "0.80.1-alpha.2" }),
    ).rejects.toThrow("mismatch");
    await expect(verifyAlphaDistribution({ ...options, sdkSha: "c".repeat(40) })).rejects.toThrow(
      "mismatch",
    );
    const installer = `OpenAgent Alpha_${version}_x64-setup.exe`;
    const installerBytes = Buffer.from("NSIS fixture");
    await writeFile(path.join(directories.distribution, installer), installerBytes);
    await writeFile(
      path.join(directories.distribution, `${installer}.sig`),
      fixture.sign(installerBytes),
    );
    await writeFile(
      path.join(directories.distribution, installer.replace("-setup", "-full-setup")),
      "full NSIS fixture",
    );
    const noWebviewInstaller = installer.replace("-setup", "-full-no-webview-setup");
    await writeFile(
      path.join(directories.distribution, noWebviewInstaller),
      "full without WebView2 NSIS fixture",
    );
    await writeFile(
      path.join(directories.distribution, "latest.json"),
      JSON.stringify({
        version,
        platforms: Object.fromEntries(
          ["windows-x86_64", "windows-x86_64-nsis"].map((target) => [
            target,
            {
              url: `https://github.com/BANG404/openagent/releases/download/v${version}/${encodeURIComponent(installer)}`,
              signature: fixture.sign(installerBytes),
            },
          ]),
        ),
      }),
    );
    await writeAlphaCandidate({ ...options, sourceSha, baselineTag: "v0.80.0-beta.1" });
    await writeFile(
      path.join(directories.distribution, "alpha-candidate.json.sig"),
      fixture.sign(await readFile(path.join(directories.distribution, "alpha-candidate.json"))),
    );
    await expect(verifyAlphaCandidate({ ...options, sourceSha })).resolves.toHaveProperty(
      "channel",
      "alpha",
    );
    await writeFile(
      path.join(directories.distribution, "codex-command-runner.exe"),
      "corrupt helper",
    );
    await expect(verifyAlphaDistribution(options)).rejects.toThrow("mismatch");
    await expect(verifyAlphaCandidate({ ...options, sourceSha })).rejects.toThrow("mismatch");
    await rm(path.join(directories.distribution, noWebviewInstaller));
    await writeAlphaCandidate({ ...options, sourceSha, baselineTag: "v0.80.0-beta.1" });
    await writeFile(
      path.join(directories.distribution, "alpha-candidate.json.sig"),
      fixture.sign(await readFile(path.join(directories.distribution, "alpha-candidate.json"))),
    );
    await expect(verifyAlphaCandidate({ ...options, sourceSha })).rejects.toThrow("installer");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Prepare Release isolates Alpha from the formal release and requires installed smoke before publication", async () => {
  const prepare = await readFile(
    new URL("../.github/workflows/prepare-release.yml", import.meta.url),
    "utf8",
  );
  const alpha = await readFile(
    new URL("../.github/workflows/alpha-release.yml", import.meta.url),
    "utf8",
  );
  expect(prepare).toContain("- alpha");
  expect(prepare).toContain("if: inputs.release_type == 'alpha'");
  expect(prepare).toContain("if: inputs.release_type != 'alpha'");
  expect(alpha).toContain("needs: [plan, build]");
  expect(alpha).toContain("test-alpha-installer.ps1");
  expect(alpha).not.toContain("ensure-sdk-release");
  expect(alpha).not.toContain("full: true");
  expect(alpha).not.toContain("release:prepare");
  const publisher = await readFile(new URL("./publish-alpha.mjs", import.meta.url), "utf8");
  expect(publisher).toContain('"frontend-alpha"');
  expect(publisher).toContain('"runtime-alpha"');
  expect(publisher).not.toContain('"frontend-beta"');
  expect(publisher).toContain('"--latest=false"');
});

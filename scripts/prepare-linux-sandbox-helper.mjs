import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { appendFile, chmod, copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { EOL } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), "..");

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with exit code ${result.status}\n${result.stderr ?? ""}`,
    );
  }
  return result.stdout ?? "";
}

async function sha256(file) {
  return createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
}

export async function prepareLinuxSandboxHelper({
  profile = "dev",
  targetDirectory = path.join(root, "sdk", "target"),
  targetTriple: requestedTargetTriple,
  exportToGitHubEnvironment = false,
} = {}) {
  if (process.platform !== "linux") {
    return { digest: null, revision: null, targetTriple: null };
  }
  if (!new Set(["dev", "release"]).has(profile)) {
    throw new Error(`Unsupported Cargo profile: ${profile}`);
  }

  const cargo = process.env.CARGO ?? "cargo";
  const rustc = process.env.RUSTC ?? "rustc";
  const strip = process.env.STRIP ?? "strip";
  const metadata = JSON.parse(
    run(cargo, [
      "metadata",
      "--locked",
      "--format-version",
      "1",
      "--manifest-path",
      path.join("sdk", "Cargo.toml"),
    ]),
  );
  const linuxSandboxPackage = metadata.packages.find(
    (candidate) => candidate.name === "codex-linux-sandbox" && candidate.source?.startsWith("git+"),
  );
  if (!linuxSandboxPackage) {
    throw new Error("The pinned Codex Linux sandbox package was not found in SDK metadata.");
  }
  const revision = linuxSandboxPackage.source.split("#").at(-1);
  if (!revision || !/^[0-9a-f]{40}$/.test(revision)) {
    throw new Error(`The Codex Linux sandbox source is not pinned: ${linuxSandboxPackage.source}`);
  }
  const bwrapManifest = path.resolve(
    path.dirname(linuxSandboxPackage.manifest_path),
    "..",
    "bwrap",
    "Cargo.toml",
  );
  const bwrapMetadata = JSON.parse(
    run(cargo, [
      "metadata",
      "--locked",
      "--no-deps",
      "--format-version",
      "1",
      "--manifest-path",
      bwrapManifest,
    ]),
  );
  const bwrapPackage = bwrapMetadata.packages.find(
    (candidate) =>
      candidate.name === "codex-bwrap" &&
      candidate.targets.some((target) => target.name === "bwrap" && target.kind.includes("bin")),
  );
  if (!bwrapPackage || path.resolve(bwrapPackage.manifest_path) !== bwrapManifest) {
    throw new Error("The pinned Codex checkout does not contain the expected Bubblewrap package.");
  }

  const targetTriple = requestedTargetTriple ?? /^host:\s+(\S+)$/m.exec(run(rustc, ["-vV"]))?.[1];
  if (!targetTriple) {
    throw new Error("Could not resolve the host Rust target triple.");
  }

  const profileDirectory = profile === "dev" ? "debug" : "release";
  const resolvedTargetDirectory = path.resolve(targetDirectory);
  run(
    cargo,
    [
      "build",
      "--locked",
      "--manifest-path",
      bwrapManifest,
      "--package",
      "codex-bwrap",
      "--bin",
      "bwrap",
      "--profile",
      profile,
      "--target",
      targetTriple,
      "--target-dir",
      resolvedTargetDirectory,
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        CFLAGS: [process.env.CFLAGS, "-Wno-missing-field-initializers"].filter(Boolean).join(" "),
      },
    },
  );

  const builtHelper = path.join(resolvedTargetDirectory, targetTriple, profileDirectory, "bwrap");
  if (profile === "release") {
    run(strip, ["--strip-debug", "--strip-unneeded", builtHelper], { stdio: "inherit" });
  }

  const sidecarDirectory = path.join(root, "src-tauri", "binaries");
  const sidecar = path.join(sidecarDirectory, `bwrap-${targetTriple}`);
  await mkdir(sidecarDirectory, { recursive: true });
  await copyFile(builtHelper, sidecar);
  await chmod(sidecar, 0o755);

  const digest = await sha256(builtHelper);
  const expectedDigest = process.env.CODEX_BWRAP_SHA256;
  if (expectedDigest && expectedDigest !== digest) {
    throw new Error(
      "The rebuilt Codex Bubblewrap helper does not match the digest selected for this build.",
    );
  }
  if ((await sha256(sidecar)) !== digest) {
    throw new Error("The copied Codex Bubblewrap sidecar does not match the built helper.");
  }
  if (((await stat(sidecar)).mode & 0o111) === 0) {
    throw new Error("The copied Codex Bubblewrap sidecar is not executable.");
  }
  const linuxTauriConfig = JSON.parse(
    await readFile(path.join(root, "src-tauri", "tauri.linux.conf.json"), "utf8"),
  );
  if (!linuxTauriConfig.bundle?.externalBin?.includes("binaries/bwrap")) {
    throw new Error("The Linux Tauri config does not package the Codex Bubblewrap sidecar.");
  }

  if (exportToGitHubEnvironment) {
    const githubEnvironment = process.env.GITHUB_ENV;
    if (!githubEnvironment) {
      throw new Error("GITHUB_ENV is required with --github-env.");
    }
    await appendFile(githubEnvironment, `CODEX_BWRAP_SHA256=${digest}${EOL}`, "utf8");
  }

  return { digest, revision, targetTriple };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(scriptPath)) {
  const result = await prepareLinuxSandboxHelper({
    profile: argument("--profile", "dev"),
    targetDirectory: argument("--target-dir", path.join(root, "sdk", "target")),
    targetTriple: argument("--target", undefined),
    exportToGitHubEnvironment: process.argv.includes("--github-env"),
  });
  if (result.digest) {
    console.log(
      `Prepared Codex Bubblewrap ${result.revision} for ${result.targetTriple} (sha256:${result.digest}).`,
    );
  } else {
    console.log("The Codex Bubblewrap sidecar is only required on Linux.");
  }
}

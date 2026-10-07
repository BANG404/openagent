import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = fileURLToPath(new URL("../", import.meta.url));

/** Embedded diagnostics resolve private dependencies in an ignored SDK-owned workspace.
 * @param {string} [repositoryRoot]
 */
export async function prepareEmbeddedManifest(repositoryRoot = root) {
  const host = path.join(repositoryRoot, "src-tauri");
  const destination = path.join(repositoryRoot, "sdk", "target", "desktop-host");
  const quotePath = (value) => JSON.stringify(value.replaceAll("\\", "/"));
  let manifest = await readFile(path.join(host, "Cargo.toml"), "utf8");
  manifest = manifest
    .replace(
      'edition = "2021"',
      `edition = "2021"\nbuild = ${quotePath(path.join(host, "build.rs"))}`,
    )
    .replaceAll('path = "src/lib.rs"', `path = ${quotePath(path.join(host, "src/lib.rs"))}`)
    .replaceAll('path = "src/main.rs"', `path = ${quotePath(path.join(host, "src/main.rs"))}`)
    .replaceAll(
      'path = "src/bin/openagent-agent-server.rs"',
      `path = ${quotePath(path.join(host, "src/bin/openagent-agent-server.rs"))}`,
    )
    .replace(
      "[dependencies]",
      `[features]\ndefault = []\nembedded-runtime = ["dep:openagent-app", "dep:openagent-protocol", "dep:openagent-runtime"]\n\n[dependencies]\n${["openagent-app", "openagent-protocol", "openagent-runtime"].map((crate) => `${crate} = { path = ${quotePath(path.join(repositoryRoot, "sdk/rust", crate))}, optional = true }`).join("\n")}`,
    );
  // The main binary must also be explicit because the diagnostic workspace has no src/main.rs.
  manifest += `\n[[bin]]\nname = "openagent-agent-server"\npath = ${quotePath(path.join(host, "src/bin/openagent-agent-server.rs"))}\nrequired-features = ["embedded-runtime"]\n`;
  manifest = manifest.replace(
    "[patch.crates-io]",
    `[patch.crates-io]\ntokio-tungstenite = { git = "https://github.com/openai-oss-forks/tokio-tungstenite", rev = "0e5b2d73aa18dd9f0a50ee9ff199d5aef7594186" }\ntungstenite = { git = "https://github.com/openai-oss-forks/tungstenite-rs", rev = "4fffad30fe373adbdcffab9545e9e9bf4f2fc19f" }`,
  );
  manifest = manifest.replace(
    "[target.'cfg(windows)'.dependencies]",
    `[target.'cfg(windows)'.dependencies]\nrama-error = "=0.3.0-alpha.4"\nrama-macros = "=0.3.0-alpha.4"\nrama-utils = "=0.3.0-alpha.4"`,
  );
  const config = JSON.parse(await readFile(path.join(host, "tauri.conf.json"), "utf8"));
  config.build.frontendDist = path.resolve(host, config.build.frontendDist).replaceAll("\\", "/");
  config.bundle.icon = config.bundle.icon.map((name) =>
    path.resolve(host, name).replaceAll("\\", "/"),
  );
  config.bundle.externalBin = config.bundle.externalBin.map((name) =>
    path.resolve(host, name).replaceAll("\\", "/"),
  );
  await mkdir(destination, { recursive: true });
  await cp(path.join(host, "capabilities"), path.join(destination, "capabilities"), {
    recursive: true,
  });
  // The i18n plugin discovers src-tauri/locales below the nearest workspace
  // above OUT_DIR. Keep the generated diagnostic workspace self-contained.
  await cp(path.join(host, "locales"), path.join(destination, "src-tauri", "locales"), {
    recursive: true,
  });
  await cp(path.join(host, "resources", "models"), path.join(destination, "resources", "models"), {
    recursive: true,
  });
  await cp(path.join(host, "icons"), path.join(destination, "icons"), { recursive: true });
  await cp(path.join(host, "binaries"), path.join(destination, "binaries"), { recursive: true });
  await writeFile(path.join(destination, "Cargo.toml"), manifest);
  const hostLock = await readFile(path.join(host, "Cargo.lock"), "utf8");
  const sdkLock = await readFile(path.join(repositoryRoot, "sdk", "Cargo.lock"), "utf8");
  const packageBlocks = (lock) => lock.split("\n[[package]]\n").slice(1);
  const packageIdentity = (block) =>
    ["name", "version", "source"]
      .map((key) => new RegExp(`^${key} = (.+)$`, "m").exec(block)?.[1] ?? "")
      .join("|");
  const blocks = packageBlocks(hostLock);
  const identities = new Set(blocks.map(packageIdentity));
  for (const block of packageBlocks(sdkLock)) {
    const identity = packageIdentity(block);
    if (!identities.has(identity)) {
      identities.add(identity);
      blocks.push(block);
    }
  }
  // Retain both owners' pinned dependency versions instead of resolving a new
  // Tauri/SDK graph when this diagnostic workspace is generated.
  const lockInputs = createHash("sha256")
    .update(manifest)
    .update(hostLock)
    .update(sdkLock)
    .digest("hex");
  const inputFile = path.join(destination, "lock-inputs.sha256");
  if ((await readFile(inputFile, "utf8").catch(() => "")) !== lockInputs) {
    await writeFile(
      path.join(destination, "Cargo.lock"),
      `${hostLock.split("\n[[package]]\n")[0]}\n[[package]]\n${blocks.join("\n[[package]]\n")}`,
    );
    await writeFile(inputFile, lockInputs);
  }
  await writeFile(
    path.join(destination, "tauri.conf.json"),
    `${JSON.stringify(config, null, 2)}\n`,
  );
  for (const platform of ["windows", "linux", "macos"]) {
    const source = path.join(host, `tauri.${platform}.conf.json`);
    const content = await readFile(source, "utf8").catch(() => null);
    if (!content) continue;
    const platformConfig = JSON.parse(content);
    if (platformConfig.bundle?.resources) {
      platformConfig.bundle.resources = Object.fromEntries(
        Object.entries(platformConfig.bundle.resources).map(([name, target]) => [
          path.resolve(host, name).replaceAll("\\", "/"),
          target,
        ]),
      );
    }
    if (platformConfig.bundle?.externalBin) {
      platformConfig.bundle.externalBin = platformConfig.bundle.externalBin.map((name) =>
        path.resolve(host, name).replaceAll("\\", "/"),
      );
    }
    await writeFile(
      path.join(destination, `tauri.${platform}.conf.json`),
      `${JSON.stringify(platformConfig, null, 2)}\n`,
    );
  }
  return path.join(destination, "Cargo.toml");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = await prepareEmbeddedManifest();
  const args = process.argv.slice(2);
  const manifestIndex = args.indexOf("--manifest-path");
  if (manifestIndex >= 0) args.splice(manifestIndex, 2);
  const delimiter = args.indexOf("--");
  args.splice(
    delimiter < 0 ? args.length : delimiter,
    0,
    "--manifest-path",
    manifest,
    "--features",
    "embedded-runtime",
  );
  const result = spawnSync(process.env.CARGO ?? "cargo", args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

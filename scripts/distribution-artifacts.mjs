import { createHash } from "node:crypto";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Bind the complete initial resource set to one immutable product release.
 * @param {{directory: string; runtimeDirectory: string; frontendDirectory: string; modelDirectory: string; helperDirectory: string; version: string; sdkSha: string; shellVersion?: string; targets?: string[]}} options
 */
export async function createDistribution(options) {
  const {
    directory,
    runtimeDirectory,
    frontendDirectory,
    modelDirectory,
    helperDirectory,
    version,
    sdkSha,
    shellVersion = version,
    targets,
  } = options;
  if (
    !/^\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?$/.test(version) ||
    !/^\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?$/.test(shellVersion) ||
    !/^[a-f0-9]{40}$/.test(sdkSha)
  )
    throw new Error("Invalid distribution identity");
  await mkdir(directory, { recursive: true });
  /** @param {string} source @param {string} [name] */
  const stage = async (source, name = path.basename(source)) => {
    if (!/^[a-zA-Z0-9._-]+$/.test(name) || name === "." || name === "..")
      throw new Error("Unsafe distribution filename");
    const bytes = await readFile(source);
    await cp(source, path.join(directory, name));
    return {
      file: name,
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  };
  const runtime = JSON.parse(
    await readFile(path.join(runtimeDirectory, "openagent-sdk-manifest.json"), "utf8"),
  );
  const frontend = JSON.parse(
    await readFile(path.join(frontendDirectory, "openagent-frontend-manifest.json"), "utf8"),
  );
  if (runtime.schema_version !== 1 || frontend.schema_version !== 2)
    throw new Error("Distribution components do not match their release");
  const frontendProtocol = frontend.compatibility?.runtime;
  if (
    [frontendProtocol, runtime.protocol].some(
      (range) =>
        !range ||
        !Number.isSafeInteger(range.min) ||
        !Number.isSafeInteger(range.max) ||
        range.min < 1 ||
        range.min > range.max,
    ) ||
    Math.max(frontendProtocol.min, runtime.protocol.min) >
      Math.min(frontendProtocol.max, runtime.protocol.max)
  )
    throw new Error("Frontend and Runtime protocols are incompatible");
  /** @type {Record<string, import('./signed-artifacts.mjs').Artifact>} */
  const manifests = {};
  for (const [name, source] of [
    ["openagent-sdk-manifest.json", runtimeDirectory],
    ["openagent-frontend-manifest.json", frontendDirectory],
  ]) {
    manifests[name] = await stage(path.join(source, name));
    manifests[`${name}.sig`] = await stage(path.join(source, `${name}.sig`));
  }
  /** @type {Record<string, import('./signed-artifacts.mjs').Artifact>} */
  const runtimeArtifacts = {};
  for (const [target, artifact] of Object.entries(runtime.artifacts)) {
    if (targets && !targets.includes(target)) continue;
    const descriptor = await stage(path.join(runtimeDirectory, artifact.file));
    if (descriptor.sha256 !== artifact.sha256 || descriptor.size !== artifact.size)
      throw new Error("Runtime artifact disagrees with signed manifest");
    runtimeArtifacts[target] = descriptor;
  }
  const frontendArtifact = await stage(path.join(frontendDirectory, frontend.artifact.file));
  if (
    frontendArtifact.sha256 !== frontend.artifact.sha256 ||
    frontendArtifact.size !== frontend.artifact.size
  )
    throw new Error("Frontend artifact disagrees with signed manifest");
  /** @type {Record<string, import('./signed-artifacts.mjs').Artifact>} */
  const embedding = {};
  for (const name of [
    "model_quantized.onnx",
    "config.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "special_tokens_map.json",
    "LICENSE",
  ]) {
    embedding[name] = await stage(path.join(modelDirectory, name), `embedding-${name}`);
  }
  if (targets?.some((target) => !runtimeArtifacts[target]))
    throw new Error("Distribution is missing a selected Runtime target");
  /** @type {Record<string, Record<string, import('./signed-artifacts.mjs').Artifact>>} */
  const helpers = {};
  for (const [target, names] of Object.entries({
    "windows-x64": ["codex-windows-sandbox-setup.exe", "codex-command-runner.exe"],
    "linux-x64": ["codex-bwrap-linux-x64"],
  })) {
    if (targets && !targets.includes(target)) continue;
    helpers[target] = {};
    for (const name of names) helpers[target][name] = await stage(path.join(helperDirectory, name));
  }
  const manifest = {
    schema_version: 1,
    version,
    sdk_sha: sdkSha,
    shell_version: shellVersion,
    runtime_version: runtime.version,
    frontend_version: frontend.version,
    shell_protocol: frontend.compatibility.shell,
    runtime_protocol: runtime.protocol,
    manifests,
    runtime: runtimeArtifacts,
    frontend: frontendArtifact,
    embedding,
    helpers,
  };
  await writeFile(
    path.join(directory, "openagent-distribution.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  /** @param {string} name */
  const value = (name) => args[args.indexOf(name) + 1];
  const plan = process.env.OPENAGENT_COMPONENT_PLAN
    ? JSON.parse(await readFile(path.resolve(process.env.OPENAGENT_COMPONENT_PLAN), "utf8"))
    : null;
  await createDistribution({
    shellVersion: plan?.components.shell.identity.version,
    directory: value("--output"),
    runtimeDirectory: value("--runtime"),
    frontendDirectory: value("--frontend"),
    modelDirectory: value("--model"),
    helperDirectory: value("--helpers"),
    version: value("--version"),
    sdkSha: value("--sdk-sha"),
  });
}

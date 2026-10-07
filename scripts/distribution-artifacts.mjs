import { createHash } from "node:crypto";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Bind the complete initial resource set to one immutable product release.
 * @param {{directory: string; runtimeDirectory: string; frontendDirectory: string; modelDirectory: string; helperDirectory: string; version: string; sdkSha: string}} options
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
  } = options;
  if (!/^\d+\.\d+\.\d+(?:-(?:beta|rc)\.\d+)?$/.test(version) || !/^[a-f0-9]{40}$/.test(sdkSha))
    throw new Error("Invalid distribution identity");
  await mkdir(directory, { recursive: true });
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
  if (frontend.version !== version || runtime.schema_version !== 1 || frontend.schema_version !== 2)
    throw new Error("Distribution components do not match their release");
  const manifests = {};
  for (const [name, source] of [
    ["openagent-sdk-manifest.json", runtimeDirectory],
    ["openagent-frontend-manifest.json", frontendDirectory],
  ]) {
    manifests[name] = await stage(path.join(source, name));
    manifests[`${name}.sig`] = await stage(path.join(source, `${name}.sig`));
  }
  const runtimeArtifacts = {};
  for (const [target, artifact] of Object.entries(runtime.artifacts)) {
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
  const helpers = {};
  for (const [target, names] of Object.entries({
    "windows-x64": ["codex-windows-sandbox-setup.exe", "codex-command-runner.exe"],
    "linux-x64": ["codex-bwrap-linux-x64"],
  })) {
    helpers[target] = {};
    for (const name of names) helpers[target][name] = await stage(path.join(helperDirectory, name));
  }
  const manifest = {
    schema_version: 1,
    version,
    sdk_sha: sdkSha,
    runtime_version: runtime.version,
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
  const value = (name) => args[args.indexOf(name) + 1];
  await createDistribution({
    directory: value("--output"),
    runtimeDirectory: value("--runtime"),
    frontendDirectory: value("--frontend"),
    modelDirectory: value("--model"),
    helperDirectory: value("--helpers"),
    version: value("--version"),
    sdkSha: value("--sdk-sha"),
  });
}

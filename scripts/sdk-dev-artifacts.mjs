import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const CLIENTS = {
  typescript: { name: "@bang404/openagent-sdk", file: "openagent-typescript-sdk.tar.gz" },
};

async function describeFile(directory, file) {
  if (basename(file) !== file) throw new Error(`Unsafe development artifact name: ${file}`);
  const path = join(directory, file);
  const bytes = await readFile(path);
  return {
    file,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    size: (await stat(path)).size,
  };
}

export async function createSdkDevelopmentManifest({ directory, sdkSha, version }) {
  if (!/^[0-9a-f]{40}$/.test(sdkSha)) throw new Error("Invalid immutable SDK SHA");
  if (!/^\d+\.\d+\.\d+(?:-(?:dev\.[0-9a-f]{7,40}|(?:beta|rc)\.\d+))?$/.test(version)) {
    throw new Error("Invalid SDK development version");
  }
  const runtime = JSON.parse(
    await readFile(join(directory, "openagent-sdk-manifest.json"), "utf8"),
  );
  if (runtime.schema_version !== 1 || !/^[0-9a-f]{40}$/.test(runtime.sdk_sha ?? "")) {
    throw new Error("Development kit Runtime manifest has no immutable source identity");
  }
  const helpers = {};
  for (const [target, names] of Object.entries({
    "windows-x64": ["codex-windows-sandbox-setup.exe", "codex-command-runner.exe"],
    "linux-x64": ["codex-bwrap-linux-x64"],
  })) {
    helpers[target] = Object.fromEntries(
      await Promise.all(names.map(async (name) => [name, await describeFile(directory, name)])),
    );
  }
  return {
    schema_version: 2,
    sdk_sha: sdkSha,
    version,
    runtime_manifest: {
      file: "openagent-sdk-manifest.json",
      signature: "openagent-sdk-manifest.json.sig",
    },
    runtime: {
      sdk_sha: runtime.sdk_sha,
      version: runtime.version,
      protocol: runtime.protocol,
      artifacts: runtime.artifacts,
    },
    helpers,
    clients: Object.fromEntries(
      await Promise.all(
        Object.entries(CLIENTS).map(async ([key, client]) => [
          key,
          { name: client.name, ...(await describeFile(directory, client.file)) },
        ]),
      ),
    ),
  };
}

async function main() {
  const arguments_ = process.argv.slice(2);
  const value = (name) => {
    const index = arguments_.indexOf(name);
    return index >= 0 ? arguments_[index + 1] : undefined;
  };
  const directory = value("--artifacts");
  const output = value("--output");
  const sdkSha = value("--sdk-sha");
  const version = value("--version");
  if (!directory || !output || !sdkSha || !version) {
    throw new Error(
      "Usage: sdk-dev-artifacts.mjs --artifacts <dir> --output <file> --sdk-sha <sha> --version <semver>",
    );
  }
  const manifest = await createSdkDevelopmentManifest({ directory, sdkSha, version });
  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();

import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function inspectFrontendAssets(root) {
  const index = path.join(root, "index.html");
  if (!(await stat(index).catch(() => null))?.isFile()) {
    throw new Error("Frontend assets must contain index.html.");
  }
  let files = 0;
  let unpackedSize = 0;
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(candidate);
      } else if (entry.isFile()) {
        files += 1;
        unpackedSize += (await stat(candidate)).size;
      } else {
        throw new Error(`Frontend assets contain unsupported entry ${candidate}.`);
      }
    }
  }
  return { files, unpackedSize };
}

export async function createFrontendManifest({ archive, assets, version, protocolVersion }) {
  const archiveBytes = await readFile(archive);
  const { files, unpackedSize } = await inspectFrontendAssets(assets);
  return {
    schema_version: 1,
    version,
    protocol: { min: protocolVersion, max: protocolVersion },
    artifact: {
      file: path.basename(archive),
      sha256: createHash("sha256").update(archiveBytes).digest("hex"),
      size: archiveBytes.length,
      unpacked_size: unpackedSize,
      files,
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const value = (name) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const archive = value("--archive");
  const assets = value("--assets");
  const output = value("--output");
  const version = value("--version");
  const protocolVersion = Number(value("--protocol"));
  if (!archive || !assets || !output || !version || !Number.isInteger(protocolVersion)) {
    throw new Error(
      "Usage: frontend-artifacts.mjs --archive <file> --assets <dir> --output <file> --version <semver> --protocol <integer>",
    );
  }
  const manifest = await createFrontendManifest({
    archive,
    assets,
    version,
    protocolVersion,
  });
  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}

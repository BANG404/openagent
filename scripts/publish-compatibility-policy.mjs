import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchSignedManifest, UPDATE_PUBLIC_KEY, verifySignedBytes } from "./signed-artifacts.mjs";

const repository = "BANG404/openagent";
const tag = "compatibility-policy";
const filename = "openagent-compatibility-policy.json";

/** @param {string} command @param {string[]} args */
function execute(command, args) {
  return execFileSync(command, args, { encoding: "utf8", windowsHide: true });
}

/** @param {string} candidate @param {string | undefined} previous */
function validate(candidate, previous) {
  execute("cargo", [
    "run",
    "--quiet",
    "--locked",
    "--manifest-path",
    "crates/Cargo.toml",
    "--package",
    "openagent-app",
    "--example",
    "compatibility-policy",
    "--",
    candidate,
    ...(previous ? [previous] : []),
  ]);
}

/** Independent policy publication; immutable revisions precede the moving feed.
 * @param {{ directory: string; fetchRequest?: typeof fetch; publicKey?: string;
 * execute?: typeof execute; validate?: typeof validate }} options
 */
export async function publishCompatibilityPolicy(options) {
  const run = options.execute ?? execute;
  const check = options.validate ?? validate;
  const fetchRequest = options.fetchRequest ?? fetch;
  const publicKey = options.publicKey ?? UPDATE_PUBLIC_KEY;
  const candidate = path.resolve(options.directory, filename);
  const bytes = await readFile(candidate);
  let signature = await readFile(`${candidate}.sig`, "utf8");
  verifySignedBytes(bytes, signature, publicKey);
  check(candidate, undefined);
  const policy = JSON.parse(bytes.toString("utf8"));
  const response = await fetchRequest(
    `https://api.github.com/repos/${repository}/releases/tags/${tag}`,
    {
      signal: AbortSignal.timeout(30_000),
      headers: { Accept: "application/vnd.github+json" },
    },
  );
  if (!response.ok && response.status !== 404) {
    throw new Error(`Cannot inspect policy publication: HTTP ${response.status}`);
  }
  /** @type {{ assets: { name: string; browser_download_url: string }[] } | undefined} */
  const release = response.ok ? await response.json() : undefined;
  const temporary = await mkdtemp(path.join(os.tmpdir(), "openagent-policy-publication-"));
  try {
    if (release) {
      const archives = release.assets
        .filter((a) => /^openagent-compatibility-policy-v[1-9][0-9]*\.json$/.test(a.name))
        .sort((a, b) => archiveRevision(b.name) - archiveRevision(a.name));
      if (archives.length && policy.revision < archiveRevision(archives[0].name)) {
        throw new Error("Policy revision must advance; a published revision is immutable");
      }
      const complete = archives.find((a) => release.assets.some((s) => s.name === `${a.name}.sig`));
      if (complete) {
        const previous = await fetchSignedManifest(complete.browser_download_url, {
          fetchRequest,
          publicKey,
        });
        const previousFile = path.join(temporary, "previous.json");
        await writeFile(previousFile, previous.bytes);
        await writeFile(`${previousFile}.sig`, previous.signature);
        check(candidate, previousFile);
        const revision = previous.manifest.revision;
        if (
          revision !== archiveRevision(complete.name) ||
          policy.revision < revision ||
          (policy.revision === revision && !bytes.equals(previous.bytes))
        ) {
          throw new Error("Policy revision must advance; a published revision is immutable");
        }
      } else if (
        !archives.length &&
        release.assets.some((a) => a.name === filename || a.name === `${filename}.sig`)
      ) {
        throw new Error("Published policy is missing its immutable archive");
      }
    }
    const archiveName = `openagent-compatibility-policy-v${policy.revision}.json`;
    const existing = release?.assets.find((asset) => asset.name === archiveName);
    const existingSignature = release?.assets.find((asset) => asset.name === `${archiveName}.sig`);
    if (existing) {
      const archived = await fetchRequest(existing.browser_download_url, {
        signal: AbortSignal.timeout(30_000),
      });
      if (!archived.ok || !bytes.equals(Buffer.from(await archived.arrayBuffer()))) {
        throw new Error("Archived policy revision differs from candidate");
      }
      if (existingSignature) {
        const archivedSignature = await fetchRequest(existingSignature.browser_download_url, {
          signal: AbortSignal.timeout(30_000),
        });
        if (!archivedSignature.ok) throw new Error("Cannot verify archived policy signature");
        signature = await archivedSignature.text();
        verifySignedBytes(bytes, signature, publicKey);
      }
    } else if (existingSignature) {
      throw new Error("Archived policy signature has no matching document");
    }
    // No remote mutation occurs until current and archived documents are verified.
    if (!release) {
      run("gh", [
        "release",
        "create",
        tag,
        "--repo",
        repository,
        "--target",
        "main",
        "--title",
        "OpenAgent compatibility policy",
        "--notes",
        "Signed compatibility rules. Independent from application releases; numbered assets are immutable.",
        "--prerelease",
        "--latest=false",
      ]);
    }
    const archived = path.join(temporary, archiveName);
    await writeFile(archived, bytes);
    await writeFile(`${archived}.sig`, signature);
    const missing = [
      ...(!existing ? [archived] : []),
      ...(!existingSignature ? [`${archived}.sig`] : []),
    ];
    if (missing.length) run("gh", ["release", "upload", tag, "--repo", repository, ...missing]);
    const moving = path.join(temporary, filename);
    await writeFile(moving, bytes);
    await writeFile(`${moving}.sig`, signature);
    run("gh", [
      "release",
      "upload",
      tag,
      "--repo",
      repository,
      moving,
      `${moving}.sig`,
      "--clobber",
    ]);
    return { revision: policy.revision, archive: archiveName };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

/** @param {string} name */
function archiveRevision(name) {
  const revision = Number(name.match(/-v([0-9]+)\.json$/)?.[1]);
  if (!Number.isSafeInteger(revision)) throw new Error("Invalid archived policy revision");
  return revision;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = process.argv[2];
  if (!directory) throw new Error("Usage: publish-compatibility-policy.mjs <signed-directory>");
  console.log(JSON.stringify(await publishCompatibilityPolicy({ directory })));
}

// @ts-check
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import ts from "typescript";

// Resolve the same pinned scanner used by the bootstrap's Tailwind Vite plugin.
const require = createRequire(import.meta.url);
const { Scanner } = createRequire(require.resolve("@tailwindcss/vite"))("@tailwindcss/oxide");
import { requireArtifact, verifyArtifactBytes, verifySignedBytes } from "./signed-artifacts.mjs";

export const COMPONENTS = /** @type {const} */ (["embedding", "runtime", "frontend", "shell"]);
export const SHELL_TARGETS = ["windows-x64", "linux-x64", "macos-arm64", "macos-x64"];
const root = fileURLToPath(new URL("../", import.meta.url));
const hash = (/** @type {string | Uint8Array} */ bytes) =>
  createHash("sha256").update(bytes).digest("hex");
const git = (/** @type {string[]} */ args, repositoryRoot = root) =>
  execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8", windowsHide: true }).trim();

/** Remove only generated release stamps; all other manifest fields remain inputs.
 * @param {string} file @param {string} source
 */
export function normalizeComponentInput(file, source) {
  if (file === "package.json" || file === "src-tauri/tauri.conf.json") {
    const manifest = JSON.parse(source);
    delete manifest.version;
    return JSON.stringify(manifest);
  }
  if (file === "src-tauri/Cargo.toml")
    return source.replace(/^(version = )"[^"]+"/m, '$1"<release>"');
  if (file === "src-tauri/Cargo.lock")
    return source.replace(
      /(\[\[package\]\]\r?\nname = "openagent"\r?\nversion = )"[^"]+"/,
      '$1"<release>"',
    );
  return source;
}

/** Conservative, explicit input closure. Automation and test policy changes invalidate every receipt.
 * @param {string} file @returns {readonly (typeof COMPONENTS)[number][]}
 */
export function inputOwners(file) {
  if (["CHANGELOG.md", ".github/release.json"].includes(file) || file.endsWith(".md")) return [];
  if (file === "runtime") return ["runtime", "frontend"];
  if (
    file.startsWith("scripts/") ||
    file.startsWith("tests/") ||
    file.startsWith(".github/") ||
    file.startsWith("patches/") ||
    ["package.json", "bun.lock", ".gitmodules"].includes(file)
  )
    return COMPONENTS;
  if (file.startsWith("src-tauri/resources/models/")) return ["embedding"];
  if (file.startsWith("src-tauri/") || file.startsWith("crates/")) return ["shell", "frontend"];
  if (
    file.startsWith("src/bootstrap/") ||
    file === "src/lib/bootstrapI18n.ts" ||
    file === "bootstrap.vite.config.js"
  )
    return ["shell", "frontend"];
  if (
    file.startsWith("src/") ||
    file.startsWith("static/") ||
    file.startsWith("sdk/") ||
    file.startsWith("assets/")
  )
    return ["frontend"];
  if (file.startsWith("plugins/")) return ["frontend", "shell"];
  return COMPONENTS;
}

/** Shared bootstrap imports and Tailwind's global source scan are shell build inputs.
 * Unresolved local or computed imports conservatively include the entire source tree.
 * @param {Map<string, string>} sources @returns {{files: Set<string>, candidates: string[]}}
 */
export function bootstrapInputs(sources) {
  const files = new Set([...sources.keys()].filter((file) => file.startsWith("src/bootstrap/")));
  let opaque = false;
  for (const file of files) {
    const source = sources.get(file) ?? "";
    const code = file.endsWith(".svelte")
      ? [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
          .map((match) => match[1])
          .join("\n")
      : source;
    const parsed = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
    const imports = ts
      .preProcessFile(code, true, true)
      .importedFiles.map((entry) => entry.fileName);
    /** @param {ts.Node} node */
    const visit = (node) => {
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        (!node.arguments[0] || !ts.isStringLiteralLike(node.arguments[0]))
      )
        opaque = true;
      ts.forEachChild(node, visit);
    };
    visit(parsed);
    for (const specifier of imports) {
      let base;
      if (specifier.startsWith(".")) base = path.posix.join(path.posix.dirname(file), specifier);
      else if (specifier.startsWith("$lib/")) base = "src/lib/" + specifier.slice(5);
      else continue; // External packages are bound by the frozen lockfile.
      const candidates = [
        base,
        ...[".ts", ".js", ".svelte", ".json"].map((ext) => base + ext),
        base + "/index.ts",
        base + "/index.js",
      ];
      if (base.endsWith(".js")) candidates.push(base.slice(0, -3) + ".ts");
      const dependency = candidates.find((candidate) => sources.has(candidate));
      if (dependency) files.add(dependency);
      else opaque = true;
    }
  }
  if (opaque) for (const file of sources.keys()) files.add(file);
  const scanner = new Scanner({});
  // app.css scans all src/, including files outside the bootstrap import graph.
  // Candidate changes conservatively rebuild the shell even for product-only UI.
  const candidates = scanner
    .scanFiles(
      [...sources]
        .filter(([file]) => file.startsWith("src/"))
        .map(([file, content]) => ({ content, extension: path.posix.extname(file).slice(1) })),
    )
    .sort();
  return { files, candidates };
}

/** @param {string} [repositoryRoot] @param {string} [ref] */
export function componentFingerprints(repositoryRoot = root, ref = "HEAD") {
  const inputs = Object.fromEntries(COMPONENTS.map((name) => [name, []]));
  const entries = git(["ls-tree", "-r", "--full-tree", ref], repositoryRoot).split("\n");
  const textEntries = entries
    .map((entry) => /^(\d+) blob ([a-f0-9]{40})\t(.+)$/.exec(entry))
    .filter(
      (entry) =>
        entry &&
        /^(?:src|static)\//.test(entry[3]) &&
        !/\.(?:png|jpe?g|gif|ico|woff2?|ttf|mp[34]|web[mp]|pdf|zip)$/i.test(entry[3]),
    );
  const blobs = execFileSync("git", ["cat-file", "--batch"], {
    cwd: repositoryRoot,
    input: textEntries.map((entry) => entry?.[2]).join("\n") + "\n",
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  /** @type {Map<string, string>} */
  const sources = new Map();
  let cursor = 0;
  for (const entry of textEntries) {
    const headerEnd = blobs.indexOf(10, cursor);
    const size = Number(blobs.subarray(cursor, headerEnd).toString().split(" ")[2]);
    if (!entry || headerEnd < cursor || !Number.isSafeInteger(size))
      throw new Error("Invalid source blob");
    sources.set(entry[3], blobs.subarray(headerEnd + 1, headerEnd + 1 + size).toString());
    cursor = headerEnd + size + 2;
  }
  for (const entry of entries) {
    const match = /^\d+ blob [a-f0-9]{40}\t((?:src|static)\/.+)$/.exec(entry);
    if (match && !sources.has(match[1])) sources.set(match[1], "");
  }
  const bootstrap = bootstrapInputs(sources);
  inputs.shell.push(["tailwind-candidates", bootstrap.candidates]);
  for (const entry of entries) {
    const match = /^(\d+) (blob|commit) ([a-f0-9]{40})\t(.+)$/.exec(entry);
    if (!match) throw new Error("Invalid component source tree");
    const [, mode, kind, oid, file] = match;
    const owners = [
      ...new Set([...inputOwners(file), ...(bootstrap.files.has(file) ? ["shell"] : [])]),
    ];
    if (!owners.length) continue;
    const normalized = [
      "package.json",
      "src-tauri/tauri.conf.json",
      "src-tauri/Cargo.toml",
      "src-tauri/Cargo.lock",
    ].includes(file);
    const digest = normalized
      ? hash(normalizeComponentInput(file, git(["show", `${ref}:${file}`], repositoryRoot)))
      : oid;
    for (const owner of owners) inputs[owner].push([file, mode, kind, digest]);
  }
  return Object.fromEntries(
    COMPONENTS.map((name) => [name, hash(JSON.stringify([1, name, inputs[name]]))]),
  );
}

/** Keep old receipts readable when the fingerprint implementation or parser changes.
 * A policy change forces fresh qualification before evaluating prior fingerprints.
 * @param {string} [repositoryRoot] @param {string} [ref]
 */
export function fingerprintPolicy(repositoryRoot = root, ref = "HEAD") {
  return hash(
    git(["ls-tree", ref, "scripts/release-component-reuse.mjs", "bun.lock"], repositoryRoot) +
      normalizeComponentInput("package.json", git(["show", ref + ":package.json"], repositoryRoot)),
  );
}

/** @typedef {{desktop_sha: string, sdk_sha: string, version: string}} Identity */
/** @typedef {{fingerprint: string, identity: Identity, reused: boolean}} ComponentSelection */
/** @typedef {{schema_version: number, tag: string, source_sha: string, runtime_source?: string, components: Record<string, ComponentSelection>, artifacts?: Record<string, import('./signed-artifacts.mjs').Artifact>}} ComponentPlan */

/** Accept only a published, signed receipt whose source agrees with its immutable tag.
 * A receipt is produced only after the full selected checks and all release candidates pass.
 * @param {Record<string, string>} fingerprints @param {Identity} identity
 * @param {string} tag @param {ComponentPlan | null} baseline
 * @returns {ComponentPlan}
 */
export function selectReleaseComponents(fingerprints, identity, tag, baseline) {
  if (
    baseline &&
    (baseline.schema_version !== 1 ||
      !baseline.artifacts ||
      COMPONENTS.some(
        (name) => !/^[a-f0-9]{64}$/.test(baseline.components?.[name]?.fingerprint ?? ""),
      ))
  )
    throw new Error("Invalid qualified component receipt");
  return {
    schema_version: 1,
    tag,
    source_sha: identity.desktop_sha,
    components: Object.fromEntries(
      COMPONENTS.map((name) => {
        const previous = baseline?.components[name];
        const reused = previous?.fingerprint === fingerprints[name];
        if (
          reused &&
          (!/^[a-f0-9]{40}$/.test(previous.identity.desktop_sha) ||
            !/^[a-f0-9]{40}$/.test(previous.identity.sdk_sha) ||
            !/^\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?$/.test(previous.identity.version))
        )
          throw new Error("Invalid component build identity");
        return [
          name,
          {
            fingerprint: fingerprints[name],
            identity: reused ? previous.identity : identity,
            reused,
          },
        ];
      }),
    ),
  };
}

/** @param {string} repository @param {string} tag @param {string} directory @param {string[]} files */
function download(repository, tag, directory, files) {
  execFileSync(
    "gh",
    [
      "release",
      "download",
      tag,
      "--repo",
      repository,
      "--dir",
      directory,
      "--clobber",
      ...files.flatMap((file) => ["--pattern", file]),
    ],
    { stdio: "pipe", windowsHide: true },
  );
}

/** @param {string} name */
export function componentArchives(name) {
  if (name === "shell") return SHELL_TARGETS.map((target) => `shell-build-${target}.tar.gz`);
  if (name === "runtime") return ["runtime-helpers-windows.tar.gz", "runtime-helpers-linux.tar.gz"];
  return name === "frontend"
    ? ["frontend-build.tar.gz", "frontend-component.tar.gz"]
    : ["embedding-resources.tar.gz"];
}

/** @param {Record<string, string>} fingerprints @param {string} source */
export function bindRuntimeSource(fingerprints, source) {
  if (!/^[a-f0-9]{40}$/.test(source)) throw new Error("Missing frozen Runtime release source");
  return { ...fingerprints, runtime: hash(fingerprints.runtime + source) };
}

/** @param {{bytes: Buffer, signature: string, tag: string, sourceSha: string,
 * fingerprints?: Record<string, string>, publicKey?: string}} options
 * @returns {ComponentPlan}
 */
export function verifyComponentReceipt({
  bytes,
  signature,
  tag,
  sourceSha,
  fingerprints,
  publicKey,
}) {
  verifySignedBytes(bytes, signature, publicKey);
  const baseline = JSON.parse(bytes.toString());
  if (!baseline || baseline.tag !== tag || baseline.source_sha !== sourceSha)
    throw new Error("Component baseline source mismatch");
  if (!/^[a-f0-9]{40}$/.test(baseline.runtime_source ?? ""))
    throw new Error("Missing receipt Runtime source");
  const expected = fingerprints ? bindRuntimeSource(fingerprints, baseline.runtime_source) : null;
  if (baseline.schema_version !== 1 || !baseline.components || !baseline.artifacts)
    throw new Error("Invalid qualified component receipt");
  for (const name of COMPONENTS) {
    if (
      !/^[a-f0-9]{64}$/.test(baseline.components[name]?.fingerprint ?? "") ||
      (expected && baseline.components[name]?.fingerprint !== expected[name])
    )
      throw new Error("Component receipt input mismatch");
    for (const file of componentArchives(name)) {
      if (requireArtifact(baseline.artifacts[file]).file !== file)
        throw new Error("Component archive filename mismatch");
    }
  }
  return baseline;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const option = (/** @type {string} */ name) => args[args.indexOf(name) + 1];
  const directory = path.resolve(option("--directory") || ".cache/component-reuse");
  await mkdir(directory, { recursive: true });
  if (command === "plan") {
    const manifest = JSON.parse(await readFile(path.join(root, ".github/release.json"), "utf8"));
    const repository = process.env.GITHUB_REPOSITORY;
    if (!repository || !/^v\d+\.\d+\.\d+(?:-(?:beta|rc)\.\d+)?$/.test(manifest.previousTag))
      throw new Error("Immutable published component baseline required");
    const release = JSON.parse(
      execFileSync(
        "gh",
        ["release", "view", manifest.previousTag, "--repo", repository, "--json", "isDraft,assets"],
        { encoding: "utf8", windowsHide: true },
      ),
    );
    if (release.isDraft) throw new Error("Component baseline is a draft");
    /** @type {ComponentPlan | null} */
    let baseline = null;
    if (
      release.assets.some(
        (/** @type {{name: string}} */ asset) => asset.name === "openagent-components.json",
      )
    ) {
      download(repository, manifest.previousTag, directory, [
        "openagent-components.json",
        "openagent-components.json.sig",
      ]);
      const bytes = await readFile(path.join(directory, "openagent-components.json"));
      const sourceSha = git(["rev-parse", manifest.previousTag + "^{commit}"]);
      const samePolicy = fingerprintPolicy(root, sourceSha) === fingerprintPolicy();
      const receipt = verifyComponentReceipt({
        bytes,
        signature: await readFile(path.join(directory, "openagent-components.json.sig"), "utf8"),
        tag: manifest.previousTag,
        sourceSha,
        fingerprints: samePolicy ? componentFingerprints(root, sourceSha) : undefined,
      });
      baseline = samePolicy ? receipt : null;
    }
    const runtimeSource = process.env.COMPONENT_RUNTIME_SOURCE;
    if (!/^[a-f0-9]{40}$/.test(runtimeSource ?? ""))
      throw new Error("Missing frozen Runtime release source");
    const fingerprints = bindRuntimeSource(componentFingerprints(), runtimeSource ?? "");
    const identity = {
      desktop_sha: git(["rev-parse", "HEAD"]),
      sdk_sha: git(["rev-parse", "HEAD:runtime"]),
      version: manifest.version,
    };
    const plan = selectReleaseComponents(fingerprints, identity, manifest.tag, baseline);
    plan.runtime_source = runtimeSource;
    for (const name of COMPONENTS) {
      if (!plan.components[name].reused || !baseline?.artifacts) continue;
      for (const file of componentArchives(name)) {
        const artifact = requireArtifact(baseline.artifacts[file]);
        if (artifact.file !== file) throw new Error("Component archive filename mismatch");
        download(repository, manifest.previousTag, directory, [file]);
        verifyArtifactBytes(await readFile(path.join(directory, file)), artifact);
      }
    }
    await writeFile(path.join(directory, "plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
    const outputs = COMPONENTS.map((name) => `reuse_${name}=${plan.components[name].reused}`).join(
      "\n",
    );
    if (process.env.GITHUB_OUTPUT)
      await writeFile(process.env.GITHUB_OUTPUT, `${outputs}\n`, { flag: "a" });
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  if (command === "receipt") {
    /** @type {ComponentPlan} */
    const plan = JSON.parse(await readFile(path.join(directory, "plan.json"), "utf8"));
    const artifactsDirectory = path.resolve(option("--artifacts"));
    const output = path.resolve(option("--output"));
    await mkdir(output, { recursive: true });
    plan.artifacts = {};
    for (const name of COMPONENTS)
      for (const file of componentArchives(name)) {
        const bytes = await readFile(path.join(artifactsDirectory, file));
        plan.artifacts[file] = { file, size: bytes.length, sha256: hash(bytes) };
        await copyFile(path.join(artifactsDirectory, file), path.join(output, file));
      }
    await writeFile(
      path.join(output, "openagent-components.json"),
      `${JSON.stringify(plan, null, 2)}\n`,
    );
    return;
  }
  throw new Error(
    "Usage: release-component-reuse.mjs <plan|receipt> --directory <path> [--artifacts <path> --output <path>]",
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main();

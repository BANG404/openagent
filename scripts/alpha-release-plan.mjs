import { execFileSync } from "node:child_process";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getLatestReleaseTag } from "./release-version.mjs";

export const ALPHA_VERSION = /^\d+\.\d+\.\d+-alpha\.([1-9]\d*)$/;

/** Keep API output bounded to identity metadata, including all pages and drafts.
 * @param {string} repository
 */
export function listAlphaReleaseIdentities(repository) {
  const output = execFileSync(
    "gh",
    [
      "api",
      `repos/${repository}/releases`,
      "--paginate",
      "--jq",
      ".[] | [.tag_name, .draft, (.immutable // false)] | @tsv",
    ],
    { encoding: "utf8", windowsHide: true, timeout: 180_000 },
  ).trim();
  return output
    ? output.split(/\r?\n/).map((line) => {
        const [tag_name, draft, immutable] = line.split("\t");
        return { tag_name, draft: draft === "true", immutable: immutable === "true" };
      })
    : [];
}

/** Alpha never participates in the formal release baseline or promotion train.
 * @param {string} currentVersion @param {string[]} tags
 */
export function alphaReleasePlan(currentVersion, tags) {
  const baselineTag = getLatestReleaseTag(tags);
  if (!baselineTag) throw new Error("Alpha requires a published production baseline");
  const cores = [currentVersion, baselineTag.slice(1)].map((version) => {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:-(?:alpha|beta|rc)\.\d+)?$/.exec(version);
    if (!match) throw new Error(`Unsupported Alpha baseline: ${version}`);
    return match.slice(1, 4).map(Number);
  });
  cores.sort((a, b) => b[0] - a[0] || b[1] - a[1] || b[2] - a[2]);
  const [major, minor, patch] = cores[0];
  const base = `${major}.${minor}.${patch + 1}`;
  const numbers = tags
    .filter((tag) => tag.startsWith(`v${base}-alpha.`))
    .map((tag) => Number(ALPHA_VERSION.exec(tag.slice(1))?.[1] ?? 0));
  const sequence = Math.max(0, ...numbers) + 1;
  if (sequence > 65535) throw new Error("Alpha sequence exceeds Windows version limits");
  const version = `${base}-alpha.${sequence}`;
  return { version, tag: `v${version}`, baselineTag };
}

/** Stamp only a disposable build checkout. No commit, SDK tag or formal release marker.
 * @param {string} root @param {string} version
 */
export async function stampAlphaBuild(root, version) {
  if (!ALPHA_VERSION.test(version)) throw new Error("Expected an Alpha product version");
  for (const name of ["package.json", "src-tauri/tauri.conf.json"]) {
    const file = path.join(root, name);
    const manifest = JSON.parse(await readFile(file, "utf8"));
    manifest.version = version;
    if (name.endsWith("tauri.conf.json")) {
      manifest.productName = "OpenAgent Alpha";
      manifest.identifier = "com.iumm.openagent.alpha";
      manifest.app.windows[0].title = "OpenAgent Alpha";
      manifest.plugins.updater.endpoints = [
        "https://github.com/BANG404/openagent/releases/download/alpha/latest.json",
      ];
    }
    await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  const cargoFile = path.join(root, "src-tauri/Cargo.toml");
  const cargo = await readFile(cargoFile, "utf8");
  if (!/^version = "[^"]+"$/m.test(cargo)) throw new Error("Missing shell Cargo version");
  await writeFile(cargoFile, cargo.replace(/^version = "[^"]+"$/m, `version = "${version}"`));
  const lockFile = path.join(root, "src-tauri/Cargo.lock");
  const lock = await readFile(lockFile, "utf8");
  const pattern = /(\[\[package\]\]\r?\nname = "openagent"\r?\nversion = )"[^"]+"/;
  if (!pattern.test(lock)) throw new Error("Missing shell lock version");
  await writeFile(lockFile, lock.replace(pattern, `$1"${version}"`));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const current = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")).version;
  const releases = listAlphaReleaseIdentities("BANG404/openagent");
  // Draft Alpha identities are reserved too; formal baselines must be published.
  const publishedTags = releases
    .filter((release) => !release.draft || ALPHA_VERSION.test(release.tag_name.slice(1)))
    .map((release) => release.tag_name);
  const reservedTags = execFileSync("git", ["tag", "--list", "v*-alpha.*"], {
    cwd: root,
    encoding: "utf8",
  })
    .trim()
    .split(/\r?\n/)
    .filter((tag) => ALPHA_VERSION.test(tag.slice(1)));
  const tags = [...new Set([...publishedTags, ...reservedTags])];
  const plan = alphaReleasePlan(current, tags);
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const sdkSha = execFileSync("git", ["rev-parse", "HEAD:runtime"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `version=${plan.version}\ntag=${plan.tag}\nbaseline_tag=${plan.baselineTag}\nsource_sha=${sha}\nsdk_sha=${sdkSha}\n`,
    );
  }
  console.log(JSON.stringify({ ...plan, sourceSha: sha, sdkSha }));
}

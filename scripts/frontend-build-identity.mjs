import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Abbreviated revision length embedded in the frontend build identity. */
const REVISION_LENGTH = 12;

/**
 * Vite `define` key that carries the identity into the bundle. Keep it in sync
 * with the declaration in `src/lib/frontendBuild.ts`.
 */
export const FRONTEND_BUILD_DEFINE = "__OPENAGENT_FRONTEND_BUILD__";

/**
 * Product version the frontend bundle is built from. `scripts/release.mjs`
 * advances it together with the shell version, but a frontend resource release
 * can advance it on its own.
 *
 * @param {string} repositoryRoot
 * @returns {string}
 */
export function frontendProductVersion(repositoryRoot = root) {
  const manifest = JSON.parse(readFileSync(path.join(repositoryRoot, "package.json"), "utf8"));
  if (typeof manifest.version !== "string" || manifest.version.length === 0) {
    throw new Error("package.json carries no version to stamp into the frontend build.");
  }
  return manifest.version;
}

/**
 * Abbreviated revision of the checkout the bundle is built from. Returns null
 * when git cannot answer, so a source archive without a repository still builds
 * a frontend that reports its product version.
 *
 * @param {string} repositoryRoot
 * @returns {string | null}
 */
export function frontendRevision(repositoryRoot = root) {
  try {
    const revision = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return revision === "" ? null : revision.slice(0, REVISION_LENGTH);
  } catch {
    return null;
  }
}

/**
 * SemVer build metadata form of one frontend build.
 *
 * @param {{ version: string, revision: string | null }} identity
 * @returns {string}
 */
export function frontendBuildLabel({ version, revision }) {
  return revision ? `${version}+${revision}` : version;
}

/**
 * Identity of the bundle this Vite run produces. The frontend has no version
 * axis of its own: product releases advance `package.json` in lockstep with the
 * shell, so the revision is what distinguishes one frontend build from another.
 * Development builds are stamped like published ones and therefore report the
 * revision of the working tree the Vite server started from.
 *
 * @param {string} repositoryRoot
 * @returns {{ version: string, revision: string | null, label: string }}
 */
export function frontendBuildIdentity(repositoryRoot = root) {
  const version = frontendProductVersion(repositoryRoot);
  const revision = frontendRevision(repositoryRoot);
  return { version, revision, label: frontendBuildLabel({ version, revision }) };
}

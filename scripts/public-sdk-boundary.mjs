import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** @param {string[]} entries @param {Set<string>} allowed */
export function assertPublicSdkEntries(entries, allowed) {
  for (const entry of entries) {
    const match = /^(\d+) \w+ [^\t]+\t(.+)$/.exec(entry);
    if (!match) throw new Error("Invalid public source tree entry");
    const [, mode, file] = match;
    if (file === "runtime" && mode === "160000") continue;
    if (file.startsWith("sdk/") && mode === "100644" && allowed.has(file)) continue;
    throw new Error(`Private source boundary rejected ${file}`);
  }
}

/** Check the staged source or an immutable commit, including pre-migration history.
 * @param {string} repository
 * @param {string} revision
 */
export function verifyPublicSdkBoundary(repository, revision) {
  const git = (/** @type {string[]} */ args) =>
    execFileSync("git", args, { cwd: repository, encoding: "utf8" }).trim();
  const entries = git(
    revision === "INDEX"
      ? ["ls-files", "--stage", "--", "sdk", "runtime"]
      : ["ls-tree", "-r", revision, "--", "sdk", "runtime"],
  )
    .split(/\r?\n/)
    .filter(Boolean);
  // The same hook inspects earlier immutable commits introduced by this push.
  if (revision !== "INDEX" && entries.some((entry) => /^160000 .*\tsdk$/.test(entry))) return;
  if (!entries.some((entry) => /^160000 .*\truntime$/.test(entry)))
    throw new Error("Private Runtime must remain a gitlink");
  const allowed = new Set(
    readFileSync(resolve(repository, ".githooks/public-sdk-sources.txt"), "utf8")
      .split(/\r?\n/)
      .filter(Boolean),
  );
  assertPublicSdkEntries(entries, allowed);
}

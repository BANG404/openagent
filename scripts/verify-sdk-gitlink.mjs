import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { verifyPublicSdkBoundary } from "./public-sdk-boundary.mjs";

/**
 * @param {string} cwd
 * @param {string[]} args
 * @returns {{ status: number, stdout: string, stderr: string }}
 */
function runGit(cwd, args) {
  // Hooks export these for the host repository. Let cwd select the independent
  // Runtime repository instead of accidentally querying the host object store.
  const env = { ...process.env };
  for (const name of [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_COMMON_DIR",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_SHALLOW_FILE",
    "GIT_PREFIX",
  ]) {
    delete env[name];
  }
  const result = spawnSync("git", args, {
    // NOSONAR: git is the fixed repository tool.
    cwd,
    encoding: "utf8",
    shell: false,
    env,
  });
  if (result.error) throw result.error;
  return {
    status: result.status ?? 1,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

/**
 * Require the host's pinned SDK commit to be available from the SDK mainline.
 *
 * @param {{
 *   repository?: string,
 *   hostRevision?: string,
 *   mainRef?: string,
 *   git?: typeof runGit,
 * }} [options]
 */
export function verifySdkGitlink(options = {}) {
  const repository = resolve(options.repository ?? ".");
  const hostRevision = options.hostRevision ?? "INDEX";
  const mainRef = options.mainRef ?? "origin/main";
  const git = options.git ?? runGit;
  const sdkDirectory = resolve(repository, "runtime");
  const gitlinkRevision = hostRevision === "INDEX" ? ":runtime" : `${hostRevision}:runtime`;

  let gitlink = git(repository, ["rev-parse", "--verify", gitlinkRevision]);
  // Older introduced commits used sdk as the private gitlink. Inspect those
  // immutable commits during pushes without treating the public SDK tree as one.
  if (gitlink.status !== 0 && hostRevision !== "INDEX") {
    gitlink = git(repository, ["rev-parse", "--verify", `${hostRevision}:sdk`]);
  }
  if (gitlink.status !== 0) {
    throw new Error(`Cannot resolve the SDK gitlink from ${hostRevision}: ${gitlink.stderr}`);
  }

  const sdkSha = gitlink.stdout;
  const sdkCommit = git(sdkDirectory, ["cat-file", "-e", `${sdkSha}^{commit}`]);
  if (sdkCommit.status !== 0) {
    throw new Error(
      `SDK gitlink ${sdkSha} is not present in the initialized runtime repository. ` +
        "Fetch or initialize the pinned SDK revision before delivery.",
    );
  }

  const main = git(sdkDirectory, ["rev-parse", "--verify", `${mainRef}^{commit}`]);
  if (main.status !== 0) {
    throw new Error(
      `Cannot resolve SDK ${mainRef}. Fetch the SDK origin before verifying the host gitlink.`,
    );
  }

  const ancestor = git(sdkDirectory, ["merge-base", "--is-ancestor", sdkSha, main.stdout]);
  if (ancestor.status !== 0) {
    throw new Error(
      `SDK gitlink ${sdkSha} is not contained in SDK ${mainRef} (${main.stdout}). ` +
        `Verify the SDK changes, push them to main first, then update ${mainRef} and retry.`,
    );
  }

  return { sdkSha, mainSha: main.stdout };
}

function parseArguments() {
  const args = process.argv.slice(2);
  let hostRevision = "INDEX";

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--host-revision" && args[index + 1]) {
      hostRevision = args[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${args[index]}`);
    }
  }

  return { hostRevision };
}

const entry = process.argv[1] ? resolve(process.argv[1]) : "";
if (entry && fileURLToPath(import.meta.url) === entry) {
  try {
    const options = parseArguments();
    verifyPublicSdkBoundary(resolve("."), options.hostRevision);
    const result = verifySdkGitlink(options);
    console.log(
      `SDK gitlink ${result.sdkSha.slice(0, 12)} is contained in origin/main (${result.mainSha.slice(0, 12)}).`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

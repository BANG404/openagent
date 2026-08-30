import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function value(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

const SDK_WORKFLOW_FAILURES = new Set([
  "action_required",
  "cancelled",
  "failure",
  "stale",
  "startup_failure",
  "timed_out",
]);

export function workflowDispatchInvocation(repository, workflow, ref, fields = []) {
  return [
    "workflow",
    "run",
    workflow,
    "--repo",
    repository,
    "--ref",
    ref,
    ...fields.flatMap((field) => ["-f", field]),
  ];
}

export function selectDispatchedWorkflowRun(runs, sdkSha, dispatchedAt, displayTitle = null) {
  const earliest = dispatchedAt - 5_000;
  return (
    runs.find(
      (candidate) =>
        candidate.event === "workflow_dispatch" &&
        (candidate.headSha === sdkSha || candidate.displayTitle === displayTitle) &&
        Date.parse(candidate.createdAt) >= earliest,
    ) ?? null
  );
}

export function validateSdkManifest(manifest, plan) {
  if (manifest.version !== plan.version) {
    throw new Error(`SDK manifest version ${manifest.version} does not match ${plan.version}`);
  }
  if (manifest.sdk_sha !== plan.releaseSha) {
    throw new Error(`SDK manifest SHA ${manifest.sdk_sha} does not match ${plan.releaseSha}`);
  }
  const minimum = manifest.protocol?.min;
  const maximum = manifest.protocol?.max;
  if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || minimum > maximum) {
    throw new Error("SDK manifest contains an invalid protocol range");
  }
  return { protocolMin: minimum, protocolMax: maximum };
}

export function sdkReleaseVersionInvocation(sdkDirectory, sdkSha) {
  const cwd = resolve(sdkDirectory);
  return {
    args: [join(cwd, "scripts/release-version.mjs"), "--sha", sdkSha],
    cwd,
  };
}

async function publishedRelease(repository, plan) {
  let isDraft;
  try {
    isDraft = run("gh", [
      "release",
      "view",
      plan.tag,
      "--repo",
      repository,
      "--json",
      "isDraft",
      "--jq",
      ".isDraft",
    ]);
  } catch (error) {
    if (error?.status === 1) return null;
    throw error;
  }
  if (isDraft !== "false") return null;

  const tagReference = JSON.parse(
    run("gh", ["api", `repos/${repository}/git/ref/tags/${plan.tag}`]),
  );
  let taggedSha = tagReference.object.sha;
  if (tagReference.object.type === "tag") {
    const tagObject = JSON.parse(run("gh", ["api", `repos/${repository}/git/tags/${taggedSha}`]));
    taggedSha = tagObject.object.sha;
  } else if (tagReference.object.type !== "commit") {
    throw new Error(`Unsupported SDK tag object type: ${tagReference.object.type}`);
  }
  if (taggedSha !== plan.releaseSha) {
    throw new Error(`${plan.tag} points to ${taggedSha}, not ${plan.releaseSha}`);
  }

  const directory = await mkdtemp(join(tmpdir(), "openagent-sdk-release-"));
  try {
    run("gh", [
      "release",
      "download",
      plan.tag,
      "--repo",
      repository,
      "--pattern",
      "openagent-sdk-manifest.json",
      "--dir",
      directory,
    ]);
    const manifest = JSON.parse(
      await readFile(join(directory, "openagent-sdk-manifest.json"), "utf8"),
    );
    return validateSdkManifest(manifest, plan);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function taggedReleaseSha(repository, tag) {
  try {
    const tagReference = JSON.parse(run("gh", ["api", `repos/${repository}/git/ref/tags/${tag}`]));
    if (tagReference.object.type === "commit") return tagReference.object.sha;
    if (tagReference.object.type !== "tag") {
      throw new Error(`Unsupported SDK tag object type: ${tagReference.object.type}`);
    }
    return JSON.parse(run("gh", ["api", `repos/${repository}/git/tags/${tagReference.object.sha}`]))
      .object.sha;
  } catch (error) {
    if (error?.status === 1) return null;
    throw error;
  }
}

function dispatchWorkflow(repository, workflow, ref, fields = []) {
  const dispatchedAt = Date.now();
  run("gh", workflowDispatchInvocation(repository, workflow, ref, fields));
  return dispatchedAt;
}

function workflowRuns(repository, workflow) {
  return JSON.parse(
    run("gh", [
      "run",
      "list",
      "--repo",
      repository,
      "--workflow",
      workflow,
      "--limit",
      "30",
      "--json",
      "databaseId,event,status,conclusion,createdAt,displayTitle,headSha,url",
    ]),
  );
}

async function waitForWorkflowRun(repository, workflow, sdkSha, dispatchedAt, displayTitle = null) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const workflowRun = selectDispatchedWorkflowRun(
      workflowRuns(repository, workflow),
      sdkSha,
      dispatchedAt,
      displayTitle,
    );
    if (workflowRun) return { workflow, ...workflowRun };
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  throw new Error(`GitHub did not create ${workflow} for SDK ${sdkSha}`);
}

function refreshWorkflowRun(repository, trackedRun) {
  const current = JSON.parse(
    run("gh", [
      "run",
      "view",
      String(trackedRun.databaseId),
      "--repo",
      repository,
      "--json",
      "databaseId,status,conclusion,url",
    ]),
  );
  return { ...trackedRun, ...current };
}

async function waitForSdkTag(repository, plan) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const tagSha = taggedReleaseSha(repository, plan.tag);
    if (tagSha) {
      if (tagSha !== plan.releaseSha) {
        throw new Error(`${plan.tag} points to ${tagSha}, not ${plan.releaseSha}`);
      }
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error(`Timed out waiting for immutable SDK tag ${plan.tag}`);
}

async function main() {
  const sdkDirectory = value("--sdk-dir");
  const sdkSha = value("--sdk-sha");
  const hostVersion = value("--host-version");
  const repository = value("--repository");
  const output = value("--output");
  if (!sdkDirectory || !sdkSha || !hostVersion || !repository || !output) {
    throw new Error(
      "Usage: ensure-sdk-release.mjs --sdk-dir <dir> --sdk-sha <sha> " +
        "--host-version <version> --repository <owner/repo> --output <github-output>",
    );
  }

  const releaseVersion = sdkReleaseVersionInvocation(sdkDirectory, sdkSha);
  const plan = JSON.parse(run(process.execPath, releaseVersion.args, { cwd: releaseVersion.cwd }));
  let manifest = await publishedRelease(repository, plan);
  if (!manifest) {
    const ciTitle = `SDK CI ${plan.releaseSha}`;
    const ciDispatch = dispatchWorkflow(repository, "ci.yml", "main", [
      `sdk_sha=${plan.releaseSha}`,
      "full=true",
    ]);
    const ciRun = await waitForWorkflowRun(
      repository,
      "ci.yml",
      plan.releaseSha,
      ciDispatch,
      ciTitle,
    );
    let qualifiedRun = ciRun;
    while (qualifiedRun.status !== "completed") {
      await new Promise((resolve) => setTimeout(resolve, 30_000));
      qualifiedRun = refreshWorkflowRun(repository, qualifiedRun);
    }
    if (qualifiedRun.conclusion !== "success") {
      throw new Error(
        `${qualifiedRun.workflow} failed before tagging ${plan.tag}: ${qualifiedRun.url}`,
      );
    }

    if (plan.releaseRequired) {
      dispatchWorkflow(repository, "prepare-release.yml", "main", [`sdk_sha=${sdkSha}`]);
    }
    await waitForSdkTag(repository, plan);

    const releaseTitle = `Publish SDK Release ${plan.tag}`;
    const releaseDispatch = dispatchWorkflow(repository, "release.yml", "main", [
      `sdk_tag=${plan.tag}`,
    ]);
    let trackedRuns = [
      await waitForWorkflowRun(
        repository,
        "release.yml",
        plan.releaseSha,
        releaseDispatch,
        releaseTitle,
      ),
    ];

    for (let attempt = 0; attempt < 360 && !manifest; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 30_000));
      manifest = await publishedRelease(repository, plan);
      if (manifest) break;

      trackedRuns = trackedRuns.map((trackedRun) => refreshWorkflowRun(repository, trackedRun));
      const failed = trackedRuns.find((trackedRun) =>
        SDK_WORKFLOW_FAILURES.has(trackedRun.conclusion),
      );
      if (failed) {
        throw new Error(`${failed.workflow} failed while publishing ${plan.tag}: ${failed.url}`);
      }
    }
  }
  if (!manifest) throw new Error(`Timed out waiting for published SDK release ${plan.tag}`);

  await writeFile(
    output,
    [
      `sdk_tag=${plan.tag}`,
      `sdk_version=${plan.version}`,
      `sdk_sha=${sdkSha}`,
      `sdk_release_sha=${plan.releaseSha}`,
      `protocol_min=${manifest.protocolMin}`,
      `protocol_max=${manifest.protocolMax}`,
      `host_compatibility=openagent-desktop = ${hostVersion}`,
      "",
    ].join("\n"),
    { flag: "a" },
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();

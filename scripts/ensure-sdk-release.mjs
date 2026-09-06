import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

function report(message) {
  console.log(`[sdk-release] ${message}`);
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

export function workflowRunProgress(trackedRun) {
  const conclusion = trackedRun.conclusion ? `/${trackedRun.conclusion}` : "";
  return `${trackedRun.workflow} run ${trackedRun.databaseId}: ${trackedRun.status}${conclusion} (${trackedRun.url})`;
}

export function sdkReleaseWorkflowTitle(tag, operation) {
  const verb = operation === "stage" ? "Stage" : "Publish";
  return `${verb} SDK Release ${tag}`;
}

export function sdkReleaseCandidateArtifact(tag) {
  return `sdk-release-candidate-${tag}`;
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

export function selectSdkQualificationStatus(statuses, dispatchedAt) {
  const earliest = dispatchedAt - 5_000;
  return statuses.reduce((latest, candidate) => {
    if (candidate.context !== "Public SDK CI" || Date.parse(candidate.created_at) < earliest) {
      return latest;
    }
    return !latest || Date.parse(candidate.created_at) > Date.parse(latest.created_at)
      ? candidate
      : latest;
  }, null);
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

async function publishedRelease(repository, plan, artifactsDirectory = null) {
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

  const directory = artifactsDirectory ?? (await mkdtemp(join(tmpdir(), "openagent-sdk-release-")));
  try {
    await mkdir(directory, { recursive: true });
    const patterns = artifactsDirectory
      ? ["openagent-sdk-manifest.json", "openagent-server-*"]
      : ["openagent-sdk-manifest.json"];
    run("gh", [
      "release",
      "download",
      plan.tag,
      "--repo",
      repository,
      ...patterns.flatMap((pattern) => ["--pattern", pattern]),
      "--dir",
      directory,
    ]);
    const manifest = JSON.parse(
      await readFile(join(directory, "openagent-sdk-manifest.json"), "utf8"),
    );
    return validateSdkManifest(manifest, plan);
  } finally {
    if (!artifactsDirectory) await rm(directory, { recursive: true, force: true });
  }
}

async function stagedReleaseManifest(repository, plan, runId, artifactsDirectory = null) {
  const directory = artifactsDirectory ?? (await mkdtemp(join(tmpdir(), "openagent-sdk-stage-")));
  try {
    await mkdir(directory, { recursive: true });
    run("gh", [
      "run",
      "download",
      String(runId),
      "--repo",
      repository,
      "--name",
      sdkReleaseCandidateArtifact(plan.tag),
      "--dir",
      directory,
    ]);
    const manifest = JSON.parse(
      await readFile(join(directory, "openagent-sdk-manifest.json"), "utf8"),
    );
    return validateSdkManifest(manifest, plan);
  } finally {
    if (!artifactsDirectory) await rm(directory, { recursive: true, force: true });
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
  report(`Dispatched ${repository} ${workflow} from ${ref}.`);
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
    if (workflowRun) {
      const trackedRun = { workflow, ...workflowRun };
      report(`Tracking ${workflowRunProgress(trackedRun)}.`);
      return trackedRun;
    }
    if (attempt === 0 || (attempt + 1) % 5 === 0) {
      report(`Waiting for GitHub to create ${repository} ${workflow} for SDK ${sdkSha}.`);
    }
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

function sdkCommitStatuses(repository, sdkSha) {
  return JSON.parse(
    run("gh", ["api", `repos/${repository}/commits/${sdkSha}/status`, "--jq", ".statuses"]),
  );
}

async function waitForSdkQualification(repository, sdkSha, dispatchedAt) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const status = selectSdkQualificationStatus(
      sdkCommitStatuses(repository, sdkSha),
      dispatchedAt,
    );
    if (status?.state === "success") {
      if (status.description !== "Public SDK full validation passed") {
        throw new Error(
          `Public SDK CI reported unexpected success for ${sdkSha}: ${status.description}`,
        );
      }
      report(`Public SDK qualification passed for ${sdkSha}: ${status.target_url}.`);
      return status;
    }
    if (status?.state === "failure" || status?.state === "error") {
      throw new Error(
        `Public SDK CI failed before tagging ${sdkSha}: ${status.target_url ?? "missing run URL"}`,
      );
    }
    if (attempt === 0 || (attempt + 1) % 4 === 0) {
      report(
        `Waiting for Public SDK CI status for ${sdkSha}; current state is ${status?.state ?? "missing"}.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 30_000));
  }
  throw new Error(`Timed out waiting for complete public SDK qualification for ${sdkSha}`);
}

async function waitForSdkTag(repository, plan) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const tagSha = taggedReleaseSha(repository, plan.tag);
    if (tagSha) {
      if (tagSha !== plan.releaseSha) {
        throw new Error(`${plan.tag} points to ${tagSha}, not ${plan.releaseSha}`);
      }
      report(`Immutable SDK tag ${plan.tag} now points to ${plan.releaseSha}.`);
      return;
    }
    if (attempt === 0 || (attempt + 1) % 6 === 0) {
      report(`Waiting for immutable SDK tag ${plan.tag}.`);
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
  const mode = value("--mode");
  const artifactsDirectory = value("--artifacts-dir");
  if (
    !sdkDirectory ||
    !sdkSha ||
    !hostVersion ||
    !repository ||
    !output ||
    !["stage", "publish"].includes(mode) ||
    (mode === "stage" && !artifactsDirectory)
  ) {
    throw new Error(
      "Usage: ensure-sdk-release.mjs --sdk-dir <dir> --sdk-sha <sha> " +
        "--host-version <version> --repository <owner/repo> --output <github-output> " +
        "--mode <stage|publish> [--artifacts-dir <dir>]",
    );
  }

  const releaseVersion = sdkReleaseVersionInvocation(sdkDirectory, sdkSha);
  const plan = JSON.parse(run(process.execPath, releaseVersion.args, { cwd: releaseVersion.cwd }));
  report(
    `Resolved SDK ${sdkSha} to ${plan.tag} at release source ${plan.releaseSha}; release required: ${plan.releaseRequired}.`,
  );
  let manifest = await publishedRelease(repository, plan, artifactsDirectory);
  if (manifest) report(`Reusing published SDK release ${plan.tag}.`);
  if (!manifest && mode === "stage") {
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
      report(`Waiting for ${workflowRunProgress(qualifiedRun)}.`);
    }
    if (qualifiedRun.conclusion !== "success") {
      throw new Error(
        `${qualifiedRun.workflow} failed before tagging ${plan.tag}: ${qualifiedRun.url}`,
      );
    }
    await waitForSdkQualification(repository, plan.releaseSha, ciDispatch);

    if (plan.releaseRequired) {
      const prepareDispatch = dispatchWorkflow(repository, "prepare-release.yml", "main", [
        `sdk_sha=${sdkSha}`,
      ]);
      let prepareRun = await waitForWorkflowRun(
        repository,
        "prepare-release.yml",
        plan.releaseSha,
        prepareDispatch,
        "Prepare SDK Release",
      );
      while (prepareRun.status !== "completed") {
        await new Promise((resolve) => setTimeout(resolve, 10_000));
        prepareRun = refreshWorkflowRun(repository, prepareRun);
        report(`Waiting for ${workflowRunProgress(prepareRun)}.`);
      }
      if (prepareRun.conclusion !== "success") {
        throw new Error(
          `${prepareRun.workflow} failed before tagging ${plan.tag}: ${prepareRun.url}`,
        );
      }
    }
    await waitForSdkTag(repository, plan);

    const releaseTitle = sdkReleaseWorkflowTitle(plan.tag, "stage");
    const releaseDispatch = dispatchWorkflow(repository, "release.yml", "main", [
      `sdk_tag=${plan.tag}`,
      "operation=stage",
    ]);
    let stagedRun = await waitForWorkflowRun(
      repository,
      "release.yml",
      plan.releaseSha,
      releaseDispatch,
      releaseTitle,
    );
    while (stagedRun.status !== "completed") {
      await new Promise((resolve) => setTimeout(resolve, 30_000));
      stagedRun = refreshWorkflowRun(repository, stagedRun);
      report(`Waiting for ${workflowRunProgress(stagedRun)}.`);
    }
    if (stagedRun.conclusion !== "success") {
      throw new Error(`${stagedRun.workflow} failed while staging ${plan.tag}: ${stagedRun.url}`);
    }
    manifest = await stagedReleaseManifest(
      repository,
      plan,
      stagedRun.databaseId,
      artifactsDirectory,
    );
    report(`Private SDK Runtime candidate ${plan.tag} is staged.`);
  }
  if (!manifest && mode === "publish") {
    await waitForSdkTag(repository, plan);
    const releaseTitle = sdkReleaseWorkflowTitle(plan.tag, "publish");
    const releaseDispatch = dispatchWorkflow(repository, "release.yml", "main", [
      `sdk_tag=${plan.tag}`,
      "operation=publish",
    ]);
    let trackedRun = await waitForWorkflowRun(
      repository,
      "release.yml",
      plan.releaseSha,
      releaseDispatch,
      releaseTitle,
    );

    for (let attempt = 0; attempt < 360 && !manifest; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 30_000));
      manifest = await publishedRelease(repository, plan);
      if (manifest) break;

      trackedRun = refreshWorkflowRun(repository, trackedRun);
      if (attempt === 0 || (attempt + 1) % 2 === 0) {
        report(
          `Waiting for published SDK release ${plan.tag}; ${workflowRunProgress(trackedRun)}.`,
        );
      }
      if (SDK_WORKFLOW_FAILURES.has(trackedRun.conclusion)) {
        throw new Error(
          `${trackedRun.workflow} failed while publishing ${plan.tag}: ${trackedRun.url}`,
        );
      }
    }
  }
  if (!manifest) throw new Error(`Timed out waiting for ${mode} SDK release ${plan.tag}`);
  report(`${mode === "stage" ? "Staged" : "Published"} SDK release ${plan.tag} is ready.`);

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

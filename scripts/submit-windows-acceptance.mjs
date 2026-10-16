// @ts-check
import { sleep } from "bun";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { digest, verifyCandidate } from "./windows-acceptance-artifacts.mjs";

/** Upload exact local bytes privately as a draft, dispatch both VM jobs and collect reports.
 * @param {{directory: string; reports: string; keepTransfer?: boolean}} options
 */
export async function submitWindowsAcceptance({ directory, reports, keepTransfer = false }) {
  const candidate = await verifyCandidate(directory);
  const tag = `acceptance-transfer-${randomUUID()}`;
  const temp = await mkdtemp(path.join(tmpdir(), "openagent-acceptance-transfer-"));
  const archive = path.join(temp, "candidate.zip");
  /** @param {string} command @param {string[]} args @param {NodeJS.ProcessEnv} [env] */
  function run(command, args, env = process.env) {
    const result = spawnSync(command, args, {
      env,
      encoding: "utf8",
      windowsHide: true,
      timeout: 7_200_000,
    });
    assert(result.status === 0, result.stderr || result.stdout || `Command failed: ${command}`);
    return result.stdout.trim();
  }
  run(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      "Compress-Archive -Path (Join-Path $env:ACCEPTANCE_SOURCE '*') -DestinationPath $env:ACCEPTANCE_ARCHIVE -CompressionLevel Fastest",
    ],
    { ...process.env, ACCEPTANCE_SOURCE: directory, ACCEPTANCE_ARCHIVE: archive },
  );
  const sha256 = digest(await readFile(archive));
  const repository = JSON.parse(
    run("gh", ["repo", "view", "--json", "nameWithOwner"]),
  ).nameWithOwner;
  let success = false;
  try {
    run("gh", [
      "release",
      "create",
      tag,
      archive,
      "--repo",
      repository,
      "--draft",
      "--prerelease",
      "--latest=false",
      "--target",
      candidate.source_sha,
      "--title",
      `Windows acceptance transfer ${tag}`,
      "--notes",
      "Temporary local installer transfer; never publish this draft.",
    ]);
    run("gh", [
      "workflow",
      "run",
      "windows-install-acceptance.yml",
      "--repo",
      repository,
      "--ref",
      "main",
      "-f",
      `transfer_tag=${tag}`,
      "-f",
      `archive_sha256=${sha256}`,
    ]);
    let runId;
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      /** @type {{databaseId: number; displayTitle: string}[]} */
      const runs = JSON.parse(
        run("gh", [
          "run",
          "list",
          "--repo",
          repository,
          "--workflow",
          "windows-install-acceptance.yml",
          "--event",
          "workflow_dispatch",
          "--limit",
          "30",
          "--json",
          "databaseId,displayTitle",
        ]),
      );
      runId = runs.find(
        (entry) => entry.displayTitle === `Windows installation acceptance ${tag}`,
      )?.databaseId;
      if (runId) break;
      await sleep(2000);
    }
    assert(runId, `Dispatched workflow has not appeared; preserve transfer ${tag}`);
    console.log(`https://github.com/${repository}/actions/runs/${runId}`);
    const watch = spawnSync(
      "gh",
      ["run", "watch", String(runId), "--repo", repository, "--exit-status", "--interval", "10"],
      { windowsHide: true, stdio: "inherit", timeout: 7_200_000 },
    );
    await mkdir(reports, { recursive: true });
    run("gh", ["run", "download", String(runId), "--repo", repository, "--dir", reports]);
    assert(watch.status === 0, `Acceptance failed; reports: ${reports}; transfer: ${tag}`);
    for (const mode of ["online", "offline"]) {
      const report = JSON.parse(
        await readFile(
          path.join(reports, `windows-acceptance-${mode}`, `${mode}-report.json`),
          "utf8",
        ),
      );
      assert(
        report.passed === true && report.source_sha === candidate.source_sha,
        `Missing successful ${mode} report for submitted source`,
      );
    }
    success = true;
    console.log(`Both installed-package tests passed. Reports: ${reports}`);
  } finally {
    if (success && !keepTransfer)
      run("gh", ["release", "delete", tag, "--repo", repository, "--yes"]);
    else console.log(`Retained task transfer draft: ${tag}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  /** @param {string} name */
  const option = (name) => {
    const index = process.argv.indexOf(name);
    assert(index >= 0 && process.argv[index + 1], `${name} is required`);
    return process.argv[index + 1];
  };
  await submitWindowsAcceptance({
    directory: path.resolve(option("--artifacts")),
    reports: path.resolve(option("--reports")),
    keepTransfer: process.argv.includes("--keep-transfer"),
  });
}

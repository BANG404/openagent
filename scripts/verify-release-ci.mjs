import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const REQUIRED_RELEASE_CI_JOBS = [
  "Automation / GitHub Actions",
  "Frontend / Type, test, and build",
  "Native desktop / Rust quality",
  "Native desktop / Check Windows x64",
  "Native desktop / Check macOS arm64",
  "Required",
];

/**
 * @param {Array<{ name?: string; conclusion?: string | null }>} jobs
 */
export function verifyReleaseCiJobs(jobs) {
  const conclusions = new Map(jobs.map(({ name, conclusion }) => [name, conclusion]));
  for (const name of REQUIRED_RELEASE_CI_JOBS) {
    const conclusion = conclusions.get(name);
    if (conclusion !== "success") {
      throw new Error(
        `${name} must succeed before release preparation; got: ${conclusion ?? "missing"}`,
      );
    }
  }
}

function main() {
  const jobs = JSON.parse(process.env.CI_JOBS_JSON ?? "[]");
  if (!Array.isArray(jobs)) {
    throw new Error("CI_JOBS_JSON must contain an array of workflow jobs.");
  }
  verifyReleaseCiJobs(jobs);
  console.log("Release base passed every required full CI job.");
}

const entry = process.argv[1] ? resolve(process.argv[1]) : "";
if (entry && fileURLToPath(import.meta.url) === entry) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

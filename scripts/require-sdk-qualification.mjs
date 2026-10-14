import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** @typedef {{ context: string, state: string, description: string, target_url: string | null }} SdkStatus */

/** @param {SdkStatus[][]} pages */
export function selectCompletedSdkQualification(pages) {
  return pages
    .flat()
    .find(
      (status) =>
        status.context === "Public SDK CI" &&
        status.state === "success" &&
        status.description === "Public SDK full validation passed" &&
        status.target_url,
    );
}

/** @param {string} sdkSha @returns {SdkStatus[][]} */
function loadStatusHistory(sdkSha) {
  return JSON.parse(
    execFileSync(
      "gh",
      [
        "api",
        "--paginate",
        "--slurp",
        `repos/BANG404/openagent-sdk/commits/${sdkSha}/statuses?per_page=100`,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ),
  );
}

/**
 * @param {string} sdkSha
 * @param {(sdkSha: string) => SdkStatus[][]} [loadStatuses]
 */
export function requireSdkQualification(sdkSha, loadStatuses = loadStatusHistory) {
  if (!/^[0-9a-f]{40}$/.test(sdkSha)) throw new Error("An immutable SDK source SHA is required");
  const qualification = selectCompletedSdkQualification(loadStatuses(sdkSha));
  if (!qualification) {
    throw new Error(`Runtime source ${sdkSha} has no successful full Public SDK qualification`);
  }
  return qualification;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sdkSha = process.env.SDK_SHA ?? "";
  const qualification = requireSdkQualification(sdkSha);
  console.log(`Runtime source ${sdkSha} qualified by ${qualification.target_url}`);
}

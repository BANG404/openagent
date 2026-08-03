import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const TERMINAL_UNSELECTED_RESULTS = new Set(["skipped", "success"]);

/**
 * @param {{
 *   changes: string;
 *   modules: Record<string, { selected: boolean; result: string }>;
 * }} state
 */
export function verifyCiResults({ changes, modules }) {
  if (changes !== "success") {
    throw new Error(`Change detection finished with: ${changes}`);
  }

  for (const [name, { selected, result }] of Object.entries(modules)) {
    if (selected && result !== "success") {
      throw new Error(`${name} was selected but finished with: ${result}`);
    }
    if (!selected && !TERMINAL_UNSELECTED_RESULTS.has(result)) {
      throw new Error(`${name} was not selected but finished with: ${result}`);
    }
  }
}

/**
 * @param {NodeJS.ProcessEnv} env
 */
export function readCiResultState(env = process.env) {
  const moduleNames = (env.CI_RESULT_MODULES ?? "automation,frontend,native")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  return {
    changes: env.CHANGES_RESULT ?? "",
    modules: Object.fromEntries(
      moduleNames.map((name) => {
        const envPrefix = name.replaceAll(/[^a-zA-Z0-9]/g, "_").toUpperCase();
        return [
          name,
          {
            selected: env[`${envPrefix}_SELECTED`] === "true",
            result: env[`${envPrefix}_RESULT`] ?? "",
          },
        ];
      }),
    ),
  };
}

function main() {
  verifyCiResults(readCiResultState());
  console.log("Every selected CI module passed.");
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

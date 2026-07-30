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

function main() {
  verifyCiResults({
    changes: process.env.CHANGES_RESULT ?? "",
    modules: {
      automation: {
        selected: process.env.AUTOMATION_SELECTED === "true",
        result: process.env.AUTOMATION_RESULT ?? "",
      },
      frontend: {
        selected: process.env.FRONTEND_SELECTED === "true",
        result: process.env.FRONTEND_RESULT ?? "",
      },
      native: {
        selected: process.env.NATIVE_SELECTED === "true",
        result: process.env.NATIVE_RESULT ?? "",
      },
    },
  });
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

import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { componentSourceErrors, NATIVE_CONTROL_BASELINE } from "./check-component-usage.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

/**
 * Run the shared frontend component contract through ESLint's Svelte parser.
 * The standalone check remains the ratchet and unit-test entry point; this
 * rule makes the same policy visible in the normal frontend lint command.
 */
const componentUsage = {
  meta: {
    type: "problem",
    docs: {
      description: "Enforce OpenAgent shared frontend component usage",
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (filename === "<text>" || filename === "<input>") return {};

    const absoluteFilename = isAbsolute(filename) ? filename : resolve(process.cwd(), filename);
    const name = relative(root, absoluteFilename).replaceAll("\\", "/");
    if (!name.startsWith("src/") || !name.endsWith(".svelte")) return {};
    if (name.startsWith("src/lib/components/ui/")) return {};

    return {
      Program(node) {
        for (const message of componentSourceErrors(
          context.sourceCode.text,
          name,
          NATIVE_CONTROL_BASELINE,
        )) {
          context.report({ node, message });
        }
      },
    };
  },
};

export default {
  rules: {
    "component-usage": componentUsage,
  },
};

// @ts-check
import { readPluginDevIndex, resolvePluginDevPath } from "./plugin-dev-paths.mjs";

/** @param {string[]} args */
function main(args) {
  let indexFile;
  let id;
  let pathOnly = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--index" && args[i + 1]) indexFile = args[++i];
    else if (arg === "--path" && args[i + 1]) {
      id = args[++i];
      pathOnly = true;
    } else if (!arg.startsWith("-") && !id) id = arg;
    else throw new Error("Usage: bun run plugin:dev [id | --path id] [--index file]");
  }
  const index = readPluginDevIndex({ indexFile });
  const plugins = (id ? [id] : Object.keys(index.directories)).map((name) =>
    resolvePluginDevPath(index, name),
  );
  console.log(
    pathOnly
      ? plugins[0].directory
      : JSON.stringify({ indexFile: index.indexFile, plugins }, null, 2),
  );
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

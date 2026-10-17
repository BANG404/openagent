import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createThemePlugin } from "./create-theme-plugin";
import { themeCollection } from "./themes/collection";

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--owner" || !/^[\w-]+$/.test(args[1]))
  throw new Error("Usage: bun scripts/create-theme-collection.ts --owner GITHUB_OWNER");
const root = resolve(import.meta.dirname, "..");
const candidates = themeCollection.map((entry) => ({
  ...entry,
  output: join(root, "plugins", entry.id),
  repository: `https://github.com/${args[1]}/${entry.id}`,
}));
for (const candidate of candidates)
  if (existsSync(candidate.output))
    throw new Error(`Candidate already exists: ${candidate.output}`);
for (const candidate of candidates) console.log(createThemePlugin(candidate).output);

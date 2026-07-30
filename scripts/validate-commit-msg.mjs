import { readFileSync } from "node:fs";

const messageFile = process.argv[2];
const message = messageFile ? readFileSync(messageFile, "utf8") : readFileSync(0, "utf8");

const firstLine = message
  .split(/\r?\n/)
  .find((line) => line.trim() && !line.startsWith("#"))
  ?.trim();

if (!firstLine) {
  console.error("Commit message is empty.");
  process.exit(1);
}

const ignoredPrefixes = ["Merge ", "Revert ", "fixup! ", "squash! "];
if (ignoredPrefixes.some((prefix) => firstLine.startsWith(prefix))) {
  process.exit(0);
}

const conventionalPattern =
  /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([a-z0-9._/-]+\))?!?: .{1,}$/;

if (!conventionalPattern.test(firstLine)) {
  console.error("Invalid commit message.");
  console.error("Use Conventional Commits, for example:");
  console.error("  feat(scope): add new capability");
  console.error("  fix: handle missing config");
  console.error("  feat!: remove deprecated API");
  process.exit(1);
}

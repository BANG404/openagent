import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

if (!existsSync(".git")) {
  process.exit(0);
}

execFileSync("git", ["config", "core.hooksPath", ".githooks"], {
  stdio: "inherit",
});

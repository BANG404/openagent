import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const envFile = resolve(process.cwd(), ".env.sonar");

try {
  const contents = readFileSync(envFile, "utf8");
  for (const line of contents.split(/\r?\n/u)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/u);
    if (!match || match[1].startsWith("#")) continue;
    process.env[match[1]] = match[2].replace(/^(["'])(.*)\1$/u, "$2");
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

if (!process.env.SONAR_TOKEN) {
  console.error(`Missing SONAR_TOKEN in ${envFile}`);
  process.exit(1);
}

const test = spawnSync(process.execPath, ["run", "test"], {
  env: process.env,
  stdio: "inherit",
});

const scanner = spawnSync("sonar-scanner", [], {
  env: process.env,
  shell: process.platform === "win32",
  stdio: "inherit",
});

if (scanner.status !== 0) process.exit(scanner.status ?? 1);
process.exit(test.status ?? 1);

import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { format, resolveConfig } from "prettier";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = new URL("../sdk/typescript/src/protocol.generated.ts", import.meta.url);

export async function generateProtocolTypes({ check = false } = {}) {
  const source = execFileSync(
    "cargo",
    [
      "run",
      "--quiet",
      "--manifest-path",
      "crates/Cargo.toml",
      "-p",
      "openagent-protocol",
      "--example",
      "export_typescript",
      "--features",
      "typescript",
    ],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  const generated = await format(source, {
    ...(await resolveConfig(fileURLToPath(output))),
    parser: "typescript",
  });
  if (check) {
    if ((await readFile(output, "utf8")) !== generated) {
      throw new Error("Public protocol bindings are stale. Run bun run generate:protocol.");
    }
  } else {
    await writeFile(output, generated);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await generateProtocolTypes({ check: process.argv.includes("--check") });
}

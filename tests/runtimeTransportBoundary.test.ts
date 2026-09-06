// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { DESKTOP_PRODUCT_COMMANDS } from "../sdk/typescript/src/contracts";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? sourceFiles(path) : [path];
    }),
  );
  return nested.flat().filter((path) => [".ts", ".svelte"].includes(extname(path)));
}

describe("external Runtime transport boundary", () => {
  test("routes every Runtime-owned frontend operation through the shared SDK client", async () => {
    const runtimeCommands = new Set(DESKTOP_PRODUCT_COMMANDS);
    const violations = [];
    const directInvoke = /(?<![\w.])invoke(?:<[^>]+>)?\s*\(\s*["']([a-z_]+)["']/gs;

    for (const path of await sourceFiles(sourceRoot)) {
      const source = await readFile(path, "utf8");
      for (const match of source.matchAll(directInvoke)) {
        if (runtimeCommands.has(match[1])) {
          violations.push(`${relative(repositoryRoot, path)}: ${match[1]}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test("implements every typed desktop product operation in the external Runtime router", async () => {
    const router = await readFile(
      new URL("../sdk/rust/openagent-runtime/src/commands/remote_gateway.rs", import.meta.url),
      "utf8",
    );
    const dispatch = router.slice(
      router.indexOf("async fn desktop_product_operation("),
      router.indexOf("async fn harness_capabilities("),
    );
    const implemented = new Set(
      [...dispatch.matchAll(/^\s+"([a-z_]+)"\s*=>/gm)].map((match) => match[1]),
    );

    expect(DESKTOP_PRODUCT_COMMANDS.filter((command) => !implemented.has(command))).toEqual([]);
  });
});

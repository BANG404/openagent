import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import { selectTests, testInventory, repositoryFiles } from "../scripts/test-selection.mjs";
import { executeSelectedTests } from "../scripts/run-selected-tests.mjs";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(sources: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "openagent-test-selection-"));
  roots.push(root);
  for (const [file, source] of Object.entries(sources)) {
    const path = join(root, file);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, source);
  }
  return { root, files: Object.keys(sources) };
}

const sources = {
  "src/lib/composer.ts": 'export { draft } from "./draft";',
  "src/lib/draft.ts": "export const draft = 1;",
  "src/lib/settings.ts": "export const settings = 2;",
  "tests/composer.test.ts": 'import { draft } from "../src/lib/composer";',
  "tests/settings.test.ts": 'import { settings } from "$lib/settings";',
  "tests/contract.test.ts": 'import { readFileSync } from "node:fs";',
};

describe("affected test selection", () => {
  test("includes transitive consumers and shared guards without unrelated unit suites", () => {
    const plan = selectTests({
      ...fixture(sources),
      changed: ["src\\lib\\draft.ts"],
      scope: "frontend",
    });
    expect(plan.full).toBe(false);
    expect(plan.tests).toEqual(["tests/composer.test.ts", "tests/contract.test.ts"]);
  });

  test("resolves aliases, re-exports, JavaScript-to-TypeScript paths, and index modules", () => {
    const files = fixture({
      ...sources,
      "src/lib/settings.ts": 'export { value } from "./values/index.js";',
      "src/lib/values/index.ts": 'export { value } from "./nested";',
      "src/lib/values/nested/index.ts": "export const value = 1;",
    });
    const plan = selectTests({
      ...files,
      changed: ["src/lib/values/nested/index.ts"],
      scope: "frontend",
    });
    expect(plan.tests).toEqual(["tests/contract.test.ts", "tests/settings.test.ts"]);
    expect(plan.full).toBe(false);
  });

  test("follows Svelte scripts, literal dynamic imports, require, and cycles", () => {
    const plan = selectTests({
      ...fixture({
        ...sources,
        "src/lib/composer.ts": 'import "./Panel.svelte"; import "./draft";',
        "src/lib/Panel.svelte": '<script lang="ts">const load = () => import("./cycle");</script>',
        "src/lib/cycle.ts": 'require("./composer"); export const value = 1;',
      }),
      changed: ["src/lib/cycle.ts"],
      scope: "frontend",
    });
    expect(plan.full).toBe(false);
    expect(plan.tests).toEqual(["tests/composer.test.ts", "tests/contract.test.ts"]);
  });

  test("retains source-scanning helpers and computed dependencies as shared guards", () => {
    const plan = selectTests({
      ...fixture({
        ...sources,
        "tests/shared.ts": 'import fs from "fs/promises";',
        "tests/scanner.test.ts": 'import "./shared";',
        "tests/bunFile.test.ts": 'Bun.file("src/data.json");',
        "tests/dynamic.test.ts": "const load = (name: string) => import(name);",
      }),
      changed: ["src/lib/draft.ts"],
      scope: "frontend",
    });
    expect(plan.tests).toContain("tests/scanner.test.ts");
    expect(plan.tests).toContain("tests/bunFile.test.ts");
    expect(plan.tests).toContain("tests/dynamic.test.ts");
    expect(plan.tests).not.toContain("tests/settings.test.ts");
  });

  test("includes newly added and directly modified tests", () => {
    const files = fixture({ ...sources, "tests/new.test.ts": 'import "bun:test";' });
    const plan = selectTests({
      ...files,
      changed: ["tests/new.test.ts", "tests/settings.test.ts"],
      scope: "frontend",
    });
    expect(plan.tests).toEqual([
      "tests/contract.test.ts",
      "tests/new.test.ts",
      "tests/settings.test.ts",
    ]);
  });

  test("a source-read reference cannot stop traversal of a later real import", () => {
    const plan = selectTests({
      ...fixture({
        ...sources,
        "tests/reader.ts": 'import fs from "node:fs"; const file = "../src/lib/composer.ts";',
        "tests/composer.test.ts": 'import "./reader"; import "../src/lib/composer";',
      }),
      changed: ["src/lib/draft.ts"],
      scope: "frontend",
    });
    expect(plan.full).toBe(false);
    expect(plan.tests).not.toContain("tests/settings.test.ts");
  });

  test("recognizes literal source contracts without guessing dynamic directory coverage", () => {
    const files = fixture({
      ...sources,
      "src/lib/Panel.svelte": "<p>Panel</p>",
      "tests/panel.test.ts": 'import fs from "node:fs"; const source = "../src/lib/Panel.svelte";',
    });
    const panel = selectTests({ ...files, changed: ["src/lib/Panel.svelte"], scope: "frontend" });
    expect(panel.full).toBe(false);
    expect(panel.tests).toEqual(["tests/contract.test.ts", "tests/panel.test.ts"]);
    expect(
      selectTests({ ...files, changed: ["src/lib/NewPanel.svelte"], scope: "frontend" }).full,
    ).toBe(true);
  });

  test("falls back for uncovered additions, deletions, renames, and shared inputs", () => {
    const files = fixture(sources);
    for (const changed of [
      ["src/lib/new.ts"],
      ["src/lib/deleted.ts"],
      ["src/lib/draft.ts", "src/lib/renamed.ts"],
      ["tests/deleted.test.ts"],
      ["src/app.css"],
      ["src/lib/schema.json"],
      ["bun.lock"],
      ["runtime"],
      ["plugins/goal"],
      ["scripts/run-selected-tests.mjs"],
    ]) {
      const plan = selectTests({ ...files, changed, scope: "frontend" });
      expect(plan.full).toBe(true);
      expect(plan.tests.length).toBe(3);
    }
  });

  test("full qualification keeps every suite and documentation retains guards", () => {
    const files = fixture(sources);
    expect(selectTests({ ...files, changed: [], scope: "frontend", full: true }).tests.length).toBe(
      3,
    );
    expect(selectTests({ ...files, changed: ["README.md"], scope: "frontend" }).tests).toEqual([
      "tests/contract.test.ts",
    ]);
  });

  test("discovers new script tests and does not classify frontend unit tests as automation", () => {
    const files = [
      "scripts/new.test.mjs",
      "tests/ciReuse.test.js",
      "tests/composer.test.ts",
      "tests/testSelection.test.ts",
      "tests/helper.ts",
      "sdk/typescript/tests/client.test.ts",
    ];
    expect(testInventory(files, "automation")).toEqual([
      "scripts/new.test.mjs",
      "sdk/typescript/tests/client.test.ts",
      "tests/ciReuse.test.js",
      "tests/testSelection.test.ts",
    ]);
    expect(testInventory(files, "frontend")).toHaveLength(5);
  });

  test("collects tracked and untracked tests while respecting ignored generated files", () => {
    const { root } = fixture({
      "tests/new.test.ts": "",
      ".gitignore": "build/\n",
      "build/generated.test.ts": "",
    });
    execFileSync("git", ["init", "--quiet"], { cwd: root });
    execFileSync("git", ["add", ".gitignore"], { cwd: root });
    expect(repositoryFiles(root)).toEqual(["tests/new.test.ts", ".gitignore"]);
  });

  test("fails closed when selected tests are empty", () => {
    expect(() =>
      executeSelectedTests({
        root: tmpdir(),
        scope: "frontend",
        plan: { tests: [], total: 0, full: false, reason: "fixture" },
      }),
    ).toThrow("empty");
  });

  test("runs exact selected files and propagates a real test failure", () => {
    const { root } = fixture({
      "tests/only.test.ts":
        'import {test, expect} from "bun:test"; test("passes", () => expect(1).toBe(1));',
      "tests/only.test.ts.unrelated.test.ts": 'throw new Error("must not be selected");',
      "tests/fail.test.ts":
        'import {test, expect} from "bun:test"; test("fails", () => expect(1).toBe(2));',
    });
    expect(
      executeSelectedTests({
        root,
        scope: "frontend",
        plan: {
          tests: ["tests/only.test.ts"],
          total: 3,
          full: false,
          reason: "fixture",
        },
      }),
    ).toBe(0);
    expect(
      executeSelectedTests({
        root,
        scope: "frontend",
        plan: {
          tests: ["tests/fail.test.ts"],
          total: 3,
          full: false,
          reason: "fixture",
        },
      }),
    ).not.toBe(0);
  });

  test("CI without a reliable baseline reports complete fallback in dry-run", () => {
    const result = spawnSync(process.execPath, ["scripts/run-selected-tests.mjs", "--dry-run"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, CI: "true", TEST_BASE_SHA: "missing-ref", TEST_FULL: "false" },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Falling back to complete tests:");
    expect(result.stdout).toContain("complete");
    expect(result.stdout).toContain("tests/composerDrafts.test.ts");
  });

  test("CI modules receive the same selector and explicit full qualification input", () => {
    for (const scope of ["frontend", "automation"]) {
      const workflow = readFileSync(`.github/workflows/check-${scope}.yml`, "utf8");
      expect(workflow).toContain(`bun scripts/run-selected-tests.mjs --scope ${scope}`);
      expect(workflow).toContain("TEST_BASE_SHA: ${{ inputs.base_sha }}");
      expect(workflow).toContain("TEST_FULL: ${{ inputs.full }}");
      expect(workflow).toContain("fetch-depth: 0");
    }
  });
});

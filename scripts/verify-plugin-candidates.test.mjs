import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  candidateTestFramework,
  candidateVerificationCommands,
  verifyCandidateTests,
} from "./verify-plugin-candidates.mjs";

/** @param {Record<string, string>} sources */
function candidateFixture(sources) {
  const root = mkdtempSync(join(tmpdir(), "plugin-candidate-framework-"));
  for (const [path, source] of Object.entries(sources)) {
    const directory = join(root, path, "tests");
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "package.test.mjs"), source);
  }
  return root;
}

describe("packaged plugin test frameworks", () => {
  test("real Node and Bun fixtures both execute with their native runtime capabilities", () => {
    const root = candidateFixture({
      "native-node": [
        'import { test } from "node:test";',
        'import assert from "node:assert/strict";',
        'import { writeFileSync } from "node:fs";',
        'test("native Node fixture", () => { assert.equal(process.versions.bun, undefined); writeFileSync(new URL("../verified", import.meta.url), "node"); });',
      ].join("\n"),
      "native-bun": [
        'import { test, expect } from "bun:test";',
        'import { writeFileSync } from "node:fs";',
        'test("native Bun fixture", () => { expect(typeof Bun.serve).toBe("function"); writeFileSync(new URL("../verified", import.meta.url), "bun"); });',
      ].join("\n"),
    });
    try {
      verifyCandidateTests(root);
      expect(readFileSync(join(root, "native-node/verified"), "utf8")).toBe("node");
      expect(readFileSync(join(root, "native-bun/verified"), "utf8")).toBe("bun");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("every Node and Bun suite keeps its declared runner and bounded timeout", () => {
    const root = candidateFixture({
      "message-board-1.1.1": 'import { test } from "node:test";',
      "chat-groups-3.0.2": 'import { test } from "bun:test";',
    });
    try {
      const commands = candidateVerificationCommands(root);
      expect(commands).toEqual([
        {
          command: "node",
          args: [
            "--test",
            "--test-timeout=10000",
            join(root, "message-board-1.1.1/tests/package.test.mjs"),
          ],
        },
        {
          command: "bun",
          args: [
            "test",
            "--timeout",
            "10000",
            join(root, "chat-groups-3.0.2/tests/package.test.mjs"),
          ],
        },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("implicit Bun globals remain covered while mixed frameworks stop qualification", () => {
    expect(candidateTestFramework('test("implicit suite", () => expect(true).toBe(true));')).toBe(
      "bun",
    );
    expect(() =>
      candidateTestFramework(
        'import { test } from "node:test"; import { expect } from "bun:test";',
      ),
    ).toThrow("cannot mix");
  });

  test("a failed native Node suite stops publication before running later suites", () => {
    const root = candidateFixture({
      "message-board-1.1.1": 'import { test } from "node:test";',
      "chat-groups-3.0.2": 'import { test } from "bun:test";',
    });
    /** @type {string[]} */
    const calls = [];
    try {
      expect(() =>
        verifyCandidateTests(root, {
          run(command, _args, options) {
            calls.push(command);
            expect(options.timeout).toBe(120000);
            return { status: 1 };
          },
        }),
      ).toThrow("Packaged node tests failed");
      expect(calls).toEqual(["node"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a runner deadline cannot qualify an unfinished suite", () => {
    const root = candidateFixture({ "message-board-1.1.1": 'import { test } from "node:test";' });
    try {
      expect(() =>
        verifyCandidateTests(root, {
          run() {
            return { status: null, error: new Error("ETIMEDOUT") };
          },
        }),
      ).toThrow("exceeded the verification deadline");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

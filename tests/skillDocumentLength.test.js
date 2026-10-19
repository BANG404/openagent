import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  RECOMMENDED_SKILL_ENTRYPOINT_CHARS,
  skillBodyCharacterCount,
  skillLengthWarnings,
} from "../scripts/validate-agent-skills.mjs";

describe("skill entrypoint context guidance", () => {
  test("repository entrypoints retain useful routing within the recommended budget", () => {
    expect(skillLengthWarnings()).toEqual([]);
  });

  test("large fenced examples count as context and produce a soft review hint", () => {
    const directory = mkdtempSync(join(tmpdir(), "openagent-skill-budget-"));
    try {
      mkdirSync(join(directory, "fixture"));
      const source =
        `---\nname: fixture\ndescription: fixture\n---\n\n` +
        "```text\n" +
        "example ".repeat(RECOMMENDED_SKILL_ENTRYPOINT_CHARS) +
        "\n```\n";
      writeFileSync(join(directory, "fixture", "SKILL.md"), source);
      expect(skillBodyCharacterCount(source)).toBeGreaterThan(RECOMMENDED_SKILL_ENTRYPOINT_CHARS);
      expect(skillLengthWarnings({ directory })).toHaveLength(1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

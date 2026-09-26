import { describe, expect, test } from "bun:test";
import {
  MAX_SKILL_ENTRYPOINT_CHARS,
  skillBodyCharacterCount,
  skillLengthErrors,
} from "../scripts/validate-agent-skills.mjs";

describe("skill entrypoint length contract", () => {
  test("all skill entrypoints stay below the compact prose budget", () => {
    expect(skillLengthErrors()).toEqual([]);
  });

  test("counts prose while ignoring metadata and fenced examples", () => {
    const source = `---\nname: fixture\ndescription: fixture\n---\n\n\`\`\`text\nthis example is ignored\n\`\`\`\n\n四个字`;
    expect(skillBodyCharacterCount(source)).toBe(3);
    expect(MAX_SKILL_ENTRYPOINT_CHARS).toBe(200);
  });
});

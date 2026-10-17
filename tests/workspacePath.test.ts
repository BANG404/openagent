import { expect, test } from "bun:test";
import { displayPath } from "../src/lib/workspacePath";

test("visible Windows paths omit namespace syntax while retaining UNC roots", () => {
  expect(displayPath(String.raw`\\?\C:\plugins\技能`)).toBe(String.raw`C:\plugins\技能`);
  expect(displayPath(String.raw`\\?\UNC\server\share\skills`)).toBe(
    String.raw`\\server\share\skills`,
  );
  for (const path of [
    String.raw`C:\skills`,
    String.raw`\\server\share`,
    "/workspace/skills",
    String.raw`\\?\Volume{123}\skills`,
  ])
    expect(displayPath(path)).toBe(path);
});

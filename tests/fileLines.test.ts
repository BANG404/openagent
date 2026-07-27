// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { parseFileLineRange } from "../src/lib/streamdown/fileLines";

describe("AGUI file line ranges", () => {
  test("parses single lines and common range forms", () => {
    expect(parseFileLineRange(13)).toEqual({ start: 13, end: 13 });
    expect(parseFileLineRange("13-45")).toEqual({ start: 13, end: 45 });
    expect(parseFileLineRange("L13:L45")).toEqual({ start: 13, end: 45 });
  });

  test("rejects invalid ranges and caps previews", () => {
    expect(parseFileLineRange("45-13")).toBeNull();
    expect(parseFileLineRange("0-3")).toBeNull();
    expect(parseFileLineRange("line 13")).toBeNull();
    expect(parseFileLineRange("1-999")).toEqual({ start: 1, end: 200 });
  });
});

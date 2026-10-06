import { describe, expect, test } from "bun:test";
import { applySlashCommandSelection } from "../src/lib/components/slashCommandSelection";
import { filterSlashCommands } from "../src/lib/components/slashCommandMatching";

describe("composer slash command matching", () => {
  const commands = ["compact", "model", "memory", "goal:pause", "graph:run"].map((name) => ({
    name,
  }));

  test("matches nonadjacent and unordered characters, ignoring case", () => {
    expect(filterSlashCommands(commands, "CMT")).toEqual([commands[0]]);
    expect(filterSlashCommands(commands, "tpm")).toEqual([commands[0]]);
    expect(filterSlashCommands(commands, "pause:goal")).toEqual([commands[3]]);
    expect(filterSlashCommands(commands, "run:graph")).toEqual([commands[4]]);
  });

  test("ranks exact, prefix and substring matches ahead of unordered matches", () => {
    const candidates = ["tac", "scat", "catch", "cat", "cater"].map((name) => ({ name }));
    expect(filterSlashCommands(candidates, "cat").map((command) => command.name)).toEqual([
      "cat",
      "catch",
      "cater",
      "scat",
      "tac",
    ]);
    expect(candidates[0].name).toBe("tac");
  });

  test("requires every occurrence of repeated characters and rejects missing characters", () => {
    expect(filterSlashCommands(commands, "mm")).toEqual([commands[2]]);
    expect(filterSlashCommands(commands, "mmm")).toEqual([]);
    expect(filterSlashCommands(commands, "xyz")).toEqual([]);
  });

  test("keeps the Runtime catalog order for an empty query and equally ranked matches", () => {
    expect(filterSlashCommands(commands, "")).toEqual(commands);
    expect(filterSlashCommands(commands, "m")).toEqual([commands[1], commands[2], commands[0]]);
  });
});

describe("composer slash command selection", () => {
  test("inserts /goal before an existing draft", () => {
    expect(applySlashCommandSelection("/gkeep this draft", 0, 2, "/goal")).toEqual({
      value: "/goal keep this draft",
      caret: 6,
    });
  });

  test("inserts /graph while preserving existing whitespace", () => {
    expect(applySlashCommandSelection("/gr  keep this draft", 0, 3, "/graph")).toEqual({
      value: "/graph  keep this draft",
      caret: 6,
    });
  });
});

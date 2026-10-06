import { expect, test } from "bun:test";
import { rebaseDraftValue } from "../src/lib/settings/draftMerge";

test("accepts another window's saved fields while retaining edits made during a save", () => {
  const submitted = { theme: "light", remote: { enabled: false, port: 8080 } };
  const accepted = { theme: "light", remote: { enabled: true, port: 8080 } };
  const edited = { theme: "dark", remote: { enabled: false, port: 9090 } };

  expect(rebaseDraftValue(submitted, accepted, edited)).toEqual({
    theme: "dark",
    remote: { enabled: true, port: 9090 },
  });
});

test("retains a locally edited model list as a complete ordered value", () => {
  const submitted = { models: ["a", "b"], language: "zh" };
  const accepted = { models: ["a", "b", "c"], language: "en" };
  const edited = { models: ["b", "a"], language: "zh" };
  expect(rebaseDraftValue(submitted, accepted, edited)).toEqual({
    models: ["b", "a"],
    language: "en",
  });
});

test("an unchanged draft adopts the complete accepted value without sharing mutable objects", () => {
  const accepted = { providers: [{ id: "p", models: ["model"] }], enabled: true };
  const rebased = rebaseDraftValue({ enabled: false }, accepted, { enabled: false });
  expect(rebased).toEqual(accepted);
  expect(rebased).not.toBe(accepted);
});

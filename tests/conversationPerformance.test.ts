import { expect, test } from "bun:test";
import {
  performanceOptions,
  performanceDistribution,
} from "../scripts/conversation-performance-options.mjs";
import { performanceHistory } from "../src/lib/devFixtures/conversationPerformance";
import { checkpointRecordsToMessages } from "../src/lib/checkpointTree";

test("workload sizes reject invalid values before creating state", () => {
  for (const args of [
    ["--turns", "NaN"],
    ["--turns", "3"],
    ["--payload", "0"],
    ["--profile", "other"],
    ["--base-url", "https://example.com"],
    ["--cycles", "1.5"],
    ["--max-hydration-ms", "-1"],
    ["--max-hydration-ms", "NaN"],
    ["--max-hydration-ms", "1.5"],
    ["--max-hydration-ms", "3600001"],
  ])
    expect(() => performanceOptions(args)).toThrow();
  expect(performanceOptions(["--profile", "stress"]).turns).toBe(1000);
  for (const budget of [0, 1, 4999, 5000, 5001, 10000, 3600000]) {
    expect(performanceOptions(["--max-hydration-ms", String(budget)]).maxHydration).toBe(budget);
  }
});

test("performance percentiles use sorted nearest ranks and retain outliers", () => {
  expect(performanceDistribution([1, 1000, ...Array(18).fill(2)])).toEqual({
    count: 20,
    min: 1,
    p50: 2,
    p95: 2,
    p99: 1000,
    max: 1000,
  });
  expect(() => performanceDistribution([])).toThrow();
});

test("large synthetic histories preserve authored turns, paired tools and compaction UI", () => {
  const records = performanceHistory(1000, 128, 20);
  const messages = checkpointRecordsToMessages(records, "fixture");
  expect(new Set(records.map((record) => record.id)).size).toBe(records.length);
  expect(messages.filter((message) => message.role === "user")).toHaveLength(1000);
  expect(messages.filter((message) => message.role === "ui")).toHaveLength(50);
  expect(messages.some((message) => message.content.includes("PRIVATE_PERFORMANCE_REPLAY"))).toBe(
    false,
  );
  const tools = messages
    .flatMap((message) => message.items ?? [])
    .filter((item) => item.type === "tool_call");
  expect(tools).toHaveLength(1000);
  expect(tools.every((tool) => tool.type === "tool_call" && tool.result?.length)).toBe(true);
});

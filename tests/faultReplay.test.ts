import { expect, test } from "bun:test";
import duplicate from "../src/lib/replay/fixtures/duplicate-tool-result.json";
import delayed from "../src/lib/replay/fixtures/delayed-terminal.json";
import hydration from "../src/lib/replay/fixtures/hydration-race.json";
import { replayCase } from "../src/lib/replay/runner";
import { createChatReplayTarget } from "../src/lib/replay/chatTarget";
import { validateReplayCase } from "../src/lib/replay/validate";

for (const fixture of [duplicate, delayed, hydration]) {
  test(`replays ${fixture.id} deterministically through production controllers`, async () => {
    for (let repetition = 0; repetition < 20; repetition += 1) {
      const report = await replayCase(fixture, createChatReplayTarget);
      expect(report).toMatchObject({ status: "passed", case_id: fixture.id });
      expect(report.assertions_passed).toHaveLength(fixture.assertions.length);
    }
  });
}

test("an independent behavioral expectation can fail", async () => {
  const wrong = structuredClone(delayed);
  wrong.assertions[0].equals = "incorrect";
  expect(await replayCase(wrong, createChatReplayTarget)).toMatchObject({
    status: "assertion_failed",
    assertion: "new-stream-survives",
  });
});

test("unexpected requests cannot pass even when product code catches them", async () => {
  const wrong = structuredClone(hydration);
  wrong.records.find((record) => record.kind === "request.begin")!.payload = {
    operation: "product.invoke_desktop",
    input: { operation: "get_renderable_checkpoints", args: { convId: "B" } },
  };
  expect(await replayCase(wrong, createChatReplayTarget)).toMatchObject({
    status: "runner_failed",
  });
});

test("unsupported event paths refuse a case rather than using real capabilities", async () => {
  const wrong = validateReplayCase(duplicate);
  wrong.records[0].payload = { event: "chat.run_started", data: { conv_id: "A" } };
  expect(await replayCase(wrong, createChatReplayTarget)).toMatchObject({ status: "unsupported" });
});

test("invalid and incomplete bundles do not construct a target", async () => {
  let constructed = false;
  const target: typeof createChatReplayTarget = async (...args) => {
    constructed = true;
    return createChatReplayTarget(...args);
  };
  for (const value of [
    null,
    {},
    { ...duplicate, completeness: "incomplete" },
    { ...duplicate, records: [...duplicate.records, duplicate.records[0]] },
  ]) {
    expect((await replayCase(value, target)).status).not.toBe("passed");
  }
  expect(constructed).toBe(false);
});

test("strict schema rejects unsafe, dangling and unexecuted input", async () => {
  for (const mutate of [
    (value: ReturnType<typeof validateReplayCase>) => {
      value.assertions[0].path = ["__proto__"];
    },
    (value: ReturnType<typeof validateReplayCase>) => {
      value.records[0].caused_by = ["missing"];
    },
    (value: ReturnType<typeof validateReplayCase>) => {
      value.records[0].seq = 99;
    },
    (value: ReturnType<typeof validateReplayCase>) => {
      value.schedule = value.schedule.filter((step) => step.do !== "assert");
    },
  ]) {
    const invalid = validateReplayCase(duplicate);
    mutate(invalid);
    expect(await replayCase(invalid, createChatReplayTarget)).toMatchObject({
      status: "invalid_case",
    });
  }
});

test("capability admission prevents live effects and refuses unsupported prefix coverage", async () => {
  const invalid = validateReplayCase(hydration);
  const request = invalid.records.find((record) => record.kind === "request.begin")!;
  request.payload = {
    operation: "product.invoke_desktop",
    input: {
      operation: "write_background_terminal",
      args: { convId: "A", data: "forbidden" },
    },
  };
  expect(await replayCase(invalid, createChatReplayTarget)).toMatchObject({
    status: "unsupported",
  });
  const prefix = validateReplayCase(duplicate);
  prefix.completeness = "prefix";
  expect(await replayCase(prefix, createChatReplayTarget)).toMatchObject({ status: "unsupported" });
});

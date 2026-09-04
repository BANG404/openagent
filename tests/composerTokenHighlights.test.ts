// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { segmentComposerTokens } from "../src/lib/components/composerTokenHighlights";

describe("composer token highlights", () => {
  test("highlights mention and hash tokens without changing their text", () => {
    expect(segmentComposerTokens("Ask @agent about #file.feishu.rs today")).toEqual([
      { text: "Ask ", highlighted: false },
      { text: "@agent", highlighted: true },
      { text: " about ", highlighted: false },
      { text: "#file.feishu.rs", highlighted: true },
      { text: " today", highlighted: false },
    ]);
  });

  test("keeps quoted tokens together, including escaped quotes", () => {
    expect(segmentComposerTokens('Use @"review \\"lead\\"" and #"docs plan"')).toEqual([
      { text: "Use ", highlighted: false },
      { text: '@"review \\"lead\\""', highlighted: true },
      { text: " and ", highlighted: false },
      { text: '#"docs plan"', highlighted: true },
    ]);
  });

  test("does not treat markers inside ordinary words as tokens", () => {
    expect(segmentComposerTokens("mail@example.com issue#42")).toEqual([
      { text: "mail@example.com issue#42", highlighted: false },
    ]);
  });

  test("ends unquoted tokens at English and Chinese punctuation", () => {
    expect(segmentComposerTokens("检查 #file.ts，并通知 @agent。Done #README.md.")).toEqual([
      { text: "检查 ", highlighted: false },
      { text: "#file.ts", highlighted: true },
      { text: "，并通知 ", highlighted: false },
      { text: "@agent", highlighted: true },
      { text: "。Done ", highlighted: false },
      { text: "#README.md", highlighted: true },
      { text: ".", highlighted: false },
    ]);
  });

  test("styles an incomplete marker while the user is typing", () => {
    expect(segmentComposerTokens("Ask @")).toEqual([
      { text: "Ask ", highlighted: false },
      { text: "@", highlighted: true },
    ]);
  });
});

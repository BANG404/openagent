// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const processRecordGroupUrl = new URL(
  "../src/lib/components/ProcessRecordGroup.svelte",
  import.meta.url,
);
const messageListUrl = new URL("../src/lib/components/MessageList.svelte", import.meta.url);
const virtualMessageListUrl = new URL(
  "../src/lib/components/VirtualMessageList.svelte",
  import.meta.url,
);
const agentBookReaderUrl = new URL("../src/lib/components/AgentBookReader.svelte", import.meta.url);

describe("process record group", () => {
  test("uses a controlled button without fragmenting a native details element", async () => {
    const source = await readFile(processRecordGroupUrl, "utf8");

    expect(source).toContain('class="process-record-summary"');
    expect(source).toContain("aria-expanded={open}");
    expect(source).toContain("onclick={() => (open = !open)}");
    expect(source).toContain('class="process-record-content" hidden={!open}');
    expect(source).not.toContain("<details");
    expect(source).not.toContain("<summary");
  });

  test("keeps the process disclosure mounted while an assistant turn is streaming", async () => {
    const source = await readFile(messageListUrl, "utf8");

    expect(source).toContain(
      "processSegments.length > 0 && (assistantIsStreaming || finalSegments.length > 0)",
    );
  });

  test("keeps the controlled header with the first fragmented process record", async () => {
    const source = await readFile(virtualMessageListUrl, "utf8");
    const bookSource = await readFile(agentBookReaderUrl, "utf8");

    expect(source).toMatch(
      /\.virtual-message-row\.content-columns :global\(\.process-record-summary\)\s*\{[^}]*break-inside: avoid-column;[^}]*break-after: avoid-column;/s,
    );
    expect(bookSource).toContain('attributeFilter: ["open", "hidden"]');
    expect(bookSource).toMatch(
      /:global\(\.agent-book-page \.process-record-summary\)\s*\{[^}]*break-inside: avoid-column;[^}]*break-after: avoid-column;/s,
    );
  });

  test("keeps every rendered virtual row fully measurable", async () => {
    const source = await readFile(virtualMessageListUrl, "utf8");

    expect(source).toMatch(
      /\.virtual-message-row :global\(\.message-record\)\s*\{[^}]*content-visibility: visible;[^}]*contain-intrinsic-size: none;/s,
    );
    expect(source).not.toContain(".virtual-message-row.content-columns :global(.message-record)");
  });
});

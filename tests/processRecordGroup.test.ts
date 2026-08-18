// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const processRecordGroupUrl = new URL(
  "../src/lib/components/ProcessRecordGroup.svelte",
  import.meta.url,
);
const messageListUrl = new URL("../src/lib/components/MessageList.svelte", import.meta.url);
const transcriptListUrl = new URL("../src/lib/components/TranscriptList.svelte", import.meta.url);
const agentBookReaderUrl = new URL("../src/lib/components/AgentBookReader.svelte", import.meta.url);

describe("process record group", () => {
  test("uses a controlled button without fragmenting a native details element", async () => {
    const source = await readFile(processRecordGroupUrl, "utf8");

    expect(source).toContain('class="process-record-summary"');
    expect(source).toContain("aria-expanded={open}");
    expect(source).toContain("onclick={() => (open = !open)}");
    expect(source).toContain('class="process-record-content" hidden={grouped && !open}');
    expect(source).not.toContain("<details");
    expect(source).not.toContain("<summary");
  });

  test("mounts the process disclosure only for completed assistant turns", async () => {
    const [source, bookSource] = await Promise.all([
      readFile(messageListUrl, "utf8"),
      readFile(agentBookReaderUrl, "utf8"),
    ]);

    expect(source).toContain("shouldShowProcessRecords(turnStatus, processSegments.length)");
    expect(bookSource).toContain('selectedTurn.status === "completed"');
  });

  test("keeps completed process records collapsed by default", async () => {
    const [groupSource, messageSource] = await Promise.all([
      readFile(processRecordGroupUrl, "utf8"),
      readFile(messageListUrl, "utf8"),
    ]);

    expect(groupSource).toContain("let open = $state(false)");
    expect(messageSource).toContain(
      "const turnStatus = assistantTurnStatus(turnMessages, assistantIsStreaming)",
    );
    expect(messageSource).toContain(
      "<ProcessRecordGroup grouped={showProcessRecords} duration={timing?.total}>",
    );
  });

  test("keeps final rich output mounted while completion reveals the process disclosure", async () => {
    const [groupSource, messageSource] = await Promise.all([
      readFile(processRecordGroupUrl, "utf8"),
      readFile(messageListUrl, "utf8"),
    ]);

    expect(groupSource).toContain("{#if grouped}");
    expect(groupSource).toContain('data-grouped={grouped ? "true" : undefined}');
    expect(messageSource).toContain("{@render renderAssistantSegments(finalSegments)}");
    expect(messageSource).not.toContain(
      "{:else}\n          {@render renderAssistantSegments(assistantSegments)}",
    );
  });

  test("keeps the controlled header with the first fragmented process record", async () => {
    const source = await readFile(transcriptListUrl, "utf8");
    const bookSource = await readFile(agentBookReaderUrl, "utf8");

    expect(source).toMatch(
      /\.transcript-row\.content-columns :global\(\.process-record-summary\)\s*\{[^}]*break-inside: avoid-column;[^}]*break-after: avoid-column;/s,
    );
    expect(bookSource).toContain('attributeFilter: ["open", "hidden"]');
    expect(bookSource).toMatch(
      /:global\(\.agent-book-page \.process-record-summary\)\s*\{[^}]*break-inside: avoid-column;[^}]*break-after: avoid-column;/s,
    );
  });

  test("keeps every fully mounted transcript row visible", async () => {
    const [source, messageSource] = await Promise.all([
      readFile(transcriptListUrl, "utf8"),
      readFile(messageListUrl, "utf8"),
    ]);

    expect(source).toMatch(
      /\.transcript-row :global\(\.message-record\)\s*\{[^}]*content-visibility: visible;[^}]*contain-intrinsic-size: none;/s,
    );
    expect(source).toContain("{#each items as item, index (item.key)}");
    expect(messageSource).not.toContain("VirtualMessageList");
    expect(messageSource).not.toContain("estimateEntrySize");
  });
});

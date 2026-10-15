<script lang="ts">
  import { onMount, tick } from "svelte";
  import MessageList from "./MessageList.svelte";
  import { checkpointRecordsToMessages } from "$lib/checkpointTree";
  import { createCheckpointController } from "$lib/page/checkpoints";
  import { ChatStreamState } from "$lib/chatStreamState.svelte";
  import { appendCompactionProgress, completeCompactionProgress } from "$lib/chatStream";
  import {
    performanceBoundary,
    performanceCheckpoint,
    performanceConversationId as convId,
    performanceHistory,
    performanceRecord,
  } from "$lib/devFixtures/conversationPerformance";
  import { mermaidConfigFor } from "$lib/mermaidTheme";
  import type { Locale } from "$lib/i18n";
  import type { Conversation, StreamItem } from "$lib/types";

  let { theme, locale }: { theme: string; locale: Locale } = $props();
  const query = new URLSearchParams(location.search);
  const bounded = (key: string, fallback: number, max: number) => {
    const value = Number(query.get(key) ?? fallback);
    if (!Number.isInteger(value) || value < 1 || value > max) throw new Error(`Invalid ${key}`);
    return value;
  };
  const turns = bounded("performance-turns", 200, 10_000);
  const payload = bounded("performance-payload", 1024, 65_536);
  const compactEvery = bounded("performance-compact-every", 10, turns);
  const cycles = bounded("performance-cycles", 3, 100);
  const records = performanceHistory(turns, payload, compactEvery);
  let scrollElement = $state<HTMLElement | null>(null);
  let conversations = $state<Conversation[]>([
    { id: convId, title: "Performance fixture", createdAt: 1, updatedAt: 1, messages: [] },
  ]);
  const streams = new ChatStreamState();
  let isStreaming = $state(false);
  let items = $state<StreamItem[]>([]);
  let result = $state<Record<string, unknown> | null>(null);
  let failure = $state("");
  let phase = $state("loading");
  const controller = createCheckpointController({
    tauriAvailable: false,
    activeConvId: convId,
    get conversations() {
      return conversations;
    },
    set conversations(value) {
      conversations = value;
    },
    chatStreams: streams,
    pendingForkUserMessageIds: {},
    convTrees: {},
    loadingConversationIds: {},
    checkpointLoadErrors: {},
    loadedConvIds: new Set(),
    liveCheckpointRefreshVersions: new Map(),
    branchSelectionVersions: new Map(),
    activeBranchIds: {},
    liveCheckpointFlowProjections: {},
    liveFileChangesPerConv: {},
    fileChangesPerConv: {},
    pendingUserInputs: {},
    checkpointFlowPanelAutoOpenKey: null,
    rightSidebarPanel: "status",
    rightSidebarCollapseRequested: false,
    mergeDurableFollowUpSuggestions: () => {},
    restoreMermaidRenderRequests: () => {},
    refreshTaskUsagesForConversation: async () => {},
    findConversationLocation: () => null,
  });
  const paint = async () => {
    await tick();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  };
  const hydrate = async () => {
    await controller.hydrateConversation(
      convId,
      [performanceCheckpoint(records)],
      "performance-tip",
      [],
      false,
    );
    await paint();
  };
  const require = (condition: unknown, message: string) => {
    if (!condition) throw new Error(message);
  };
  async function run() {
    const started = performance.now();
    const longTasks: number[] = [];
    const observer = PerformanceObserver.supportedEntryTypes.includes("longtask")
      ? new PerformanceObserver((list) =>
          longTasks.push(...list.getEntries().map((entry) => entry.duration)),
        )
      : null;
    observer?.observe({ type: "longtask", buffered: false });
    const hydration: number[] = [];
    const streamFrames: number[] = [];
    const compactionHydration: number[] = [];
    const scrollFrames: number[] = [];
    try {
      phase = "cold-hydration";
      let mark = performance.now();
      const projected = checkpointRecordsToMessages(records, "performance-tip");
      const projectionMs = performance.now() - mark;
      require(projected.filter((message) => message.role === "user").length ===
        turns, "authored user count changed");
      await hydrate();
      hydration.push(performance.now() - mark);
      const firstNode = scrollElement?.querySelector('[data-message-id="user-1"]');
      require(firstNode, "first user message missing");
      phase = "warm-hydration";
      mark = performance.now();
      await hydrate();
      hydration.push(performance.now() - mark);
      require(firstNode ===
        scrollElement?.querySelector(
          '[data-message-id="user-1"]',
        ), "warm hydration remounted stable messages");
      for (let cycle = 1; cycle <= cycles; cycle++) {
        phase = `streaming-${cycle}`;
        isStreaming = true;
        items = [{ type: "thinking", content: "Preparing a long conversation continuation." }];
        await paint();
        for (let chunk = 0; chunk < 32; chunk++) {
          mark = performance.now();
          const prior = items.at(-1);
          const content = prior?.type === "text" ? prior.content : "";
          items = [
            ...items.filter((item) => item.type !== "text"),
            { type: "text", content: `${content}Stream ${cycle}/${chunk}: ${"s".repeat(128)}\n` },
          ];
          await paint();
          streamFrames.push(performance.now() - mark);
        }
        phase = `compaction-${cycle}`;
        items = appendCompactionProgress(items, "creating");
        await paint();
        items = completeCompactionProgress(items);
        await paint();
        const boundary = turns + cycle;
        records.push(
          performanceRecord(`live-${cycle}`, "assistant", [
            { type: "text", text: `Completed performance continuation ${cycle}.` },
          ]),
          ...performanceBoundary(boundary),
        );
        isStreaming = false;
        items = [];
        mark = performance.now();
        await hydrate();
        compactionHydration.push(performance.now() - mark);
        require(firstNode ===
          scrollElement?.querySelector(
            '[data-message-id="user-1"]',
          ), "compaction remounted historical messages");
      }
      phase = "scroll";
      for (let step = 0; step < 12; step++) {
        mark = performance.now();
        if (scrollElement) scrollElement.scrollTop = step % 2 ? scrollElement.scrollHeight : 0;
        await paint();
        scrollFrames.push(performance.now() - mark);
      }
      phase = "restore";
      const expectedMessages = conversations[0].messages.length;
      conversations = [{ ...conversations[0], messages: [] }];
      await paint();
      mark = performance.now();
      await hydrate();
      const restoreMs = performance.now() - mark;
      require(conversations[0].messages.length ===
        expectedMessages, "restore changed message count");
      const text = scrollElement?.innerText ?? "";
      require(!text.includes("PRIVATE_PERFORMANCE_REPLAY"), "provider replay became visible");
      require(text.includes("Performance request 1:"), "earliest input lost");
      require(text.includes(`Performance answer ${turns}.`), "latest history answer lost");
      require(text.includes(`Completed performance continuation ${cycles}.`), "continuation lost");
      const expectedDividers = Math.floor(turns / compactEvery) + cycles;
      require(scrollElement?.querySelectorAll(".message-divider").length ===
        expectedDividers, "compaction boundaries missing or duplicated");
      await paint();
      const heap =
        (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
          ?.usedJSHeapSize ?? null;
      result = {
        status: "passed",
        turns,
        payload_bytes: payload,
        records: records.length,
        visible_messages: expectedMessages,
        dividers: expectedDividers,
        projection_ms: projectionMs,
        hydration_ms: hydration,
        streaming_frame_ms: streamFrames,
        compaction_hydration_ms: compactionHydration,
        scroll_frame_ms: scrollFrames,
        restore_ms: restoreMs,
        long_tasks_supported: observer !== null,
        long_task_ms: longTasks,
        js_heap_used_bytes: heap,
        dom_nodes: scrollElement?.querySelectorAll("*").length,
        elapsed_ms: performance.now() - started,
        theme,
        locale,
      };
      phase = "passed";
    } finally {
      observer?.disconnect();
    }
  }
  onMount(() => {
    void run().catch((error: unknown) => {
      failure = String(error);
      phase = "failed";
    });
  });
</script>

<main
  class="performance-stage bg-conversation-surface"
  bind:this={scrollElement}
  data-performance-phase={phase}
>
  <output
    data-conversation-performance={result ? JSON.stringify(result) : null}
    data-performance-error={failure}
  ></output>
  <MessageList
    messages={conversations[0].messages}
    {scrollElement}
    {isStreaming}
    isAwaitingStreamOutput={false}
    currentStreamItems={items}
    currentStreamMessageId="performance-live"
    activeConvId={convId}
    activeBranchId={null}
    debugMode={false}
    activeTree={undefined}
    paddingBottom={48}
    showApiKeyWarn={false}
    shikiTheme={theme === "dark" ? "github-dark" : "github-light"}
    mermaidConfig={mermaidConfigFor(theme === "dark")}
    followTail={false}
    newConversationGreeting={null}
    newConversationGreetingLoading={false}
    editable={false}
    onCommitEdit={() => {}}
    onAddQuote={() => {}}
    onReExecute={() => {}}
    onSwitchBranch={() => {}}
    onSubmitUserInput={() => {}}
    onCancelUserInput={() => {}}
  />
</main>

<style>
  .performance-stage {
    height: 100vh;
    overflow-y: auto;
    padding: 24px;
  }
</style>

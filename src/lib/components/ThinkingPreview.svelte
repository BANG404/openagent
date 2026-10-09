<script lang="ts">
  import MessageList from "./MessageList.svelte";
  import { mermaidConfigFor } from "$lib/mermaidTheme";
  import type { Locale } from "$lib/i18n";
  import type { ChatMessage, CheckpointTurnStatus, StreamItem } from "$lib/types";

  let { theme, locale }: { theme: string; locale: Locale } = $props();
  const phases = [
    "empty",
    "first",
    "partial",
    "latest",
    "blank",
    "long",
    "answer",
    "interrupted",
    "completed",
  ] as const;
  let phase = $state<(typeof phases)[number]>("first");
  let scrollElement = $state<HTMLElement | null>(null);
  const responseId = "thinking-preview-assistant";
  const startedAt = Date.now();
  let first = $derived(locale === "zh" ? "先检查组件边界。" : "Inspect the component boundaries.");
  let latest = $derived(
    locale === "zh" ? "正在检查最新的流式输出。" : "Checking the latest streamed output.",
  );
  let content = $derived(
    phase === "empty"
      ? "analysis: "
      : phase === "first"
        ? first
        : phase === "partial"
          ? `${first}\n${latest.slice(0, 6)}`
          : phase === "blank"
            ? `${first}\n${latest}\n \t\n`
            : phase === "long"
              ? `${first}\n${latest.repeat(40)}`
              : `${first}\n${latest}`,
  );
  let status = $derived<CheckpointTurnStatus>(
    phase === "completed" ? "completed" : phase === "interrupted" ? "interrupted" : "running",
  );
  let settled = $derived(status !== "running");
  let items = $derived<StreamItem[]>([
    { type: "thinking", content },
    ...(["answer", "completed"].includes(phase)
      ? [{ type: "text" as const, content: "Thinking fixture answer." }]
      : []),
  ]);
  let messages = $derived<ChatMessage[]>([
    {
      id: "thinking-preview-user",
      role: "user",
      content: "Thinking preview fixture.",
      timestamp: startedAt,
    },
    ...(settled
      ? [
          {
            id: responseId,
            role: "assistant" as const,
            content: phase === "completed" ? "Thinking fixture answer." : "",
            items,
            timestamp: startedAt,
            turn: {
              id: "thinking-preview-turn",
              input_message_id: "thinking-preview-user",
              response_message_id: responseId,
              status,
              started_at: startedAt,
            },
          },
        ]
      : []),
  ]);
</script>

<main class="thinking-preview-stage bg-conversation-surface" bind:this={scrollElement}>
  <nav aria-label="Thinking fixture">
    {#each phases as next (next)}
      <button type="button" data-thinking-phase={next} onclick={() => (phase = next)}>{next}</button
      >
    {/each}
  </nav>
  <MessageList
    {messages}
    {scrollElement}
    isStreaming={!settled}
    isAwaitingStreamOutput={false}
    streamStartedAt={startedAt}
    currentStreamItems={settled ? [] : items}
    currentStreamMessageId={settled ? null : responseId}
    activeConvId="thinking-preview"
    activeBranchId={null}
    debugMode={false}
    activeTree={undefined}
    paddingBottom={48}
    showApiKeyWarn={false}
    shikiTheme={theme === "dark" ? "github-dark" : "github-light"}
    mermaidConfig={mermaidConfigFor(theme === "dark")}
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
  .thinking-preview-stage {
    height: 100vh;
    overflow-y: auto;
  }
  nav {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    padding: 16px 32px;
  }
  button {
    color: var(--text);
    background: var(--surface);
  }
</style>

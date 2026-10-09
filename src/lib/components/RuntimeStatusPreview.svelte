<script lang="ts">
  import MessageList from "./MessageList.svelte";
  import { mermaidConfigFor } from "$lib/mermaidTheme";
  import type { ChatMessage, CheckpointTurnStatus, StreamItem } from "$lib/types";

  let { theme }: { theme: string } = $props();
  const phases = [
    "initial",
    "response",
    "waiting",
    "completed",
    "plain",
    "cancelled",
    "failed",
  ] as const;
  let phase = $state<(typeof phases)[number]>("initial");
  let scrollElement = $state<HTMLElement | null>(null);
  const startedAt = Date.now() - 12_000;
  const responseId = "runtime-status-assistant";
  const items: StreamItem[] = [
    { type: "thinking", content: "Preparing the live response." },
    {
      type: "tool_call",
      name: "read_file",
      args: '{"path":"src/routes/+page.svelte"}',
      result: "Loaded the requested file.",
    },
    { type: "text", content: "Runtime status fixture answer." },
  ];
  let terminal = $derived(
    phase === "completed" || phase === "plain" || phase === "cancelled" || phase === "failed",
  );
  let messages = $derived<ChatMessage[]>([
    {
      id: "runtime-status-user",
      role: "user",
      content: "Run the status fixture.",
      timestamp: startedAt,
    },
    ...(terminal
      ? [
          {
            id: responseId,
            role: "assistant" as const,
            content: "Runtime status fixture answer.",
            items:
              phase === "plain"
                ? [{ type: "text" as const, content: "Runtime status fixture answer." }]
                : items,
            timestamp: startedAt + 1_000,
            turn: {
              id: "runtime-status-turn",
              input_message_id: "runtime-status-user",
              response_message_id: responseId,
              status: phase === "plain" ? "completed" : (phase as CheckpointTurnStatus),
              started_at: startedAt,
              first_token_at: startedAt + 1_000,
              completed_at: startedAt + 15_000,
              duration_ms: 15_000,
            },
          },
        ]
      : []),
  ]);
</script>

<main class="runtime-status-preview bg-conversation-surface" bind:this={scrollElement}>
  <nav aria-label="Runtime status fixture">
    {#each phases as nextPhase (nextPhase)}
      <button type="button" data-runtime-phase={nextPhase} onclick={() => (phase = nextPhase)}
        >{nextPhase}</button
      >
    {/each}
  </nav>
  <MessageList
    {messages}
    {scrollElement}
    isStreaming={!terminal}
    isAwaitingStreamOutput={phase === "initial" || phase === "waiting"}
    streamStartedAt={startedAt}
    currentStreamItems={phase === "initial" ? [] : items}
    currentStreamMessageId={terminal ? null : responseId}
    activeConvId="runtime-status-preview"
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
  .runtime-status-preview {
    height: 100vh;
    overflow-y: auto;
  }
  nav {
    display: flex;
    gap: 12px;
    padding: 16px 32px;
  }
  button {
    color: var(--text);
    background: var(--surface);
  }
</style>

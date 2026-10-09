<script lang="ts">
  import MessageList from "./MessageList.svelte";
  import { mermaidConfigFor } from "$lib/mermaidTheme";
  import { replayCase, type ReplayTargetFactory } from "$lib/replay/runner";
  import { createChatReplayTarget } from "$lib/replay/chatTarget";
  import type { ReplayReport } from "$lib/replay/types";
  import type { ChatMessage } from "$lib/types";
  import duplicate from "$lib/replay/fixtures/duplicate-tool-result.json";
  import delayed from "$lib/replay/fixtures/delayed-terminal.json";
  import hydration from "$lib/replay/fixtures/hydration-race.json";

  let { theme }: { theme: string } = $props();
  let report = $state<ReplayReport | null>(null);
  let messages = $state<ChatMessage[]>([]);
  let scrollElement = $state<HTMLElement | null>(null);
  let busy = $state(false);
  const fixtures = [duplicate, delayed, hydration];

  async function run(fixture: (typeof fixtures)[number]) {
    busy = true;
    report = null;
    const factory: ReplayTargetFactory = async (...args) => {
      const target = await createChatReplayTarget(...args);
      return {
        ...target,
        close() {
          const observed = target.observe() as unknown as {
            conversations: { A: { messages: ChatMessage[] } };
          };
          messages = observed.conversations.A.messages.map((message) => ({
            ...message,
            timestamp: 1,
          }));
          target.close();
        },
      };
    };
    report = await replayCase(fixture, factory);
    busy = false;
  }
</script>

<main class="fault-replay-preview bg-conversation-surface" bind:this={scrollElement}>
  <nav aria-label="Replay fixtures">
    {#each fixtures as fixture (fixture.id)}
      <button
        type="button"
        data-replay-case={fixture.id}
        disabled={busy}
        onclick={() => run(fixture)}>{fixture.id}</button
      >
    {/each}
  </nav>
  <output data-replay-status={report?.status ?? "idle"} data-replay-id={report?.case_id ?? ""}
    >{report ? JSON.stringify(report) : "Select a replay fixture"}</output
  >
  <MessageList
    {messages}
    {scrollElement}
    isStreaming={false}
    isAwaitingStreamOutput={false}
    currentStreamItems={[]}
    currentStreamMessageId={null}
    activeConvId="A"
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
  main {
    height: 100vh;
    overflow-y: auto;
  }
  nav {
    display: flex;
    gap: 16px;
    padding: 16px;
  }
  output {
    display: block;
    padding: 16px;
    overflow-wrap: anywhere;
  }
</style>

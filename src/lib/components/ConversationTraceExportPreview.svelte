<script lang="ts">
  import { onMount } from "svelte";
  import MessageList from "./MessageList.svelte";
  import { mermaidConfigFor } from "$lib/mermaidTheme";
  import { desktopOpenAgent, invoke } from "$lib/openagent/tauriClient";
  import { createConversationTraceExporter } from "$lib/conversationTraceExport.svelte";

  let { theme }: { theme: string } = $props();
  const convId = `trace-export-fixture-${crypto.randomUUID()}`;
  let ready = $state(false);
  let debugMode = $state(true);
  let failNext = $state(false);
  let savedPath = $state("");
  let scrollElement = $state<HTMLElement | null>(null);
  const exporter = createConversationTraceExporter({
    async loadTrace(id) {
      // Keep the pending state observable in the native scenario.
      await new Promise((resolve) => setTimeout(resolve, 450));
      if (failNext) {
        failNext = false;
        throw new Error("Fixture read failure");
      }
      return desktopOpenAgent.invokeProduct("export_conversation_trace", { convId: id });
    },
    async saveFile(filename, content) {
      savedPath = await invoke<string>("save_download_file", {
        filename,
        content,
        encoding: "utf8",
      });
      return { location: savedPath };
    },
  });
  onMount(() => {
    void desktopOpenAgent
      .invokeProduct("create_conversation", {
        id: convId,
        title: "Trace export fixture",
        workspace: "",
      })
      .then(() => {
        ready = true;
      });
  });
  async function cleanup() {
    await desktopOpenAgent.invokeProduct("delete_conversation", { convId });
    ready = false;
  }
</script>

<main
  class="trace-export-preview bg-conversation-surface"
  bind:this={scrollElement}
  data-ready={ready}
  data-conversation={convId}
>
  <button
    type="button"
    data-toggle-debug
    onclick={() => {
      debugMode = !debugMode;
    }}>Toggle debug</button
  >
  <button
    type="button"
    data-fail-export
    onclick={() => {
      failNext = true;
    }}>Fail next export</button
  >
  <button type="button" data-cleanup-export onclick={cleanup}>Remove fixture</button>
  <output data-export-path>{savedPath}</output>
  {#if ready}
    <MessageList
      messages={[]}
      {scrollElement}
      isStreaming={false}
      isAwaitingStreamOutput={false}
      currentStreamItems={[]}
      currentStreamMessageId={null}
      activeConvId={convId}
      activeBranchId={null}
      {debugMode}
      activeTree={undefined}
      paddingBottom={48}
      showApiKeyWarn={false}
      shikiTheme={theme === "dark" ? "github-dark" : "github-light"}
      mermaidConfig={mermaidConfigFor(theme === "dark")}
      newConversationGreeting={null}
      newConversationGreetingLoading={false}
      showNewConversationContext={false}
      onExportConversationTrace={() => exporter.exportTrace(convId)}
      exportingConversationTrace={exporter.exporting}
      onCommitEdit={() => {}}
      onAddQuote={() => {}}
      onReExecute={() => {}}
      onSwitchBranch={() => {}}
      onSubmitUserInput={() => {}}
      onCancelUserInput={() => {}}
    />
  {/if}
</main>

<style>
  .trace-export-preview {
    min-height: 100vh;
    padding: 32px;
  }
  output {
    display: block;
    margin: 16px 0;
    overflow-wrap: anywhere;
  }
</style>

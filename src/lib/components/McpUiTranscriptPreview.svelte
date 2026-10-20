<script lang="ts">
  import { onMount } from "svelte";
  import MessageList from "./MessageList.svelte";
  import { mermaidConfigFor } from "$lib/mermaidTheme";
  import type { ChatMessage, StreamItem } from "$lib/types";

  let { theme, locale }: { theme: "light" | "dark"; locale: "en" | "zh" } = $props();
  let element = $state<HTMLElement | null>(null);
  let html = $state("");
  let error = $state("");
  let stage = $state<"pending" | "success" | "completed" | "failed">("pending");
  const source = "flowchart LR\n  Start --> Done";
  onMount(() => {
    const controller = new AbortController();
    const resource = new URLSearchParams(location.search).get("mcp-ui-transcript-preview-resource");
    if (!resource) {
      error = "Select a resource with mcp-ui-transcript-preview-resource.";
      return;
    }
    void fetch(resource, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`UI resource: ${response.status}`);
        html = await response.text();
      })
      .catch((cause) => {
        if (!controller.signal.aborted) error = String(cause);
      });
    return () => controller.abort();
  });
  const items = $derived<StreamItem[]>([
    { type: "thinking", content: "Prepare the diagram" },
    { type: "tool_call", name: "read_file", args: '{"path":"diagram.mmd"}', result: source },
    { type: "tool_call", name: "inspect_source", args: "{}", result: "Source loaded" },
    {
      type: "tool_call",
      name: "plugin_mermaid_render_mermaid",
      args: JSON.stringify({ source }),
      ...(stage === "pending"
        ? {}
        : {
            result:
              stage === "failed" ? '{"isError":true,"error":"Invalid source"}' : "Editor prepared",
          }),
      mcpUi: {
        descriptor: {
          server_id: "mermaid-preview",
          tool_name: "render_mermaid",
          resource_uri: "ui://mermaid/editor.html",
          visibility: ["model", "app"],
        },
        ...(html
          ? {
              resource: {
                uri: "ui://mermaid/editor.html",
                mime_type: "text/html;profile=mcp-app",
                text: html,
              },
            }
          : {}),
        arguments: { source },
        structured_content: { source, title: "Mermaid", status: "prepared" },
        content: [],
        is_error: stage === "failed",
      },
    },
    { type: "tool_call", name: "update_goal", args: "{}", result: "Updated" },
    { type: "text", content: locale === "zh" ? "图示已准备。" : "Diagram prepared." },
  ]);
  const messages = $derived<ChatMessage[]>([
    { id: "mcp-ui-user", role: "user", content: "Mermaid", timestamp: 1 },
    ...(stage === "completed"
      ? [
          {
            id: "mcp-ui-assistant",
            role: "assistant" as const,
            content: "",
            items,
            timestamp: 2,
            turn: {
              id: "mcp-ui-turn",
              input_message_id: "mcp-ui-user",
              response_message_id: "mcp-ui-assistant",
              status: "completed" as const,
              started_at: 1,
              completed_at: 2,
              duration_ms: 1,
            },
          },
        ]
      : []),
  ]);
</script>

<main
  bind:this={element}
  class="mcp-ui-transcript-preview bg-conversation-surface"
  data-stage={stage}
>
  <nav aria-label="Preview">
    <button data-mcp-result onclick={() => (stage = "success")}
      >{locale === "zh" ? "返回结果" : "Return result"}</button
    >
    <button data-mcp-finalize onclick={() => (stage = "completed")}
      >{locale === "zh" ? "完成响应" : "Finalize"}</button
    >
    <button data-mcp-fail onclick={() => (stage = "failed")}
      >{locale === "zh" ? "模拟失败" : "Fail"}</button
    >
  </nav>
  {#if error}<p role="alert">{error}</p>{/if}
  <MessageList
    {messages}
    scrollElement={element}
    isStreaming={stage !== "completed"}
    isAwaitingStreamOutput={false}
    currentStreamItems={items}
    currentStreamMessageId="mcp-ui-assistant"
    activeConvId="mcp-ui-preview"
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
    overflow: auto;
    padding: 24px;
  }
  nav {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }
  button {
    padding: 6px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--foreground);
  }
</style>

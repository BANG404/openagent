<script lang="ts">
  import { onMount } from "svelte";
  import { t, locale } from "$lib/i18n";
  import type { ConversationUi } from "$lib/types";
  import { conversationUiFrameDocument } from "$lib/conversationUi";
  import { useOpenAgentUiCapabilities } from "$lib/openagent/uiCapabilities";
  import MessageDivider from "./MessageDivider.svelte";

  let {
    ui,
    messageId,
    conversationId,
    branchId,
  }: {
    ui: ConversationUi;
    messageId: string;
    conversationId: string | null;
    branchId: string | null;
  } = $props();
  const capabilities = useOpenAgentUiCapabilities();
  let documentSource = $state<string | null>(null);
  let loading = $state(false);
  let failed = $state(false);
  let frame = $state<HTMLIFrameElement | null>(null);
  let height = $state(160);
  let theme = $state("light");
  const supported = $derived(ui.version === 1);
  const assetIdentity = $derived(
    JSON.stringify([ui.version, ui.plugin_id, ui.entry, ui.component]),
  );
  const compaction = $derived(
    ui.component === "builtin.divider" && ui.props.label_key === "compactionCompleted",
  );
  const title = $derived(
    compaction ? $t("compactionCompleted") : stringProp("title") || ui.fallback,
  );

  function stringProp(key: string): string {
    const value = ui.props[key];
    return typeof value === "string" ? value : "";
  }

  function postContext(): void {
    frame?.contentWindow?.postMessage(
      {
        type: "openagent:conversation-ui-context",
        version: 1,
        message_id: messageId,
        conversation_id: conversationId,
        branch_id: branchId,
        component: ui.component,
        props: $state.snapshot(ui.props),
        locale: $locale,
        theme,
      },
      "*",
    );
  }

  function receive(event: MessageEvent): void {
    if (!frame?.contentWindow || event.source !== frame.contentWindow) return;
    const data: unknown = event.data;
    if (!data || typeof data !== "object") return;
    const payload = data as Record<string, unknown>;
    if (payload.version !== 1 || payload.message_id !== messageId) return;
    if (payload.type === "openagent:conversation-ui-ready") postContext();
    if (
      payload.type === "openagent:conversation-ui-resize" &&
      typeof payload.height === "number" &&
      Number.isFinite(payload.height)
    ) {
      height = Math.min(720, Math.max(80, payload.height));
    }
    if (
      payload.type === "openagent:conversation-ui-state" &&
      typeof payload.request_id === "string" &&
      payload.request_id.length <= 128 &&
      payload.props &&
      typeof payload.props === "object" &&
      !Array.isArray(payload.props) &&
      conversationId &&
      branchId &&
      capabilities.setConversationUiProps
    ) {
      const target = frame.contentWindow;
      void capabilities
        .setConversationUiProps(
          conversationId,
          branchId,
          messageId,
          payload.props as Record<string, unknown>,
        )
        .then(() =>
          target?.postMessage(
            {
              type: "openagent:conversation-ui-state-result",
              version: 1,
              message_id: messageId,
              request_id: payload.request_id,
              ok: true,
            },
            "*",
          ),
        )
        .catch(() =>
          target?.postMessage(
            {
              type: "openagent:conversation-ui-state-result",
              version: 1,
              message_id: messageId,
              request_id: payload.request_id,
              ok: false,
            },
            "*",
          ),
        );
    }
  }

  $effect(() => {
    const [version, pluginId, entry, component] = JSON.parse(assetIdentity) as [
      number,
      string | null,
      string | null,
      string,
    ];
    let cancelled = false;
    documentSource = null;
    failed = false;
    loading = false;
    if (
      version !== 1 ||
      !pluginId ||
      !entry ||
      !component.startsWith(`plugin:${pluginId}:`) ||
      !capabilities.readPluginUiAsset
    )
      return;
    loading = true;
    void capabilities
      .readPluginUiAsset(pluginId, entry)
      .then((asset) => {
        if (cancelled) return;
        if (!asset.mime.startsWith("text/html") || asset.content.length > 4 * 1024 * 1024)
          throw new Error("invalid");
        documentSource = conversationUiFrameDocument(asset.content);
      })
      .catch(() => {
        if (!cancelled) failed = true;
      })
      .finally(() => {
        if (!cancelled) loading = false;
      });
    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    ui.props;
    $locale;
    theme;
    messageId;
    conversationId;
    branchId;
    postContext();
  });

  onMount(() => {
    const updateTheme = () => {
      theme = document.documentElement.classList.contains("dark") ? "dark" : "light";
    };
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  });
</script>

<svelte:window onmessage={receive} />

{#if supported && ui.component === "builtin.divider"}
  <MessageDivider
    {title}
    streamItemKey={`ui-${messageId}`}
    detail={stringProp("detail") || undefined}
    tone={ui.props.tone === "danger" ? "danger" : "neutral"}
    {messageId}
  />
{:else}
  <article
    class="conversation-ui message-record"
    class:danger={supported && ui.component === "builtin.notice" && ui.props.tone === "danger"}
    id={`message-${messageId}`}
    data-message-id={messageId}
    aria-label={$t("conversationUiLabel")}
  >
    {#if supported && ui.component === "builtin.notice"}
      {#if ui.plugin_id}<header>{ui.plugin_id}</header>{/if}
      {#if stringProp("title")}<strong>{stringProp("title")}</strong>{/if}
      <p>{stringProp("text") || ui.fallback}</p>
    {:else if loading}
      <div class="ui-skeleton" aria-busy="true" aria-label={$t("loadingContent")}></div>
    {:else if supported && documentSource && !failed}
      <iframe
        title={ui.fallback}
        srcdoc={documentSource}
        sandbox="allow-scripts"
        referrerpolicy="no-referrer"
        bind:this={frame}
        style:height={`${height}px`}
        onload={postContext}
      ></iframe>
    {:else}
      <p>{ui.fallback}</p>
      {#if ui.plugin_id}<small>{$t("conversationUiUnavailable")}</small>{/if}
    {/if}
  </article>
{/if}

<style>
  .conversation-ui {
    min-width: 0;
    padding: 14px 18px;
    border-radius: var(--app-radius);
    background: var(--component-neutral-bg);
    color: var(--text);
  }
  header,
  small {
    color: var(--text-muted);
    font-size: 12px;
  }
  .conversation-ui.danger {
    color: var(--danger);
  }
  header {
    margin-bottom: 8px;
  }
  p {
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  strong + p {
    margin-top: 8px;
  }
  iframe {
    display: block;
    width: 100%;
    border: 0;
  }
  .ui-skeleton {
    height: 160px;
    border-radius: var(--app-radius);
    background: var(--surface);
  }
</style>

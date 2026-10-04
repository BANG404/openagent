<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import { t } from "$lib/i18n";
  import type { AgentPluginSidebarViewSummary } from "$lib/types";
  import { desktopOpenAgent } from "$lib/openagent/tauriClient";

  let {
    view,
    pluginSidebarRevision = "",
    scopeKey,
    locale = "en",
    theme = "system",
    context = {},
  }: {
    view: AgentPluginSidebarViewSummary;
    /** Installed package identity; a change re-reads the panel document. */
    pluginSidebarRevision?: string;
    scopeKey: string;
    locale?: string;
    theme?: string;
    context?: {
      workspacePath?: string | null;
      conversationId?: string | null;
      branchId?: string | null;
      fileChanges?: Array<{ path: string; status: string }>;
      locale?: string;
      theme?: string;
    };
  } = $props();

  let src = $state<string | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(true);
  let frame = $state<HTMLIFrameElement | null>(null);
  const assetIdentity = $derived(`${view.id}\u0000${view.entry}\u0000${pluginSidebarRevision}`);

  function pluginContext(): Record<string, unknown> {
    const capabilities = new Set(view.capabilities ?? []);
    const payload: Record<string, unknown> = {
      type: "openagent:sidebar-context",
      version: 1,
      plugin_id: view.id.split(":")[1] ?? "",
      scope: scopeKey,
    };
    if (capabilities.has("workspace")) payload.workspace = context.workspacePath ?? null;
    if (capabilities.has("conversation")) payload.conversation_id = context.conversationId ?? null;
    if (capabilities.has("branch")) payload.branch_id = context.branchId ?? null;
    if (capabilities.has("files")) payload.file_changes = context.fileChanges ?? [];
    if (capabilities.has("locale")) payload.locale = context.locale ?? locale;
    if (capabilities.has("theme")) payload.theme = context.theme ?? theme;
    return payload;
  }

  function postContext(): void {
    frame?.contentWindow?.postMessage(pluginContext(), "*");
  }

  async function load(): Promise<void> {
    loading = true;
    error = null;
    if (!view.id.startsWith("plugin:") || !view.entry) {
      error = "invalid";
      loading = false;
      return;
    }
    const pluginId = view.id.split(":")[1];
    try {
      const asset = await desktopOpenAgent.invokeProduct("read_agent_plugin_asset", {
        plugin_id: pluginId,
        entry: view.entry,
      });
      const previous = src;
      src = URL.createObjectURL(new Blob([asset.content], { type: asset.mime }));
      if (previous) URL.revokeObjectURL(previous);
    } catch (cause) {
      error = String(cause);
    } finally {
      loading = false;
    }
  }

  // The plugin descriptor carries the installed package identity, so a plugin
  // install, update, or enable/disable re-reads the document instead of leaving
  // the panel on the snapshot it loaded first.
  $effect(() => {
    assetIdentity;
    untrack(() => void load());
  });

  $effect(() => {
    view.capabilities;
    scopeKey;
    locale;
    theme;
    context.workspacePath;
    context.conversationId;
    context.branchId;
    context.fileChanges;
    context.locale;
    context.theme;
    postContext();
  });

  onDestroy(() => {
    if (src) URL.revokeObjectURL(src);
  });
</script>

<section class="plugin-panel" aria-label={view.title}>
  {#if loading}
    <p class="plugin-state">{$t("loadingContent")}</p>
  {:else if error}
    <p class="plugin-state plugin-error">
      {$t("pluginSidebarInvalid")}{error === "invalid" ? "" : `: ${error}`}
    </p>
  {:else if src}
    <!-- WebView2 requires same-origin blob documents to paint sandboxed HTML. -->
    <iframe
      title={view.title}
      {src}
      bind:this={frame}
      sandbox="allow-scripts allow-same-origin"
      referrerpolicy="no-referrer"
      onload={postContext}
    ></iframe>
  {/if}
</section>

<style>
  .plugin-panel {
    display: flex;
    min-width: 0;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    background: var(--surface);
  }
  iframe {
    width: 100%;
    min-height: 0;
    flex: 1;
    border: 0;
    background: var(--surface);
  }
  .plugin-state {
    margin: auto;
    padding: 18px;
    color: var(--text-muted);
    font-size: 12px;
    text-align: center;
  }
  .plugin-error {
    color: var(--danger, #b42318);
  }
</style>

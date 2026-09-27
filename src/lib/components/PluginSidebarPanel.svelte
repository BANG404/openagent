<script lang="ts">
  import { onDestroy } from "svelte";
  import type { AgentPluginSidebarViewSummary } from "$lib/types";
  import { desktopOpenAgent } from "$lib/openagent/tauriClient";

  let {
    view,
    scopeKey,
    locale = "en",
    theme = "system",
  }: {
    view: AgentPluginSidebarViewSummary;
    scopeKey: string;
    locale?: string;
    theme?: string;
  } = $props();

  let src = $state<string | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(true);

  async function load(): Promise<void> {
    loading = true;
    error = null;
    if (!view.id.startsWith("plugin:") || !view.entry) {
      error = "Invalid plugin sidebar view";
      loading = false;
      return;
    }
    const pluginId = view.id.split(":")[1];
    try {
      const asset = await desktopOpenAgent.invokeProduct("read_agent_plugin_asset", {
        plugin_id: pluginId,
        entry: view.entry,
      });
      const blob = new Blob([asset.content], { type: asset.mime });
      src = URL.createObjectURL(blob);
    } catch (cause) {
      error = String(cause);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    view.id;
    view.entry;
    void load();
  });

  onDestroy(() => {
    if (src) URL.revokeObjectURL(src);
  });
</script>

<section class="plugin-panel" aria-label={view.title}>
  {#if loading}
    <p class="plugin-state">Loading plugin view...</p>
  {:else if error}
    <p class="plugin-state plugin-error">{error}</p>
  {:else if src}
    <iframe
      title={view.title}
      {src}
      sandbox="allow-scripts"
      referrerpolicy="no-referrer"
      onload={(event) => {
        const frame = event.currentTarget as HTMLIFrameElement;
        frame.contentWindow?.postMessage(
          { type: "openagent:sidebar-context", version: 1, locale, theme, scope: scopeKey },
          "*",
        );
      }}
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

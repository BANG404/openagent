<script lang="ts">
  import type { AgentPluginSummary } from "$lib/types";
  import { t, locale } from "$lib/i18n";
  import { pluginText } from "$lib/pluginI18n";
  let { plugin, onOpen }: { plugin: AgentPluginSummary; onOpen: (id: string) => void } = $props();
</script>

<div class="integration-source" data-plugin-source={plugin.id}>
  <span>{$t("integrationSource")}</span>
  <button type="button" onclick={() => onOpen(plugin.id)}>
    {pluginText(plugin.i18n, $locale, "display_name", plugin.name)}
  </button>
  <span class="detail-hint">{plugin.id}{plugin.version ? ` · ${plugin.version}` : ""}</span>
</div>

<style>
  .integration-source {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: baseline;
    font-size: 12px;
    color: var(--text-muted);
  }
  button {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--primary);
    font: inherit;
    cursor: pointer;
    text-align: start;
  }
  button:hover {
    text-decoration: underline;
  }
  button:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
</style>

<script lang="ts">
  import Mermaid from "../Mermaid.svelte";
  import { t } from "$lib/i18n";

  let { args }: { args: Record<string, unknown> } = $props();
  const id = $props.id();
  const source = $derived(typeof args.source === "string" ? args.source : "");
  const title = $derived(typeof args.title === "string" ? args.title : "");
</script>

<figure class="agui-mermaid" data-agui-mermaid>
  {#if title}<figcaption>{title}</figcaption>{/if}
  {#if source.trim()}
    <Mermaid token={{ text: source }} id={`agui-${id}`} />
  {:else}
    <p>{$t("mermaidNoSource")}</p>
  {/if}
</figure>

<style>
  .agui-mermaid {
    display: block;
    margin: 12px 0;
    min-width: 0;
  }

  figcaption {
    margin-bottom: 8px;
    color: var(--foreground);
    font-weight: 500;
  }

  p {
    color: var(--muted-foreground);
  }
</style>

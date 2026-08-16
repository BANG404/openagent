<script lang="ts">
  import { Streamdown } from "svelte-streamdown";
  import ChatMath from "./ChatMath.svelte";
  import { useOpenAgentUiCapabilities } from "$lib/openagent";
  import { externalLinks } from "./externalLink";

  let { content }: { content: string } = $props();
  const capabilities = useOpenAgentUiCapabilities();
</script>

<div class="quote-content" use:externalLinks={capabilities.openUrl}>
  <Streamdown
    {content}
    controls={{ code: false, mermaid: false, table: false }}
    components={{ math: ChatMath }}
  />
</div>

<style>
  .quote-content {
    min-width: 0;
  }

  :global(.quote-content p) {
    margin: 0;
  }

  :global(.quote-content [data-streamdown-inline-math]) {
    white-space: nowrap;
  }

  :global(.quote-content [data-streamdown-block-math]) {
    max-width: 100%;
    overflow-x: auto;
  }
</style>

<script lang="ts">
  import { Streamdown } from "svelte-streamdown";
  import ChatMath from "./ChatMath.svelte";

  let { content }: { content: string } = $props();
</script>

<div class="quote-content">
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

<script lang="ts">
  import MathBlock from "svelte-streamdown/math";

  type MathToken = {
    type: "math";
    raw: string;
    text: string;
    isInline: boolean;
    displayMode: boolean;
  };

  let { token, id }: { token: MathToken; id: string } = $props();
</script>

{#if token.isInline}
  <span data-chat-math-source={token.text} data-chat-math-display="inline">
    <MathBlock {token} {id} />
  </span>
{:else}
  <div data-chat-math-source={token.text} data-chat-math-display="block">
    <MathBlock {token} {id} />
  </div>
{/if}

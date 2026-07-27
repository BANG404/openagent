<script lang="ts">
  import { Tooltip as T } from "bits-ui";
  import type { Snippet } from "svelte";

  interface Props {
    text: string | null | undefined;
    side?: "top" | "right" | "bottom" | "left";
    sideOffset?: number;
    align?: "start" | "center" | "end";
    delayMs?: number;
    disabled?: boolean;
    /** Render the wrapper span as block (fills parent width). Ignored when `trigger` is used. */
    block?: boolean;
    /** Default mode: wraps children in an inline-flex span. */
    children?: Snippet;
    /**
     * Advanced mode: receive the bits-ui trigger props and spread them on your own element.
     * Use this when the wrapped element is `position: absolute` or otherwise can't tolerate
     * an extra wrapping element.
     */
    trigger?: Snippet<[Record<string, unknown>]>;
  }

  let {
    text,
    side = "top",
    sideOffset = 6,
    align = "center",
    delayMs,
    disabled = false,
    block = false,
    children,
    trigger,
  }: Props = $props();

  let inactive = $derived(!text || disabled);
</script>

{#if inactive}
  {#if trigger}
    {@render trigger({})}
  {:else if children}
    {@render children()}
  {/if}
{:else}
  <T.Root delayDuration={delayMs}>
    <T.Trigger>
      {#snippet child({ props })}
        {#if trigger}
          {@render trigger(props)}
        {:else if children}
          <span class="tt-trigger" class:tt-block={block} {...props}>{@render children()}</span>
        {/if}
      {/snippet}
    </T.Trigger>
    <T.Portal>
      <T.Content class="tt-content" {side} {sideOffset} {align}>
        {text}
      </T.Content>
    </T.Portal>
  </T.Root>
{/if}

<style>
  .tt-trigger {
    display: inline-flex;
  }
  .tt-trigger.tt-block {
    display: block;
    width: 100%;
  }
</style>

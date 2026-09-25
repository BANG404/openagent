<script lang="ts">
  import { fade } from "svelte/transition";
  import LoadingSkeleton from "./LoadingSkeleton.svelte";
  import { t } from "$lib/i18n";
  import { motionDuration } from "$lib/motion";

  interface Props {
    prompt: string | null;
    loading: boolean;
    showApiKeyWarn: boolean;
    placement?: "overlay" | "stack";
  }

  let { prompt: _prompt, loading, showApiKeyWarn, placement = "overlay" }: Props = $props();
</script>

<div class="new-conversation-context" class:stack={placement === "stack"}>
  {#if loading}
    <div transition:fade={{ duration: motionDuration(140) }}>
      <LoadingSkeleton variant="memory-note" label={$t("loadingContent")} />
    </div>
  {/if}
  {#if showApiKeyWarn}
    <p class="warn" transition:fade={{ duration: motionDuration(160) }}>{$t("configApiKey")}</p>
  {/if}
</div>

<style>
  .new-conversation-context {
    position: absolute;
    top: calc(50% + 24px);
    right: 0;
    left: 0;
    z-index: 1;
    display: flex;
    width: auto;
    max-width: none;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 12px;
    margin: 0;
    padding: 0 32px;
    transform: translateY(-100%);
    color: var(--text-muted);
    text-align: center;
    pointer-events: none;
  }

  .new-conversation-context.stack {
    position: relative;
    top: auto;
    right: auto;
    left: auto;
    width: 100%;
    margin-bottom: 32px;
    transform: none;
  }

  .warn {
    margin-top: 4px;
    color: #f59e0b !important;
    font-size: 13px;
  }

  @media (max-width: 720px) {
    .new-conversation-context {
      padding: 0 20px;
    }

    .new-conversation-context.stack {
      margin-bottom: 28px;
    }
  }
</style>

<script lang="ts">
  import LoadingSkeleton from "./LoadingSkeleton.svelte";
  import { locale, t } from "$lib/i18n";

  interface Props {
    prompt: string | null;
    loading: boolean;
    showApiKeyWarn: boolean;
    placement?: "overlay" | "stack";
  }

  let { prompt, loading, showApiKeyWarn, placement = "overlay" }: Props = $props();
</script>

<div class="new-conversation-context" class:stack={placement === "stack"}>
  {#if loading}
    <LoadingSkeleton variant="memory-note" label={$t("loadingContent")} />
  {:else if prompt}
    <div class="memory-note">
      <p lang={$locale}>{prompt}</p>
    </div>
  {/if}
  {#if showApiKeyWarn}
    <p class="warn">{$t("configApiKey")}</p>
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

  .new-conversation-context.stack .memory-note p {
    font-size: 28px;
    font-weight: 400;
    line-height: 1.2;
    letter-spacing: -0.02em;
  }

  .new-conversation-context.stack .memory-note p:lang(zh) {
    letter-spacing: 0.06em;
  }

  .memory-note {
    position: relative;
    isolation: isolate;
    box-sizing: border-box;
    width: fit-content;
    max-width: min(100%, 720px);
    padding: 0 clamp(34px, 5vw, 64px);
    border: 0;
    background: transparent;
    pointer-events: auto;
    user-select: text;
  }

  .memory-note p {
    position: relative;
    z-index: 1;
    margin: 0;
    color: var(--text);
    font-size: 18px;
    font-weight: 500;
    line-height: 1.55;
    overflow-wrap: anywhere;
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

    .new-conversation-context.stack .memory-note p {
      font-size: 26px;
    }
  }
</style>

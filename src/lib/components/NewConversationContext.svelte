<script lang="ts">
  import LoadingSkeleton from "./LoadingSkeleton.svelte";
  import { t } from "$lib/i18n";

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
      <p>{prompt}</p>
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
    margin-bottom: 24px;
    transform: none;
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

  .memory-note::before {
    position: absolute;
    top: 50%;
    left: 50%;
    z-index: -2;
    width: calc(100% + clamp(360px, 38vw, 720px));
    height: calc(100% + clamp(240px, 28vh, 420px));
    background:
      radial-gradient(
        ellipse at 18% 36%,
        rgba(66, 133, 244, 0.2) 0 14%,
        rgba(66, 133, 244, 0.1) 34%,
        transparent 72%
      ),
      radial-gradient(
        ellipse at 42% 54%,
        rgba(52, 168, 83, 0.1) 0 16%,
        rgba(52, 168, 83, 0.06) 38%,
        transparent 76%
      ),
      radial-gradient(
        ellipse at 68% 34%,
        rgba(161, 66, 244, 0.12) 0 14%,
        rgba(161, 66, 244, 0.06) 36%,
        transparent 74%
      ),
      radial-gradient(
        ellipse at 82% 58%,
        rgba(251, 188, 5, 0.08) 0 12%,
        rgba(251, 188, 5, 0.04) 34%,
        transparent 72%
      ),
      linear-gradient(
        180deg,
        rgba(232, 246, 255, 0.36),
        rgba(216, 237, 255, 0.22) 58%,
        transparent 100%
      );
    filter: blur(56px) saturate(1.12);
    opacity: 0.28;
    transform: translate3d(-50%, -50%, 0) scale(1.04);
    animation: memory-note-aurora 8s ease-in-out infinite alternate;
    content: "";
    -webkit-mask-image: radial-gradient(
      ellipse at center,
      #000 0 34%,
      rgba(0, 0, 0, 0.7) 52%,
      rgba(0, 0, 0, 0.22) 76%,
      transparent 100%
    );
    mask-image: radial-gradient(
      ellipse at center,
      #000 0 34%,
      rgba(0, 0, 0, 0.7) 52%,
      rgba(0, 0, 0, 0.22) 76%,
      transparent 100%
    );
    pointer-events: none;
  }

  .memory-note::after {
    position: absolute;
    top: 50%;
    left: 50%;
    z-index: -1;
    width: calc(100% + clamp(300px, 32vw, 600px));
    height: calc(100% + clamp(200px, 24vh, 360px));
    background: rgba(245, 250, 255, 0.08);
    filter: blur(76px);
    transform: translate(-50%, -50%);
    content: "";
    -webkit-mask-image: radial-gradient(
      ellipse at center,
      #000 0 36%,
      rgba(0, 0, 0, 0.58) 58%,
      rgba(0, 0, 0, 0.18) 78%,
      transparent 100%
    );
    mask-image: radial-gradient(
      ellipse at center,
      #000 0 36%,
      rgba(0, 0, 0, 0.58) 58%,
      rgba(0, 0, 0, 0.18) 78%,
      transparent 100%
    );
    pointer-events: none;
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

  :global(html.dark) .memory-note::before,
  :global(html.dark) .memory-note::after {
    display: none;
  }

  .warn {
    margin-top: 4px;
    color: #f59e0b !important;
    font-size: 13px;
  }

  @keyframes memory-note-aurora {
    0% {
      transform: translate3d(calc(-50% - 5%), calc(-50% + 4%), 0) scale(1.04);
    }
    45% {
      transform: translate3d(calc(-50% + 4%), calc(-50% - 3%), 0) scale(1.12);
    }
    100% {
      transform: translate3d(calc(-50% - 1%), calc(-50% + 2%), 0) scale(1.08);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .memory-note::before {
      animation: none;
    }
  }

  @media (max-width: 720px) {
    .new-conversation-context {
      padding: 0 20px;
    }
  }
</style>

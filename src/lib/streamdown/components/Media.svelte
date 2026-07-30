<script lang="ts">
  import { useOpenAgentUiCapabilities } from "$lib/openagent/uiCapabilities";
  import { t } from "$lib/i18n";
  import type { Value } from "../parser";
  import { classifyMediaSource, mediaDisplayName } from "../mediaSource";

  let {
    args,
    kind,
  }: {
    args: Record<string, unknown>;
    rawArgs?: Array<[string, Value]>;
    kind: "image" | "video";
  } = $props();

  const source = $derived(classifyMediaSource(args.src));
  const caption = $derived(typeof args.caption === "string" ? args.caption.trim() : "");
  const alt = $derived(
    typeof args.alt === "string" && args.alt.trim()
      ? args.alt.trim()
      : caption || mediaDisplayName(source.value),
  );
  const controls = $derived(args.controls !== false);
  const autoplay = $derived(args.autoplay === true);
  const loop = $derived(args.loop === true);
  const muted = $derived(args.muted === true || autoplay);

  let resolvedSrc = $state("");
  let loading = $state(false);
  let errorDetail = $state("");
  const capabilities = useOpenAgentUiCapabilities();

  $effect(() => {
    const current = source;
    const currentKind = kind;
    let cancelled = false;

    resolvedSrc = "";
    errorDetail = "";

    if (current.kind === "invalid") {
      loading = false;
      errorDetail = "Invalid media source";
      return;
    }
    if (current.kind === "remote") {
      resolvedSrc = current.value;
      loading = true;
      return;
    }
    loading = true;
    void capabilities.resolveMedia(current.value, currentKind)
      .then((result) => {
        if (!cancelled) resolvedSrc = result.url;
      })
      .catch((error) => {
        if (!cancelled) {
          loading = false;
          errorDetail = typeof error === "string" ? error : String(error);
        }
      });

    return () => {
      cancelled = true;
    };
  });

  function markLoaded() {
    loading = false;
    errorDetail = "";
  }

  function markFailed() {
    loading = false;
    errorDetail = "The media resource could not be loaded";
  }
</script>

<figure class:video={kind === "video"} class="agui-media">
  <div class="media-stage" class:loading>
    {#if errorDetail}
      <div class="media-status media-error" role="status" title={errorDetail}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
          <path d="M12 8v5m0 3.5v.5"/>
          <path d="M10.4 3.7 2.6 17.2A1.9 1.9 0 0 0 4.3 20h15.4a1.9 1.9 0 0 0 1.7-2.8L13.6 3.7a1.9 1.9 0 0 0-3.2 0Z"/>
        </svg>
        <span>{$t("aguiMediaUnavailable")}</span>
      </div>
    {:else if resolvedSrc}
      {#if kind === "image"}
        <img
          src={resolvedSrc}
          {alt}
          loading="lazy"
          decoding="async"
          onload={markLoaded}
          onerror={markFailed}
        />
      {:else}
        <video
          src={resolvedSrc}
          {controls}
          {autoplay}
          {loop}
          {muted}
          playsinline
          preload="metadata"
          aria-label={alt}
          onloadedmetadata={markLoaded}
          onerror={markFailed}
        ></video>
      {/if}
    {/if}

    {#if loading}
      <div class="media-status media-loading" role="status">
        <span class="spinner" aria-hidden="true"></span>
        <span>{$t("aguiMediaLoading")}</span>
      </div>
    {/if}
  </div>

  {#if caption}
    <figcaption>{caption}</figcaption>
  {/if}
</figure>

<style>
  .agui-media {
    width: min(100%, 720px);
    margin: 10px 0;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    box-shadow: 0 1px 2px color-mix(in srgb, var(--text) 5%, transparent);
  }

  .media-stage {
    position: relative;
    display: grid;
    min-height: 132px;
    place-items: center;
    overflow: hidden;
    background:
      linear-gradient(45deg, color-mix(in srgb, var(--border) 28%, transparent) 25%, transparent 25%),
      linear-gradient(-45deg, color-mix(in srgb, var(--border) 28%, transparent) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, color-mix(in srgb, var(--border) 28%, transparent) 75%),
      linear-gradient(-45deg, transparent 75%, color-mix(in srgb, var(--border) 28%, transparent) 75%);
    background-position: 0 0, 0 8px, 8px -8px, -8px 0;
    background-size: 16px 16px;
  }

  .video .media-stage {
    min-height: 240px;
    background: #0b0b0c;
  }

  img,
  video {
    display: block;
    width: 100%;
    max-height: 540px;
    object-fit: contain;
  }

  video {
    min-height: 240px;
  }

  .media-status {
    display: flex;
    min-height: 132px;
    align-items: center;
    justify-content: center;
    gap: 9px;
    padding: 20px;
    color: var(--text-muted);
    font-size: 13px;
    text-align: center;
  }

  .media-status svg {
    width: 22px;
    height: 22px;
    flex: 0 0 auto;
  }

  .media-loading {
    position: absolute;
    inset: 0;
    min-height: 0;
    background: color-mix(in srgb, var(--surface) 82%, transparent);
    backdrop-filter: blur(3px);
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid color-mix(in srgb, var(--text-muted) 28%, transparent);
    border-top-color: var(--text-muted);
    border-radius: 999px;
    animation: spin 0.8s linear infinite;
  }

  figcaption {
    padding: 8px 11px 9px;
    border-top: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.45;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation: none;
    }
  }
</style>

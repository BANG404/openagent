<script lang="ts">
  import { useOpenAgentUiCapabilities } from "$lib/openagent/uiCapabilities";
  import type { ChatToolImage } from "$lib/types";
  import { t } from "$lib/i18n";

  let { image, alt }: { image: ChatToolImage; alt: string } = $props();
  const capabilities = useOpenAgentUiCapabilities();
  let element = $state<HTMLDivElement>();
  let source = $state<string | null>(null);
  let failed = $state(false);

  $effect(() => {
    const current = image;
    const container = element;
    source = current.blobId ? null : current.src;
    failed = false;
    if (!current.blobId || !container) return;
    let active = true;
    let requested = false;
    async function load() {
      if (requested) return;
      requested = true;
      try {
        const preview = await capabilities.readAttachmentPreview?.(
          current.blobId!,
          current.name ?? "tool-image.bin",
        );
        if (!active) return;
        if (preview?.kind === "image" && preview.data_url) source = preview.data_url;
        else failed = true;
      } catch {
        if (active) failed = true;
      }
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          void load();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(container);
    return () => {
      active = false;
      observer.disconnect();
    };
  });
</script>

<div bind:this={element} class="tool-image" aria-busy={!source && !failed}>
  {#if source}
    <img
      src={source}
      {alt}
      loading="lazy"
      onerror={() => {
        source = null;
        failed = true;
      }}
    />
  {:else if failed}
    <span role="status">{$t("attachmentPreviewUnavailable")}</span>
  {:else}
    <div class="image-skeleton" aria-label={alt}></div>
  {/if}
</div>

<style>
  .tool-image {
    min-width: 0;
    width: min(100%, 420px);
    aspect-ratio: 4 / 3;
    display: grid;
    place-items: center;
    overflow: hidden;
    border-radius: 6px;
    background: var(--surface);
  }
  img {
    display: block;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 6px;
    background: var(--surface);
  }
  .image-skeleton {
    width: 100%;
    height: 100%;
    border-radius: 6px;
    background: var(--surface);
  }
  span {
    display: block;
    padding: 12px;
    color: var(--text-muted);
  }
</style>

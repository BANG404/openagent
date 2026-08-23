<script lang="ts">
  import { isTauri } from "@tauri-apps/api/core";
  import { invoke } from "$lib/openagent/tauriClient";
  import { Dialog } from "bits-ui";
  import { tick } from "svelte";
  import {
    anchoredAttachmentPreviewScroll,
    ATTACHMENT_PREVIEW_MAX_SCALE,
    ATTACHMENT_PREVIEW_MIN_SCALE,
    clampAttachmentPreviewScale,
    attachmentPreviewScaleFromWheel,
    isAttachmentPreviewSupported,
  } from "$lib/attachmentPreview";
  import { t } from "$lib/i18n";
  import { useOpenAgentUiCapabilities } from "$lib/openagent";
  import type { ChatAttachment } from "$lib/types";
  import Tooltip from "./Tooltip.svelte";

  type PreviewPayload = {
    kind: "image" | "text" | "file";
    data_url?: string;
    text?: string;
  };

  interface Props {
    attachment: ChatAttachment;
    size?: "composer" | "message" | "strip";
    onRemove?: () => void;
    loadPreview?: (locator: string, name: string) => Promise<PreviewPayload>;
  }

  let { attachment, size = "message", onRemove, loadPreview }: Props = $props();
  let preview = $state<PreviewPayload | null>(null);
  let failed = $state(false);
  let previewOpen = $state(false);
  let previewScale = $state(1);
  let repairError = $state("");
  let reloadKey = $state(0);
  let previewViewport = $state<HTMLDivElement>();
  const uiCapabilities = useOpenAgentUiCapabilities();

  const previewCache = getPreviewCache();
  const extension = $derived(attachment.name.split(".").pop()?.toUpperCase().slice(0, 5) || "FILE");
  const previewScalePercent = $derived(`${previewScale * 100}%`);
  const previewSupported = $derived(isAttachmentPreviewSupported(attachment.name));
  const canOpenPreview = $derived(size !== "strip" && previewSupported);
  const canZoomImage = $derived(preview?.kind === "image" && Boolean(preview.data_url));

  $effect(() => {
    const locator = attachment.path;
    const name = attachment.name;
    reloadKey;
    preview = null;
    failed = false;
    repairError = "";
    if (!previewSupported) return;
    if (attachment.previewUrl && attachment.kind === "image") {
      preview = { kind: "image", data_url: attachment.previewUrl };
      return;
    }
    if ((!isTauri() && !loadPreview) || !locator) return;

    const key = `${loadPreview ? "transport" : "tauri"}\0${locator}\0${name}`;
    let request = previewCache.get(key);
    if (!request) {
      request = loadPreview
        ? loadPreview(locator, name)
        : invoke<PreviewPayload>("read_attachment_preview", { locator, name });
      previewCache.set(key, request);
    }
    request
      .then((value) => {
        if (attachment.path === locator && attachment.name === name) preview = value;
      })
      .catch(() => {
        previewCache.delete(key);
        if (attachment.path === locator && attachment.name === name) failed = true;
      });
  });

  function getPreviewCache() {
    const root = globalThis as typeof globalThis & {
      __openagentAttachmentPreviewCache?: Map<string, Promise<PreviewPayload>>;
    };
    root.__openagentAttachmentPreviewCache ??= new Map();
    return root.__openagentAttachmentPreviewCache;
  }

  function openPreview() {
    if (!canOpenPreview) return;
    previewScale = 1;
    previewOpen = true;
  }

  async function setPreviewScale(nextScale: number, clientX?: number, clientY?: number) {
    const previousScale = previewScale;
    const next = clampAttachmentPreviewScale(nextScale);
    if (next === previousScale) return;

    const viewport = previewViewport;
    if (!viewport) {
      previewScale = next;
      return;
    }
    const rect = viewport?.getBoundingClientRect();
    const pointerX = rect && clientX !== undefined ? clientX - rect.left : viewport.clientWidth / 2;
    const pointerY = rect && clientY !== undefined ? clientY - rect.top : viewport.clientHeight / 2;
    const nextScrollLeft = anchoredAttachmentPreviewScroll(
      viewport.scrollLeft,
      pointerX,
      previousScale,
      next,
    );
    const nextScrollTop = anchoredAttachmentPreviewScroll(
      viewport.scrollTop,
      pointerY,
      previousScale,
      next,
    );

    previewScale = next;
    await tick();
    viewport.scrollLeft = nextScrollLeft;
    viewport.scrollTop = nextScrollTop;
  }

  function handlePreviewWheel(event: WheelEvent) {
    if (!canZoomImage) return;
    const viewport = previewViewport;
    if (!viewport) return;
    event.preventDefault();
    const deltaPixels =
      event.deltaMode === event.DOM_DELTA_LINE
        ? event.deltaY * 16
        : event.deltaMode === event.DOM_DELTA_PAGE
          ? event.deltaY * viewport.clientHeight
          : event.deltaY;
    void setPreviewScale(
      attachmentPreviewScaleFromWheel(previewScale, deltaPixels),
      event.clientX,
      event.clientY,
    );
  }

  async function repairPreview() {
    if (!attachment.path.startsWith("sha256:")) return;
    repairError = "";
    try {
      const repaired = await uiCapabilities.repairAttachment(attachment.path, attachment.name);
      if (!repaired) return;
      previewCache.delete(`tauri\0${attachment.path}\0${attachment.name}`);
      previewCache.delete(`transport\0${attachment.path}\0${attachment.name}`);
      reloadKey += 1;
    } catch (error) {
      repairError = String(error);
    }
  }
</script>

<article
  class="attachment-preview"
  class:composer-card={size === "composer"}
  class:message-capsule={size === "message"}
  class:strip={size === "strip"}
  class:preview-disabled={!canOpenPreview}
  class:failed
>
  <Tooltip text={attachment.name}>
    {#snippet trigger(props)}
      <button
        {...props}
        class="preview-trigger"
        type="button"
        aria-disabled={!canOpenPreview}
        onclick={openPreview}
      >
        <div class="thumbnail" class:image={preview?.kind === "image"}>
          {#if preview?.kind === "image" && preview.data_url}
            <img src={preview.data_url} alt="" />
          {:else if preview?.kind === "text" && preview.text}
            <pre aria-hidden="true">{preview.text}</pre>
          {:else}
            <span class="file-fold" aria-hidden="true"></span>
            <strong>{extension}</strong>
          {/if}
        </div>
        <div class="attachment-meta">
          <span>{attachment.name}</span>
          <small>{extension}</small>
        </div>
      </button>
    {/snippet}
  </Tooltip>
  {#if onRemove}
    <Tooltip text={$t("removeAttachment")}>
      {#snippet trigger(props)}
        <button
          {...props}
          class="remove-button"
          type="button"
          aria-label={`${$t("removeAttachment")}: ${attachment.name}`}
          onclick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
        >
          <svg viewBox="0 0 14 14" aria-hidden="true">
            <path d="M3 3 L11 11 M11 3 L3 11" />
          </svg>
        </button>
      {/snippet}
    </Tooltip>
  {/if}
</article>

{#if size !== "strip"}
  <Dialog.Root bind:open={previewOpen}>
    <Dialog.Portal>
      <Dialog.Overlay class="attachment-dialog-overlay" />
      <Dialog.Content class="attachment-dialog">
        <header class="attachment-dialog-toolbar">
          <div
            class="attachment-window-edge-drag-region"
            data-tauri-drag-region
            aria-hidden="true"
          ></div>
          <Dialog.Title>{attachment.name}</Dialog.Title>
          <div class="attachment-dialog-controls">
            {#if canZoomImage}
              <Tooltip text={$t("attachmentZoomOut")}>
                {#snippet trigger(props)}
                  <button
                    {...props}
                    class="app-icon-button"
                    type="button"
                    aria-label={$t("attachmentZoomOut")}
                    disabled={previewScale <= ATTACHMENT_PREVIEW_MIN_SCALE}
                    onclick={() => void setPreviewScale(previewScale - 0.25)}
                  >
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                      <circle cx="7" cy="7" r="4.5" />
                      <path d="M10.5 10.5 14 14M4.5 7h5" />
                    </svg>
                  </button>
                {/snippet}
              </Tooltip>
              <Tooltip text={$t("attachmentFitPreview")}>
                {#snippet trigger(props)}
                  <button
                    {...props}
                    class="app-icon-button"
                    type="button"
                    aria-label={$t("attachmentFitPreview")}
                    disabled={previewScale === 1}
                    onclick={() => void setPreviewScale(1)}
                  >
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M6 3H3v3M10 3h3v3M6 13H3v-3M10 13h3v-3" />
                    </svg>
                  </button>
                {/snippet}
              </Tooltip>
              <Tooltip text={$t("attachmentZoomIn")}>
                {#snippet trigger(props)}
                  <button
                    {...props}
                    class="app-icon-button"
                    type="button"
                    aria-label={$t("attachmentZoomIn")}
                    disabled={previewScale >= ATTACHMENT_PREVIEW_MAX_SCALE}
                    onclick={() => void setPreviewScale(previewScale + 0.25)}
                  >
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                      <circle cx="7" cy="7" r="4.5" />
                      <path d="M10.5 10.5 14 14M4.5 7h5M7 4.5v5" />
                    </svg>
                  </button>
                {/snippet}
              </Tooltip>
            {/if}
            <Tooltip text={$t("closeAttachmentPreview")}>
              {#snippet trigger(props)}
                <Dialog.Close
                  {...props}
                  class="app-icon-button"
                  aria-label={$t("closeAttachmentPreview")}
                >
                  <svg viewBox="0 0 14 14" aria-hidden="true">
                    <path d="M3 3 L11 11 M11 3 L3 11" />
                  </svg>
                </Dialog.Close>
              {/snippet}
            </Tooltip>
          </div>
        </header>
        <div
          class="attachment-dialog-body"
          class:zoomable={canZoomImage}
          bind:this={previewViewport}
          data-preview-scale={previewScale}
          onwheel={handlePreviewWheel}
        >
          {#if preview?.kind === "image" && preview.data_url}
            <div
              class="attachment-image-canvas"
              style={`--attachment-preview-size: ${previewScalePercent}`}
            >
              <img src={preview.data_url} alt={attachment.name} />
            </div>
          {:else if preview?.kind === "text"}
            <pre>{preview.text ?? ""}</pre>
          {:else}
            <div class="unavailable-preview">
              <span class="file-fold" aria-hidden="true"></span>
              <strong>{extension}</strong>
              <p>{$t("attachmentPreviewUnavailable")}</p>
              {#if attachment.path.startsWith("sha256:")}
                <button type="button" onclick={repairPreview}
                  >{$t("selectOriginalAttachment")}</button
                >
              {/if}
              {#if repairError}
                <small role="alert">{repairError}</small>
              {/if}
            </div>
          {/if}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
{/if}

<style>
  .attachment-preview {
    position: relative;
    display: grid;
    width: 132px;
    min-width: 0;
    overflow: hidden;
    border: 0;
    border-radius: 11px;
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--control-shadow);
  }

  .thumbnail {
    position: relative;
    display: grid;
    height: 82px;
    place-items: center;
    overflow: hidden;
    border-bottom: 1px solid var(--border);
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--primary) 13%, var(--surface2)),
      var(--surface2)
    );
  }

  .thumbnail.image {
    background: var(--surface2);
  }

  .thumbnail img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .thumbnail pre {
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
    padding: 7px;
    color: var(--text-muted);
    background: var(--surface2);
    font:
      7px/1.35 ui-monospace,
      SFMono-Regular,
      Menlo,
      monospace;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    opacity: 0.9;
  }

  .thumbnail strong {
    z-index: 1;
    color: var(--primary);
    font-size: 11px;
    letter-spacing: 0.45px;
  }

  .file-fold {
    position: absolute;
    width: 38px;
    height: 48px;
    border: 1px solid color-mix(in srgb, var(--primary) 42%, var(--border));
    border-radius: 5px;
    background: color-mix(in srgb, var(--surface) 92%, var(--primary));
    box-shadow: 0 5px 14px var(--shadow);
  }

  .file-fold::after {
    content: "";
    position: absolute;
    top: -1px;
    right: -1px;
    width: 11px;
    height: 11px;
    border-bottom: 1px solid color-mix(in srgb, var(--primary) 42%, var(--border));
    border-left: 1px solid color-mix(in srgb, var(--primary) 42%, var(--border));
    background: var(--surface2);
    clip-path: polygon(0 0, 100% 100%, 0 100%);
  }

  .attachment-meta {
    display: grid;
    gap: 1px;
    min-width: 0;
    padding: 7px 9px 8px;
  }

  .attachment-meta span {
    overflow: hidden;
    font-size: 11px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .attachment-meta small {
    color: var(--text-muted);
    font-size: 9px;
  }

  .message-capsule {
    display: flex;
    width: fit-content;
    min-width: 92px;
    max-width: min(220px, 100%);
    height: 38px;
    border-color: var(--border);
    border-radius: 11px;
    background: var(--surface);
    box-shadow: none;
    transition:
      background 0.15s,
      transform 0.15s;
  }

  .message-capsule:hover,
  .message-capsule:focus-within {
    background: var(--interactive-state-bg);
  }

  .message-capsule:focus-within {
    box-shadow: var(--focus-ring);
  }

  .message-capsule:active {
    transform: scale(0.985);
  }

  .preview-trigger {
    display: grid;
    grid-template-columns: 38px minmax(0, 1fr);
    width: auto;
    max-width: 220px;
    min-width: 0;
    padding: 0;
    overflow: hidden;
    border: 0;
    border-radius: inherit;
    outline: none;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: zoom-in;
  }

  .preview-disabled .preview-trigger {
    cursor: default;
  }

  .composer-card {
    display: block;
    width: 112px;
    height: 112px;
    flex: 0 0 112px;
    border-radius: 18px;
    background: var(--surface2);
    box-shadow: none;
  }

  .composer-card:hover {
    background: var(--interactive-state-bg);
  }

  .composer-card:focus-within {
    box-shadow: var(--focus-ring);
  }

  .composer-card .preview-trigger {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) auto;
    width: 100%;
    height: 100%;
    padding: 0;
    overflow: hidden;
    border: 0;
    border-radius: inherit;
    outline: none;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: zoom-in;
  }

  .composer-card .thumbnail {
    height: auto;
    min-height: 0;
    border: 0;
    background: transparent;
  }

  .composer-card .thumbnail:not(.image) {
    align-content: start;
    justify-content: start;
    padding: 13px 12px 4px;
  }

  .composer-card .thumbnail pre {
    padding: 12px;
    color: var(--text-muted);
    background: transparent;
    font-size: 7px;
  }

  .composer-card .file-fold {
    display: none;
  }

  .composer-card .thumbnail strong {
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0;
  }

  .composer-card .attachment-meta {
    min-height: 34px;
    align-content: center;
    padding: 5px 12px 8px;
  }

  .composer-card .attachment-meta span {
    font-size: 12px;
    font-weight: 450;
  }

  .composer-card .attachment-meta small {
    display: none;
  }

  .composer-card .remove-button {
    top: 8px;
    right: 8px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--surface) 90%, transparent);
    color: var(--text);
    box-shadow: 0 1px 4px color-mix(in srgb, var(--shadow) 72%, transparent);
    transform: none;
    opacity: 0;
  }

  .composer-card:hover .remove-button,
  .composer-card:focus-within .remove-button {
    opacity: 1;
  }

  .composer-card .remove-button:hover {
    background: var(--interactive-state-bg);
  }

  .composer-card .remove-button:active {
    transform: scale(0.94);
  }

  .attachment-preview.strip {
    display: block;
    width: min(180px, 100%);
    height: 28px;
    flex: 0 0 auto;
    border-radius: 8px;
    box-shadow: none;
  }

  .strip .preview-trigger {
    grid-template-columns: 28px minmax(0, 1fr);
    width: 100%;
    height: 100%;
    max-width: none;
    cursor: default;
  }

  .strip .thumbnail {
    height: 28px;
    min-height: 28px;
    padding: 0;
    place-content: center;
    place-items: center;
    border-right: 1px solid var(--border);
    border-bottom: 0;
  }

  .strip .thumbnail pre {
    padding: 3px;
    font-size: 3px;
  }

  .strip .file-fold {
    width: 15px;
    height: 18px;
    border-radius: 2px;
  }

  .strip .file-fold::after {
    width: 5px;
    height: 5px;
  }

  .strip .thumbnail strong {
    font-size: 6px;
  }

  .strip .attachment-meta {
    align-content: center;
    padding: 2px 26px 2px 7px;
  }

  .strip .attachment-meta small {
    display: none;
  }

  .strip .remove-button {
    top: 3px;
    right: 3px;
    width: 22px;
    height: 22px;
    transform: none;
  }

  .message-capsule .preview-trigger {
    display: grid;
    grid-template-columns: 38px minmax(0, 1fr);
    width: auto;
    max-width: 220px;
    min-width: 0;
    padding: 0;
    overflow: hidden;
    border: 0;
    border-radius: inherit;
    outline: none;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: zoom-in;
  }

  .message-capsule .preview-trigger .thumbnail {
    width: 28px;
    height: 28px;
    margin: 5px;
    border: 0;
    border-radius: 8px;
    border-bottom: 0;
    background: var(--surface2);
  }

  .message-capsule .thumbnail pre {
    padding: 3px;
    font-size: 3px;
  }

  .message-capsule .file-fold {
    display: none;
  }

  .message-capsule .thumbnail strong {
    color: var(--text-muted);
    font-size: 8px;
    font-weight: 500;
    letter-spacing: -0.1px;
  }

  .message-capsule .attachment-meta {
    align-content: center;
    padding: 0 10px 0 5px;
  }

  .message-capsule .attachment-meta span {
    font-size: 12px;
    font-weight: 400;
  }

  .message-capsule .attachment-meta small {
    display: none;
  }

  .message-capsule .remove-button {
    right: 4px;
    width: 22px;
    height: 22px;
    opacity: 0;
    background: var(--surface);
  }

  .message-capsule:hover .remove-button,
  .message-capsule:focus-within .remove-button {
    opacity: 1;
  }

  .remove-button {
    position: absolute;
    top: 50%;
    right: 7px;
    display: inline-flex;
    width: 24px;
    height: 24px;
    padding: 0;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--text-muted);
    transform: translateY(-50%);
    transition:
      background 0.12s,
      color 0.12s,
      transform 0.12s;
  }

  .remove-button svg,
  :global(.attachment-dialog-toolbar button svg) {
    width: 12px;
    height: 12px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
  }

  .remove-button:hover {
    color: var(--text);
    background: var(--interactive-state-bg);
  }

  .remove-button:active {
    transform: translateY(-50%) scale(0.94);
  }

  :global(.attachment-dialog-overlay) {
    position: fixed;
    inset: 0;
    z-index: 2147483646;
    background: var(--surface);
  }

  :global(.attachment-dialog) {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    width: 100vw;
    height: 100vh;
    padding: 16px;
    box-sizing: border-box;
    border: 0;
    outline: none;
    background: var(--surface);
    color: var(--text);
  }

  :global(.attachment-dialog-toolbar) {
    position: absolute;
    z-index: 3;
    top: 24px;
    right: 24px;
    left: 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-width: 0;
    pointer-events: none;
  }

  :global(.attachment-dialog-toolbar h2) {
    z-index: 1;
    min-width: 0;
    overflow: hidden;
    padding: 6px 8px;
    font-size: 14px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.attachment-window-edge-drag-region) {
    position: fixed;
    z-index: 0;
    top: 0;
    right: 0;
    left: 0;
    height: 24px;
    pointer-events: auto;
  }

  :global(.attachment-dialog-controls) {
    z-index: 1;
    display: flex;
    flex: none;
    align-items: center;
    gap: 5px;
    pointer-events: auto;
  }

  :global(.attachment-dialog-controls button) {
    display: inline-flex;
    width: 30px;
    height: 30px;
    flex: none;
    padding: 0;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: color-mix(in srgb, var(--surface) 90%, transparent);
    color: var(--text-muted);
    box-shadow: var(--control-shadow);
  }

  :global(.attachment-dialog-controls button:hover:not(:disabled)) {
    background: var(--interactive-state-bg);
    color: var(--text);
  }

  :global(.attachment-dialog-controls button:focus-visible) {
    box-shadow: var(--focus-ring);
  }

  :global(.attachment-dialog-controls button:disabled) {
    opacity: 0.42;
  }

  :global(.attachment-dialog-body) {
    display: grid;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--surface) 35%, transparent);
  }

  :global(.attachment-dialog-body.zoomable) {
    cursor: zoom-in;
  }

  :global(.attachment-image-canvas) {
    display: grid;
    width: var(--attachment-preview-size);
    min-width: var(--attachment-preview-size);
    height: var(--attachment-preview-size);
    min-height: var(--attachment-preview-size);
    place-items: center;
    margin: auto;
  }

  :global(.attachment-image-canvas > img) {
    display: block;
    width: auto;
    height: auto;
    max-width: calc(100% - 56px);
    max-height: calc(100% - 56px);
    box-sizing: border-box;
    object-fit: contain;
  }

  :global(.attachment-dialog-body > pre) {
    box-sizing: border-box;
    width: min(960px, calc(100% - 56px));
    max-height: calc(100% - 112px);
    margin: auto;
    overflow: auto;
    padding: 22px;
    color: var(--text);
    background: var(--surface);
    border-radius: 9px;
    box-shadow: var(--control-shadow);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    line-height: 1.65;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  :global(.unavailable-preview) {
    display: grid;
    height: 100%;
    place-content: center;
    place-items: center;
    gap: 12px;
    color: var(--text-muted);
  }

  :global(.unavailable-preview .file-fold) {
    position: relative;
    width: 64px;
    height: 80px;
  }

  :global(.unavailable-preview strong) {
    margin-top: -58px;
    z-index: 1;
    color: var(--primary);
    font-size: 12px;
  }

  :global(.unavailable-preview p) {
    margin: 40px 0 0;
    font-size: 12px;
  }

  :global(.unavailable-preview button) {
    padding: 7px 12px;
    border: 0;
    border-radius: 7px;
    background: var(--surface);
    color: var(--text);
    font-size: 12px;
    box-shadow: var(--control-shadow);
  }

  :global(.unavailable-preview button:hover) {
    background: var(--interactive-state-bg);
  }

  :global(.unavailable-preview small) {
    max-width: 420px;
    color: var(--danger, #c33);
    font-size: 11px;
    text-align: center;
  }
</style>

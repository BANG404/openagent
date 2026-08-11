<script lang="ts">
  import { isTauri } from "@tauri-apps/api/core";
  import { invoke } from "$lib/openagent/tauriClient";
  import { Dialog } from "bits-ui";
  import { t } from "$lib/i18n";
  import { useOpenAgentUiCapabilities } from "$lib/openagent";
  import type { ChatAttachment } from "$lib/types";
  import Tooltip from "./Tooltip.svelte";

  type PreviewPayload = {
    kind: "image" | "text" | "pdf" | "file";
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
  let repairError = $state("");
  let reloadKey = $state(0);
  const uiCapabilities = useOpenAgentUiCapabilities();

  const previewCache = getPreviewCache();
  const extension = $derived(attachment.name.split(".").pop()?.toUpperCase().slice(0, 5) || "FILE");
  const canLoadPreview = $derived(
    attachment.kind === "image" ||
      /\.(svg|pdf|txt|md|markdown|json|ya?ml|toml|rtf|html?|css|csv|xml|jsx?|tsx?|py)$/i.test(
        attachment.name,
      ),
  );

  $effect(() => {
    const locator = attachment.path;
    const name = attachment.name;
    reloadKey;
    preview = null;
    failed = false;
    repairError = "";
    if (attachment.previewUrl && attachment.kind === "image") {
      preview = { kind: "image", data_url: attachment.previewUrl };
      return;
    }
    if ((!isTauri() && !loadPreview) || !locator || !canLoadPreview) return;

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
    if (size === "strip") return;
    previewOpen = true;
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
  class:failed
>
  <Tooltip text={attachment.name}>
    {#snippet trigger(props)}
      <button {...props} class="preview-trigger" type="button" onclick={openPreview}>
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
        <header>
          <Dialog.Title>{attachment.name}</Dialog.Title>
          <Tooltip text={$t("closeAttachmentPreview")}>
            {#snippet trigger(props)}
              <Dialog.Close {...props} aria-label={$t("closeAttachmentPreview")}>
                <svg viewBox="0 0 14 14" aria-hidden="true">
                  <path d="M3 3 L11 11 M11 3 L3 11" />
                </svg>
              </Dialog.Close>
            {/snippet}
          </Tooltip>
        </header>
        <div class="attachment-dialog-body">
          {#if preview?.kind === "image" && preview.data_url}
            <img src={preview.data_url} alt={attachment.name} />
          {:else if preview?.kind === "pdf" && preview.data_url}
            <iframe src={preview.data_url} title={attachment.name}></iframe>
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
    background: color-mix(in srgb, var(--surface2) 52%, var(--surface));
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
    background: color-mix(in srgb, var(--surface2) 88%, var(--text) 4%);
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
    background: var(--surface);
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
  :global(.attachment-dialog > header button svg) {
    width: 12px;
    height: 12px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
  }

  .remove-button:hover {
    color: var(--text);
    background: var(--surface2);
  }

  .remove-button:active {
    transform: translateY(-50%) scale(0.94);
  }

  :global(.attachment-dialog-overlay) {
    position: fixed;
    inset: 0;
    z-index: 1200;
    background: color-mix(in srgb, #000 58%, transparent);
    backdrop-filter: blur(5px);
  }

  :global(.attachment-dialog) {
    position: fixed;
    top: 50%;
    left: 50%;
    z-index: 1201;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    width: min(900px, calc(100vw - 48px));
    height: min(720px, calc(100vh - 48px));
    overflow: hidden;
    border: 0;
    border-radius: 14px;
    background: var(--surface);
    box-shadow: var(--raised-shadow);
    color: var(--text);
    transform: translate(-50%, -50%);
  }

  :global(.attachment-dialog > header) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-width: 0;
    padding: 10px 12px 10px 16px;
    border-bottom: 1px solid var(--border);
  }

  :global(.attachment-dialog > header h2) {
    min-width: 0;
    overflow: hidden;
    font-size: 13px;
    font-weight: 550;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.attachment-dialog > header button) {
    display: inline-flex;
    width: 28px;
    height: 28px;
    flex: none;
    padding: 0;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--text-muted);
  }

  :global(.attachment-dialog > header button:hover) {
    background: var(--surface2);
    color: var(--text);
  }

  :global(.attachment-dialog-body) {
    min-width: 0;
    min-height: 0;
    overflow: auto;
    background: var(--bg);
  }

  :global(.attachment-dialog-body > img) {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  :global(.attachment-dialog-body > iframe) {
    display: block;
    width: 100%;
    height: 100%;
    border: 0;
    background: white;
  }

  :global(.attachment-dialog-body > pre) {
    box-sizing: border-box;
    min-height: 100%;
    margin: 0;
    padding: 22px;
    color: var(--text);
    background: var(--surface);
    font:
      12px/1.65 ui-monospace,
      SFMono-Regular,
      Menlo,
      monospace;
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
    background: var(--surface2);
  }

  :global(.unavailable-preview small) {
    max-width: 420px;
    color: var(--danger, #c33);
    font-size: 11px;
    text-align: center;
  }
</style>

<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { useOpenAgentUiCapabilities } from "$lib/openagent/uiCapabilities";
  import { showToast } from "$lib/toast";
  import { t, tr } from "$lib/i18n";
  import ScrollArea from "$lib/components/ui/ScrollArea.svelte";
  import Tooltip from "$lib/components/Tooltip.svelte";
  import type { HtmlPreviewConfig } from "$lib/types";
  import type { Value } from "../parser";
  import { injectHtmlPreviewBase } from "../htmlPreviewDocument";

  let {
    args,
    htmlPreviewConfig,
    isDark = false,
  }: {
    args: Record<string, unknown>;
    rawArgs?: Array<[string, Value]>;
    htmlPreviewConfig?: HtmlPreviewConfig;
    isDark?: boolean;
  } = $props();

  let frame: HTMLIFrameElement | null = $state(null);
  let card: HTMLDivElement | null = $state(null);
  let resizeObs: ResizeObserver | null = null;
  let resizeTimer: number | null = null;
  let measuring = false;
  let expanded = $state(false);
  let fullscreen = $state(false);
  let frameHeight = $state(480);
  let busy = $state<"copy" | "png" | "open" | null>(null);
  let rawFileCode = $state("");
  let assetBaseUrl = $state("");
  let loadError = $state("");
  let loadSeq = 0;
  let expandedMessageRecord: HTMLElement | null = null;
  const capabilities = useOpenAgentUiCapabilities();

  const title = $derived(
    typeof args.title === "string" && args.title.trim() ? args.title : $t("webPreviewDefaultTitle"),
  );
  const path = $derived(typeof args.path === "string" ? args.path.trim() : "");
  const url = $derived(typeof args.url === "string" ? args.url.trim() : "");
  const code = $derived(
    rawFileCode ? injectHtmlPreviewBase(rawFileCode, assetBaseUrl, isDark ? "dark" : "light") : "",
  );
  const fixedHeight = $derived.by(() => {
    const configured = htmlPreviewConfig?.fixed_height ?? 480;
    const value = typeof args.height === "number" ? args.height : configured;
    return Math.min(Math.max(value, 160), 1200);
  });
  const displayHeight = $derived(expanded ? Math.max(frameHeight, fixedHeight) : fixedHeight);
  const viewportHeight = $derived(fullscreen ? "100%" : `${displayHeight}px`);
  const iframeHeight = $derived(fullscreen ? "100%" : `${frameHeight}px`);
  const iframeSandbox = $derived.by(() => {
    if (!url) return "allow-same-origin";
    try {
      const sameOrigin = new URL(url).origin === window.location.origin;
      return sameOrigin
        ? "allow-forms allow-scripts"
        : "allow-forms allow-same-origin allow-scripts";
    } catch {
      return "allow-forms allow-scripts";
    }
  });

  function safeFilename(ext: "png"): string {
    const base =
      title
        .trim()
        .replace(/[\\/:*?"<>|]+/g, "_")
        .replace(/\s+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "html-preview";
    return `${base}.${ext}`;
  }

  async function saveFile(filename: string, content: string, encoding: "base64") {
    const saved = await capabilities.saveDownloadFile(filename, content, encoding);
    showToast({
      title: tr("toastDownloadSuccess"),
      description: saved.location,
      descriptionFromEnd: true,
      variant: "success",
      action: saved.open ? { label: tr("toastOpenFile"), onClick: saved.open } : undefined,
    });
  }

  async function downloadImage() {
    if (!frame || busy) return;
    busy = "png";
    let restoreScroll: (() => void) | null = null;
    try {
      const doc = frame.contentDocument;
      const node = doc?.body;
      if (!doc || !node) throw new Error("Display content is not available.");

      await doc.fonts?.ready.catch(() => undefined);
      measureFrame();

      const root = doc.documentElement;
      const previousRootScrollTop = root.scrollTop;
      const previousBodyScrollTop = node.scrollTop;
      restoreScroll = () => {
        root.scrollTop = previousRootScrollTop;
        node.scrollTop = previousBodyScrollTop;
      };
      root.scrollTop = 0;
      node.scrollTop = 0;

      const exportWidth = Math.max(frame.clientWidth, 1);
      const exportHeight = Math.max(
        frameHeight,
        fixedHeight,
        root.scrollHeight,
        node.scrollHeight,
        root.offsetHeight,
        node.offsetHeight,
        1,
      );
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(node, {
        cacheBust: true,
        pixelRatio: window.devicePixelRatio || 1,
        width: exportWidth,
        height: exportHeight,
        style: {
          width: `${exportWidth}px`,
          minWidth: `${exportWidth}px`,
          maxWidth: `${exportWidth}px`,
          height: `${exportHeight}px`,
          minHeight: `${exportHeight}px`,
          overflow: "hidden",
          boxSizing: "border-box",
        },
        backgroundColor: getComputedStyle(doc.body ?? node).backgroundColor || "#ffffff",
      });
      const base64 = dataUrl.split(",", 2)[1];
      if (!base64) throw new Error("Image export produced an empty result.");
      await saveFile(safeFilename("png"), base64, "base64");
    } catch (err) {
      showToast({
        title: tr("toastDownloadFailed"),
        description:
          typeof err === "string" ? err : ((err as { message?: string })?.message ?? String(err)),
        variant: "error",
      });
    } finally {
      restoreScroll?.();
      busy = null;
    }
  }

  async function copyHtml() {
    if (busy) return;
    busy = "copy";
    try {
      const text = frame?.contentDocument?.body?.innerText?.trim() || code;
      await navigator.clipboard.writeText(text);
      showToast({
        title: "Copied",
        description: title,
        variant: "success",
      });
    } catch (err) {
      showToast({
        title: "Copy failed",
        description:
          typeof err === "string" ? err : ((err as { message?: string })?.message ?? String(err)),
        variant: "error",
      });
    } finally {
      busy = null;
    }
  }

  async function openHtmlFile() {
    if (!path || busy) return;
    busy = "open";
    try {
      await capabilities.openPath(path);
    } catch (err) {
      showToast({
        title: "Open failed",
        description:
          typeof err === "string" ? err : ((err as { message?: string })?.message ?? String(err)),
        variant: "error",
      });
    } finally {
      busy = null;
    }
  }

  async function openWebsite() {
    if (!url || busy) return;
    busy = "open";
    try {
      await capabilities.openUrl(url);
    } catch (err) {
      showToast({
        title: tr("webPreviewOpenFailed"),
        description:
          typeof err === "string" ? err : ((err as { message?: string })?.message ?? String(err)),
        variant: "error",
      });
    } finally {
      busy = null;
    }
  }

  function exitFullscreen() {
    if (!fullscreen || !card) return;
    fullscreen = false;
    card.removeAttribute("data-web-preview-fullscreen");
    expandedMessageRecord?.removeAttribute("data-web-preview-expanded");
    expandedMessageRecord = null;
  }

  function toggleFullscreen() {
    if (!card) return;
    if (fullscreen) {
      exitFullscreen();
      return;
    }
    expandedMessageRecord = card.closest<HTMLElement>(".message-record");
    expandedMessageRecord?.setAttribute("data-web-preview-expanded", "");
    card.setAttribute("data-web-preview-fullscreen", "");
    fullscreen = true;
  }

  function measureFrame() {
    if (measuring) return;
    if (!frame) return;
    const doc = frame.contentDocument;
    if (!doc) return;

    measuring = true;
    const root = doc.documentElement;
    const body = doc.body;
    const previousInlineHeight = frame.style.height;

    frame.style.height = `${fixedHeight}px`;
    frame.getBoundingClientRect();

    const nextHeight = Math.ceil(
      Math.max(
        fixedHeight,
        root.scrollHeight,
        body?.scrollHeight ?? 0,
        root.offsetHeight,
        body?.offsetHeight ?? 0,
      ),
    );

    frame.style.height = previousInlineHeight;
    frameHeight = nextHeight;
    measuring = false;
  }

  function handleLoad() {
    resizeObs?.disconnect();
    resizeObs = null;
    measureFrame();

    const doc = frame?.contentDocument;
    if (!doc) return;

    const targets = [doc.documentElement, doc.body].filter(Boolean) as Element[];
    if (targets.length && "ResizeObserver" in window) {
      resizeObs = new ResizeObserver(measureFrame);
      for (const target of targets) resizeObs.observe(target);
    }

    if (resizeTimer !== null) window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(measureFrame, 250);
  }

  onDestroy(() => {
    exitFullscreen();
    resizeObs?.disconnect();
    if (resizeTimer !== null) window.clearTimeout(resizeTimer);
  });

  onMount(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") exitFullscreen();
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  });

  $effect(() => {
    const currentPath = path;
    const seq = ++loadSeq;
    loadError = "";
    rawFileCode = "";
    assetBaseUrl = "";
    expanded = false;
    frameHeight = fixedHeight;

    if (!currentPath || url) return;

    capabilities
      .readHtmlPreview(currentPath)
      .then((preview) => {
        if (seq !== loadSeq) return;
        rawFileCode = preview.content;
        assetBaseUrl = preview.assetBaseUrl;
      })
      .catch((err) => {
        if (seq !== loadSeq) return;
        loadError =
          typeof err === "string" ? err : ((err as { message?: string })?.message ?? String(err));
      });
  });
</script>

<div class="html-card" class:fullscreen bind:this={card}>
  {#if loadError}
    <div class="empty error">{loadError}</div>
  {:else if code || url}
    <div class="actions" aria-label={title}>
      <Tooltip text={fullscreen ? $t("webPreviewExitFullscreen") : $t("webPreviewFullscreen")}>
        {#snippet trigger(props)}
          <button
            {...props}
            type="button"
            onclick={toggleFullscreen}
            aria-label={fullscreen ? $t("webPreviewExitFullscreen") : $t("webPreviewFullscreen")}
          >
            {#if fullscreen}
              <svg
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                aria-hidden="true"
              >
                <path d="M6 2.5V6H2.5M10 13.5V10h3.5M2.75 5.75 6 2.5M13.25 10.25 10 13.5" />
              </svg>
            {:else}
              <svg
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                aria-hidden="true"
              >
                <path d="M6 2.5H2.5V6M10 13.5h3.5V10M2.75 2.75 6 6M13.25 13.25 10 10" />
              </svg>
            {/if}
          </button>
        {/snippet}
      </Tooltip>
      {#if url}
        <Tooltip text={$t("webPreviewOpenExternal")}>
          {#snippet trigger(props)}
            <button
              {...props}
              type="button"
              onclick={openWebsite}
              disabled={busy !== null}
              aria-label={$t("webPreviewOpenExternal")}
            >
              {#if busy === "open"}
                <span class="busy-dot"></span>
              {:else}
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  aria-hidden="true"
                >
                  <path d="M9 2.75h4.25V7M8.25 7.75 13 3" />
                  <path
                    d="M6.75 4H4.25A1.25 1.25 0 0 0 3 5.25v6.5A1.25 1.25 0 0 0 4.25 13h6.5A1.25 1.25 0 0 0 12 11.75V9.25"
                  />
                </svg>
              {/if}
            </button>
          {/snippet}
        </Tooltip>
      {/if}
      {#if !url}
        <Tooltip text={expanded ? "Use fixed height" : "Expand to content"}>
          {#snippet trigger(props)}
            <button
              {...props}
              type="button"
              onclick={() => {
                expanded = !expanded;
                if (expanded) measureFrame();
              }}
              aria-label={expanded ? "Use fixed height" : "Expand to content"}
            >
              {#if expanded}
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5.25 2.75v3h-3" />
                  <path d="M2.75 5.75 6 2.5" />
                  <path d="M10.75 13.25v-3h3" />
                  <path d="M13.25 10.25 10 13.5" />
                </svg>
              {:else}
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M6 2.5H2.5V6" />
                  <path d="M2.75 2.75 6.25 6.25" />
                  <path d="M10 13.5h3.5V10" />
                  <path d="M13.25 13.25 9.75 9.75" />
                </svg>
              {/if}
            </button>
          {/snippet}
        </Tooltip>
      {/if}
      {#if path}
        <Tooltip text={$t("webPreviewOpenFile")}>
          {#snippet trigger(props)}
            <button
              {...props}
              type="button"
              onclick={openHtmlFile}
              disabled={busy !== null}
              aria-label={$t("webPreviewOpenFile")}
            >
              {#if busy === "open"}
                <span class="busy-dot"></span>
              {:else}
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M9 2.75h4.25V7" />
                  <path d="M8.25 7.75 13 3" />
                  <path
                    d="M6.75 4H4.25A1.25 1.25 0 0 0 3 5.25v6.5A1.25 1.25 0 0 0 4.25 13h6.5A1.25 1.25 0 0 0 12 11.75V9.25"
                  />
                </svg>
              {/if}
            </button>
          {/snippet}
        </Tooltip>
      {/if}
      {#if !url}
        <Tooltip text="Copy text">
          {#snippet trigger(props)}
            <button
              {...props}
              type="button"
              onclick={copyHtml}
              disabled={busy !== null}
              aria-label="Copy text"
            >
              {#if busy === "copy"}
                <span class="busy-dot"></span>
              {:else}
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <rect x="5.25" y="4.25" width="7" height="9" rx="1.25" />
                  <path
                    d="M3.75 11.25h-.5A1.25 1.25 0 0 1 2 10V3.25A1.25 1.25 0 0 1 3.25 2h5.5A1.25 1.25 0 0 1 10 3.25v.5"
                  />
                </svg>
              {/if}
            </button>
          {/snippet}
        </Tooltip>
        <Tooltip text="Download image">
          {#snippet trigger(props)}
            <button
              {...props}
              type="button"
              onclick={downloadImage}
              disabled={busy !== null}
              aria-label="Download image"
            >
              {#if busy === "png"}
                <span class="busy-dot"></span>
              {:else}
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M8 2.5v7" />
                  <path d="M5.25 7.25 8 10l2.75-2.75" />
                  <path d="M3 12.75h10" />
                </svg>
              {/if}
            </button>
          {/snippet}
        </Tooltip>
      {/if}
    </div>
    <ScrollArea class="preview-scroll-area" height={viewportHeight}>
      <iframe
        bind:this={frame}
        class="preview"
        {title}
        src={url || undefined}
        srcdoc={url ? undefined : code}
        sandbox={iframeSandbox}
        referrerpolicy="no-referrer"
        scrolling={url ? "auto" : "no"}
        onload={handleLoad}
        style:height={iframeHeight}
      ></iframe>
    </ScrollArea>
  {:else if path}
    <div class="empty">{$t("webPreviewLoadingFile")}</div>
  {:else}
    <div class="empty">{$t("webPreviewNoSource")}</div>
  {/if}
</div>

<style>
  .html-card {
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: visible;
    margin: 8px 0;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    color: var(--text);
  }

  .html-card.fullscreen {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    width: 100vw;
    height: 100vh;
    margin: 0;
    padding: 16px;
    border: 0;
    border-radius: 0;
    box-sizing: border-box;
  }

  .html-card.fullscreen .actions {
    top: 22px;
    right: 22px;
    opacity: 1;
  }

  .html-card.fullscreen :global(.preview-scroll-area),
  .html-card.fullscreen :global(.preview-scroll-area .ui-scroll-area-viewport),
  .html-card.fullscreen .preview {
    border-radius: 0;
  }

  .actions {
    position: absolute;
    top: 6px;
    right: 6px;
    z-index: 2;
    display: flex;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.12s;
  }

  .html-card:hover .actions,
  .actions:focus-within {
    opacity: 1;
  }

  .actions button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: color-mix(in srgb, var(--surface) 86%, transparent);
    color: var(--text-muted);
    cursor: pointer;
    transition:
      background 0.12s,
      color 0.12s,
      transform 0.12s;
  }

  .actions button:hover:not(:disabled) {
    background: var(--interactive-state-bg);
    color: var(--text);
  }

  .actions button:focus-visible {
    box-shadow: var(--focus-ring);
    outline: none;
  }

  .actions button:active:not(:disabled) {
    transform: scale(0.95);
  }

  .actions button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .actions svg {
    width: 15px;
    height: 15px;
  }

  .busy-dot {
    width: 5px;
    height: 5px;
    border-radius: 999px;
    background: currentColor;
    animation: pulse 1s ease-in-out infinite;
  }

  .preview {
    display: block;
    width: 100%;
    border: 0;
    border-radius: 7px;
    background: var(--surface);
    color-scheme: light dark;
    overflow: hidden;
  }

  :global(.preview-scroll-area) {
    border-radius: 7px;
  }

  :global(.preview-scroll-area .ui-scroll-area-viewport) {
    border-radius: inherit;
  }

  .empty {
    padding: 18px 12px;
    color: var(--text-muted);
    font-size: 13px;
  }

  .empty.error {
    color: #ef4444;
  }

  @media (hover: none), (max-width: 640px) {
    .actions {
      opacity: 1;
    }

    .actions button {
      width: 44px;
      height: 44px;
    }
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.35;
    }
  }
</style>

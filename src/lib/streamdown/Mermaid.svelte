<script lang="ts">
  import { createRawSnippet, onMount } from "svelte";
  import { on } from "svelte/events";
  import { useStreamdown } from "svelte-streamdown";
  import { showToast } from "$lib/toast";
  import Tooltip from "$lib/components/Tooltip.svelte";
  import type { MermaidConfig } from "mermaid";
  import { loadMermaid, mermaidToolFailure, renderMermaidSvg } from "./mermaidRenderer";
  import { useMermaidPanzoom } from "./useMermaidPanzoom.svelte";

  const streamdown = useStreamdown();

  const {
    token,
    id,
  }: {
    token: { text: string };
    id: string;
  } = $props();

  let mermaidReady = $state(false);
  let mermaidNode: HTMLElement | null = $state(null);
  let renderError = $state("");
  let renderGeneration = 0;

  onMount(async () => {
    await loadMermaid();
    mermaidReady = true;
  });

  const icon = (paths: string) =>
    createRawSnippet(() => ({
      render: () => `
        <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round"
          stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
          ${paths}
        </svg>`,
    }));

  const fitViewIcon = icon(
    '<path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" /><rect width="10" height="8" x="7" y="8" rx="1" />',
  );
  const zoomInIcon = icon(
    '<circle cx="11" cy="11" r="8" /><line x1="21" x2="16.65" y1="21" y2="16.65" /><line x1="11" x2="11" y1="8" y2="14" /><line x1="8" x2="14" y1="11" y2="11" />',
  );
  const zoomOutIcon = icon(
    '<circle cx="11" cy="11" r="8" /><line x1="21" x2="16.65" y1="21" y2="16.65" /><line x1="8" x2="14" y1="11" y2="11" />',
  );
  const fullscreenIcon = icon(
    '<path d="m15 15 6 6" /><path d="m15 9 6-6" /><path d="M21 16v5h-5" /><path d="M21 8V3h-5" /><path d="M3 16v5h5" /><path d="m3 21 6-6" /><path d="M3 8V3h5" /><path d="M9 9 3 3" />',
  );
  const copyIcon = icon(
    '<rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />',
  );
  const downloadIcon = icon(
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" />',
  );

  let downloadOpen = $state(false);

  async function copySourceCode() {
    try {
      await navigator.clipboard.writeText(token.text);
      showToast({ title: "Copied", description: "Mermaid source code", variant: "success" });
    } catch (err) {
      showToast({
        title: "Copy failed",
        description:
          typeof err === "string" ? err : ((err as { message?: string })?.message ?? String(err)),
        variant: "error",
      });
    }
  }

  const useIsInsideForMoreThanAQuarterSecond = () => {
    let isInside = $state(false);
    let timeout: number | undefined;

    return {
      get isInside() {
        return isInside;
      },
      attach: (node: HTMLElement) => {
        const offEnter = on(node, "mouseenter", () => {
          timeout = window.setTimeout(() => {
            isInside = true;
          }, 800);
        });
        const offLeave = on(node, "mouseleave", () => {
          isInside = false;
          clearTimeout(timeout);
        });
        return () => {
          offEnter();
          offLeave();
        };
      },
    };
  };

  const insider = useIsInsideForMoreThanAQuarterSecond();
  const panzoom = useMermaidPanzoom({
    minZoom: 0.05,
    maxZoom: 4,
    zoomSpeed: 1,
    get activateMouseWheel() {
      return insider.isInside;
    },
  });

  const renderMermaid = async (
    code: string,
    element: HTMLElement,
    config: MermaidConfig | undefined,
  ) => {
    const generation = ++renderGeneration;
    try {
      const { svg: svgString } = await renderMermaidSvg(code, config);
      if (generation !== renderGeneration) return;
      const svgTarget = element.querySelector("[data-mermaid-svg]") as HTMLElement | null;
      if (!svgTarget) return;

      renderError = "";
      svgTarget.innerHTML = svgString;
      const renderedSvg = svgTarget.querySelector(":scope > svg") as SVGSVGElement | null;
      if (renderedSvg) {
        const viewBox = renderedSvg.viewBox?.baseVal;
        const width =
          viewBox?.width ||
          Number.parseFloat(renderedSvg.getAttribute("width") || "") ||
          renderedSvg.getBBox().width ||
          800;
        const height =
          viewBox?.height ||
          Number.parseFloat(renderedSvg.getAttribute("height") || "") ||
          renderedSvg.getBBox().height ||
          600;
        renderedSvg.setAttribute("width", String(width));
        renderedSvg.setAttribute("height", String(height));
        renderedSvg.style.maxWidth = "none";
        renderedSvg.style.overflow = "visible";
      }
      requestAnimationFrame(() => panzoom.zoomToFit());
    } catch (err) {
      if (generation !== renderGeneration) return;
      renderError = mermaidToolFailure(err).error.message;
      console.warn("Mermaid rendering error:", err);
    }
  };

  function attachMermaid(node: HTMLElement) {
    mermaidNode = node;
    return () => {
      if (mermaidNode === node) mermaidNode = null;
      renderGeneration += 1;
    };
  }

  $effect(() => {
    const config = streamdown.mermaidConfig as MermaidConfig | undefined;
    if (!mermaidReady || !mermaidNode) return;
    void renderMermaid(token.text, mermaidNode, config);
  });

  function saveFile(filename: string, content: string, mimeType: string) {
    if (typeof window.__OPENAGENT_DOWNLOAD__ === "function") {
      window.__OPENAGENT_DOWNLOAD__({ filename, content, mimeType });
      return;
    }
    const link = document.createElement("a");
    link.href = `data:${mimeType};charset=utf-8,${encodeURIComponent(content)}`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function getRenderedSvg(): SVGSVGElement | null {
    const container = document.querySelector(`[data-streamdown-mermaid="${id}"]`);
    return container?.querySelector("[data-mermaid-svg] > svg") ?? null;
  }

  function cloneRenderedSvg() {
    const svg = getRenderedSvg();
    if (!svg) return null;
    const cloned = svg.cloneNode(true) as SVGSVGElement;
    cloned.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    cloned.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    const viewBox = svg.viewBox?.baseVal;
    const bbox = svg.getBBox();
    const width = viewBox?.width || bbox.width || 800;
    const height = viewBox?.height || bbox.height || 600;
    cloned.setAttribute("width", String(width));
    cloned.setAttribute("height", String(height));
    return { cloned, width, height };
  }

  function downloadSvg() {
    const cloned = cloneRenderedSvg();
    if (!cloned) return;
    saveFile(
      "mermaid-diagram.svg",
      new XMLSerializer().serializeToString(cloned.cloned),
      "image/svg+xml",
    );
    downloadOpen = false;
  }

  async function downloadPng() {
    const cloned = cloneRenderedSvg();
    if (!cloned) return;
    const svgString = new XMLSerializer().serializeToString(cloned.cloned);
    const img = new Image();
    img.width = cloned.width;
    img.height = cloned.height;
    img.onload = () => {
      const ratio = 2;
      const canvas = document.createElement("canvas");
      canvas.width = cloned.width * ratio;
      canvas.height = cloned.height * ratio;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle =
        getComputedStyle(document.documentElement).getPropertyValue("--surface").trim() ||
        "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/png");
      const content = dataUrl.split(",")[1] ?? "";
      if (typeof window.__OPENAGENT_DOWNLOAD__ === "function") {
        window.__OPENAGENT_DOWNLOAD__({
          filename: "mermaid-diagram.png",
          content,
          mimeType: "image/png",
        });
      } else {
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = "mermaid-diagram.png";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    };
    img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgString)))}`;
    downloadOpen = false;
  }
</script>

<div data-streamdown-mermaid={id}>
  {#if mermaidReady}
    <div
      style={streamdown.isMounted ? streamdown.animationBlockStyle : ""}
      class={streamdown.theme.mermaid.base}
      {@attach attachMermaid}
      {@attach insider.attach}
      data-expanded="false"
    >
      <div
        class="mermaid-window-edge-drag-region"
        data-tauri-drag-region
        data-panzoom-ignore
        aria-hidden="true"
      ></div>
      <div
        class="mermaid-window-drag-region"
        data-tauri-drag-region
        data-panzoom-ignore
        aria-hidden="true"
      ></div>
      {#if streamdown.controls.mermaid}
        <div class={`${streamdown.theme.mermaid.buttons} mermaid-controls`}>
          <button
            class={streamdown.theme.components.button}
            aria-label="Zoom to fit"
            onclick={() => panzoom.zoomToFit()}
            data-panzoom-ignore
          >
            {@render (streamdown.icons?.fitView || fitViewIcon)()}
          </button>
          <button
            class={streamdown.theme.components.button}
            aria-label="Zoom in"
            onclick={() => panzoom.zoomIn()}
            data-panzoom-ignore
          >
            {@render (streamdown.icons?.zoomIn || zoomInIcon)()}
          </button>
          <button
            class={streamdown.theme.components.button}
            aria-label="Zoom out"
            onclick={() => panzoom.zoomOut()}
            data-panzoom-ignore
          >
            {@render (streamdown.icons?.zoomOut || zoomOutIcon)()}
          </button>
          <button
            class={streamdown.theme.components.button}
            aria-label="Toggle expand"
            onclick={() => panzoom.toggleExpand()}
            data-panzoom-ignore
          >
            {@render (streamdown.icons?.fullscreen || fullscreenIcon)()}
          </button>
          <Tooltip text="Copy Mermaid source code">
            {#snippet trigger(props)}
              <button
                {...props}
                class={streamdown.theme.components.button}
                aria-label="Copy Mermaid source code"
                onclick={copySourceCode}
                data-panzoom-ignore
              >
                {@render copyIcon()}
              </button>
            {/snippet}
          </Tooltip>
          <button
            class={streamdown.theme.components.button}
            aria-label="Download diagram"
            onclick={() => (downloadOpen = !downloadOpen)}
            data-panzoom-ignore
          >
            {@render (streamdown.icons?.download || downloadIcon)()}
          </button>
          {#if downloadOpen}
            <div class="download-menu" data-panzoom-ignore>
              <button class={streamdown.theme.components.button} onclick={downloadPng}>PNG</button>
              <button class={streamdown.theme.components.button} onclick={downloadSvg}>SVG</button>
            </div>
          {/if}
        </div>
      {/if}
      {#if renderError}
        <div class="mermaid-render-error" role="alert" data-panzoom-ignore>
          <strong>Mermaid render failed</strong>
          <span>{renderError}</span>
        </div>
      {/if}
      <div {@attach panzoom.attach} data-mermaid-svg></div>
    </div>
  {:else}
    <div class={streamdown.theme.mermaid.base}></div>
  {/if}
</div>

<style>
  :global([data-streamdown-mermaid][data-expanded="true"]) {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    z-index: 2147483647;
    margin: 0;
    padding: 16px;
    box-sizing: border-box;
    background: var(--surface);
  }

  :global([data-streamdown-mermaid][data-expanded="true"] > div) {
    width: 100% !important;
    height: 100% !important;
    margin: 0 !important;
  }

  :global([data-streamdown-mermaid] > [data-expanded="true"]) {
    position: fixed;
    inset: 16px;
    width: auto;
    height: auto;
    z-index: 2147483647;
    margin: 0;
  }

  .mermaid-window-edge-drag-region,
  .mermaid-window-drag-region {
    display: none;
  }

  :global([data-streamdown-mermaid][data-expanded="true"]) .mermaid-window-edge-drag-region,
  :global([data-streamdown-mermaid] > [data-expanded="true"]) .mermaid-window-edge-drag-region {
    position: fixed;
    z-index: 3;
    top: 0;
    right: 0;
    left: 0;
    display: block;
    height: 16px;
  }

  :global([data-streamdown-mermaid][data-expanded="true"]) .mermaid-window-drag-region,
  :global([data-streamdown-mermaid] > [data-expanded="true"]) .mermaid-window-drag-region {
    position: absolute;
    z-index: 1;
    top: 0;
    right: 252px;
    left: 0;
    display: block;
    height: 44px;
  }

  :global(div[id^="dmermaid-"]) {
    position: absolute !important;
    left: -9999px !important;
    top: -9999px !important;
    visibility: hidden !important;
    pointer-events: none !important;
  }

  .download-menu {
    position: absolute;
    right: 0;
    top: calc(100% + 4px);
    display: flex;
    flex-direction: column;
    min-width: 72px;
    padding: var(--menu-content-padding);
    border: 1px solid var(--border);
    border-radius: var(--menu-content-radius);
    background: var(--surface);
    box-shadow: 0 8px 24px var(--shadow);
  }

  .download-menu button + button {
    margin-top: var(--menu-item-stack-gap);
  }

  /* The SVG canvas is absolutely positioned and rendered after the controls.
     Keep the controls in their own stacking layer so the canvas cannot absorb
     clicks intended for the top-right actions. */
  .mermaid-controls {
    z-index: 2;
    pointer-events: auto;
  }

  .mermaid-render-error {
    position: absolute;
    inset: 52px 16px 16px;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 6px;
    padding: 16px;
    color: var(--text);
    font: 13px/1.45 var(--font-mono, ui-monospace, monospace);
    overflow: auto;
  }

  .mermaid-render-error strong {
    color: var(--danger);
    font-family: inherit;
  }
</style>

<script lang="ts">
  import Tooltip from "$lib/components/Tooltip.svelte";
  import { useOpenAgentUiCapabilities } from "$lib/openagent";
  import type { Value } from "../parser";
  import { getFaviconSources } from "../urlFavicon";

  let {
    args,
  }: {
    args: Record<string, unknown>;
    rawArgs?: Array<[string, Value]>;
  } = $props();

  const href = $derived(typeof args.href === "string" ? args.href : "");
  const title = $derived(typeof args.title === "string" ? args.title : "");
  const capabilities = useOpenAgentUiCapabilities();

  const hostname = $derived.by(() => {
    try {
      return new URL(href).hostname.replace(/^www\./, "");
    } catch {
      return href;
    }
  });

  const faviconSources = $derived(getFaviconSources(href));

  let faviconIndex = $state(0);
  let faviconLoaded = $state(false);
  const faviconSrc = $derived(faviconSources[faviconIndex] ?? "");

  $effect(() => {
    href;
    faviconIndex = 0;
    faviconLoaded = false;
  });

  function handleFaviconError() {
    faviconLoaded = false;
    if (faviconIndex < faviconSources.length - 1) {
      faviconIndex += 1;
    }
  }

  async function open(e: MouseEvent) {
    e.preventDefault();
    if (!href) return;
    try {
      await capabilities.openUrl(href);
    } catch (err) {
      console.warn("openUrl failed", err);
    }
  }
</script>

<Tooltip text={href}>
  <a class="url-ref" {href} onclick={open}>
    <span class="site-icon" class:loaded={faviconLoaded} aria-hidden="true">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M7 9a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2l-1 1"/>
        <path d="M9 7a3 3 0 0 0-4.2 0l-2 2a3 3 0 0 0 4.2 4.2l1-1"/>
      </svg>
      {#if faviconSrc}
        <img
          src={faviconSrc}
          alt=""
          loading="lazy"
          decoding="async"
          referrerpolicy="no-referrer"
          onload={() => (faviconLoaded = true)}
          onerror={handleFaviconError}
        />
      {/if}
    </span>
    <span class="label">{title || hostname}</span>
    {#if title}<span class="host">{hostname}</span>{/if}
  </a>
</Tooltip>

<style>
  .url-ref {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    padding: 1px 7px 1px 6px;
    margin: 0 2px;
    border-radius: 5px;
    border: 1px solid var(--border);
    background: var(--surface2);
    color: var(--primary);
    font-size: 0.92em;
    line-height: 1.3;
    text-decoration: none;
    vertical-align: baseline;
    transition: background 0.12s, border-color 0.12s;
  }
  .url-ref:hover {
    background: var(--surface);
    border-color: var(--primary);
  }
  .site-icon {
    position: relative;
    width: 12px;
    height: 12px;
    flex: 0 0 12px;
    color: var(--text-muted);
    transform: translateY(1px);
  }
  .site-icon svg,
  .site-icon img {
    position: absolute;
    inset: 0;
    width: 12px;
    height: 12px;
  }
  .site-icon svg {
    transition: opacity 0.12s;
  }
  .site-icon img {
    border-radius: 2px;
    object-fit: contain;
    opacity: 0;
    transition: opacity 0.12s;
  }
  .site-icon.loaded svg {
    opacity: 0;
  }
  .site-icon.loaded img {
    opacity: 1;
  }
  .label {
    font-size: 0.95em;
  }
  .host {
    color: var(--text-muted);
    font-size: 0.82em;
    margin-left: 2px;
  }
</style>

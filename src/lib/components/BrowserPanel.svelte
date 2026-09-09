<script lang="ts">
  import { onMount } from "svelte";
  import { useOpenAgentUiCapabilities } from "$lib/openagent/uiCapabilities";
  import { normalizeBrowserAddress } from "$lib/browserNavigation";
  import { browserViewportScale } from "$lib/browserViewportScale";
  import { t } from "$lib/i18n";
  import Tooltip from "./Tooltip.svelte";

  const capabilities = useOpenAgentUiCapabilities();
  let address = $state("");
  let history = $state<string[]>([]);
  let historyIndex = $state(-1);
  let frameVersion = $state(0);
  let loading = $state(false);
  let addressError = $state(false);
  let viewportElement = $state<HTMLDivElement | null>(null);
  let viewportWidth = $state(0);
  const currentUrl = $derived(history[historyIndex] ?? "");
  const pageScale = $derived(browserViewportScale(viewportWidth));
  const canGoBack = $derived(historyIndex > 0);
  const canGoForward = $derived(historyIndex >= 0 && historyIndex < history.length - 1);

  function navigate(rawAddress = address): void {
    const url = normalizeBrowserAddress(rawAddress);
    if (!url) {
      addressError = true;
      return;
    }
    addressError = false;
    address = url;
    history = [...history.slice(0, historyIndex + 1), url];
    historyIndex = history.length - 1;
    loading = true;
    frameVersion += 1;
  }

  function moveHistory(offset: number): void {
    const nextIndex = historyIndex + offset;
    if (nextIndex < 0 || nextIndex >= history.length) return;
    historyIndex = nextIndex;
    address = history[nextIndex];
    addressError = false;
    loading = true;
    frameVersion += 1;
  }

  function refresh(): void {
    if (!currentUrl) return;
    loading = true;
    frameVersion += 1;
  }

  function openExternal(): void {
    if (currentUrl) void capabilities.openUrl(currentUrl);
  }

  onMount(() => {
    if (!viewportElement) return;
    const observer = new ResizeObserver(([entry]) => {
      viewportWidth = entry.contentRect.width;
    });
    observer.observe(viewportElement);
    viewportWidth = viewportElement.clientWidth;
    return () => observer.disconnect();
  });
</script>

<section class="browser-panel" aria-label={$t("browserPanel")}>
  <form class="browser-toolbar" onsubmit={(event) => (event.preventDefault(), navigate())}>
    <div class="browser-actions">
      <Tooltip text={$t("browserBack")}>
        {#snippet trigger(props)}
          <button {...props} type="button" disabled={!canGoBack} onclick={() => moveHistory(-1)}>
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"
              ><path d="m9.5 3.5-4.5 4.5 4.5 4.5" /></svg
            >
          </button>
        {/snippet}
      </Tooltip>
      <Tooltip text={$t("browserForward")}>
        {#snippet trigger(props)}
          <button {...props} type="button" disabled={!canGoForward} onclick={() => moveHistory(1)}>
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"
              ><path d="m6.5 3.5 4.5 4.5-4.5 4.5" /></svg
            >
          </button>
        {/snippet}
      </Tooltip>
      <Tooltip text={$t("browserRefresh")}>
        {#snippet trigger(props)}
          <button {...props} type="button" disabled={!currentUrl} onclick={refresh}>
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"
              ><path d="M13 5.5V2.75l-1.45 1.4A5.25 5.25 0 1 0 13.2 9" /><path
                d="M13 2.75h-2.75"
              /></svg
            >
          </button>
        {/snippet}
      </Tooltip>
    </div>

    <label class:invalid={addressError}>
      <span class="sr-only">{$t("browserAddress")}</span>
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"
        ><circle cx="8" cy="8" r="5.5" /><path
          d="M2.75 8h10.5M8 2.5c1.4 1.5 2.1 3.33 2.1 5.5S9.4 12 8 13.5C6.6 12 5.9 10.17 5.9 8S6.6 4 8 2.5Z"
        /></svg
      >
      <input
        bind:value={address}
        aria-invalid={addressError}
        placeholder={$t("browserAddressPlaceholder")}
        autocomplete="url"
        spellcheck="false"
        oninput={() => (addressError = false)}
      />
    </label>

    <Tooltip text={$t("browserGo")}>
      {#snippet trigger(props)}
        <button {...props} class="go-button" type="submit" disabled={!address.trim()}>
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"
            ><path d="M3 8h9M8.5 3.5 13 8l-4.5 4.5" /></svg
          >
        </button>
      {/snippet}
    </Tooltip>
    <Tooltip text={$t("webPreviewOpenExternal")}>
      {#snippet trigger(props)}
        <button {...props} type="button" disabled={!currentUrl} onclick={openExternal}>
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"
            ><path d="M9 3h4v4M13 3 7.5 8.5" /><path
              d="M7 4H4a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V9"
            /></svg
          >
        </button>
      {/snippet}
    </Tooltip>
  </form>

  <div
    class="browser-viewport"
    class:loading
    bind:this={viewportElement}
    style:--browser-page-scale={pageScale}
  >
    {#if currentUrl}
      {#key frameVersion}
        <iframe
          src={currentUrl}
          title={$t("browserPage")}
          sandbox="allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
          referrerpolicy="no-referrer"
          onload={() => (loading = false)}
        ></iframe>
      {/key}
      {#if loading}<div class="loading-bar" aria-label={$t("browserLoading")}></div>{/if}
    {:else}
      <div class="browser-empty">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"
          ><circle cx="12" cy="12" r="8.5" /><path
            d="M3.5 12h17M12 3.5c2.2 2.35 3.3 5.18 3.3 8.5s-1.1 6.15-3.3 8.5C9.8 18.15 8.7 15.32 8.7 12S9.8 5.85 12 3.5Z"
          /></svg
        >
        <p>{$t("browserEmpty")}</p>
      </div>
    {/if}
  </div>
</section>

<style>
  .browser-panel {
    display: flex;
    min-width: 0;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    container-type: inline-size;
  }
  .browser-toolbar {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 6px;
    padding: 7px;
    border-bottom: 1px solid var(--border);
  }
  .browser-actions {
    display: flex;
    flex: 0 0 auto;
    gap: 2px;
  }
  button {
    display: grid;
    width: 30px;
    height: 30px;
    flex: 0 0 30px;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }
  button:hover:not(:disabled),
  button:focus-visible {
    background: var(--interactive-state-bg);
    color: var(--text);
    outline: none;
  }
  button:focus-visible {
    box-shadow: var(--focus-ring);
  }
  button:disabled {
    cursor: default;
    opacity: 0.34;
  }
  button:active:not(:disabled) {
    transform: scale(0.95);
  }
  button svg,
  label svg {
    width: 16px;
    height: 16px;
    stroke: currentColor;
    stroke-width: 1.45;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  label {
    display: flex;
    min-width: 80px;
    height: 30px;
    flex: 1;
    align-items: center;
    gap: 6px;
    box-sizing: border-box;
    padding: 0 9px;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--surface2);
    color: var(--text-muted);
  }
  label:focus-within {
    border-color: color-mix(in srgb, var(--primary) 58%, var(--border));
    box-shadow: var(--focus-ring);
    color: var(--text);
  }
  label.invalid {
    border-color: #b42318;
  }
  label svg {
    flex: 0 0 14px;
    width: 14px;
    height: 14px;
  }
  input {
    min-width: 0;
    width: 100%;
    padding: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--text);
    font-size: 11px;
    letter-spacing: 0;
  }
  input::placeholder {
    color: var(--text-muted);
  }
  .go-button {
    background: var(--primary);
    color: white;
  }
  .go-button:hover:not(:disabled),
  .go-button:focus-visible {
    background: var(--primary-hover, var(--primary));
    color: white;
  }
  .browser-viewport {
    position: relative;
    display: grid;
    min-width: 0;
    min-height: 0;
    flex: 1;
    overflow: hidden;
    background: white;
  }
  iframe {
    width: calc(100% / var(--browser-page-scale));
    height: calc(100% / var(--browser-page-scale));
    border: 0;
    background: white;
    transform: scale(var(--browser-page-scale));
    transform-origin: top left;
  }
  .loading-bar {
    position: absolute;
    inset: 0 auto auto 0;
    width: 42%;
    height: 2px;
    background: var(--primary);
    animation: browser-loading 1.1s ease-in-out infinite;
  }
  .browser-empty {
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 10px;
    padding: 24px;
    background: var(--surface);
    color: var(--text-muted);
    text-align: center;
  }
  .browser-empty svg {
    width: 30px;
    height: 30px;
    stroke: currentColor;
    stroke-width: 1.25;
  }
  .browser-empty p {
    max-width: 220px;
    margin: 0;
    font-size: 11px;
    line-height: 1.45;
  }
  @keyframes browser-loading {
    0% {
      transform: translateX(-110%);
    }
    55% {
      transform: translateX(125%);
    }
    100% {
      transform: translateX(250%);
    }
  }
  @container (max-width: 280px) {
    .browser-toolbar {
      flex-wrap: wrap;
    }
    label {
      flex-basis: calc(100% - 72px);
    }
    .browser-actions {
      order: 2;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .loading-bar {
      animation: none;
      width: 100%;
    }
  }
</style>

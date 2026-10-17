<script lang="ts">
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { onMount } from "svelte";
  import { Tooltip as TooltipPrimitive } from "bits-ui";
  import LoadingSkeleton from "./LoadingSkeleton.svelte";
  import WindowControls from "./WindowControls.svelte";
  import { detectWindowPlatform } from "$lib/windowPlatform";
  import { t } from "$lib/i18n";

  const platform = detectWindowPlatform();
  let label = $derived($t("shellStarting"));
  let slow = $state(false);
  onMount(() => {
    const timer = setTimeout(() => {
      slow = true;
    }, 3000);
    return () => clearTimeout(timer);
  });
</script>

<TooltipPrimitive.Provider>
  <div class="startup-shell" data-module="startup-loading" aria-busy="true">
    <header data-tauri-drag-region>
      <span data-tauri-drag-region>OpenAgent</span>
      {#if platform !== "linux"}
        <WindowControls
          onMinimize={() => void getCurrentWindow().minimize()}
          onMaximize={() => getCurrentWindow().toggleMaximize()}
          onClose={() => void getCurrentWindow().close()}
        />
      {/if}
    </header>
    <div class="startup-body">
      <aside aria-hidden="true"><LoadingSkeleton variant="sidebar" /></aside>
      <main>
        <div class="startup-composer">
          <p role="status" aria-live="polite">{label}</p>
          {#if slow}<p class="startup-slow" role="status">{$t("startupTakingLonger")}</p>{/if}
          <LoadingSkeleton variant="composer" {label} showApprovalMode showWorkspaceSwitcher />
        </div>
      </main>
    </div>
  </div>
</TooltipPrimitive.Provider>

<style>
  .startup-shell {
    height: 100dvh;
    display: flex;
    flex-direction: column;
    color: var(--foreground);
  }
  header {
    height: var(--desktop-titlebar-height);
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-left: 12px;
    font-size: 12px;
  }
  .startup-body {
    display: flex;
    flex: 1;
    min-height: 0;
    padding: 0 8px 8px;
  }
  aside {
    width: 240px;
    flex: none;
    padding: 12px 8px;
  }
  main {
    flex: 1;
    min-width: 0;
    display: grid;
    place-items: center;
    padding: 24px;
    border-radius: var(--radius);
    background: var(--card);
  }
  .startup-composer {
    width: min(100%, 760px);
  }
  p {
    text-align: center;
    color: var(--muted-foreground);
    font-size: 13px;
    margin: 0 0 20px;
  }
  @media (max-width: 700px) {
    aside {
      display: none;
    }
  }
</style>

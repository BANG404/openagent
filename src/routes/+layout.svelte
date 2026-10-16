<script lang="ts">
  import { onMount } from "svelte";
  import "../app.css";
  import { installFrontendDiagnostics } from "$lib/frontendDiagnostics";
  import { installScrollbarActivity } from "$lib/scrollbarActivity";
  import { desktopExitProgress } from "$lib/desktopExit";
  import DesktopExitProgress from "$lib/components/DesktopExitProgress.svelte";

  let { children } = $props();

  onMount(() => {
    const uninstallDiagnostics = installFrontendDiagnostics();
    const uninstallScrollbarActivity = installScrollbarActivity();
    const blockExitInput = (event: KeyboardEvent) => {
      if (!$desktopExitProgress) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener("keydown", blockExitInput, true);

    return () => {
      uninstallDiagnostics();
      uninstallScrollbarActivity();
      window.removeEventListener("keydown", blockExitInput, true);
    };
  });
</script>

<div class="application-content" inert={$desktopExitProgress !== null}>
  {@render children()}
</div>
{#if $desktopExitProgress}
  <DesktopExitProgress progress={$desktopExitProgress} />
{/if}

<style>
  .application-content {
    display: contents;
  }
</style>

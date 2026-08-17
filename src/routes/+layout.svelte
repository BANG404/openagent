<script lang="ts">
  import { onMount } from "svelte";
  import "../app.css";
  import { installFrontendDiagnostics } from "$lib/frontendDiagnostics";
  import { installScrollbarActivity } from "$lib/scrollbarActivity";

  let { children } = $props();

  onMount(() => {
    const uninstallDiagnostics = installFrontendDiagnostics();
    const uninstallScrollbarActivity = installScrollbarActivity();

    return () => {
      uninstallDiagnostics();
      uninstallScrollbarActivity();
    };
  });
</script>

{@render children()}

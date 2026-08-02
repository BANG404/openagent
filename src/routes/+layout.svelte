<script lang="ts">
  import { onMount } from "svelte";
  import "../app.css";
  import { installFrontendDiagnostics } from "$lib/frontendDiagnostics";

  let { children } = $props();

  onMount(installFrontendDiagnostics);
</script>

{@render children()}

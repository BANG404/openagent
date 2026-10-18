<script lang="ts">
  import { Tooltip } from "bits-ui";
  import FullscreenSurface from "$lib/components/FullscreenSurface.svelte";

  let { onClose }: { onClose: () => void } = $props();
</script>

<Tooltip.Provider>
  <FullscreenSurface
    open
    title="OpenAgent"
    onMinimize={() => {}}
    onMaximize={() => {}}
    onCloseWindow={() => {}}
    {onClose}
  >
    <p style="padding: 24px">OpenAgent</p>
  </FullscreenSurface>
</Tooltip.Provider>

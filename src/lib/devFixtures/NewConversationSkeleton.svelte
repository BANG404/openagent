<script lang="ts">
  import type { ComponentProps } from "svelte";
  import { Tooltip } from "bits-ui";
  import ConversationSurface from "$lib/components/ConversationSurface.svelte";

  let props: ComponentProps<typeof ConversationSurface> = $props();
</script>

<Tooltip.Provider>
  <ConversationSurface {...props} />
</Tooltip.Provider>

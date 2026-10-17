<script lang="ts">
  import { Tooltip } from "bits-ui";
  import Chart from "$lib/streamdown/components/Chart.svelte";
  import MermaidToolPreview from "$lib/components/MermaidToolPreview.svelte";
</script>

<Tooltip.Provider>
  <Chart
    args={{
      type: "bar",
      title: "Live palette / 实时配色",
      labels: ["A", "B"],
      data: [3, 5],
      height: 180,
    }}
  />
  <MermaidToolPreview args={{ source: "graph TD; A[Theme] --> B[Live]" }} />
</Tooltip.Provider>

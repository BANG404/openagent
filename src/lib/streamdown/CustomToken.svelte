<script lang="ts">
  import type { ComponentToken } from "./extensions";
  import { evalArgs } from "./runtime";
  import FileCard from "./components/File.svelte";
  import UrlCard from "./components/Url.svelte";
  import ChartCard from "./components/Chart.svelte";
  import HtmlPreview from "./components/Html.svelte";
  import Media from "./components/Media.svelte";
  import Skeleton from "./components/Skeleton.svelte";
  import type { HtmlPreviewConfig } from "$lib/types";

  let {
    token,
    htmlPreviewConfig,
  }: {
    token: ComponentToken;
    htmlPreviewConfig?: HtmlPreviewConfig;
  } = $props();

  const args = $derived(evalArgs(token.args));
</script>

{#if token.partial}
  <Skeleton name={token.name} />
{:else if token.name === "File"}
  <FileCard {args} rawArgs={token.args} />
{:else if token.name === "Url" || token.name === "Link"}
  <UrlCard {args} rawArgs={token.args} />
{:else if token.name === "Chart"}
  <ChartCard {args} rawArgs={token.args} />
{:else if token.name === "Image"}
  <Media {args} rawArgs={token.args} kind="image" />
{:else if token.name === "Video"}
  <Media {args} rawArgs={token.args} kind="video" />
{:else if token.name === "Html"}
  <HtmlPreview {args} rawArgs={token.args} {htmlPreviewConfig} />
{:else}
  <!-- Unknown component: render the raw call so it's not silently swallowed. -->
  <code class="unknown-component">{token.raw}</code>
{/if}

<style>
  .unknown-component {
    display: inline-block;
    padding: 1px 6px;
    border: 1px dashed var(--border);
    border-radius: 4px;
    background: var(--surface2);
    color: var(--text-muted);
    font-size: 12px;
  }
</style>

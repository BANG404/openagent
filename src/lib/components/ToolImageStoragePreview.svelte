<script lang="ts">
  import { onMount } from "svelte";
  import ToolCallCard from "./ToolCallCard.svelte";
  import { desktopOpenAgent } from "$lib/openagent/tauriClient";
  import {
    provideOpenAgentUiCapabilities,
    useOpenAgentUiCapabilities,
  } from "$lib/openagent/uiCapabilities";
  import type { ChatToolImage } from "$lib/types";

  const capabilities = useOpenAgentUiCapabilities();
  let ready = $state(false);
  let reads = $state(0);
  let epoch = $state(0);
  let missing = $state(false);
  let duplicate = $state(false);
  let blob = $state("");
  let failure = $state("");
  provideOpenAgentUiCapabilities({
    ...capabilities,
    async readAttachmentPreview(locator, name) {
      reads += 1;
      await new Promise((resolve) => setTimeout(resolve, 700));
      return desktopOpenAgent.invokeProduct("read_attachment_preview", { locator, name });
    },
  });
  const references = $derived<ChatToolImage[]>(
    blob
      ? [
          {
            src: blob,
            blobId: missing ? `sha256:${"0".repeat(64)}` : blob,
            name: "storage-fixture.png",
            mimeType: "image/png",
          },
        ]
      : [],
  );
  const images = $derived(duplicate ? [...references, ...references] : references);
  onMount(() => {
    void desktopOpenAgent
      .invokeProduct("mcp_app_upload_file", {
        name: "storage-fixture.png",
        mime_type: "image/png",
        content_base64:
          "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAHUlEQVR4nGPUrPz/n4ECwESJ5lEDRg0YNWAwGQAA55ICwMeKXAUAAAAASUVORK5CYII=",
      })
      .then((file) => {
        blob = file.fileId;
        ready = true;
      })
      .catch((cause) => {
        failure = String(cause);
      });
  });
</script>

<main class="image-storage-preview" data-ready={ready} data-reads={reads} data-epoch={epoch}>
  <p>Image storage preview</p>
  <button
    data-reload-image
    onclick={() => {
      epoch += 1;
    }}>Reload stored reference</button
  >
  <button
    data-missing-image
    onclick={() => {
      missing = !missing;
      epoch += 1;
    }}>Toggle unavailable image</button
  >
  <output data-image-blob>{blob}</output>
  <button
    data-duplicate-image
    onclick={() => {
      duplicate = !duplicate;
      epoch += 1;
    }}>Toggle repeated image</button
  >
  {#if failure}<p role="alert">{failure}</p>{/if}
  <section class="image-fixture" data-image-fixture>
    {#if ready}
      {#key epoch}
        <ToolCallCard
          name="screenshot"
          args={"{}"}
          result="Stored screenshot"
          {images}
          expanded={true}
          argHint=""
          onToggle={() => {}}
        />
      {/key}
    {/if}
  </section>
</main>

<style>
  .image-storage-preview {
    min-height: 1600px;
    padding: 32px;
    color: var(--foreground);
    background: var(--conversation-surface);
  }
  output {
    display: block;
    overflow-wrap: anywhere;
    margin: 16px 0;
  }
  .image-fixture {
    margin-top: 1200px;
    max-width: 640px;
  }
</style>

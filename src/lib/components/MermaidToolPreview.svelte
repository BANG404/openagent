<script lang="ts">
  import { Streamdown } from "svelte-streamdown";
  import Mermaid from "$lib/streamdown/Mermaid.svelte";
  import type { MermaidConfig } from "$lib/mermaidTheme";
  import { t } from "$lib/i18n";

  type JsonObject = Record<string, unknown>;

  interface Props {
    args: JsonObject;
    result?: string;
    mermaidConfig?: MermaidConfig;
  }

  let { args, result, mermaidConfig }: Props = $props();

  const title = $derived(typeof args.title === "string" ? args.title.trim() : "");
  const source = $derived(typeof args.source === "string" ? args.source : "");
  const markdown = $derived(source ? `\`\`\`\`mermaid\n${source}\n\`\`\`\`` : "");
  const parsedResult = $derived.by((): JsonObject | null => {
    if (!result) return null;
    try {
      const parsed = JSON.parse(result);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as JsonObject
        : null;
    } catch {
      return null;
    }
  });
  const error = $derived.by(() => {
    if (!parsedResult || parsedResult.ok !== false) return null;
    const value = parsedResult.error;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const detail = value as JsonObject;
    return {
      message: typeof detail.message === "string" ? detail.message : "Mermaid render failed",
      line: typeof detail.line === "number" ? detail.line : null,
      column: typeof detail.column === "number" ? detail.column : null,
    };
  });
</script>

<section class="mermaid-tool-preview" data-mermaid-tool-preview>
  {#if title}<div class="title">{title}</div>{/if}

  {#if source && !error}
    <Streamdown
      content={markdown}
      controls={{ table: false }}
      components={{ mermaid: Mermaid }}
      {mermaidConfig}
    />
  {:else if !source}
    <p class="empty">{$t("mermaidNoSource")}</p>
  {/if}

  {#if error}
    <div class="error" role="alert">
      <strong>
        {$t("mermaidRenderError")}{error.line !== null ? ` (${error.line}${error.column !== null ? `:${error.column}` : ""})` : ""}
      </strong>
      <pre>{error.message}</pre>
    </div>
  {/if}
</section>

<style>
  .mermaid-tool-preview {
    margin: 12px 0;
  }

  .title {
    margin: 0 0 8px;
    color: var(--text);
    font-size: 13px;
    font-weight: 500;
    text-align: center;
  }

  .empty {
    margin: 0;
    padding: 12px 0;
    color: var(--text-muted);
    font-size: 13px;
  }

  .error {
    margin-top: 8px;
    padding: 10px 12px;
    border-radius: 8px;
    background: color-mix(in srgb, #b42318 6%, var(--surface));
    color: var(--text);
  }

  .error strong {
    display: block;
    margin-bottom: 6px;
    color: #b42318;
    font-size: 12px;
  }

  .error pre {
    max-height: 180px;
    margin: 0;
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font: 12px/1.45 var(--font-mono, ui-monospace, monospace);
  }

  :global(.mermaid-tool-preview [data-streamdown-mermaid] > div) {
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
  }
</style>

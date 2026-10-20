<script lang="ts">
  import { onMount } from "svelte";
  import { Tooltip } from "bits-ui";
  import { Streamdown } from "svelte-streamdown";
  import Mermaid from "$lib/streamdown/Mermaid.svelte";
  import CustomToken from "$lib/streamdown/CustomToken.svelte";
  import { customExtensions, type ComponentToken } from "$lib/streamdown/extensions";
  import { chatMarkdownTheme } from "$lib/streamdown/chatMarkdownTheme";
  import MermaidToolPreview from "$lib/components/MermaidToolPreview.svelte";
  import McpAppFrame from "$lib/components/McpAppFrame.svelte";

  let { html }: { html: string } = $props();
  let source = $state("flowchart LR\nStart -->|next|Done");
  onMount(() => {
    const change = (event: Event) => (source = (event as CustomEvent<string>).detail);
    window.addEventListener("mermaid-theme-source", change);
    return () => window.removeEventListener("mermaid-theme-source", change);
  });
</script>

<Tooltip.Provider>
  <main id="mermaid-theme-fixture">
    <section data-renderer="markdown">
      <h2>Markdown</h2>
      <Streamdown
        content={`\`\`\`mermaid\n${source}\n\`\`\``}
        components={{ mermaid: Mermaid }}
        theme={chatMarkdownTheme}
      />
    </section>
    <section data-renderer="agui">
      <h2>AGUI Mermaid</h2>
      <Streamdown
        content={`Mermaid(source: ${JSON.stringify(source)})`}
        components={{ mermaid: Mermaid }}
        extensions={customExtensions}
        theme={chatMarkdownTheme}
      >
        {#snippet children({ token })}
          {#if (token as ComponentToken).type === "component"}
            <CustomToken token={token as ComponentToken} />
          {/if}
        {/snippet}
      </Streamdown>
    </section>
    <section data-renderer="legacy">
      <h2>Historical tool</h2>
      <MermaidToolPreview args={{ source }} />
    </section>
    <section data-renderer="plugin">
      <h2>Mermaid MCP App</h2>
      <McpAppFrame
        invocation={{
          descriptor: {
            server_id: "mermaid-theme-fixture",
            tool_name: "render_mermaid",
            resource_uri: "ui://mermaid/editor.html",
            visibility: ["model", "app"],
          },
          resource: {
            uri: "ui://mermaid/editor.html",
            mime_type: "text/html;profile=mcp-app",
            text: html,
          },
          arguments: { source },
          structured_content: { source, status: "prepared" },
          content: [],
          is_error: false,
        }}
      />
    </section>
  </main>
</Tooltip.Provider>

<style>
  main {
    position: fixed;
    inset: 40px 0 0;
    z-index: 100;
    overflow: auto;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
    padding: 16px;
    background: var(--card);
    color: var(--card-foreground);
  }
  section {
    min-width: 0;
  }
  h2 {
    font-size: 14px;
    margin: 0 0 8px;
  }
</style>

<script lang="ts">
  import type { Locale } from "$lib/i18n";
  import { provideOpenAgentUiCapabilities, type OpenAgentUiCapabilities } from "$lib/openagent";
  import Media from "$lib/streamdown/components/Media.svelte";

  let { locale }: { locale: Locale } = $props();

  const embeddedSvg = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop stop-color="#6d5dfc"/>
          <stop offset="1" stop-color="#24b6a6"/>
        </linearGradient>
      </defs>
      <rect width="640" height="360" rx="32" fill="url(#g)"/>
      <circle cx="320" cy="155" r="72" fill="white" fill-opacity=".9"/>
      <path d="M278 165l30 30 60-75" fill="none" stroke="#4f46e5" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="320" y="286" text-anchor="middle" font-family="sans-serif" font-size="34" fill="white">data:image</text>
    </svg>
  `)}`;

  const previewCapabilities: OpenAgentUiCapabilities = {
    async openUrl() {},
    async openPath() {},
    async readTextSnippet(_path, startLine) {
      return { startLine, lines: [] };
    },
    async resolveMedia(path, kind) {
      if (kind === "image" && path === "/app-icon.png") {
        return { url: "/app-icon.png", mimeType: "image/png" };
      }
      throw new Error("Unsupported media preview fixture");
    },
    async readHtmlPreview() {
      return { content: "", assetBaseUrl: "" };
    },
    async repairAttachment() {
      return false;
    },
    async saveDownloadFile(filename) {
      return { location: filename };
    },
  };

  provideOpenAgentUiCapabilities(previewCapabilities);
</script>

<main class="media-source-preview" data-media-source-preview>
  <header>
    <h1>{locale === "zh" ? "图片来源预览" : "Image source preview"}</h1>
    <p>
      {locale === "zh"
        ? "Image 组件通过受约束的 file:// 路径或内联 data:image URL 显示图片。"
        : "The Image component displays workspace-confined file:// paths and inline data:image URLs."}
    </p>
  </header>
  <div class="media-grid">
    <section>
      <h2>file://</h2>
      <Media
        args={{
          src: "file:///app-icon.png",
          alt: "OpenAgent",
          caption: locale === "zh" ? "工作区约束的文件 URL" : "Workspace-confined file URL",
        }}
        kind="image"
      />
    </section>
    <section>
      <h2>data:image</h2>
      <Media
        args={{
          src: embeddedSvg,
          alt: locale === "zh" ? "内联图片" : "Inline image",
          caption: locale === "zh" ? "内联图片数据 URL" : "Inline image data URL",
        }}
        kind="image"
      />
    </section>
  </div>
</main>

<style>
  .media-source-preview {
    min-height: 100vh;
    padding: 56px clamp(24px, 6vw, 84px);
    background: var(--bg);
    color: var(--text);
  }

  header {
    max-width: 760px;
    margin: 0 auto 28px;
  }

  h1 {
    margin: 0 0 8px;
    font-size: 28px;
    font-weight: 650;
  }

  header p {
    margin: 0;
    color: var(--text-muted);
    font-size: 14px;
    line-height: 1.55;
  }

  .media-grid {
    display: grid;
    width: min(100%, 1120px);
    margin: 0 auto;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 24px;
  }

  section {
    min-width: 0;
  }

  h2 {
    margin: 0 0 10px;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 13px;
    font-weight: 600;
  }

  section :global(.agui-media) {
    margin: 0;
  }

  @media (max-width: 760px) {
    .media-grid {
      grid-template-columns: 1fr;
    }
  }
</style>

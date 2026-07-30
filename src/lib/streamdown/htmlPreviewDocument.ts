function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function htmlPreviewDirectoryUrl(assetUrl: string): string {
  return assetUrl.endsWith("/") ? assetUrl : `${assetUrl}/`;
}

export function injectHtmlPreviewBase(
  html: string,
  assetUrl: string,
  colorScheme: "light" | "dark" = "light",
): string {
  const base = `<base href="${escapeHtmlAttribute(htmlPreviewDirectoryUrl(assetUrl))}">`;
  const themeDefaults = `<style data-openagent-preview-theme>:root{color-scheme:${colorScheme}}html,body{background-color:Canvas;color:CanvasText}</style>`;
  const headContent = `${base}${themeDefaults}`;
  const head = /<head(?:\s[^>]*)?>/i.exec(html);
  if (head?.index !== undefined) {
    const insertAt = head.index + head[0].length;
    return `${html.slice(0, insertAt)}${headContent}${html.slice(insertAt)}`;
  }

  const root = /<html(?:\s[^>]*)?>/i.exec(html);
  if (root?.index !== undefined) {
    const insertAt = root.index + root[0].length;
    return `${html.slice(0, insertAt)}<head>${headContent}</head>${html.slice(insertAt)}`;
  }

  return `${headContent}${html}`;
}

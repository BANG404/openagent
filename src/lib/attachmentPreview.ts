const PREVIEWABLE_EXTENSIONS = new Set([
  "avif",
  "bmp",
  "css",
  "csv",
  "gif",
  "htm",
  "html",
  "jpeg",
  "jpg",
  "js",
  "json",
  "jsx",
  "markdown",
  "md",
  "pdf",
  "png",
  "py",
  "rtf",
  "svg",
  "toml",
  "ts",
  "tsx",
  "txt",
  "webp",
  "xml",
  "yaml",
  "yml",
]);

export const ATTACHMENT_PREVIEW_MIN_SCALE = 0.5;
export const ATTACHMENT_PREVIEW_MAX_SCALE = 3;

export function isAttachmentPreviewSupported(name: string): boolean {
  const extension = name.match(/\.([^.\s]+)$/)?.[1]?.toLowerCase();
  return extension ? PREVIEWABLE_EXTENSIONS.has(extension) : false;
}

export function clampAttachmentPreviewScale(scale: number): number {
  return Math.min(
    ATTACHMENT_PREVIEW_MAX_SCALE,
    Math.max(ATTACHMENT_PREVIEW_MIN_SCALE, Math.round(scale * 100) / 100),
  );
}

export function attachmentPreviewScaleFromWheel(scale: number, deltaPixels: number): number {
  return clampAttachmentPreviewScale(scale * Math.exp(-deltaPixels * 0.0015));
}

export function anchoredAttachmentPreviewScroll(
  scrollOffset: number,
  pointerOffset: number,
  previousScale: number,
  nextScale: number,
): number {
  return Math.max(0, ((scrollOffset + pointerOffset) * nextScale) / previousScale - pointerOffset);
}

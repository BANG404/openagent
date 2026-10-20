/** Resolve modern CSS colors to sRGB for renderers whose parsers cannot read OKLCH. */
export function readThemePalette(): Record<string, string> {
  if (typeof document === "undefined") return {};
  const style = getComputedStyle(document.documentElement);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return {};
  const colors: Record<string, string> = {};
  for (const name of [
    "background",
    "foreground",
    "card",
    "card-foreground",
    "muted",
    "muted-foreground",
    "popover",
    "popover-foreground",
    "primary",
    "primary-foreground",
    "border",
    ...Array.from({ length: 5 }, (_, i) => `chart-${i + 1}`),
  ]) {
    const value = style.getPropertyValue(`--${name}`).trim();
    if (!value || !CSS.supports("color", value)) continue;
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b, alpha] = context.getImageData(0, 0, 1, 1).data;
    colors[name] =
      alpha === 255
        ? `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`
        : `rgba(${r}, ${g}, ${b}, ${alpha / 255})`;
  }
  colors.font = style.getPropertyValue("--app-font-family").trim();
  return colors;
}

export function observeThemePalette(update: () => void): () => void {
  let palette = JSON.stringify(readThemePalette());
  const observer = new MutationObserver(() => {
    // Focus, overlays and repeated appearance application also mutate the root.
    // Only actual renderer palette changes should replace a zoomed diagram.
    const next = JSON.stringify(readThemePalette());
    if (next === palette) return;
    palette = next;
    update();
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style"],
  });
  return () => observer.disconnect();
}

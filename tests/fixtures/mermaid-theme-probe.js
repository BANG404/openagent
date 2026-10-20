// DOM-only measurement shared by the native host and opaque offline widget probe.
/** @param {Element | null} root */
const inspectMermaidTheme = (root) => {
  if (!root) return null;
  const svg = root.querySelector("[data-mermaid-svg] > svg") ?? root.querySelector("svg");
  if (!svg) return null;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw Error("Canvas color measurements unavailable");
  /** @param {string} value */
  const rgb = (value) => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    return [...context.getImageData(0, 0, 1, 1).data];
  };
  let surface = root;
  while (surface.parentElement && rgb(getComputedStyle(surface).backgroundColor)[3] === 0)
    surface = surface.parentElement;
  const background = rgb(getComputedStyle(surface).backgroundColor);
  const shapes = [...svg.querySelectorAll("rect,path,polygon,circle,ellipse")]
    .map((node) => ({ node, bounds: node.getBoundingClientRect(), style: getComputedStyle(node) }))
    .filter(
      ({ bounds, style }) =>
        bounds.width > 1 && bounds.height > 1 && style.fill !== "none" && rgb(style.fill)[3] > 0,
    );
  /** @param {number[]} color */
  const luminance = (color) =>
    color
      .slice(0, 3)
      .map((value) => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      })
      .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  const labels = [...svg.querySelectorAll("text,foreignObject .nodeLabel,foreignObject .edgeLabel")]
    .filter((node) => node.textContent?.trim())
    .map((node) => {
      const bounds = node.getBoundingClientRect();
      const x = bounds.x + bounds.width / 2,
        y = bounds.y + bounds.height / 2;
      const shape = shapes
        .filter(
          ({ bounds: box }) => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom,
        )
        .sort((a, b) => a.bounds.width * a.bounds.height - b.bounds.width * b.bounds.height)[0];
      const style = getComputedStyle(node.querySelector("tspan") ?? node);
      const foreground = rgb(node instanceof SVGElement ? style.fill : style.color);
      const fill = shape ? rgb(shape.style.fill) : background;
      const composite = fill
        .slice(0, 3)
        .map((value, index) => (value * fill[3]) / 255 + background[index] * (1 - fill[3] / 255));
      const a = luminance(foreground),
        b = luminance(composite);
      return {
        text: node.textContent?.trim(),
        foreground,
        background: fill,
        shape: shape?.node.outerHTML.slice(0, 250),
        contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
      };
    });
  return {
    id: svg.id,
    bounds: svg.getBoundingClientRect().toJSON(),
    bodyBackground: background,
    labels,
    rows: [...svg.querySelectorAll(".row-rect-odd,.row-rect-even")].map(
      (node) => getComputedStyle(node).fill,
    ),
  };
};
Object.assign(window, { __inspectMermaidTheme: inspectMermaidTheme });

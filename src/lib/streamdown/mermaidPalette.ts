/** Explicit surface pairs prevent Mermaid's light defaults leaking into dark diagrams. */
export function mermaidPalette(palette: Record<string, string>, darkMode: boolean) {
  const variables: Record<string, string | boolean> = { darkMode };
  const mapping: Record<string, string[]> = {
    card: [
      "mainBkg",
      "primaryColor",
      "actorBkg",
      "labelBoxBkgColor",
      "clusterBkg",
      "rowOdd",
      "attributeBackgroundColorOdd",
    ],
    background: ["background", "secondaryColor", "edgeLabelBackground"],
    muted: [
      "tertiaryColor",
      "activationBkgColor",
      "noteBkgColor",
      "rowEven",
      "attributeBackgroundColorEven",
      "altSectionBkgColor",
    ],
    foreground: [
      "textColor",
      "secondaryTextColor",
      "tertiaryTextColor",
      "titleColor",
      "signalTextColor",
      "loopTextColor",
      "noteTextColor",
      "taskTextColor",
      "taskTextOutsideColor",
      "taskTextLightColor",
      "taskTextDarkColor",
    ],
    "card-foreground": ["primaryTextColor", "nodeTextColor", "actorTextColor", "labelTextColor"],
    border: [
      "primaryBorderColor",
      "secondaryBorderColor",
      "tertiaryBorderColor",
      "nodeBorder",
      "clusterBorder",
      "actorBorder",
      "labelBoxBorderColor",
      "noteBorderColor",
      "gridColor",
    ],
    "muted-foreground": [
      "lineColor",
      "signalColor",
      "activationBorderColor",
      "actorLineColor",
      "arrowheadColor",
    ],
    font: ["fontFamily"],
  };
  for (const [token, names] of Object.entries(mapping)) {
    const value = palette[token] || (token === "card-foreground" ? palette.foreground : "");
    if (value) for (const name of names) variables[name] = value;
  }
  return variables;
}

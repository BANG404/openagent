import { readFileSync } from "node:fs";

/** Keep font distribution notices beside the fonts in both frontend artifacts.
 * @returns {import('vite').Plugin}
 */
export function themeFontResources() {
  const root = new URL("../src/lib/assets/fonts/shadcn/", import.meta.url);
  const provenance = readFileSync(new URL("provenance.json", root), "utf8");
  const fonts = /** @type {Array<{name: string}>} */ (JSON.parse(provenance));
  return {
    name: "openagent-theme-font-notices",
    apply: "build",
    generateBundle() {
      for (const filename of [
        "provenance.json",
        ...fonts.map((font) => `${font.name}.LICENSE.txt`),
      ])
        this.emitFile({
          type: "asset",
          fileName: `licenses/theme-fonts/${filename}`,
          source: readFileSync(new URL(filename, root)),
        });
    },
  };
}

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import definitions from "./upstream/fonts.json";
import resources from "./fonts/provenance.json";
import type { ThemeRecipe } from "./compose";

/** Build-time inputs stay outside src; each package distributes only its own faces/notices. */
export function packageThemeFonts(output: string, recipe: ThemeRecipe) {
  const names = [
    ...new Set([recipe.font, recipe.fontHeading].filter((name) => name !== "inherit")),
  ];
  const target = join(output, "fonts");
  mkdirSync(target, { recursive: true });
  const provenance = names.map((name) => {
    const resource = resources.find((font) => font.name === name);
    if (!resource) throw new Error(`Font resource missing: ${name}`);
    const source = new URL(`./fonts/${resource.file}`, import.meta.url);
    if (createHash("sha256").update(readFileSync(source)).digest("hex") !== resource.sha256)
      throw new Error(`Font checksum mismatch: ${name}`);
    copyFileSync(source, join(target, resource.file));
    copyFileSync(
      new URL(`./fonts/${name}.LICENSE.txt`, import.meta.url),
      join(target, `${name}.LICENSE.txt`),
    );
    return resource;
  });
  writeFileSync(join(target, "provenance.json"), JSON.stringify(provenance, null, 2) + "\n");
  return names.map((name) => ({
    family: definitions
      .find((font) => font.name === name)!
      .family.split(",")[0]
      .replaceAll("'", ""),
    entry: `fonts/${name}.woff2`,
    weight: name === "instrument-serif" ? "400" : "100 900",
    style: "normal" as const,
  }));
}

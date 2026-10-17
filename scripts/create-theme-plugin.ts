import { mkdirSync, existsSync, writeFileSync, copyFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { composeTheme, recipeFromPreset, themeOptions, type ThemeRecipe } from "./themes/compose";
import upstream from "./themes/upstream/provenance.json";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Generate a process-free, portable theme-v1 package. Never overwrite an existing candidate. */
export function createThemePlugin(options: {
  id: string;
  output: string;
  title?: string;
  version?: string;
  repository?: string;
  preset?: string;
  overrides?: Partial<ThemeRecipe>;
}) {
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(options.id)) throw new Error("Invalid plugin ID");
  const version = options.version ?? "1.0.0";
  if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) throw new Error("Expected a semantic version");
  if (
    options.repository &&
    !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?$/.test(options.repository)
  )
    throw new Error("Repository must be an HTTPS GitHub repository");
  const { recipe, theme } = composeTheme({
    ...recipeFromPreset(options.preset),
    ...options.overrides,
  });
  const output = resolve(options.output);
  if (existsSync(output)) throw new Error(`Candidate already exists: ${output}`);
  const title = options.title ?? options.id.replace(/^openagent-theme-/, "");
  const description = `${title}: ${recipe.style} / ${recipe.baseColor} / ${recipe.theme} / ${recipe.chartColor}`;
  const manifest = {
    $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    name: options.id,
    version,
    description,
    license: "MIT",
    ...(options.repository && { repository: options.repository }),
    homepage: "https://ui.shadcn.com/create",
    keywords: ["theme", "shadcn", recipe.style, recipe.baseColor, recipe.theme],
    extensions: {
      openagent: {
        type: "theme",
        category: "design",
        compatibility: { plugin_protocol: { min: 1, max: 1 }, features: ["theme-v1"] },
        theme,
        i18n: {
          supported_locales: ["en", "zh"],
          default_locale: "en",
          translations: {
            en: { display_name: title, description },
            zh: {
              display_name: title,
              description: `${title} 主题：${recipe.style} / ${recipe.baseColor} / ${recipe.theme} / ${recipe.chartColor}`,
            },
          },
        },
      },
    },
  };
  mkdirSync(output, { recursive: true });
  const json = (name: string, value: unknown) =>
    writeFileSync(join(output, name), JSON.stringify(value, null, 2) + "\n");
  json("plugin.json", manifest);
  json("recipe.json", recipe);
  json("provenance.json", {
    ...upstream,
    generator: "OpenAgent scripts/create-theme-plugin.ts",
    recipe: "recipe.json",
  });
  copyFileSync(join(root, "scripts/themes/upstream/LICENSE.md"), join(output, "LICENSE"));
  writeFileSync(
    join(output, "README.md"),
    `# ${title}\n\n${description}\n\nInstall this directory or its release archive in OpenAgent Plugins, then select ${title} in General → Appearance. Light/dark and system appearance are supported. User appearance overrides apply last.\n\nRequires the OpenAgent semantic theme implementation (0.84 or later). This is a Svelte/Bits UI adaptation of the upstream visual grammar; React component libraries and icon libraries are not switched by a theme. Fonts are bundled by OpenAgent and work offline; CJK glyphs use system fallbacks.\n\nrecipe.json records every independent mix option. provenance.json pins the MIT-licensed shadcn source. This package contains no scripts, remote fonts, or executable stylesheets.\n\nPublish plugin.json, recipe.json, provenance.json, LICENSE, and this README as a GitHub release archive; keep the manifest repository and version aligned with the release.\n`,
  );
  return { output, manifest, recipe };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.includes("--list")) {
    console.log(JSON.stringify(themeOptions, null, 2));
  } else {
    const flags: Record<string, string> = {};
    for (let i = 0; i < args.length; i += 2) {
      if (!args[i].startsWith("--") || !args[i + 1] || args[i + 1].startsWith("--"))
        throw new Error("Expected --option value pairs; see --list");
      flags[args[i].slice(2)] = args[i + 1];
    }
    const recipes: Record<string, keyof ThemeRecipe> = {
      style: "style",
      "base-color": "baseColor",
      theme: "theme",
      "chart-color": "chartColor",
      font: "font",
      "font-heading": "fontHeading",
      radius: "radius",
      "menu-accent": "menuAccent",
      "menu-color": "menuColor",
    };
    const allowed = new Set([
      "id",
      "output",
      "title",
      "version",
      "repository",
      "preset",
      ...Object.keys(recipes),
    ]);
    for (const key of Object.keys(flags))
      if (!allowed.has(key)) throw new Error(`Unknown option: --${key}`);
    if (!flags.id) throw new Error("--id is required");
    const result = createThemePlugin({
      id: flags.id,
      output: flags.output ?? join(root, "plugins", flags.id),
      title: flags.title,
      version: flags.version,
      repository: flags.repository,
      preset: flags.preset,
      overrides: Object.fromEntries(
        Object.entries(recipes)
          .filter(([key]) => flags[key])
          .map(([key, field]) => [field, flags[key]]),
      ),
    });
    console.log(result.output);
  }
}

import type { HighlighterCore, ThemedToken } from "shiki/core";
import { bundledLanguagesInfo } from "shiki/langs";
import { diffCodeText, type FileChangeDiffLine } from "$lib/fileChangeDiff";

const extensions: Record<string, string> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  py: "python",
  rs: "rust",
  rb: "ruby",
  cs: "csharp",
  fs: "fsharp",
  sh: "bash",
  zsh: "bash",
  ps1: "powershell",
  psm1: "powershell",
  psd1: "powershell",
  yml: "yaml",
  md: "markdown",
  h: "c",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  htm: "html",
  kt: "kotlin",
  kts: "kotlin",
  ex: "elixir",
  exs: "elixir",
  tf: "hcl",
  vue: "vue",
  svelte: "svelte",
  jsonc: "jsonc",
  env: "dotenv",
};

export function fileCodeLanguage(path: string): string | null {
  const name = path.split(/[/\\]/).at(-1)?.toLowerCase() ?? "";
  const named =
    name === "dockerfile"
      ? "dockerfile"
      : name === "makefile"
        ? "makefile"
        : name === "cmakelists.txt"
          ? "cmake"
          : name === ".env" || name.startsWith(".env.")
            ? "dotenv"
            : null;
  const extension = name.includes(".") ? name.split(".").at(-1)! : name;
  const candidate = named ?? extensions[extension] ?? extension;
  return (
    bundledLanguagesInfo.find(
      (entry) => entry.id === candidate || entry.aliases?.includes(candidate),
    )?.id ?? null
  );
}

let highlighter: Promise<HighlighterCore> | undefined;
const languageLoads = new Map<string, Promise<void>>();

async function loadHighlighter(): Promise<HighlighterCore> {
  highlighter ??= Promise.all([
    import("shiki/core"),
    import("shiki/engine/javascript"),
    import("@shikijs/themes/github-light"),
    import("@shikijs/themes/github-dark"),
  ])
    .then(([core, engine, light, dark]) =>
      core.createHighlighterCore({
        themes: [light.default, dark.default],
        langs: [],
        engine: engine.createJavaScriptRegexEngine({ forgiving: true }),
      }),
    )
    .catch((error: unknown) => {
      highlighter = undefined;
      throw error;
    });
  return highlighter;
}

/** Tokenize each revision separately so deleted text cannot change added-text grammar. */
export async function highlightDiffLines(
  lines: FileChangeDiffLine[],
  path: string,
): Promise<ThemedToken[][]> {
  const plain = () => lines.map((line) => [{ content: diffCodeText(line), offset: 0 }]);
  const language = fileCodeLanguage(path);
  if (!language || lines.length === 0) return plain();
  try {
    const core = await loadHighlighter();
    let loading = languageLoads.get(language);
    if (!loading) {
      const entry = bundledLanguagesInfo.find((item) => item.id === language)!;
      loading = entry
        .import()
        .then((module) => core.loadLanguage(module.default))
        .catch((error: unknown) => {
          languageLoads.delete(language);
          throw error;
        });
      languageLoads.set(language, loading);
    }
    await loading;
    const result: ThemedToken[][] = plain();
    for (const side of ["old", "new"] as const) {
      let group: number[] = [];
      let previousNumber: number | undefined;
      const flush = () => {
        if (!group.length) return;
        const { tokens } = core.codeToTokens(
          group.map((index) => diffCodeText(lines[index])).join("\n"),
          {
            lang: language,
            themes: { light: "github-light", dark: "github-dark" },
            defaultColor: false,
          },
        );
        group.forEach((index, row) => {
          if (side === "new" || lines[index].type === "remove") result[index] = tokens[row];
        });
        group = [];
      };
      lines.forEach((line, index) => {
        if (line.type === (side === "old" ? "add" : "remove")) return;
        const number = side === "old" ? line.oldLine : line.newLine;
        if (number !== undefined && previousNumber !== undefined && number !== previousNumber + 1)
          flush();
        group.push(index);
        previousNumber = number;
      });
      flush();
    }
    return result;
  } catch {
    return plain();
  }
}

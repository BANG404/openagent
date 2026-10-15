import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { posix, resolve } from "node:path";
import ts from "typescript";

const TEST_FILE = /^(?:tests|scripts|sdk\/typescript\/tests)\/.*\.(?:test|spec)\.(?:[cm]?js|tsx?)$/;
const AUTOMATION_TESTS = new Set([
  "agentSkills",
  "ciChanges",
  "ciResults",
  "ciReuse",
  "codexExecBatch",
  "componentUsage",
  "docsSync",
  "owtBatch",
  "preflight",
  "privateSdkDiagnostic",
  "releaseChangelog",
  "releaseCi",
  "releaseComponents",
  "releaseIdentity",
  "releaseVersion",
  "sdkGitlink",
  "skillDocumentLength",
  "staticToolI18n",
  "testSelection",
]);
const SHARED_FILES = new Set([
  "package.json",
  "bun.lock",
  "bunfig.toml",
  "tsconfig.json",
  "tsconfig.tests.json",
  "vite.config.js",
  "svelte.config.js",
  "eslint.config.js",
  "runtime",
  ".gitmodules",
  "scripts/ci-changes.mjs",
  "scripts/preflight.mjs",
  "scripts/test-selection.mjs",
  "scripts/run-selected-tests.mjs",
  "scripts/ci-reuse.mjs",
]);

/** @param {string} file */
function normalize(file) {
  return posix.normalize(file.replaceAll("\\", "/")).replace(/^\.\//, "");
}

/** @param {string[]} files @param {"frontend"|"automation"} scope */
export function testInventory(files, scope) {
  return [...new Set(files.map(normalize))]
    .filter((file) => {
      if (!TEST_FILE.test(file)) return false;
      if (scope === "frontend" || file.startsWith("scripts/") || file.startsWith("sdk/"))
        return true;
      return AUTOMATION_TESTS.has(posix.basename(file).split(".")[0]);
    })
    .sort();
}

/** Include untracked tests during local development, but never ignored build output.
 * @param {string} root
 */
export function repositoryFiles(root) {
  return execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean)
    .map(normalize);
}

/** @param {string} source @param {string} file */
function moduleSource(source, file) {
  if (!file.endsWith(".svelte")) return source;
  return [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1])
    .join("\n");
}

/** @param {string} importer @param {string} specifier @param {Set<string>} files */
function resolveImport(importer, specifier, files) {
  let base;
  if (specifier.startsWith(".")) base = posix.join(posix.dirname(importer), specifier);
  else if (specifier.startsWith("$lib/")) base = `src/lib/${specifier.slice(5)}`;
  else return null;
  base = normalize(base);
  const candidates = [
    base,
    ...[".ts", ".js", ".mjs", ".json", ".svelte"].map((ext) => base + ext),
    `${base}/index.ts`,
    `${base}/index.js`,
  ];
  if (base.endsWith(".js")) candidates.push(base.slice(0, -3) + ".ts");
  return candidates.find((candidate) => files.has(candidate)) ?? base;
}

/**
 * File-system and process tests inspect inputs outside their import graph, so
 * keep them as shared guards. Unknown dynamic dependencies also remain guards.
 * @param {string} source @param {string} file
 */
function inspectModule(source, file) {
  const code = moduleSource(source, file);
  const parsed = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const imports = new Set(
    ts.preProcessFile(code, true, true).importedFiles.map((entry) => entry.fileName),
  );
  const references = new Set();
  let opaque = /\bBun\s*\.\s*(?:file|spawn|Glob)\b/.test(code);
  /** @param {ts.Node} node */
  const visit = (node) => {
    if (
      ts.isStringLiteralLike(node) &&
      /^(?:(?:\.\.\/)+)?(?:src|src-tauri|scripts|tests|\.agents|\.github|plugins)\/.+\.[a-z]+$/.test(
        node.text,
      )
    ) {
      references.add(node.text);
    }
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      const argument = node.arguments[0];
      if (argument && ts.isStringLiteralLike(argument)) imports.add(argument.text);
      else opaque = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  const guard =
    opaque || [...imports].some((name) => /^(?:node:)?(?:fs|child_process)(?:\/|$)/.test(name));
  return { imports: [...imports], references: guard ? [...references] : [], guard };
}

/**
 * @param {{ root: string; files: string[]; changed: string[];
 *   scope: "frontend"|"automation"; full?: boolean }} options
 */
export function selectTests({ root, files, changed, scope, full = false }) {
  const available = new Set(files.map(normalize).filter((file) => existsSync(resolve(root, file))));
  const inventory = testInventory([...available], scope);
  const delta = [...new Set(changed.map(normalize))];
  /** @param {string} reason */
  const complete = (reason) => ({ tests: inventory, total: inventory.length, full: true, reason });
  if (full) return complete("Complete qualification requested");
  if (
    delta.some(
      (file) =>
        SHARED_FILES.has(file) ||
        file.startsWith("sdk/") ||
        file.startsWith("plugins/") ||
        file.startsWith("static/") ||
        file.startsWith(".github/workflows/") ||
        (file.startsWith("src/") && !/\.(?:ts|js|mjs|svelte)$/.test(file)),
    )
  ) {
    return complete("Shared configuration, resources, or test routing changed");
  }

  /** @type {Map<string, ReturnType<typeof inspectModule>>} */
  const modules = new Map();
  /** @param {string} file */
  const inspect = (file) => {
    let result = modules.get(file);
    if (!result) {
      result = inspectModule(readFileSync(resolve(root, file), "utf8"), file);
      modules.set(file, result);
    }
    return result;
  };
  /** @type {Map<string, { dependencies: Set<string>; guard: boolean }>} */
  const graphs = new Map();
  for (const test of inventory) {
    const dependencies = new Set();
    const visited = new Set();
    let guard = false;
    /** @param {string} file */
    const visit = (file) => {
      if (visited.has(file)) return;
      visited.add(file);
      dependencies.add(file);
      if (!available.has(file) || !/\.(?:tsx?|[cm]?js|svelte)$/.test(file)) return;
      const module = inspect(file);
      guard ||= module.guard;
      for (const specifier of module.imports) {
        const dependency = resolveImport(file, specifier, available);
        if (dependency) visit(dependency);
      }
      // Literal source reads establish contract coverage for components without
      // importing Svelte into Bun. Directory scans remain guards, not inferred
      // unit coverage for every file in a directory.
      for (const reference of module.references) {
        const dependency = reference.startsWith(".")
          ? normalize(posix.join(posix.dirname(file), reference))
          : normalize(reference);
        dependencies.add(dependency);
      }
    };
    visit(test);
    graphs.set(test, { dependencies, guard });
  }

  const relevant = delta.filter((file) => !file.endsWith(".md"));
  for (const file of relevant) {
    if (
      !inventory.includes(file) &&
      ![...graphs.values()].some((graph) => graph.dependencies.has(file))
    ) {
      return complete(`No reliable dependency coverage for ${file}`);
    }
  }
  const selected = inventory.filter((test) => {
    const graph = graphs.get(test);
    return graph && (graph.guard || delta.some((file) => graph.dependencies.has(file)));
  });
  return {
    tests: selected,
    total: inventory.length,
    full: false,
    reason: "Changed tests, transitive import consumers, and shared contract guards",
  };
}

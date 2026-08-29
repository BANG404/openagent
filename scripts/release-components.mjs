/** @typedef {{ frontend: boolean, runtime: boolean, nativeShell: boolean }} ReleaseComponents */

/** @type {Readonly<ReleaseComponents>} */
const ALL_COMPONENTS = Object.freeze({
  frontend: true,
  runtime: true,
  nativeShell: true,
});

/** @returns {ReleaseComponents} */
export function allReleaseComponents() {
  return { ...ALL_COMPONENTS };
}

/**
 * @param {unknown} value
 * @returns {value is ReleaseComponents}
 */
export function isReleaseComponents(value) {
  if (value === null || typeof value !== "object") return false;
  const candidate = /** @type {Record<string, unknown>} */ (value);
  return (
    typeof candidate.frontend === "boolean" &&
    typeof candidate.runtime === "boolean" &&
    typeof candidate.nativeShell === "boolean"
  );
}

/**
 * @param {unknown} value
 * @param {Readonly<ReleaseComponents>} fallback
 * @returns {ReleaseComponents}
 */
export function normalizeReleaseComponents(value, fallback = ALL_COMPONENTS) {
  if (!isReleaseComponents(value)) {
    return { ...fallback };
  }
  return {
    frontend: value.frontend,
    runtime: value.runtime,
    nativeShell: value.nativeShell,
  };
}

/**
 * @param {string} file
 * @param {ReleaseComponents} components
 */
function classifySdkPath(file, components) {
  if (file.startsWith("typescript/")) {
    components.frontend = true;
    return;
  }
  if (
    file.startsWith("rust/openagent-protocol/") ||
    file === "Cargo.toml" ||
    file === "Cargo.lock"
  ) {
    components.frontend = true;
    components.runtime = true;
    return;
  }
  if (
    file.startsWith("rust/openagent-runtime/") ||
    file.startsWith("rust/openagent-app/") ||
    file.startsWith("rust/openagent-server/") ||
    file.startsWith("scripts/server-")
  ) {
    components.runtime = true;
    return;
  }
  if (
    file.startsWith("harness-typescript/") ||
    file.startsWith("rust/openagent-benchmark/") ||
    file.startsWith("docs/") ||
    file.startsWith(".agents/") ||
    file === "AGENTS.md" ||
    file === "README.md"
  ) {
    return;
  }
  components.frontend = true;
  components.runtime = true;
}

/**
 * @param {string[]} files
 * @param {string[] | null} sdkFiles
 * @returns {ReleaseComponents}
 */
export function classifyReleaseComponents(files, sdkFiles = null) {
  const components = { frontend: false, runtime: false, nativeShell: false };
  for (const source of files) {
    const file = source.replaceAll("\\", "/");
    if (file === "sdk") {
      if (!sdkFiles) {
        components.frontend = true;
        components.runtime = true;
      } else {
        for (const sdkFile of sdkFiles) {
          classifySdkPath(sdkFile.replaceAll("\\", "/"), components);
        }
      }
      continue;
    }
    if (file.startsWith("src-tauri/")) components.nativeShell = true;
    if (
      file.startsWith("src/") ||
      file.startsWith("static/") ||
      file.startsWith("assets/") ||
      ["package.json", "bun.lock", "svelte.config.js", "tsconfig.json", "vite.config.js"].includes(
        file,
      )
    ) {
      components.frontend = true;
    }
    if (file.startsWith("patches/")) {
      components.frontend = true;
      components.runtime = true;
      components.nativeShell = true;
    }
  }
  return components;
}

/** @param {ReleaseComponents} components */
export function hasReleaseComponents(components) {
  return components.frontend || components.runtime || components.nativeShell;
}

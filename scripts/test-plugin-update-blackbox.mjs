// @ts-check

// Drive the committed plugin-update scenario against a running debug instance.
//
// The scenario asserts what the plugins page says about a package whose release
// metadata could not be read. `tests/fixtures/agent-plugin-update` declares a
// repository that is not an HTTPS `github.com/owner/repo` URL, which the Runtime
// rejects without spending a request, so the reason the page has to explain is
// deterministic and needs no network. The other package installed in the shared
// plugin instance keeps its own repository, so the same run also covers a
// summary that carries more than one entry.
//
// The page renders its own copy, so the runner injects the expected strings from
// the catalogs before each pass and repeats the pass in the dark theme and the
// Chinese locale, the way the MCP OAuth runner does. The run shares the instance
// reserved for plugin verification:
//
//   bun tauri dev --multi-instance plugin-blackbox
//   bun run test:blackbox:plugin-update
//
// Every other package the Runtime checks — the builtins and the other two
// fixtures — declares a `github.com` repository, so an uncached check spends the
// machine's shared anonymous GitHub quota and a machine that has spent it makes
// the whole check report the quota condition instead of the per-plugin reasons
// this scenario asserts. The runner therefore seeds the Runtime's release
// metadata cache with the repositories the page itself renders, at the installed
// version, before the check runs: the check answers those from the cache, and the
// only plugin it still has to explain is the fixture. That cache is a derived
// file the Runtime documents as deletable, and every seeded release matches the
// installed version, so it offers no update and reports no failure of its own.
//
// Each pass is captured twice: the settings surface, which carries the summary
// line, and the fixture card itself, which is the last row of a list the panel
// scrolls and only explains itself while it is expanded. The captures clip the
// elements rather than the viewport, because the capture renders the page from
// the top of every scroll area and a viewport-sized image would show the first
// rows of the list instead of the row the pass asserted.

import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { en } from "../src/lib/i18n.en.ts";
import { zh } from "../src/lib/i18n.zh.ts";
import { blackboxInstanceName, resolveBlackboxHome } from "./tauri-test-environment.mjs";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const scenario = join(workspaceRoot, "tests", "blackbox", "plugin-update.toml");
const fixtureRoot = join(workspaceRoot, "tests", "fixtures", "agent-plugin-update");
const pluginId = "openagent-update-plugin";
const pilotBinary = process.env.TAURI_PILOT_BIN || "tauri-pilot";
const windowLabel = "main";
// The Runtime's own wording for the rejection this fixture provokes, raised by
// `github_repository_path` in the SDK's `agent_plugins.rs`. The page keeps it as
// the detail under the localized reason, so the scenario pins both.
const rawDiagnostic = "repository is not a supported GitHub URL";
// The shape of the Runtime's derived release-metadata cache, and the version
// every package in this catalog declares, used when a card reports none.
const updateCacheVersion = 1;
const fallbackInstalledVersion = "1.0.0";
const isolatedHome = resolveBlackboxHome(process.env, { instanceName: "plugin-blackbox" });
const artifactRoot =
  process.env.BLACKBOX_ARTIFACT_DIR ||
  mkdtempSync(join(tmpdir(), "openagent-plugin-update-blackbox-"));

if (resolve(isolatedHome) === resolve(join(homedir(), ".openagent"))) {
  throw new Error(
    "Refusing to run Agent Plugin update black-box verification against ~/.openagent",
  );
}

mkdirSync(artifactRoot, { recursive: true });
mkdirSync(join(isolatedHome, "plugins"), { recursive: true });
cpSync(fixtureRoot, join(isolatedHome, "plugins", pluginId), { recursive: true });

process.env.OPENAGENT_HOME = isolatedHome;
process.env.OPENAGENT_DEV_INSTANCE ||= blackboxInstanceName(process.env);

/** @type {NodeJS.ProcessEnv} */
const pilotEnv = { ...process.env, TAURI_PILOT_WINDOW: windowLabel };

/**
 * @param {string[]} args
 * @param {boolean} [capture]
 */
function pilot(args, capture = false) {
  const result = spawnSync(pilotBinary, args, {
    cwd: artifactRoot,
    env: pilotEnv,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`tauri-pilot ${args.join(" ")} failed with exit code ${result.status}`);
  }
  return capture ? (result.stdout ?? "") : "";
}

/** @param {string} script */
function evaluate(script) {
  return pilot(["eval", script, "--window", windowLabel], true).trim();
}

/**
 * A synchronous sleep for the poll loops below. `tauri-pilot eval` caps a single
 * script at roughly ten seconds, so a wait that can outlast that budget has to
 * be driven from this process with repeated cheap probes instead of by an
 * in-page timer.
 *
 * @param {number} ms
 */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * @param {string} script
 * @param {string} description
 * @param {number} timeoutMs
 */
function waitUntil(script, description, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const observed = evaluate(script);
    if (observed === "true") return;
    if (Date.now() >= deadline) throw new Error(`${description} (observed: ${observed})`);
    sleepSync(100);
  }
}

/** @param {string} selector */
function waitForElement(selector) {
  pilot(["wait", "--selector", selector, "--timeout", "20000", "--window", windowLabel]);
}

/**
 * Publish the package, the reason, and the control label the active language
 * renders. The catalogs are imported so the scenario asserts which explanation
 * is shown rather than a copy of the text.
 *
 * @param {"en" | "zh"} language
 */
function injectProbe(language) {
  const catalog = language === "en" ? en : zh;
  const payload = {
    name: pluginId,
    reason: catalog.pluginUpdateErrorRepositoryUnsupported,
    detail: rawDiagnostic,
    checkLabel: catalog.pluginCheckUpdates,
    officialMarketplace: catalog.pluginOfficialMarketplace,
    officialHint: catalog.pluginOfficialMarketplaceHint,
    officialStandard: catalog.pluginOfficialStandard,
    officialSearchPlaceholder: catalog.pluginOfficialSearchPlaceholder,
  };
  evaluate(`window.__pluginUpdateProbe = ${JSON.stringify(payload)}; true`);
}

/**
 * The cache key the Runtime derives from a repository URL: `owner/repo`, with a
 * trailing `.git` trimmed. Anything that is not an HTTPS `github.com` URL is not
 * a repository the check would send a request for, so it needs no entry.
 *
 * @param {string} repository
 */
function githubRepositoryPath(repository) {
  let url;
  try {
    url = new URL(repository);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "github.com") return null;
  const [owner, repositoryName] = url.pathname.split("/").filter(Boolean);
  if (!owner || !repositoryName) return null;
  return `${owner}/${repositoryName.replace(/\.git$/, "")}`;
}

/**
 * Every repository the Runtime's builtin plugin registry declares. The page
 * renders a link for all but one of them — the Cua Driver card carries no
 * repository — so the catalog the check walks is not fully visible in the DOM
 * and the registry itself is the only complete list. It lives in product source
 * in the pinned SDK submodule.
 */
function builtinRegistryRepositories() {
  const registry = readFileSync(
    join(workspaceRoot, "sdk", "rust", "openagent-runtime", "src", "agent_plugins.rs"),
    "utf8",
  );
  const found = [...registry.matchAll(/repository: "(https:\/\/github\.com\/[^"]+)"/g)].map(
    (match) => match[1],
  );
  if (found.length === 0) {
    throw new Error("the Runtime's builtin plugin registry declared no GitHub repository");
  }
  return found;
}

/** The public source addresses rendered in the official plugin store. */
function officialRegistryRepositories() {
  const registry = JSON.parse(
    readFileSync(join(workspaceRoot, "src", "lib", "officialPluginRegistry.json"), "utf8"),
  );
  const repositories = registry.plugins
    .map((plugin) => plugin.repository)
    .filter((repository) => typeof repository === "string");
  if (repositories.length === 0) {
    throw new Error("the official plugin registry declared no repository");
  }
  return repositories;
}

/**
 * The `github.com` repository and installed version each plugin card renders.
 * Together they are the installed half of the catalog the check walks, and the
 * versions the seeded releases must not outrank.
 */
function discoverRepositories() {
  const observed = evaluate(
    `JSON.stringify([...document.querySelectorAll('[role=dialog] .plugin-accordion-item')]
      .map((card) => ({
        repository: card.querySelector('a[href^="https://github.com/"]')?.getAttribute("href") ?? null,
        version: (card.querySelector(".plugin-version")?.textContent ?? "").trim(),
      }))
      .filter((card) => card.repository !== null))`,
  );
  const cards = JSON.parse(observed);
  if (!Array.isArray(cards) || cards.length === 0) {
    throw new Error(`the plugins page reported no GitHub repository: ${observed}`);
  }
  return cards;
}

/**
 * Remember every rendered repository as answered at its installed version, so
 * the check takes its cached path for all of them instead of spending the
 * machine's anonymous GitHub quota. A seeded release is never newer than the
 * package it stands for, so it offers no update and fails nothing.
 *
 * @param {string[]} repositories every repository the check may walk
 * @param {Map<string, string>} [versions] the installed version per repository
 */
function seedUpdateCache(repositories, versions = new Map()) {
  /** @type {Record<string, unknown>} */
  const entries = {};
  for (const repository of repositories) {
    const path = githubRepositoryPath(repository);
    if (path === null) continue;
    const version = versions.get(repository) ?? "";
    const tag = version === "" ? fallbackInstalledVersion : version;
    entries[path] = {
      etag: null,
      fetched_at: Math.floor(Date.now() / 1000),
      release: {
        tag_name: tag,
        html_url: `${repository}/releases/tag/${tag}`,
        assets: [],
      },
    };
  }
  const seeded = Object.keys(entries).length;
  if (seeded === 0) throw new Error("the plugins page rendered no cacheable repository");
  writeFileSync(
    join(isolatedHome, "plugin-update-cache.json"),
    `${JSON.stringify({ version: updateCacheVersion, entries }, null, 2)}\n`,
  );
  process.stderr.write(`seeded ${seeded} release metadata cache entr(ies)\n`);
}

function runScenario() {
  pilot(["run", scenario, "--window", windowLabel]);
}

/** Open Settings -> Plugins through the same menu a user uses. */
function openPluginSurface() {
  evaluate(`(async () => {
    const trigger = document.querySelector("#application-integrations-menu");
    if (!(trigger instanceof HTMLElement)) throw new Error("integrations menu trigger is missing");
    trigger.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const item = [...document.querySelectorAll("[role=menuitem]")].find((candidate) =>
      /Plugins|插件/.test(candidate.textContent ?? "")
    );
    if (!item) throw new Error("plugins menu item is missing");
    item.click();
    return true;
  })()`);
  waitForElement(`[role=dialog] [role=switch][aria-label="${pluginId}"]`);
}

/**
 * Ask for the update check the way a user does and wait for the line it writes.
 * Reopening the surface refreshes the plugin directory, which clears the line an
 * earlier check left, so the capture has to ask again.
 */
function checkForUpdates() {
  evaluate(`(async () => {
    const probe = window.__pluginUpdateProbe;
    const summary = () =>
      [...document.querySelectorAll(".settings-tab-panel .provider-status")].find((node) =>
        (node.textContent ?? "").includes(probe.name)
      );
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      if (summary()) return true;
      const control = [...document.querySelectorAll(".plugin-directory-actions button")].find(
        (candidate) => (candidate.textContent ?? "").trim() === probe.checkLabel
      );
      if (control instanceof HTMLElement && !control.disabled) control.click();
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("the update summary never named " + probe.name);
  })()`);
}

/**
 * The card as the plugins list renders it. The list scrolls, and the capture
 * below renders every scroll area from its top, so this is the selector the
 * card's own screenshot has to clip.
 */
const fixtureCardSelector = `.plugin-accordion-item:has([role=switch][aria-label="${pluginId}"])`;

/** Whether the fixture card is expanded, which is when its reason is on screen. */
function fixtureCardIsExpanded() {
  return (
    evaluate(
      `document.querySelector(${JSON.stringify(
        `${fixtureCardSelector} .plugin-accordion-content[data-state="open"]`,
      )}) !== null ? "true" : "false"`,
    ) === "true"
  );
}

/**
 * Expand the fixture card so a capture shows the reporting the run asserted.
 * The card's content stays mounted while the card is collapsed, so the expanded
 * state is what has to be waited for — a collapsed card already carries the
 * text in the DOM without showing it.
 */
function expandFixtureCard() {
  evaluate(`(async () => {
    const control = document.querySelector('[role=dialog] [role=switch][aria-label="${pluginId}"]');
    if (!(control instanceof HTMLElement)) throw new Error("the fixture package switch is missing");
    const card = control.closest(".plugin-accordion-item");
    if (!(card instanceof HTMLElement)) throw new Error("the fixture package card is missing");
    const opener = card.querySelector(".plugin-accordion-trigger");
    if (!(opener instanceof HTMLElement)) throw new Error("the fixture package card has no opener");
    const open = () => card.querySelector('.plugin-accordion-content[data-state="open"]');
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && open() === null) {
      opener.click();
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    if (open() === null) throw new Error("the fixture package card never expanded");
    if (open().querySelector(".plugin-warning") === null) {
      throw new Error("the fixture package card never reported why its release could not be read");
    }
    return true;
  })()`);
}

/** Close the settings surface and confirm it is gone. */
function dismissSettingsSurface() {
  evaluate(`(() => {
    const close = document.querySelector(
      '[role=dialog] button[aria-label="Close"], [role=dialog] button[aria-label="关闭"]'
    );
    if (!(close instanceof HTMLElement)) throw new Error("the settings surface close control is missing");
    close.click();
    return true;
  })()`);
  waitUntil(
    `document.querySelector("[role=dialog]") === null
      ? "true"
      : JSON.stringify("the settings surface is still mounted")`,
    "the settings surface did not close",
    15000,
  );
}

/**
 * @param {string} key
 * @param {string} code
 * @param {{ ctrlKey?: boolean }} modifiers
 */
function dispatchShortcut(key, code, modifiers = {}) {
  const flags = Object.entries(modifiers)
    .map(([flag, enabled]) => `${flag}: ${enabled ? "true" : "false"}`)
    .join(", ");
  evaluate(
    `(() => { window.dispatchEvent(new KeyboardEvent("keydown", {key: ${JSON.stringify(
      key,
    )}, code: ${JSON.stringify(code)}, ${flags}, bubbles: true})); return true; })()`,
  );
}

const THEME_ROW = '[role=tabpanel][data-value="general"] .settings-card-row:nth-child(1) button';
const LANGUAGE_ROW = '[role=tabpanel][data-value="general"] .settings-card-row:nth-child(2) button';

/**
 * @param {string} selector
 * @param {string} value
 */
function chooseGeneralOption(selector, value) {
  pilot(["click", selector, "--window", windowLabel]);
  pilot(["click", `[role=option][data-value=${value}]`, "--window", windowLabel]);
}

/**
 * Poll until the requested appearance is actually applied. The language only
 * reaches i18n when the settings surface closes and autosaves its draft, so the
 * caller cannot assume the choice took effect synchronously.
 *
 * @param {string} theme
 * @param {"en" | "zh"} language
 */
function waitForVisualState(theme, language) {
  const expectedText = language === "en" ? "New chat" : "新聊天";
  waitUntil(
    `(() => {
      const classNames = document.documentElement.classList;
      const themeReady =
        ${JSON.stringify(theme)} === "system" || classNames.contains(${JSON.stringify(theme)});
      const languageReady = document.body.innerText.includes(${JSON.stringify(expectedText)});
      return themeReady && languageReady
        ? "true"
        : JSON.stringify({ className: classNames.value, languageReady: languageReady });
    })()`,
    `visual state did not reach theme=${theme} language=${language}`,
    20000,
  );
}

/**
 * @param {string} theme
 * @param {"en" | "zh"} language
 */
function setVisualState(theme, language) {
  dispatchShortcut(",", "Comma", { ctrlKey: true });
  waitForElement(THEME_ROW);
  chooseGeneralOption(THEME_ROW, theme);
  chooseGeneralOption(LANGUAGE_ROW, language);
  dismissSettingsSurface();
  waitForVisualState(theme, language);
}

/**
 * Capture one element's own rectangle. The capture renders the page from the
 * top of every scroll area, so a viewport-sized capture cannot show a row the
 * plugins list has scrolled to; clipping the row itself shows it wherever the
 * list sits. A full-page capture is not an option either, because it does not
 * carry the settings surface at all.
 *
 * @param {string} theme
 * @param {"en" | "zh"} language
 * @param {string} selector the element the image has to show
 * @param {string} fileSuffix
 */
function captureElement(theme, language, selector, fileSuffix) {
  const artifact = join(artifactRoot, `plugin-update-${theme}-${language}-${fileSuffix}.png`);
  pilot(["screenshot", artifact, "--selector", selector, "--window", windowLabel]);
  process.stderr.write(`black-box screenshot: ${artifact}\n`);
}

/**
 * Capture the asserted reporting for the two appearances the change has to hold
 * in. The image is the window's own WebView, which is what draws this copy.
 *
 * @param {string} theme
 * @param {"en" | "zh"} language
 */
function captureSurface(theme, language) {
  // The summary sits above the list, so capture the settings dialog a user
  // reads the line in. Selecting the dialog avoids a WebView body-root capture
  // event on Windows while preserving the complete settings surface.
  captureElement(theme, language, '[role="dialog"]', "summary");
  // The card is the last row of a list the panel scrolls and is only explained
  // while it is expanded, so open it and capture the card itself.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    expandFixtureCard();
    captureElement(theme, language, fixtureCardSelector, "card");
    if (fixtureCardIsExpanded()) return;
  }
  throw new Error("the fixture package card never stayed expanded for its capture");
}

waitForElement("#application-integrations-menu");

// Render the catalog once to learn the repositories it declares, then answer
// them from the cache so the check this scenario asserts stays offline. The
// delay lets the check that opening the page starts settle before the cache is
// written under it.
openPluginSurface();
sleepSync(2000);
const rendered = discoverRepositories();
seedUpdateCache(
  [
    ...builtinRegistryRepositories(),
    ...officialRegistryRepositories(),
    ...rendered.map((card) => card.repository),
  ],
  new Map(rendered.map((card) => [card.repository, card.version])),
);
dismissSettingsSurface();

for (const [theme, language] of /** @type {const} */ [
  ["light", "en"],
  ["dark", "zh"],
]) {
  setVisualState(theme, language);
  injectProbe(language);
  runScenario();
  openPluginSurface();
  checkForUpdates();
  captureSurface(theme, language);
  dismissSettingsSurface();
}

const logs = spawnSync(pilotBinary, ["logs", "--level", "error", "--window", windowLabel], {
  cwd: artifactRoot,
  env: pilotEnv,
  encoding: "utf8",
  stdio: "inherit",
});
if (logs.error) throw logs.error;
if (logs.status !== 0) throw new Error("tauri-pilot failed to read the main window logs");

process.stdout.write("Agent Plugin update black-box tests passed.\n");

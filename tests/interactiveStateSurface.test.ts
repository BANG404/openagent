import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { readSource, settingsViewSource } from "./sourceSurfaces";

const componentPaths = [
  "../src/lib/components/MentionPalette.svelte",
  "../src/lib/components/RoleSelector.svelte",
  "../src/lib/components/WorkspaceSwitcher.svelte",
  "../src/lib/components/ui/Combobox.svelte",
  "../src/lib/components/ui/Select.svelte",
];

const settingsSurfaceFiles = [
  "SettingsViewNavigation.svelte",
  "SettingsViewTabsPrimary.svelte",
  "SettingsViewTabsSecondary.svelte",
  "SettingsViewDialogs.svelte",
];

test("derives shared interaction states from the current text color in app.css", async () => {
  const appCss = await readFile(new URL("../src/app.css", import.meta.url), "utf8");

  expect(appCss).toContain("--interactive-state-opacity: 8%;");
  expect(appCss).toMatch(
    /--interactive-state-bg: color-mix\(\s*in srgb,\s*var\(--text\) var\(--interactive-state-opacity\),\s*transparent\s*\);/s,
  );
  expect(appCss).not.toContain("--interactive-state-bg: #f4f4f5;");
  expect(appCss).not.toContain("--interactive-state-bg: #27272a;");
  expect(appCss).toContain("--item-selected-bg: var(--interactive-state-bg);");
  expect(appCss).toContain("--item-selected-hover-bg: var(--interactive-state-bg);");
  expect(appCss).toContain(".interactive-control:hover:not(:disabled)");
  expect(appCss).toContain(".desktop-menu-item[data-selected]:not([data-disabled])");
  expect(appCss).toContain(".desktop-menu-search-input:focus-visible");
  expect(appCss).toContain(".application-settings-surface {");
  expect(appCss).toMatch(/\.application-settings-surface\s*{[^}]*box-shadow: none;/s);
  expect(appCss).toContain(".application-settings-control {");
  expect(appCss).toMatch(/\.application-settings-control\s*{[^}]*box-shadow: none;/s);
  expect(appCss).toContain(".application-settings-scope .ui-select-trigger,");
  expect(appCss).toMatch(
    /\.application-settings-scope \.ui-select-trigger,[^}]*border: 1px solid var\(--mica-divider\);/s,
  );
  expect(appCss.indexOf(".application-settings-surface {")).toBeGreaterThan(
    appCss.indexOf("/* Unlayered so shared settings utilities"),
  );

  const sources = await Promise.all(
    componentPaths.map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );
  for (const source of sources) {
    expect(source).toContain("desktop-menu-item");
    expect(source).not.toContain("background: var(--interactive-state-bg);");
  }

  const applicationMenu = await readFile(
    new URL("../src/lib/components/ApplicationMenuBar.svelte", import.meta.url),
    "utf8",
  );
  expect(appCss).toContain(".application-menu-item[data-highlighted]:not([data-disabled])");
  expect(applicationMenu).not.toContain("background: var(--interactive-state-bg);");
});

test("reuses shared controls across onboarding and settings collections", async () => {
  const onboarding = await readFile(
    new URL("../src/lib/components/OnboardingFlow.svelte", import.meta.url),
    "utf8",
  );
  const settings = await settingsViewSource();
  const settingsActionButton = await readFile(
    new URL("../src/lib/components/ui/SettingsActionButton.svelte", import.meta.url),
    "utf8",
  );
  const permissions = await readFile(
    new URL("../src/lib/components/PermissionSettings.svelte", import.meta.url),
    "utf8",
  );
  const workspaceBrowser = await readFile(
    new URL("../src/lib/components/SidebarWorkspaceBrowser.svelte", import.meta.url),
    "utf8",
  );

  expect(onboarding).toContain('import Select from "./ui/Select.svelte";');
  expect(onboarding.match(/<Select\b/g)).toHaveLength(5);
  expect(onboarding.match(/triggerClass="application-settings-control"/g)).toHaveLength(5);
  expect(onboarding.match(/class="application-settings-control"/g)).toHaveLength(4);
  expect(onboarding).toContain('class="application-settings-scope onboarding-panel"');
  expect(onboarding).not.toMatch(/\n\s*input\s*{/);
  expect(onboarding).not.toContain("<select");
  // 32 surfaces: the plugin page adds `plugin-token-card` for the optional
  // GitHub release-metadata token alongside the existing settings surfaces.
  expect(settings.match(/application-settings-surface/g)).toHaveLength(32);
  expect(settings).toContain('class="application-settings-scope settings-panel"');
  expect(settings).not.toMatch(/\.list-search-input,[\s\S]*?\.detail-input\s*{[^}]*border:/);
  for (const surfaceClass of [
    "settings-card",
    "shortcut-setting-row",
    "startup-row",
    "execution-setting",
    "channel-config-card",
    "remote-gateway-card",
    "remote-gateway-credentials",
    "wechat-qr-card",
    "wechat-connected-card",
    "model-list-box",
    "flash-task-card",
    "danger-zone",
  ]) {
    expect(settings).toMatch(
      new RegExp(`class="[^"]*application-settings-surface[^"]*\\b${surfaceClass}\\b`),
    );
  }
  expect(permissions).toContain(
    'class="application-settings-scope application-settings-surface permission-settings"',
  );
  expect(permissions).not.toMatch(/\.permission-settings\s*{[^}]*box-shadow:/s);
  expect(settings).not.toContain('class="interactive-control filter-toggle"');
  expect(settings).toMatch(/<SettingsActionButton\s+label=\{view\.providerFilter/);
  expect(settingsActionButton).toMatch(
    /\.settings-action\s*{[^}]*border: 1px solid var\(--mica-divider\);/s,
  );
  expect(settingsActionButton).toMatch(/\.settings-action\s*{[^}]*box-shadow: none;/s);
  expect(settings.match(/class="detail-input settings-card-number-input"/g)).toHaveLength(5);
  expect(settings).toMatch(
    /\.settings-card-number-input\s*{[^}]*justify-self: end;[^}]*margin-inline-start: auto;/s,
  );
  expect(settings.match(/settings-card-control settings-card-number-control/g)).toHaveLength(2);
  expect(settings).toMatch(/\.settings-card-number-control\s*{[^}]*justify-content: flex-end;/s);
  expect(settings).not.toContain('icon="add"\n            tone="primary"');
  expect(workspaceBrowser.match(/class="desktop-menu-item project-menu-item/g)).toHaveLength(3);
  expect(workspaceBrowser).not.toContain(".project-menu-item[data-highlighted]");
});

test("reuses the shared Select for application-owned choice fields", async () => {
  const sources = await Promise.all(
    ["UserInputForm.svelte", "WorkspaceDialogs.svelte", "DevInspector.svelte"].map((file) =>
      readFile(new URL(`../src/lib/components/${file}`, import.meta.url), "utf8"),
    ),
  );

  for (const source of sources) {
    expect(source).toContain("ui/Select.svelte");
    expect(source).toContain("<Select");
    expect(source).not.toContain("<select");
  }

  expect(sources[0]).toContain('"ask-user-select ask-user-select-error"');
  expect(sources[0]).toMatch(
    /\.ui-select-trigger\.ask-user-select\)[\s\S]*?background: var\(--bg\);[\s\S]*?box-shadow: none;/,
  );
});

test("keeps the settings-view context facade writable for its child surfaces", async () => {
  const settingsView = await readSource(
    new URL("../src/lib/components/SettingsView.svelte", import.meta.url),
  );
  const facade = settingsView.slice(settingsView.indexOf('setContext("settings-view"'));
  const getters = new Set(
    [...facade.matchAll(/^\s+get ([A-Za-z0-9_]+)\(\)/gmu)].map((match) => match[1]),
  );
  const setters = new Set(
    [...facade.matchAll(/^\s+set ([A-Za-z0-9_]+)\(/gmu)].map((match) => match[1]),
  );

  const written = new Map<string, string>();
  for (const file of settingsSurfaceFiles) {
    const source = await readSource(new URL(`../src/lib/components/${file}`, import.meta.url));
    for (const match of source.matchAll(
      /view\.([A-Za-z0-9_]+)(?![\w.])\s*(?:\+\+|--|(?:\?\?|\|\||[-+*/%])?=(?!=))/gu,
    )) {
      written.set(match[1], file);
    }
    for (const match of source.matchAll(/bind:[\w-]+=\{\s*view\.([A-Za-z0-9_]+)(?![\w.])/gu)) {
      written.set(match[1], file);
    }
  }

  expect(written.size).toBeGreaterThan(20);
  expect(
    [...written]
      .filter(([name]) => !(getters.has(name) && setters.has(name)))
      .map(([name, file]) => `${file}: view.${name} needs a matching get/set pair`),
  ).toEqual([]);
});

// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const componentPaths = [
  "../src/lib/components/MentionPalette.svelte",
  "../src/lib/components/RoleSelector.svelte",
  "../src/lib/components/WorkspaceSwitcher.svelte",
  "../src/lib/components/ui/Combobox.svelte",
  "../src/lib/components/ui/Select.svelte",
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
  const settings = await readFile(
    new URL("../src/lib/components/SettingsView.svelte", import.meta.url),
    "utf8",
  );
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
  expect(settings.match(/application-settings-surface/g)).toHaveLength(29);
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
  expect(settings).toMatch(/<SettingsActionButton\s+label=\{providerFilter/);
  expect(settingsActionButton).toMatch(
    /\.settings-action\s*{[^}]*border: 1px solid var\(--mica-divider\);/s,
  );
  expect(settingsActionButton).toMatch(/\.settings-action\s*{[^}]*box-shadow: none;/s);
  expect(settings.match(/class="detail-input settings-card-number-input"/g)).toHaveLength(6);
  expect(settings).toMatch(
    /\.settings-card-number-input\s*{[^}]*justify-self: end;[^}]*margin-inline-start: auto;/s,
  );
  expect(settings.match(/settings-card-control settings-card-number-control/g)).toHaveLength(2);
  expect(settings).toMatch(/\.settings-card-number-control\s*{[^}]*justify-content: flex-end;/s);
  expect(settings).not.toContain('icon="add"\n            tone="primary"');
  expect(workspaceBrowser.match(/class="desktop-menu-item project-menu-item/g)).toHaveLength(3);
  expect(workspaceBrowser).not.toContain(".project-menu-item[data-highlighted]");
});

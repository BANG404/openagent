import { readFile } from "node:fs/promises";

const componentsUrl = new URL("../src/lib/components/", import.meta.url);

export async function readSource(url: URL | string): Promise<string> {
  return (await readFile(url, "utf8")).replace(/\r\n/gu, "\n");
}

export async function settingsViewSource(): Promise<string> {
  return (
    await Promise.all(
      [
        "SettingsView.svelte",
        "SettingsViewNavigation.svelte",
        "SettingsViewTabsPrimary.svelte",
        "SettingsViewTabsSecondary.svelte",
        "SettingsViewDialogs.svelte",
        "settings-view.css",
      ].map((file) => readSource(new URL(file, componentsUrl))),
    )
  ).join("\n");
}

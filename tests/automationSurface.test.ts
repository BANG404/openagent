// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const componentsUrl = new URL("../src/lib/components/", import.meta.url);

describe("automation settings surface", () => {
  test("keeps every lifecycle event in the editor option set", async () => {
    const settings = await readFile(new URL("SettingsView.svelte", componentsUrl), "utf8");
    const events = [
      "session_start",
      "session_end",
      "user_prompt_submit",
      "subagent_start",
      "subagent_stop",
      "permission_request",
      "pre_compact",
      "post_compact",
      "stop",
      "interrupt",
      "before_model",
      "after_model",
      "before_tool",
      "after_tool",
    ];

    for (const event of events) {
      expect(settings).toContain(`{ value: "${event}"`);
    }
    expect(settings).toContain('automationHookDraft.event === "before_tool"');
    expect(settings).toContain('automationHookDraft.event === "after_tool"');
  });

  test("keeps all scheduled hook modes connected to their argument mapping", async () => {
    const settings = await readFile(new URL("SettingsView.svelte", componentsUrl), "utf8");
    const modes = ["delay", "run_at", "interval_minutes", "daily", "weekdays", "weekly"];

    for (const mode of modes) {
      expect(settings).toContain(`{ value: "${mode}"`);
      expect(settings).toContain(`hookMode === "${mode}"`);
    }
    expect(settings).toContain('args.recurrence = "interval_minutes"');
    expect(settings).toContain('args.recurrence = "weekly"');
    expect(settings).toContain("args.weekdays = hookWeekdays");
    expect(settings).toContain("hook.args.recurrence as typeof hookMode");
  });

  test("keeps both automation destinations wired to the top-bar menu", async () => {
    const menu = await readFile(new URL("ApplicationMenuBar.svelte", componentsUrl), "utf8");

    expect(menu.match(/onOpenSettingsWindow\("automation"/g)).toHaveLength(2);
    expect(menu).toContain('onOpenSettingsWindow("automation", "lifecycle")');
    expect(menu).toContain('onOpenSettingsWindow("automation", "schedules")');
    expect(menu).toContain('key === "u"');
    expect(menu).toContain('Digit7: { kind: "automation", section: "lifecycle" }');
    expect(menu).toContain('Digit8: { kind: "automation", section: "schedules" }');
  });

  test("does not let delayed initial navigation override a user tab choice", async () => {
    const settings = await readFile(new URL("SettingsView.svelte", componentsUrl), "utf8");
    expect(settings).toContain(
      'document.querySelector<HTMLButtonElement>("[data-tabs-trigger][data-state=active]")',
    );
    expect(settings).toContain("bind:value={selectedSettingsSection}");
  });
});

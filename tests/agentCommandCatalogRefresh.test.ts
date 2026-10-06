import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const pageRuntime = readFileSync("src/routes/PageRuntime.svelte", "utf8");
const remoteRoute = readFileSync("src/routes/remote/+page.svelte", "utf8");
const startup = readFileSync("src/lib/page/startup.ts", "utf8");
const surfaceEvents = readFileSync("src/lib/page/events/surfaceEvents.ts", "utf8");

describe("agent command catalog refresh", () => {
  test("reads the Runtime catalog through one refresh helper", () => {
    expect(pageRuntime).toContain("async function refreshAgentCommands() {");
    expect(pageRuntime).toContain("agentCommandSpecs = await openAgent.listAgentCommands();");
    expect(pageRuntime).toContain("agentCommandSpecs.flatMap((spec) => {");
  });

  test("refreshes at every settings and plugin lifecycle change", () => {
    const callSites =
      [pageRuntime, startup, surfaceEvents]
        .join("\n")
        .match(/void (?:options\.)?refreshAgentCommands\(\);/g) ?? [];
    // Startup plus the settings-changed, agent-plugins-changed, and settings
    // save paths. A disabled plugin must leave the composer palette without an
    // application restart.
    expect(callSites.length).toBeGreaterThanOrEqual(4);
    expect(surfaceEvents).toMatch(
      /register\("agent-plugins-changed", \(\) => \{\s*\n\s*void options\.refreshAgentCommands\(\);/,
    );
    expect(surfaceEvents).toMatch(
      /register\("settings-changed", \(\) => \{[\s\S]*?void options\.refreshAgentCommands\(\);/,
    );
    expect(pageRuntime).toMatch(
      /async function saveSettings\([\s\S]*?void refreshAgentCommands\(\);/,
    );
  });

  test("deduplicates short and fully qualified package aliases in the remote palette", () => {
    expect(remoteRoute).toContain("const catalogKey =");
    expect(remoteRoute).toContain("normalizedName === `${spec.plugin_id}:${spec.plugin_id}`");
    expect(remoteRoute).toContain("id: catalogKey");
    expect(remoteRoute).toContain("insertText = spec.plugin_id ? `/${catalogKey}`");
  });

  test("normalizes legacy slash-prefixed package aliases in the desktop palette", () => {
    expect(pageRuntime).toContain('const normalizedName = spec.name.replace(/^\\/+/, "");');
    expect(pageRuntime).toContain("normalizedName === spec.plugin_id ||");
    expect(pageRuntime).toContain("id: commandName");
  });
});

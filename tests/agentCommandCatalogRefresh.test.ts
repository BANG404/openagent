import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const pageRuntime = readFileSync("src/routes/PageRuntime.svelte", "utf8");

describe("agent command catalog refresh", () => {
  test("reads the Runtime catalog through one refresh helper", () => {
    expect(pageRuntime).toContain("async function refreshAgentCommands() {");
    expect(pageRuntime).toContain("agentCommandSpecs = await openAgent.listAgentCommands();");
    expect(pageRuntime).toContain("agentCommandSpecs.flatMap((spec) => {");
  });

  test("refreshes at every settings and plugin lifecycle change", () => {
    const callSites = pageRuntime.match(/void refreshAgentCommands\(\);/g) ?? [];
    // Startup plus the settings-changed, agent-plugins-changed, and settings
    // save paths. A disabled plugin must leave the composer palette without an
    // application restart.
    expect(callSites.length).toBeGreaterThanOrEqual(4);
    expect(pageRuntime).toMatch(
      /register\("agent-plugins-changed", \(\) => \{\s*\n\s*void refreshAgentCommands\(\);/,
    );
    expect(pageRuntime).toMatch(
      /register\("settings-changed", \(\) => \{[\s\S]*?void refreshAgentCommands\(\);/,
    );
    expect(pageRuntime).toMatch(
      /async function saveSettings\([\s\S]*?void refreshAgentCommands\(\);/,
    );
  });
});

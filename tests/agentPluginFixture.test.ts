import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const fixtureRoot = resolve("tests/fixtures/agent-plugin-demo");

describe("Agent Plugin fixture", () => {
  test("uses the portable manifest and OpenAgent extension namespace", async () => {
    const manifest = JSON.parse(await readFile(resolve(fixtureRoot, "plugin.json"), "utf8")) as {
      $schema?: string;
      name?: string;
      extensions?: {
        openagent?: {
          sidebar?: Array<{ entry?: string }>;
          automation?: Array<{ command?: string }>;
        };
      };
    };

    expect(manifest.$schema).toBe("https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
    expect(manifest.name).toBe("openagent-demo-plugin");
    expect(manifest.extensions?.openagent?.sidebar?.[0]?.entry).toBe("ui/panel.html");
    expect(manifest.extensions?.openagent?.automation?.[0]?.command).toBe("hooks/after-tool.cmd");
  });

  test("keeps every declared component inside the fixture package", async () => {
    const manifest = JSON.parse(await readFile(resolve(fixtureRoot, "plugin.json"), "utf8")) as {
      extensions?: {
        openagent?: {
          sidebar?: Array<{ entry?: string }>;
          automation?: Array<{ command?: string }>;
        };
      };
    };
    const paths = [
      manifest.extensions?.openagent?.sidebar?.[0]?.entry,
      manifest.extensions?.openagent?.automation?.[0]?.command,
    ];

    for (const relativePath of paths) {
      expect(relativePath).toBeDefined();
      expect(relativePath).not.toContain("..");
      expect(await readFile(resolve(fixtureRoot, relativePath!), "utf8")).toBeTruthy();
    }
  });

  test("uses a directory-matching Skill name", async () => {
    const skill = await readFile(resolve(fixtureRoot, "skills/demo/SKILL.md"), "utf8");
    expect(skill).toContain("name: demo");
  });
});

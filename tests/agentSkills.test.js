import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  manifestErrors,
  referenceRoutingErrors,
  validate,
} from "../scripts/validate-agent-skills.mjs";
import { loadSkillManifest, resolveSkillOwner } from "../scripts/agent-skill-routing.mjs";

describe("agent skill contract", () => {
  test("has valid entrypoints, references, and primary-owner routing", () => {
    expect(validate()).toEqual([]);
  });

  test("selects specific subsystem owners independently of manifest order", () => {
    const manifest = loadSkillManifest();
    const reversed = { ...manifest, owners: [...manifest.owners].reverse() };
    const cases = [
      ["src/lib/settings/channels.svelte.ts", "openagent-channel-integrations"],
      ["src/lib/components/settings/SettingsPluginsTab.svelte", "openagent-plugin-development"],
      ["src/lib/pluginSidebar.ts", "openagent-plugin-development"],
      ["src/lib/settingsConfig.ts", "openagent-configuration"],
      ["src/lib/inputQueue.svelte.ts", "openagent-chat-frontend"],
      ["src/lib/themeTokens.ts", "openagent-design-system"],
      ["src-tauri/src/component_updates/mod.rs", "openagent-update-delivery"],
      ["crates/openagent-app/src/embedding_resource.rs", "openagent-desktop-host"],
      ["scripts/fetch-embedding-model.mjs", "openagent-desktop-host"],
      ["scripts/validate-agent-skills.mjs", "agent-prompt-infrastructure"],
      [".agents/skills/wait-for-pr-ci/scripts/wait_for_pr_ci.py", "wait-for-pr-ci"],
    ];
    for (const [file, owner] of cases) {
      expect(resolveSkillOwner(file, manifest)).toBe(owner);
      expect(resolveSkillOwner(file.replaceAll("/", "\\"), reversed)).toBe(owner);
    }
    expect(resolveSkillOwner("src/lib/nested/pluginExample.ts", manifest)).toBe(
      "openagent-chat-frontend",
    );
    expect(resolveSkillOwner("runtime/rust/lib.rs", manifest)).toBeUndefined();
  });

  test("rejects equal-specificity ambiguity rather than choosing the first owner", () => {
    const manifest = {
      version: 2,
      owners: [
        { skill: "one", paths: ["src/plugin*.ts"] },
        { skill: "two", paths: ["src/plugin*"] },
      ],
    };
    expect(() => resolveSkillOwner("src/pluginSidebar.ts", manifest)).toThrow(
      "Ambiguous skill ownership",
    );
    expect(manifestErrors(manifest, new Set(["one", "two"]), ["src/pluginSidebar.ts"])).toEqual([
      expect.stringContaining("Ambiguous skill ownership"),
    ]);
  });

  test("rejects stale route prefixes and duplicate routes, while allowing workflow-only owners", () => {
    expect(
      manifestErrors(
        { version: 2, owners: [{ skill: "updates", paths: ["src-tauri/src/update/"] }] },
        new Set(["updates"]),
        ["src-tauri/src/component_updates/mod.rs"],
      ),
    ).toEqual([expect.stringContaining("route matches no repository paths")]);
    expect(
      manifestErrors(
        {
          version: 2,
          owners: [
            { skill: "one", paths: ["src/"] },
            { skill: "two", paths: ["src/"] },
          ],
        },
        new Set(["one", "two"]),
        ["src/app.ts"],
      ),
    ).toEqual([expect.stringContaining("Duplicate route")]);
    expect(
      manifestErrors(
        { version: 2, owners: [{ skill: "workflow", paths: [] }] },
        new Set(["workflow"]),
        [],
      ),
    ).toEqual([]);
  });

  test("accepts conditional reference chains and reports unreachable reference cycles", () => {
    const directory = mkdtempSync(join(tmpdir(), "openagent-skill-links-"));
    try {
      const skill = join(directory, "fixture");
      const references = join(skill, "references");
      mkdirSync(references, { recursive: true });
      writeFileSync(join(skill, "SKILL.md"), "For restore, read [restore](references/restore.md).");
      writeFileSync(
        join(references, "restore.md"),
        "For failure recovery, read [recovery](recovery.md).",
      );
      writeFileSync(join(references, "recovery.md"), "Recovery invariants.");
      expect(referenceRoutingErrors(directory)).toEqual([]);
      writeFileSync(join(references, "orphan.md"), "[Other](other.md)");
      writeFileSync(join(references, "other.md"), "[Orphan](orphan.md)");
      expect(referenceRoutingErrors(directory)).toHaveLength(2);
      writeFileSync(join(references, "recovery.md"), "[More](orphan.md)");
      expect(referenceRoutingErrors(directory)).toEqual([]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

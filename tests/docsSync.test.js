// @ts-nocheck -- Bun provides the test module at runtime.
import { describe, expect, test } from "bun:test";
import { documentationSyncErrors } from "../scripts/check-docs-sync.mjs";

describe("agent-facing documentation synchronization", () => {
  test("accepts documentation-only and test-only changes", () => {
    expect(documentationSyncErrors([".agents/skills/openagent-design-system/SKILL.md"])).toEqual(
      [],
    );
    expect(documentationSyncErrors(["tests/chatStream.test.ts"])).toEqual([]);
  });

  test("requires documentation for product logic", () => {
    expect(documentationSyncErrors(["src/lib/settingsConfig.ts"])).toHaveLength(1);
    expect(
      documentationSyncErrors([
        "src/lib/settingsConfig.ts",
        ".agents/skills/openagent-configuration/references/save-and-reload.md",
      ]),
    ).toEqual([]);
  });

  test("requires the chat skill for mapped chat behavior", () => {
    const errors = documentationSyncErrors([
      "src/lib/chatStream.ts",
      ".agents/skills/openagent-design-system/references/inputs-and-forms.md",
    ]);

    expect(errors).toEqual([
      "Chat frontend logic changed without Markdown under .agents/skills/openagent-chat-frontend/. Update the skill's current invariant in the same change.",
    ]);
  });

  test("accepts chat behavior and skill changes together", () => {
    expect(
      documentationSyncErrors([
        "src/lib/components/MessageList.svelte",
        ".agents/skills/openagent-chat-frontend/SKILL.md",
      ]),
    ).toEqual([]);

    expect(
      documentationSyncErrors([
        "src/lib/chatStream.ts",
        ".agents/skills/openagent-chat-frontend/references/streaming.md",
      ]),
    ).toEqual([]);
  });

  test("requires documentation for automation logic", () => {
    expect(documentationSyncErrors(["scripts/release.mjs"])).toHaveLength(1);
    expect(
      documentationSyncErrors([
        "scripts/release.mjs",
        ".agents/skills/openagent-release-engineering/references/versioning.md",
      ]),
    ).toEqual([]);
  });

  test("treats manifests and embedded skills as living documentation inputs", () => {
    expect(documentationSyncErrors(["package.json"])).toHaveLength(1);
    expect(documentationSyncErrors(["package.json", "CHANGELOG.md"])).toEqual([]);
    expect(documentationSyncErrors(["package.json", "static/skills/find-skills/SKILL.md"])).toEqual(
      [],
    );
  });

  test("normalizes Windows paths and ignores the SDK gitlink", () => {
    expect(
      documentationSyncErrors([
        "src\\lib\\chatStream.ts",
        ".agents\\skills\\openagent-chat-frontend\\SKILL.md",
      ]),
    ).toEqual([]);
    expect(documentationSyncErrors(["sdk"])).toEqual([]);
  });
});

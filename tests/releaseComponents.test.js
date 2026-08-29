// @ts-nocheck -- Bun provides the test module at runtime.
import { describe, expect, test } from "bun:test";
import {
  allReleaseComponents,
  classifyReleaseComponents,
  normalizeReleaseComponents,
} from "../scripts/release-components.mjs";

describe("release component classification", () => {
  test("publishes frontend resources without selecting a native installer", () => {
    expect(classifyReleaseComponents(["src/routes/+page.svelte"])).toEqual({
      frontend: true,
      runtime: false,
      nativeShell: false,
    });
  });

  test("publishes runtime-only SDK changes without selecting a native installer", () => {
    expect(
      classifyReleaseComponents(
        ["sdk"],
        ["rust/openagent-runtime/src/lib.rs", "rust/openagent-server/src/main.rs"],
      ),
    ).toEqual({ frontend: false, runtime: true, nativeShell: false });
  });

  test("keeps SDK TypeScript and protocol changes on their actual consumers", () => {
    expect(classifyReleaseComponents(["sdk"], ["typescript/src/client.ts"])).toEqual({
      frontend: true,
      runtime: false,
      nativeShell: false,
    });
    expect(classifyReleaseComponents(["sdk"], ["rust/openagent-protocol/src/lib.rs"])).toEqual({
      frontend: true,
      runtime: true,
      nativeShell: false,
    });
  });

  test("selects native installers only for native shell source", () => {
    expect(classifyReleaseComponents(["src-tauri/src/lib.rs"])).toEqual({
      frontend: false,
      runtime: false,
      nativeShell: true,
    });
  });

  test("uses a conservative fallback when private SDK paths are unavailable", () => {
    expect(classifyReleaseComponents(["sdk"])).toEqual({
      frontend: true,
      runtime: true,
      nativeShell: false,
    });
    expect(normalizeReleaseComponents(null)).toEqual(allReleaseComponents());
  });
});

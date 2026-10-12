import { describe, expect, test } from "bun:test";

import { classifyReleaseComponents } from "./release-components.mjs";

describe("release component compatibility classification", () => {
  test("publishes Runtime resources when their signed installation identity changes", () => {
    expect(classifyReleaseComponents(["scripts/stage-release-runtime.mjs"])).toEqual({
      frontend: false,
      runtime: true,
      nativeShell: false,
    });
  });

  test("publishes frontend resources with frontend-shell contract changes", () => {
    expect(classifyReleaseComponents(["src-tauri/src/frontend_resource.rs"])).toEqual({
      frontend: true,
      runtime: false,
      nativeShell: true,
    });
  });

  test("publishes frontend resources when their signed manifest changes", () => {
    expect(classifyReleaseComponents(["scripts/frontend-artifacts.mjs"])).toEqual({
      frontend: true,
      runtime: false,
      nativeShell: false,
    });
  });
});

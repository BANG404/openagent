// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";

import { parseRoleEditorRequest } from "../src/lib/roleEditorWindow";

describe("role editor window request", () => {
  test("parses an edit target and requesting workspace window", () => {
    const request = parseRoleEditorRequest(
      new URLSearchParams("role-id=role%3Aglobal&requester-label=workspace-42"),
    );

    expect(request).toEqual({ roleId: "role:global", requesterLabel: "workspace-42" });
  });

  test("normalizes a new-role request and defaults the main window", () => {
    expect(parseRoleEditorRequest(new URLSearchParams("role-id="))).toEqual({
      roleId: null,
      requesterLabel: "main",
    });
  });
});

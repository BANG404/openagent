// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import {
  cloneManagedPermissionProfile,
  managedPermissionPreset,
  managedProfileWithPreset,
  readOnlyPermissionProfile,
  workspaceWritablePermissionProfile,
} from "../src/lib/permissionProfiles";

describe("managed permission presets", () => {
  test("recognizes only the canonical workspace-write and read-only shapes", () => {
    expect(managedPermissionPreset(workspaceWritablePermissionProfile())).toBe("workspace_write");
    expect(managedPermissionPreset(readOnlyPermissionProfile())).toBe("read_only");
    expect(
      managedPermissionPreset({
        enforcement: "managed",
        file_system: {
          entries: [
            { path: { kind: "host_root" }, access: "read" },
            { path: { kind: "workspace" }, access: "write" },
            { path: { kind: "workspace", subpath: ".agents" }, access: "deny" },
          ],
        },
        network: "restricted",
      }),
    ).toBe("custom");
  });

  test("changes filesystem presets without changing network access", () => {
    const enabled = workspaceWritablePermissionProfile("enabled");

    expect(managedProfileWithPreset(enabled, "read_only")).toEqual(
      readOnlyPermissionProfile("enabled"),
    );
  });

  test("clones custom entries so editor snapshots cannot mutate the source", () => {
    const source = {
      enforcement: "managed" as const,
      file_system: {
        entries: [
          { path: { kind: "workspace" as const, subpath: "src" }, access: "write" as const },
        ],
      },
      network: "restricted" as const,
    };
    const cloned = cloneManagedPermissionProfile(source);

    cloned.file_system.entries[0].access = "deny";
    expect(source.file_system.entries[0].access).toBe("write");
  });
});

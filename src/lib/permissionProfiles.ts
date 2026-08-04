import type { FileSystemPermissionEntry, NetworkAccess, PermissionProfile } from "./types";

export type ManagedPermissionProfile = Extract<PermissionProfile, { enforcement: "managed" }>;
export type ManagedPermissionPreset = "workspace_write" | "read_only" | "custom";

function cloneEntries(entries: FileSystemPermissionEntry[]): FileSystemPermissionEntry[] {
  return entries.map((entry) => ({
    access: entry.access,
    path: { ...entry.path },
  }));
}

export function workspaceWritablePermissionProfile(
  network: NetworkAccess = "restricted",
): ManagedPermissionProfile {
  return {
    enforcement: "managed",
    file_system: {
      entries: [
        { path: { kind: "host_root" }, access: "read" },
        { path: { kind: "workspace" }, access: "write" },
      ],
    },
    network,
  };
}

export function readOnlyPermissionProfile(
  network: NetworkAccess = "restricted",
): ManagedPermissionProfile {
  return {
    enforcement: "managed",
    file_system: {
      entries: [{ path: { kind: "host_root" }, access: "read" }],
    },
    network,
  };
}

function isHostRootRead(entry: FileSystemPermissionEntry | undefined): boolean {
  return entry?.access === "read" && entry.path.kind === "host_root";
}

function isWorkspaceRootWrite(entry: FileSystemPermissionEntry | undefined): boolean {
  return entry?.access === "write" && entry.path.kind === "workspace" && !entry.path.subpath;
}

export function managedPermissionPreset(
  profile: ManagedPermissionProfile,
): ManagedPermissionPreset {
  const entries = profile.file_system.entries;
  if (entries.length === 1 && isHostRootRead(entries[0])) return "read_only";
  if (entries.length === 2 && isHostRootRead(entries[0]) && isWorkspaceRootWrite(entries[1])) {
    return "workspace_write";
  }
  return "custom";
}

export function managedProfileWithPreset(
  profile: ManagedPermissionProfile,
  preset: Exclude<ManagedPermissionPreset, "custom">,
): ManagedPermissionProfile {
  return preset === "workspace_write"
    ? workspaceWritablePermissionProfile(profile.network)
    : readOnlyPermissionProfile(profile.network);
}

export function cloneManagedPermissionProfile(
  profile: ManagedPermissionProfile,
): ManagedPermissionProfile {
  return {
    enforcement: "managed",
    file_system: { entries: cloneEntries(profile.file_system.entries) },
    network: profile.network,
  };
}

export function permissionProfileNetwork(
  profile: PermissionProfile,
  fallback: NetworkAccess = "restricted",
): NetworkAccess {
  return profile.enforcement === "disabled" ? fallback : profile.network;
}

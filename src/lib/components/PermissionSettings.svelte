<script lang="ts">
  import type {
    FileSystemAccess,
    FileSystemPermissionEntry,
    FileSystemPermissionPath,
    NetworkAccess,
    PermissionProfile,
  } from "$lib/types";
  import {
    cloneManagedPermissionProfile,
    managedPermissionPreset,
    managedProfileWithPreset,
    permissionProfileNetwork,
    workspaceWritablePermissionProfile,
    type ManagedPermissionPreset,
    type ManagedPermissionProfile,
  } from "$lib/permissionProfiles";
  import { t } from "$lib/i18n";
  import { untrack } from "svelte";
  import Tooltip from "./Tooltip.svelte";
  import Select from "./ui/Select.svelte";

  let {
    profile,
    onProfileChange,
  }: {
    profile: PermissionProfile;
    onProfileChange: (profile: PermissionProfile) => void;
  } = $props();

  type PermissionEnforcement = PermissionProfile["enforcement"];
  type PermissionPathKind = FileSystemPermissionPath["kind"];

  const initialProfile = untrack(() => profile);
  const initialManagedProfile =
    initialProfile.enforcement === "managed"
      ? cloneManagedPermissionProfile(initialProfile)
      : workspaceWritablePermissionProfile(permissionProfileNetwork(initialProfile));
  const initialFileSystemPreset = managedPermissionPreset(initialManagedProfile);

  let lastManagedProfile = $state<ManagedPermissionProfile>(initialManagedProfile);
  let fileSystemPreset = $state<ManagedPermissionPreset>(initialFileSystemPreset);
  let lastCustomEntries = $state<FileSystemPermissionEntry[] | null>(
    initialFileSystemPreset === "custom"
      ? initialManagedProfile.file_system.entries.map((entry) => ({
          access: entry.access,
          path: { ...entry.path },
        }))
      : null,
  );
  let lastProfileSignature = $state(JSON.stringify(initialProfile));
  let lastEmittedSignature = $state<string | null>(null);
  let newRuleAccess = $state<FileSystemAccess>("read");
  let newRuleKind = $state<PermissionPathKind>("workspace");
  let newRulePath = $state("");

  const pathKindLabelKey = {
    host_root: "permissionPathHostRoot",
    workspace: "permissionPathWorkspace",
    absolute: "permissionPathAbsolute",
  } as const;

  let managedProfile = $derived(profile.enforcement === "managed" ? profile : lastManagedProfile);
  let canAddRule = $derived(newRuleKind !== "absolute" || newRulePath.trim().length > 0);

  $effect(() => {
    const signature = JSON.stringify(profile);
    if (signature === lastProfileSignature) return;
    lastProfileSignature = signature;
    if (signature === lastEmittedSignature) {
      lastEmittedSignature = null;
      return;
    }

    if (profile.enforcement === "managed") {
      lastManagedProfile = cloneManagedPermissionProfile(profile);
      fileSystemPreset = managedPermissionPreset(profile);
      if (fileSystemPreset === "custom") {
        lastCustomEntries = profile.file_system.entries.map((entry) => ({
          access: entry.access,
          path: { ...entry.path },
        }));
      }
    }
  });

  function emitProfile(nextProfile: PermissionProfile) {
    lastEmittedSignature = JSON.stringify(nextProfile);
    onProfileChange(nextProfile);
  }

  function commitManaged(nextProfile: ManagedPermissionProfile) {
    lastManagedProfile = cloneManagedPermissionProfile(nextProfile);
    if (fileSystemPreset === "custom") {
      lastCustomEntries = nextProfile.file_system.entries.map((entry) => ({
        access: entry.access,
        path: { ...entry.path },
      }));
    }
    emitProfile(nextProfile);
  }

  function changeEnforcement(value: string) {
    const enforcement = value as PermissionEnforcement;
    if (enforcement === profile.enforcement) return;
    if (enforcement === "managed") {
      emitProfile(cloneManagedPermissionProfile(lastManagedProfile));
      return;
    }
    emitProfile({ enforcement: "disabled" });
  }

  function changeFileSystemPreset(value: string) {
    const nextPreset = value as ManagedPermissionPreset;
    if (nextPreset === fileSystemPreset) return;
    if (fileSystemPreset === "custom") {
      lastCustomEntries = managedProfile.file_system.entries.map((entry) => ({
        access: entry.access,
        path: { ...entry.path },
      }));
    }
    fileSystemPreset = nextPreset;
    if (nextPreset === "custom") {
      // Entering the editor does not change a canonical preset by itself. Avoid
      // an equal-value profile emission: the settings save cycle may remount
      // this component and infer the canonical preset again before any rule is
      // actually edited.
      if (lastCustomEntries === null) return;
      commitManaged({
        ...managedProfile,
        file_system: {
          entries: lastCustomEntries.map((entry) => ({
            access: entry.access,
            path: { ...entry.path },
          })),
        },
      });
      return;
    }
    commitManaged(managedProfileWithPreset(managedProfile, nextPreset));
  }

  function changeNetwork(value: string) {
    const network = value as NetworkAccess;
    if (profile.enforcement === "managed") {
      commitManaged({ ...managedProfile, network });
    }
  }

  function replaceRule(index: number, entry: FileSystemPermissionEntry) {
    const entries = managedProfile.file_system.entries.map((current, currentIndex) =>
      currentIndex === index ? entry : current,
    );
    commitManaged({ ...managedProfile, file_system: { entries } });
  }

  function changeRuleAccess(index: number, value: string) {
    const entry = managedProfile.file_system.entries[index];
    if (!entry) return;
    replaceRule(index, { ...entry, access: value as FileSystemAccess });
  }

  function changeRulePath(index: number, value: string) {
    const entry = managedProfile.file_system.entries[index];
    if (!entry || entry.path.kind === "host_root") return;
    const trimmed = value.trim();
    if (entry.path.kind === "absolute" && !trimmed) return;
    replaceRule(index, {
      ...entry,
      path:
        entry.path.kind === "absolute"
          ? { kind: "absolute", path: trimmed }
          : { kind: "workspace", ...(trimmed ? { subpath: trimmed } : {}) },
    });
  }

  function removeRule(index: number) {
    commitManaged({
      ...managedProfile,
      file_system: {
        entries: managedProfile.file_system.entries.filter(
          (_, currentIndex) => currentIndex !== index,
        ),
      },
    });
  }

  function addRule() {
    if (!canAddRule) return;
    const trimmed = newRulePath.trim();
    const path: FileSystemPermissionPath =
      newRuleKind === "host_root"
        ? { kind: "host_root" }
        : newRuleKind === "absolute"
          ? { kind: "absolute", path: trimmed }
          : { kind: "workspace", ...(trimmed ? { subpath: trimmed } : {}) };
    commitManaged({
      ...managedProfile,
      file_system: {
        entries: [...managedProfile.file_system.entries, { access: newRuleAccess, path }],
      },
    });
    newRulePath = "";
  }
</script>

<div class="application-settings-scope application-settings-surface permission-settings">
  <div class="permission-control">
    <div class="permission-control-copy">
      <span class="permission-label">{$t("permissionEnforcement")}</span>
      <span class="permission-description">{$t("permissionEnforcementDescription")}</span>
    </div>
    <div class="permission-select">
      <Select
        value={profile.enforcement}
        items={[
          {
            value: "managed",
            label: $t("permissionManaged"),
            description: $t("permissionManagedDescription"),
          },
          {
            value: "disabled",
            label: $t("permissionDisabled"),
            description: $t("permissionDisabledDescription"),
          },
        ]}
        ariaLabel={$t("permissionEnforcement")}
        onValueChange={changeEnforcement}
      />
    </div>
  </div>

  {#if profile.enforcement === "managed"}
    <div class="permission-divider"></div>
    <div class="permission-control">
      <div class="permission-control-copy">
        <span class="permission-label">{$t("permissionFileSystem")}</span>
        <span class="permission-description">{$t("permissionFileSystemDescription")}</span>
      </div>
      <div class="permission-select">
        <Select
          value={fileSystemPreset}
          items={[
            {
              value: "workspace_write",
              label: $t("permissionPresetWorkspaceWrite"),
              description: $t("permissionPresetWorkspaceWriteDescription"),
            },
            {
              value: "read_only",
              label: $t("permissionPresetReadOnly"),
              description: $t("permissionPresetReadOnlyDescription"),
            },
            {
              value: "custom",
              label: $t("permissionPresetCustom"),
              description: $t("permissionPresetCustomDescription"),
            },
          ]}
          ariaLabel={$t("permissionFileSystem")}
          onValueChange={changeFileSystemPreset}
        />
      </div>
    </div>
    <div class="permission-divider"></div>
    <div class="permission-control">
      <div class="permission-control-copy">
        <span class="permission-label">{$t("permissionNetwork")}</span>
        <span class="permission-description">{$t("permissionNetworkDescription")}</span>
      </div>
      <div class="permission-select">
        <Select
          value={profile.network}
          items={[
            {
              value: "restricted",
              label: $t("permissionNetworkRestricted"),
              description: $t("permissionNetworkRestrictedDescription"),
            },
            {
              value: "enabled",
              label: $t("permissionNetworkEnabled"),
              description: $t("permissionNetworkEnabledDescription"),
            },
          ]}
          ariaLabel={$t("permissionNetwork")}
          onValueChange={changeNetwork}
        />
      </div>
    </div>

    {#if fileSystemPreset === "custom"}
      <div class="custom-rules">
        <div class="custom-rules-heading">
          <div>
            <h5>{$t("permissionCustomRules")}</h5>
            <p>{$t("permissionCustomRulesDescription")}</p>
          </div>
          <span class="rule-count">{profile.file_system.entries.length}</span>
        </div>

        <div class="rule-list">
          {#if profile.file_system.entries.length === 0}
            <p class="empty-rules">{$t("permissionNoCustomRules")}</p>
          {:else}
            {#each profile.file_system.entries as entry, index (`${index}-${entry.path.kind}`)}
              <div class="rule-row">
                <div class="rule-access">
                  <Select
                    value={entry.access}
                    items={[
                      { value: "read", label: $t("permissionAccessRead") },
                      { value: "write", label: $t("permissionAccessWrite") },
                      { value: "deny", label: $t("permissionAccessDeny") },
                    ]}
                    ariaLabel={$t("permissionRuleAccess")}
                    onValueChange={(value) => changeRuleAccess(index, value)}
                  />
                </div>
                <div class="rule-path">
                  <span class="path-kind">{$t(pathKindLabelKey[entry.path.kind])}</span>
                  {#if entry.path.kind === "host_root"}
                    <span class="path-value">{$t("permissionPathHostRootValue")}</span>
                  {:else}
                    <input
                      value={entry.path.kind === "absolute"
                        ? entry.path.path
                        : (entry.path.subpath ?? "")}
                      required={entry.path.kind === "absolute"}
                      aria-label={$t("permissionRulePath")}
                      placeholder={entry.path.kind === "absolute"
                        ? $t("permissionAbsolutePathPlaceholder")
                        : $t("permissionWorkspacePathPlaceholder")}
                      onchange={(event) => changeRulePath(index, event.currentTarget.value)}
                    />
                  {/if}
                </div>
                <Tooltip text={$t("permissionRemoveRule")}>
                  <button
                    type="button"
                    class="remove-rule"
                    aria-label={$t("permissionRemoveRule")}
                    onclick={() => removeRule(index)}
                  >
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M3.5 4.5h9M6 4.5v-1h4v1m-5 0 .5 8h5l.5-8" />
                    </svg>
                  </button>
                </Tooltip>
              </div>
            {/each}
          {/if}
        </div>

        <div class="add-rule-row">
          <div class="new-rule-access">
            <Select
              bind:value={newRuleAccess}
              items={[
                { value: "read", label: $t("permissionAccessRead") },
                { value: "write", label: $t("permissionAccessWrite") },
                { value: "deny", label: $t("permissionAccessDeny") },
              ]}
              ariaLabel={$t("permissionRuleAccess")}
            />
          </div>
          <div class="new-rule-kind">
            <Select
              bind:value={newRuleKind}
              items={[
                { value: "workspace", label: $t("permissionPathWorkspace") },
                { value: "host_root", label: $t("permissionPathHostRoot") },
                { value: "absolute", label: $t("permissionPathAbsolute") },
              ]}
              ariaLabel={$t("permissionRuleLocation")}
            />
          </div>
          {#if newRuleKind !== "host_root"}
            <input
              class="new-rule-path"
              bind:value={newRulePath}
              required={newRuleKind === "absolute"}
              aria-label={$t("permissionRulePath")}
              placeholder={newRuleKind === "absolute"
                ? $t("permissionAbsolutePathPlaceholder")
                : $t("permissionWorkspacePathPlaceholder")}
              onkeydown={(event) => {
                if (event.key === "Enter") addRule();
              }}
            />
          {/if}
          <button type="button" class="add-rule" disabled={!canAddRule} onclick={addRule}>
            {$t("permissionAddRule")}
          </button>
        </div>
      </div>
    {/if}
  {:else}
    <div class="permission-warning disabled">
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M10 2.5 18 17H2L10 2.5Z" />
        <path d="M10 7v4.5M10 14.5v.1" />
      </svg>
      <p>{$t("permissionDisabledWarning")}</p>
    </div>
  {/if}
</div>

<style>
  .permission-settings {
    color: var(--text);
  }

  .permission-control {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(210px, 248px);
    align-items: center;
    gap: 24px;
    padding: 14px 16px;
  }

  .permission-control-copy {
    display: grid;
    min-width: 0;
    gap: 4px;
  }

  .permission-label {
    font-size: 13px;
    font-weight: 550;
    line-height: 1.35;
  }

  .permission-description {
    color: var(--text-muted);
    font-size: 11px;
    line-height: 1.45;
  }

  .permission-select {
    min-width: 0;
  }

  .permission-divider {
    height: 1px;
    margin-left: 16px;
    background: var(--mica-divider);
  }

  .custom-rules {
    margin: 0 12px 12px;
    overflow: hidden;
    border-radius: 9px;
    border: 1px solid var(--mica-divider);
    background: transparent;
  }

  .custom-rules-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 14px;
  }

  .custom-rules-heading h5,
  .custom-rules-heading p,
  .empty-rules,
  .permission-warning p {
    margin: 0;
  }

  .custom-rules-heading h5 {
    font-size: 12px;
    font-weight: 600;
  }

  .custom-rules-heading p,
  .empty-rules {
    margin-top: 3px;
    color: var(--text-muted);
    font-size: 11px;
    line-height: 1.45;
  }

  .rule-count {
    min-width: 22px;
    padding: 2px 7px;
    border-radius: 999px;
    background: var(--surface);
    color: var(--text-muted);
    font-size: 11px;
    text-align: center;
  }

  .rule-list {
    border-top: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  }

  .rule-row {
    display: grid;
    grid-template-columns: 110px minmax(0, 1fr) 30px;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
  }

  .rule-row + .rule-row {
    border-top: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  }

  .rule-path {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 8px;
  }

  .path-kind {
    flex: 0 0 auto;
    padding: 3px 7px;
    border-radius: 5px;
    background: var(--surface);
    color: var(--text-muted);
    font-size: 10px;
    line-height: 16px;
  }

  .path-value {
    overflow: hidden;
    color: var(--text);
    font-family: "SFMono-Regular", Consolas, monospace;
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rule-path input,
  .new-rule-path {
    width: 100%;
    min-width: 0;
    border: 0;
    border-radius: 6px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-family: "SFMono-Regular", Consolas, monospace;
    font-size: 11px;
    outline: none;
    padding: 6px 8px;
    box-shadow: inset 0 0 0 1px transparent;
  }

  .rule-path input:focus-visible,
  .new-rule-path:focus-visible {
    box-shadow: var(--focus-ring);
  }

  .rule-path input:invalid,
  .new-rule-path:invalid {
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--danger) 60%, transparent);
  }

  .remove-rule {
    display: inline-flex;
    width: 30px;
    height: 30px;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }

  .remove-rule:hover {
    background: color-mix(in srgb, var(--danger) 10%, transparent);
    color: var(--danger);
  }

  .remove-rule:focus-visible,
  .add-rule:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .remove-rule svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.35;
  }

  .empty-rules {
    padding: 14px;
    text-align: center;
  }

  .add-rule-row {
    display: grid;
    grid-template-columns: 100px 120px minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
    padding: 10px;
    border-top: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  }

  .add-rule {
    min-height: 32px;
    border: 0;
    border-radius: 7px;
    padding: 6px 11px;
    background: var(--primary);
    color: white;
    font: inherit;
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;
  }

  .add-rule:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .permission-warning {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    margin: 0 12px 12px;
    padding: 11px 12px;
    border-radius: 8px;
    background: color-mix(in srgb, #c57a00 10%, var(--surface2));
    color: var(--text-muted);
    font-size: 11px;
    line-height: 1.5;
  }

  .permission-warning.disabled {
    margin-top: 12px;
    background: color-mix(in srgb, var(--danger) 10%, var(--surface2));
  }

  .permission-warning svg {
    width: 17px;
    height: 17px;
    flex: 0 0 auto;
    fill: none;
    stroke: #b36c00;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.4;
  }

  .permission-warning.disabled svg {
    stroke: var(--danger);
  }

  @media (max-width: 640px) {
    .permission-control {
      grid-template-columns: 1fr;
      gap: 10px;
    }

    .rule-row {
      grid-template-columns: 96px minmax(0, 1fr) 30px;
    }

    .add-rule-row {
      grid-template-columns: 1fr 1fr;
    }

    .new-rule-path {
      grid-column: 1 / -1;
    }

    .add-rule {
      grid-column: 1 / -1;
    }
  }
</style>

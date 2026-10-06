import { invoke } from "$lib/openagent/tauriClient";
import { isTauri } from "@tauri-apps/api/core";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { onMount, tick } from "svelte";
import { fromStore } from "svelte/store";
import type { PermissionProfile } from "$lib/types";
import { captureQuickChatShortcut } from "$lib/quickChatShortcut";
import { applyDocumentTheme } from "$lib/appTheme";
import { t, setLocale, type Locale } from "$lib/i18n";
import type { SettingsNav } from "$lib/settingsWindows";
import type { SettingsOptions } from "./types";
import type { ComponentVersions } from "./types";
import type { SettingsDraft } from "./draft.svelte";

export function createGeneralSettings(
  draft: SettingsDraft,
  options: Pick<SettingsOptions, "initialNav" | "sections" | "onThemePreview" | "visibleSections">,
) {
  const translation = fromStore(t);
  let componentVersions = $state<ComponentVersions>({
    release: "...",
    shell: "...",
    runtime: null,
  });

  let selectedSettingsSection = $state<SettingsNav>("general");
  let initialSectionResolved = false;
  let lastInitialNav: SettingsNav | undefined;
  $effect(() => {
    const nextInitialNav = options.initialNav;
    const nextSection = nextInitialNav ?? options.sections?.[0] ?? "general";
    if (initialSectionResolved && nextInitialNav === lastInitialNav) return;
    initialSectionResolved = true;
    lastInitialNav = nextInitialNav;
    selectedSettingsSection = nextSection;
  });
  // Contextual entry points can override the ordinary General default after
  // this dynamically loaded Tabs root has finished registering its triggers.
  $effect(() => {
    if (!options.initialNav) return;
    let innerFrame = 0;
    const outerFrame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => {
        if (document.querySelector<HTMLButtonElement>("[data-tabs-trigger][data-state=active]")) {
          return;
        }
        document
          .querySelector<HTMLButtonElement>(
            `[data-tabs-trigger][data-value="${options.initialNav}"]`,
          )
          ?.click();
      });
    });
    return () => {
      cancelAnimationFrame(outerFrame);
      cancelAnimationFrame(innerFrame);
    };
  });

  let autostartReady = $state(false);
  let autostartSyncing = $state(false);
  let autostartStatus = $state("");
  let autostartRequestSeq = 0;
  let lastAutostartTarget: boolean | null = null;

  const permissionProfile = $derived(draft.draftConfig.permission_profile as PermissionProfile);
  let quickShortcutRecording = $state(false);
  let quickShortcutStatus = $state<{
    tone: "idle" | "saving" | "success" | "error";
    message: string;
  }>({ tone: "idle", message: "" });
  async function commitQuickChatShortcut(shortcut: string) {
    const previousShortcut = draft.draftConfig.quick_chat_shortcut;
    quickShortcutRecording = false;
    if (shortcut === previousShortcut) {
      quickShortcutStatus = { tone: "idle", message: "" };
      return;
    }
    draft.draftConfig.quick_chat_shortcut = shortcut;
    quickShortcutStatus = { tone: "saving", message: translation.current("quickShortcutSaving") };
    await tick();
    try {
      await draft.saveDraftConfig();
      quickShortcutStatus = { tone: "success", message: translation.current("quickShortcutSaved") };
    } catch {
      draft.draftConfig.quick_chat_shortcut = previousShortcut;
      quickShortcutStatus = {
        tone: "error",
        message: translation.current("quickShortcutUnavailable"),
      };
    }
  }

  function handleQuickShortcutKeydown(event: KeyboardEvent) {
    if (!quickShortcutRecording) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      quickShortcutRecording = false;
      quickShortcutStatus = { tone: "idle", message: "" };
      return;
    }
    const captured = captureQuickChatShortcut(event);
    if (captured.kind === "pending") return;
    if (captured.kind === "error") {
      quickShortcutStatus = {
        tone: "error",
        message:
          captured.reason === "modifier_required"
            ? translation.current("quickShortcutModifierRequired")
            : translation.current("quickShortcutUnsupported"),
      };
      return;
    }
    void commitQuickChatShortcut(captured.value);
  }

  $effect(() => {
    setLocale((draft.draftConfig.language ?? "zh") as Locale);
  });

  $effect(() => {
    const theme = draft.draftConfig.theme ?? "system";
    if (options.onThemePreview) options.onThemePreview(theme);
    else applyDocumentTheme(theme);
  });

  $effect(() => {
    const enabled = draft.draftConfig.launch_on_startup;
    if (!autostartReady) return;
    if (lastAutostartTarget === enabled) return;
    lastAutostartTarget = enabled;
    syncAutostart(enabled);
  });

  async function syncAutostart(enabled: boolean) {
    const seq = ++autostartRequestSeq;
    autostartSyncing = true;
    autostartStatus = "";
    try {
      if (enabled) await enable();
      else await disable();
      if (seq === autostartRequestSeq) {
        const actual = await isEnabled();
        lastAutostartTarget = actual;
        draft.draftConfig.launch_on_startup = actual;
      }
    } catch (err: unknown) {
      if (seq === autostartRequestSeq) {
        autostartStatus = `${err}`;
        try {
          const actual = await isEnabled();
          lastAutostartTarget = actual;
          draft.draftConfig.launch_on_startup = actual;
        } catch {}
      }
    } finally {
      if (seq === autostartRequestSeq) autostartSyncing = false;
    }
  }
  onMount(() => {
    if (!isTauri()) {
      autostartReady = true;
      return;
    }
    invoke<ComponentVersions>("get_component_versions")
      .then((versions) => {
        componentVersions = versions;
      })
      .catch(() => {});
    if (!options.visibleSections.has("general")) {
      autostartReady = true;
      return;
    }
    isEnabled()
      .then((enabled) => {
        lastAutostartTarget = enabled;
        draft.draftConfig.launch_on_startup = enabled;
      })
      .catch((err) => {
        autostartStatus = `${err}`;
      })
      .finally(() => {
        autostartReady = true;
      });
  });

  return {
    get autostartReady() {
      return autostartReady;
    },
    get autostartStatus() {
      return autostartStatus;
    },
    get autostartSyncing() {
      return autostartSyncing;
    },
    commitQuickChatShortcut,
    get componentVersions() {
      return componentVersions;
    },
    handleQuickShortcutKeydown,
    get permissionProfile() {
      return permissionProfile;
    },
    get quickShortcutRecording() {
      return quickShortcutRecording;
    },
    set quickShortcutRecording(value) {
      quickShortcutRecording = value;
    },
    get quickShortcutStatus() {
      return quickShortcutStatus;
    },
    set quickShortcutStatus(value) {
      quickShortcutStatus = value;
    },
    get selectedSettingsSection() {
      return selectedSettingsSection;
    },
    set selectedSettingsSection(value: SettingsNav) {
      selectedSettingsSection = value;
    },
  };
}
export type GeneralSettings = ReturnType<typeof createGeneralSettings>;

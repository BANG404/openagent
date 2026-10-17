import { onMount } from "svelte";
import { isTauri } from "@tauri-apps/api/core";
import { desktopOpenAgent, invoke, listen } from "$lib/openagent/tauriClient";
import type { SkillMetadata } from "$lib/types";
import type { SettingsOptions } from "./types";
import { tr } from "$lib/i18n";

/** Runtime owns discovery and paths; the settings surface only browses its inventory. */
export function createIntegrationSettings(
  options: Pick<SettingsOptions, "workspacePath" | "visibleSections">,
) {
  let skills = $state<(SkillMetadata & { key: string })[]>([]);
  let loading = $state(true);
  let error = $state("");
  let query = $state("");
  let scopeFilter = $state("all");
  let selectedKey = $state<string | null>(null);
  let content = $state("");
  let contentLoading = $state(false);
  let contentError = $state("");
  let openError = $state("");
  let generation = 0;
  let contentGeneration = 0;
  let openGeneration = 0;
  let disposed = false;
  let inventoryRevision = $state(0);
  const filteredSkills = $derived(
    skills.filter(
      (skill) =>
        (scopeFilter === "all" ||
          (scopeFilter === "plugin"
            ? skill.scope.startsWith("plugin:")
            : skill.scope === scopeFilter)) &&
        `${skill.name} ${skill.description} ${skill.scope} ${skill.path}`
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase()),
    ),
  );
  const selectedSkill = $derived(filteredSkills.find((skill) => skill.key === selectedKey) ?? null);
  $effect(() => {
    if (!selectedSkill) selectedKey = filteredSkills[0]?.key ?? null;
  });

  async function refreshSkills() {
    const request = ++generation;
    loading = true;
    error = "";
    try {
      const result = (await desktopOpenAgent.invokeProduct("list_skills", {})) as SkillMetadata[];
      if (disposed || request !== generation) return;
      // A directory can be both global and local when the workspace is the home directory.
      skills = result
        .map((skill) => ({ ...skill, key: JSON.stringify([skill.scope, skill.path]) }))
        .toSorted((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
      inventoryRevision++;
    } catch (cause) {
      if (!disposed && request === generation) error = String(cause);
    } finally {
      if (!disposed && request === generation) loading = false;
    }
  }

  async function openDirectory(path: string) {
    const request = ++openGeneration;
    openError = "";
    try {
      await desktopOpenAgent.openWorkspacePath(path);
    } catch (cause) {
      if (!disposed && request === openGeneration)
        openError = `${tr("integrationOpenFailed")}: ${String(cause)}`;
    }
  }

  $effect(() => {
    inventoryRevision;
    const path = selectedSkill?.path;
    const request = ++contentGeneration;
    content = "";
    contentError = "";
    openGeneration++;
    openError = "";
    contentLoading = !!path;
    // Windows verbatim paths reject forward slashes, including in appended segments.
    const separator = path && /^(?:[a-zA-Z]:[\\/]|\\\\)/.test(path) ? "\\" : "/";
    if (path)
      void invoke<string>("read_text_file", {
        path: `${path.replace(/[\\/]+$/, "")}${separator}SKILL.md`,
      })
        .then((value) => {
          if (!disposed && request === contentGeneration) content = value;
        })
        .catch((cause) => {
          if (!disposed && request === contentGeneration) contentError = String(cause);
        })
        .finally(() => {
          if (!disposed && request === contentGeneration) contentLoading = false;
        });
  });

  $effect(() => {
    options.workspacePath;
    if (options.visibleSections.has("skills") || options.visibleSections.has("plugins"))
      void refreshSkills();
  });
  onMount(() => {
    const stop =
      isTauri() && (options.visibleSections.has("skills") || options.visibleSections.has("plugins"))
        ? listen("agent-plugins-changed", () => void refreshSkills())
        : Promise.resolve(() => {});
    return () => {
      disposed = true;
      generation++;
      contentGeneration++;
      openGeneration++;
      void stop.then((unsubscribe) => unsubscribe());
    };
  });

  return {
    get skills() {
      return skills;
    },
    get filteredSkills() {
      return filteredSkills;
    },
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },
    get query() {
      return query;
    },
    set query(value: string) {
      query = value;
    },
    get scopeFilter() {
      return scopeFilter;
    },
    set scopeFilter(value: string) {
      scopeFilter = value;
    },
    get selectedKey() {
      return selectedKey;
    },
    set selectedKey(value: string | null) {
      selectedKey = value;
    },
    get selectedSkill() {
      return selectedSkill;
    },
    get content() {
      return content;
    },
    get contentLoading() {
      return contentLoading;
    },
    get contentError() {
      return contentError;
    },
    get openError() {
      return openError;
    },
    refreshSkills,
    openDirectory,
  };
}

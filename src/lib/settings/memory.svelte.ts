import { desktopOpenAgent, invoke } from "$lib/openagent/tauriClient";
import { isTauri } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { onMount, untrack } from "svelte";
import type { AgentMemoryEntry } from "$lib/types";
import { tr } from "$lib/i18n";
import type { SettingsOptions } from "./types";
import type { SettingsDraft } from "./draft.svelte";

export function createMemorySettings(
  draft: SettingsDraft,
  options: Pick<SettingsOptions, "workspacePath" | "visibleSections">,
) {
  let memoryScope = $state<"global" | "local">("global");
  let memoryUserContent = $state("");
  let memorySavedContent = $state("");
  const memoryDirty = $derived(memoryUserContent !== memorySavedContent);
  let memoryAgentEntries = $state<AgentMemoryEntry[]>([]);
  let memoryAgentSearch = $state("");
  let memoryLoading = $state(false);
  let memoryLoaded = $state(false);
  let memoryAgentLoading = $state(false);
  let memoryAgentRequestSeq = 0;
  let memorySearchTimer: ReturnType<typeof setTimeout> | undefined;
  let memorySaving = $state(false);
  let memoryRequestSeq = 0;
  let memoryStatus = $state("");
  let memoryBusy = $state(false);
  let memoryClearDialogOpen = $state(false);
  let memoryClearInput = $state("");
  let memoryClearCloseHandled = false;

  function memoryAgentScope(scope = memoryScope): string | null {
    if (scope === "global") return "global";
    return options.workspacePath || null;
  }

  async function refreshMemory(scope = memoryScope, query = memoryAgentSearch) {
    const preserveDraft = memoryDirty;
    const requestSeq = ++memoryRequestSeq;
    const agentRequestSeq = ++memoryAgentRequestSeq;
    memoryAgentLoading = false;
    if (!isTauri() || !memoryScopeAvailable(scope)) {
      memoryUserContent = "";
      memorySavedContent = "";
      memoryAgentEntries = [];
      memoryLoading = false;
      memoryLoaded = false;
      return;
    }
    const agentScope = memoryAgentScope(scope);
    if (!agentScope) return;
    memoryLoading = true;
    try {
      const [userMemory, agentMemories] = await Promise.all([
        desktopOpenAgent.invokeProduct("get_memory", { scope }),
        desktopOpenAgent.invokeProduct("get_agent_memories", {
          scope: agentScope,
          query: query.trim() || null,
        }),
      ]);
      if (requestSeq !== memoryRequestSeq) return;
      if (!preserveDraft) {
        memoryUserContent = userMemory;
        memorySavedContent = userMemory;
      }
      memoryLoaded = true;
      if (agentRequestSeq === memoryAgentRequestSeq) memoryAgentEntries = agentMemories;
    } catch (err: unknown) {
      if (requestSeq === memoryRequestSeq) memoryStatus = `${tr("memoryOperationFailed")}: ${err}`;
    } finally {
      if (requestSeq === memoryRequestSeq) memoryLoading = false;
    }
  }

  async function refreshAgentMemories() {
    if (!isTauri() || !memoryScopeAvailable()) {
      memoryAgentEntries = [];
      return;
    }
    const agentScope = memoryAgentScope();
    if (!agentScope) return;
    const requestSeq = ++memoryAgentRequestSeq;
    memoryAgentLoading = true;
    try {
      const entries = await desktopOpenAgent.invokeProduct("get_agent_memories", {
        scope: agentScope,
        query: memoryAgentSearch.trim() || null,
      });
      if (requestSeq === memoryAgentRequestSeq) memoryAgentEntries = entries;
    } catch (err: unknown) {
      if (requestSeq === memoryAgentRequestSeq)
        memoryStatus = `${tr("memoryOperationFailed")}: ${err}`;
    } finally {
      if (requestSeq === memoryAgentRequestSeq) memoryAgentLoading = false;
    }
  }

  function searchAgentMemories() {
    clearTimeout(memorySearchTimer);
    ++memoryAgentRequestSeq;
    memoryAgentLoading = true;
    memorySearchTimer = setTimeout(() => void refreshAgentMemories(), 250);
  }

  function discardMemoryDraft() {
    memoryUserContent = memorySavedContent;
    memoryStatus = "";
  }

  async function saveUserMemory() {
    if (!memoryScopeAvailable()) {
      memoryStatus = tr("memoryNoWorkspace");
      return;
    }
    memorySaving = true;
    memoryStatus = "";
    const content = memoryUserContent;
    try {
      await desktopOpenAgent.invokeProduct("save_memory", {
        scope: memoryScope,
        content,
      });
      memorySavedContent = content;
      memoryStatus = tr("memorySaveSuccess");
    } catch (err: unknown) {
      memoryStatus = `${tr("memoryOperationFailed")}: ${err}`;
    } finally {
      memorySaving = false;
    }
  }

  async function removeAgentMemory(entry: AgentMemoryEntry) {
    if (!window.confirm(tr("memoryDeleteConfirm"))) return;
    memoryBusy = true;
    memoryStatus = "";
    try {
      await desktopOpenAgent.invokeProduct("delete_agent_memory", { id: entry.id });
      memoryAgentEntries = memoryAgentEntries.filter((item) => item.id !== entry.id);
    } catch (err: unknown) {
      memoryStatus = `${tr("memoryOperationFailed")}: ${err}`;
    } finally {
      memoryBusy = false;
    }
  }

  function formatMemoryDate(timestamp: number): string {
    return new Intl.DateTimeFormat(draft.draftConfig.language === "en" ? "en-US" : "zh-CN", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(timestamp * 1000));
  }

  $effect(() => {
    const scope = memoryScope;
    if (!options.visibleSections.has("memory")) return;
    untrack(() => {
      clearTimeout(memorySearchTimer);
      ++memoryAgentRequestSeq;
      memoryAgentLoading = false;
      memoryAgentSearch = "";
      memoryUserContent = "";
      memorySavedContent = "";
      memoryAgentEntries = [];
      memoryLoaded = false;
      memoryStatus = "";
      refreshMemory(scope, "").catch(() => {});
    });
  });

  onMount(() => () => clearTimeout(memorySearchTimer));

  function memoryScopeAvailable(scope = memoryScope) {
    return scope === "global" || Boolean(options.workspacePath);
  }

  async function exportMemory() {
    if (!memoryScopeAvailable()) {
      memoryStatus = tr("memoryNoWorkspace");
      return;
    }
    memoryBusy = true;
    memoryStatus = "";
    try {
      const content = await desktopOpenAgent.invokeProduct("export_memory_backup", {
        scope: memoryScope,
      });
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const filename = `openagent-memory-${memoryScope}-${stamp}.json`;
      const savedPath = await invoke<string>("save_download_file", {
        filename,
        content,
        encoding: "utf8",
      });
      memoryStatus = `${tr("memoryExported")} ${savedPath}`;
    } catch (err: unknown) {
      memoryStatus = `${tr("memoryOperationFailed")}: ${err}`;
    } finally {
      memoryBusy = false;
    }
  }

  async function importMemory(replace: boolean) {
    if (!memoryScopeAvailable()) {
      memoryStatus = tr("memoryNoWorkspace");
      return;
    }
    const selected = await openDialog({
      multiple: false,
      directory: false,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!selected || Array.isArray(selected)) return;

    memoryBusy = true;
    memoryStatus = "";
    try {
      const content = await invoke<string>("read_text_file", { path: selected });
      const result = await desktopOpenAgent.invokeProduct("import_memory_backup", {
        scope: memoryScope,
        content,
        replace,
      });
      memoryStatus = `${tr("memoryImported")} ${result.agent_memories_imported} ${tr("memoryAgentEntries")}`;
      await refreshMemory();
    } catch (err: unknown) {
      memoryStatus = `${tr("memoryOperationFailed")}: ${err}`;
    } finally {
      memoryBusy = false;
    }
  }

  async function clearMemoryScope() {
    if (!memoryScopeAvailable()) {
      memoryStatus = tr("memoryNoWorkspace");
      return;
    }
    memoryClearInput = "";
    memoryClearDialogOpen = true;
  }

  async function confirmClearMemoryScope() {
    const confirmationText = tr("memoryClearConfirmText");
    if (memoryClearInput !== confirmationText) {
      return;
    }
    memoryBusy = true;
    memoryStatus = "";
    try {
      await desktopOpenAgent.invokeProduct("clear_memory", { scope: memoryScope });
      memoryStatus = tr("memoryCleared");
      await refreshMemory();
      memoryClearCloseHandled = true;
      memoryClearDialogOpen = false;
      memoryClearInput = "";
    } catch (err: unknown) {
      memoryStatus = `${tr("memoryOperationFailed")}: ${err}`;
    } finally {
      memoryBusy = false;
    }
  }

  function cancelClearMemoryScope() {
    memoryClearCloseHandled = true;
    memoryClearDialogOpen = false;
    memoryClearInput = "";
    memoryStatus = tr("memoryClearCancelled");
  }
  return {
    cancelClearMemoryScope,
    clearMemoryScope,
    confirmClearMemoryScope,
    exportMemory,
    formatMemoryDate,
    importMemory,
    get memoryAgentEntries() {
      return memoryAgentEntries;
    },
    get memoryLoaded() {
      return memoryLoaded;
    },
    get memoryAgentLoading() {
      return memoryAgentLoading;
    },
    get memoryDirty() {
      return memoryDirty;
    },
    discardMemoryDraft,
    searchAgentMemories,
    get memoryAgentSearch() {
      return memoryAgentSearch;
    },
    set memoryAgentSearch(value) {
      memoryAgentSearch = value;
    },
    get memoryBusy() {
      return memoryBusy;
    },
    get memoryClearCloseHandled() {
      return memoryClearCloseHandled;
    },
    set memoryClearCloseHandled(value) {
      memoryClearCloseHandled = value;
    },
    get memoryClearDialogOpen() {
      return memoryClearDialogOpen;
    },
    set memoryClearDialogOpen(value) {
      memoryClearDialogOpen = value;
    },
    get memoryClearInput() {
      return memoryClearInput;
    },
    set memoryClearInput(value) {
      memoryClearInput = value;
    },
    get memoryLoading() {
      return memoryLoading;
    },
    get memorySaving() {
      return memorySaving;
    },
    get memoryScope() {
      return memoryScope;
    },
    set memoryScope(value) {
      memoryScope = value;
    },
    memoryScopeAvailable,
    get memoryStatus() {
      return memoryStatus;
    },
    get memoryUserContent() {
      return memoryUserContent;
    },
    set memoryUserContent(value) {
      memoryUserContent = value;
    },
    refreshMemory,
    removeAgentMemory,
    saveUserMemory,
  };
}
export type MemorySettings = ReturnType<typeof createMemorySettings>;

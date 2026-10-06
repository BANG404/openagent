import { fromStore } from "svelte/store";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "$lib/openagent/tauriClient";
import { t } from "$lib/i18n";
import type { WslDistribution, WslWorkspaceTarget } from "$lib/types";

type WslOptions = {
  available: boolean;
  browserModeNotice: string;
  switchNewConversationWorkspace: (path: string) => Promise<void>;
  requestWorkspace: (path: string) => Promise<unknown>;
};

/** Owns the native WSL picker; workspace transitions remain with the page. */
export function createWslPicker(options: WslOptions) {
  const translation = fromStore(t);
  let wslPickerOpen = $state(false);
  let wslPickerBusy = $state(false);
  let wslPickerError = $state("");
  let wslPickerStartsNewConversation = $state(false);
  let wslDistributions = $state<WslDistribution[]>([]);
  let wslDistribution = $state("");
  let wslLinuxPath = $state("");

  async function selectWslDistribution(distribution: string) {
    wslDistribution = distribution;
    wslPickerError = "";
    if (!distribution) return;
    wslPickerBusy = true;
    try {
      const target = await invoke<WslWorkspaceTarget>("get_wsl_home", { distribution });
      if (wslDistribution === distribution) wslLinuxPath = target.linux_path;
    } catch (error) {
      if (wslDistribution === distribution) wslPickerError = String(error);
    } finally {
      if (wslDistribution === distribution) wslPickerBusy = false;
    }
  }

  async function pickWslWorkspace(startNewConversation = false) {
    if (!options.available) {
      alert(options.browserModeNotice);
      return;
    }
    wslPickerStartsNewConversation = startNewConversation;
    wslPickerOpen = true;
    wslPickerBusy = true;
    wslPickerError = "";
    wslDistributions = [];
    wslDistribution = "";
    wslLinuxPath = "";
    try {
      wslDistributions = await invoke<WslDistribution[]>("list_wsl_distributions");
      if (wslDistributions.length === 0) {
        wslPickerError = translation.current("wslNoDistributions");
        return;
      }
      await selectWslDistribution(wslDistributions[0].name);
    } catch (error) {
      wslPickerError = String(error);
    } finally {
      if (!wslDistribution) wslPickerBusy = false;
    }
  }

  async function resolveSelectedWslWorkspace(): Promise<WslWorkspaceTarget | null> {
    if (!wslDistribution || !wslLinuxPath.trim()) return null;
    wslPickerBusy = true;
    wslPickerError = "";
    try {
      return await invoke<WslWorkspaceTarget>("resolve_wsl_workspace", {
        distribution: wslDistribution,
        linuxPath: wslLinuxPath.trim(),
      });
    } catch (error) {
      wslPickerError = String(error);
      return null;
    } finally {
      wslPickerBusy = false;
    }
  }

  async function browseWslWorkspace() {
    const target = await resolveSelectedWslWorkspace();
    if (!target) return;
    const selected = await openDialog({
      directory: true,
      multiple: false,
      defaultPath: target.path,
    });
    if (typeof selected === "string" && selected) {
      wslPickerOpen = false;
      if (wslPickerStartsNewConversation) await options.switchNewConversationWorkspace(selected);
      else await options.requestWorkspace(selected);
    }
  }

  async function openSelectedWslWorkspace() {
    const target = await resolveSelectedWslWorkspace();
    if (!target) return;
    wslPickerOpen = false;
    if (wslPickerStartsNewConversation) await options.switchNewConversationWorkspace(target.path);
    else await options.requestWorkspace(target.path);
  }

  return {
    get wslPickerOpen() {
      return wslPickerOpen;
    },
    set wslPickerOpen(value: boolean) {
      wslPickerOpen = value;
    },
    get wslPickerBusy() {
      return wslPickerBusy;
    },
    get wslPickerError() {
      return wslPickerError;
    },
    set wslPickerError(value: string) {
      wslPickerError = value;
    },
    get wslDistributions() {
      return wslDistributions;
    },
    get wslDistribution() {
      return wslDistribution;
    },
    set wslDistribution(value: string) {
      wslDistribution = value;
    },
    get wslLinuxPath() {
      return wslLinuxPath;
    },
    set wslLinuxPath(value: string) {
      wslLinuxPath = value;
    },
    selectWslDistribution,
    pickWslWorkspace,
    browseWslWorkspace,
    openSelectedWslWorkspace,
  };
}

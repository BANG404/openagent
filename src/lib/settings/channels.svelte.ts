import { desktopOpenAgent, listen } from "$lib/openagent/tauriClient";
import { isTauri } from "@tauri-apps/api/core";
import { onMount } from "svelte";
import type { SettingsOptions } from "./types";
import type {
  StandardChannelKind,
  ChannelSettingsNav,
  RemoteGatewayStatus,
  WechatChannelStatus,
  ChannelStatus,
} from "./types";
import type { SettingsDraft } from "./draft.svelte";

export function createChannelSettings(
  draft: SettingsDraft,
  options: Pick<SettingsOptions, "workspacePath" | "visibleSections">,
) {
  let channelSettingsNav = $state<ChannelSettingsNav>("feishu");

  let remoteGatewayStatus = $state<RemoteGatewayStatus | null>(null);
  let remoteGatewayMessage = $state("");
  let remoteGatewayBusy = $state(false);
  let copiedRemoteValue = $state<"url" | "lan" | "code" | null>(null);
  let remoteCopyTimer: ReturnType<typeof setTimeout> | null = null;
  let wechatChannelStatus = $state<WechatChannelStatus | null>(null);
  let wechatChannelBusy = $state(false);
  let wechatChannelMessage = $state("");
  let channelStatuses = $state<Partial<Record<StandardChannelKind, ChannelStatus>>>({});
  let wechatStatusTimer: ReturnType<typeof setInterval> | null = null;

  async function refreshRemoteGateway() {
    remoteGatewayStatus = (await desktopOpenAgent.invokeProduct(
      "get_remote_gateway_status",
      {},
    )) as RemoteGatewayStatus;
  }

  async function refreshWechatChannel() {
    wechatChannelStatus = (await desktopOpenAgent.invokeProduct(
      "get_wechat_channel_status",
      {},
    )) as WechatChannelStatus;
  }

  async function refreshChannelStatuses() {
    const statuses = (await desktopOpenAgent.invokeProduct(
      "get_channel_statuses",
      {},
    )) as ChannelStatus[];
    channelStatuses = Object.fromEntries(statuses.map((status) => [status.channel, status]));
  }

  function parseChannelIds(value: string) {
    return value
      .split(/[\s,，]+/)
      .map((id) => id.trim())
      .filter(Boolean);
  }

  async function reconnectWechatChannel() {
    wechatChannelBusy = true;
    wechatChannelMessage = "";
    try {
      await desktopOpenAgent.invokeProduct("reset_wechat_channel", {});
      await refreshWechatChannel();
    } catch (error) {
      wechatChannelMessage = `${error}`;
    } finally {
      wechatChannelBusy = false;
    }
  }

  function toggleCurrentWorkspaceAccess() {
    if (!options.workspacePath) return;
    const allowed = draft.draftConfig.remote_gateway.allowed_workspaces;
    draft.draftConfig.remote_gateway.allowed_workspaces = allowed.includes(options.workspacePath)
      ? allowed.filter((path) => path !== options.workspacePath)
      : [...allowed, options.workspacePath];
  }

  async function rotateRemotePairingCode() {
    remoteGatewayBusy = true;
    remoteGatewayMessage = "";
    try {
      const pairing_code = await desktopOpenAgent.invokeProduct(
        "rotate_remote_gateway_pairing_code",
        {},
      );
      if (remoteGatewayStatus) remoteGatewayStatus = { ...remoteGatewayStatus, pairing_code };
    } catch (error) {
      remoteGatewayMessage = `${error}`;
    } finally {
      remoteGatewayBusy = false;
    }
  }

  async function copyRemoteGatewayValue(value: string, kind: "url" | "lan" | "code") {
    try {
      await navigator.clipboard.writeText(value);
      copiedRemoteValue = kind;
      if (remoteCopyTimer) clearTimeout(remoteCopyTimer);
      remoteCopyTimer = setTimeout(() => {
        copiedRemoteValue = null;
      }, 1800);
    } catch (error) {
      remoteGatewayMessage = `${error}`;
    }
  }
  onMount(() => {
    if (!isTauri() || !options.visibleSections.has("channels")) return;
    refreshRemoteGateway().catch(() => {});
    refreshChannelStatuses().catch(() => {});
    refreshWechatChannel().catch(() => {});
    wechatStatusTimer = setInterval(() => {
      refreshChannelStatuses().catch(() => {});
      refreshWechatChannel().catch(() => {});
    }, 1500);
    const unlisten = listen("remote-gateway-pairing-code-rotated", () => {
      refreshRemoteGateway().catch(() => {});
    });
    return () => {
      void unlisten.then((dispose) => dispose());
      if (remoteCopyTimer) clearTimeout(remoteCopyTimer);
      if (wechatStatusTimer) clearInterval(wechatStatusTimer);
    };
  });

  return {
    get channelSettingsNav() {
      return channelSettingsNav;
    },
    set channelSettingsNav(value) {
      channelSettingsNav = value;
    },
    get channelStatuses() {
      return channelStatuses;
    },
    get copiedRemoteValue() {
      return copiedRemoteValue;
    },
    copyRemoteGatewayValue,
    parseChannelIds,
    reconnectWechatChannel,
    get remoteGatewayBusy() {
      return remoteGatewayBusy;
    },
    get remoteGatewayMessage() {
      return remoteGatewayMessage;
    },
    get remoteGatewayStatus() {
      return remoteGatewayStatus;
    },
    rotateRemotePairingCode,
    toggleCurrentWorkspaceAccess,
    get wechatChannelBusy() {
      return wechatChannelBusy;
    },
    get wechatChannelMessage() {
      return wechatChannelMessage;
    },
    get wechatChannelStatus() {
      return wechatChannelStatus;
    },
  };
}
export type ChannelSettings = ReturnType<typeof createChannelSettings>;

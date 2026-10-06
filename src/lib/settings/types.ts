import type { AppConfig } from "$lib/types";
import { type McpOAuthCapability } from "$lib/settingsConfig";
import type { SettingsNav } from "$lib/settingsWindows";
import { type PluginSidebarContext } from "$lib/pluginSidebar";
import type { RightSidebarPanel } from "$lib/rightSidebar";

export type StandardChannelKind = "feishu" | "telegram" | "qq" | "discord" | "slack";
export type ChannelSettingsNav = StandardChannelKind | "wechat" | "gateway";
export type ComponentVersions = {
  release: string;
  shell: string;
  runtime: string | null;
};
export type ProviderStatus = {
  tone: "idle" | "loading" | "success" | "error";
  message: string;
};
export type ProviderProbeResult = {
  ok: boolean;
  message: string;
  models: string[];
};
export type McpProbeResult = {
  tools: string[];
  resources: string[];
  fingerprint: string;
};
// A probe reports the connected result or the failure message, together with
// what the attempt revealed about OAuth. A connector that needs authorization
// cannot describe itself through the result alone, because the probe fails.
export type McpProbeOutcome = {
  probe?: McpProbeResult;
  error?: string;
  oauth?: McpOAuthCapability;
  oauth_detail?: string;
};
export type McpOAuthStart = {
  authorization_url: string;
};
export type McpOAuthStatus = {
  authorized: boolean;
  expires_at?: number | null;
  error?: string | null;
};
export type RemoteGatewayStatus = {
  enabled: boolean;
  url: string;
  lan_url: string | null;
  pairing_code: string;
};
export type WechatChannelStatus = {
  enabled: boolean;
  state: "disabled" | "starting" | "awaiting_scan" | "connected" | "error";
  qr_image_data_url: string | null;
  account_id: string | null;
  error: string | null;
};
export type ChannelStatus = {
  channel: StandardChannelKind;
  enabled: boolean;
  state: "disabled" | "starting" | "connected" | "error";
  account_id: string | null;
  error: string | null;
};
export type SettingsOptions = {
  config: AppConfig | null;
  workspacePath: string;
  initialNav?: SettingsNav;
  sections?: SettingsNav[];
  onSave: (config: AppConfig, baseConfig?: AppConfig) => Promise<AppConfig>;
  onOpenConversation: (conversationId: string) => Promise<void>;
  onThemePreview?: (theme: string) => void;
  /** Absent in the standalone settings window, which owns no right sidebar. */
  onOpenPluginSidebarView?: (panel: RightSidebarPanel) => void;
  pluginSidebarContext: PluginSidebarContext;
  visibleSections: ReadonlySet<SettingsNav>;
};

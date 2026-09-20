import { resolveStandaloneDevPreview, type StandaloneDevPreview } from "./devPreview";
import {
  parseSettingsWindowKind,
  type SettingsNav,
  type SettingsWindowKind,
} from "./settingsWindows";
import type { Locale } from "./i18n";

type PreviewTheme = "dark" | "light" | null;

function previewTheme(query: URLSearchParams | null, key: string): PreviewTheme {
  const value = query?.get(key);
  return value === "dark" || value === "light" ? value : null;
}

function previewLocale(query: URLSearchParams | null, key: string): Locale | null {
  const value = query?.get(key);
  return value === "en" || value === "zh" ? value : null;
}

export type RuntimeQueryState = {
  frontendActivationVersion: string | null;
  isDevInspectorWindow: boolean;
  isOnboardingPreview: boolean;
  onboardingResourcePreview: string | null;
  isQuickChatPreview: boolean;
  standaloneDevPreview: StandaloneDevPreview | null;
  isChannelsSettingsPreview: boolean;
  isAgentsSettingsPreview: boolean;
  isAutomationHooksPreview: boolean;
  isMcpSettingsPreview: boolean;
  settingsPreviewSection: SettingsNav | null;
  isQuickChatWindow: boolean;
  isOnboardingWindow: boolean;
  isRoleEditorWindow: boolean;
  settingsWindowKind: SettingsWindowKind | null;
  settingsWindowInitialSection: string | null;
  isSettingsWindow: boolean;
  isOnboardingSurface: boolean;
  isQuickChatSurface: boolean;
  onboardingPreviewTheme: PreviewTheme;
  onboardingPreviewLocale: Locale | null;
  channelsSettingsPreviewTheme: PreviewTheme;
  channelsSettingsPreviewLocale: Locale | null;
  agentsSettingsPreviewTheme: PreviewTheme;
  agentsSettingsPreviewLocale: Locale | null;
  automationHooksPreviewTheme: PreviewTheme;
  automationHooksPreviewLocale: Locale | null;
  mcpSettingsPreviewTheme: PreviewTheme;
  mcpSettingsPreviewLocale: Locale | null;
};

export function resolveRuntimeQuery(
  search: string | null | undefined,
  development: boolean,
): RuntimeQueryState {
  const runtimeQuery = search === null || search === undefined ? null : new URLSearchParams(search);
  const devQuery = development ? runtimeQuery : null;
  const isOnboardingPreview = devQuery?.has("onboarding-preview") === true;
  const isQuickChatPreview = devQuery?.has("quick-chat-preview") === true;
  const isChannelsSettingsPreview = devQuery?.has("channels-settings-preview") === true;
  const isAgentsSettingsPreview = devQuery?.has("agents-settings-preview") === true;
  const isAutomationHooksPreview = devQuery?.has("automation-hooks-preview") === true;
  const isMcpSettingsPreview = devQuery?.has("mcp-settings-preview") === true;
  const isQuickChatWindow = runtimeQuery?.has("quick-chat-window") === true;
  const isOnboardingWindow = runtimeQuery?.has("onboarding-window") === true;
  const isRoleEditorWindow = runtimeQuery?.has("role-editor-window") === true;
  const settingsWindowKind =
    parseSettingsWindowKind(runtimeQuery?.get("settings-window") ?? null) ??
    (isAutomationHooksPreview ? "automation" : null);

  return {
    frontendActivationVersion: runtimeQuery?.get("frontend-version") ?? null,
    isDevInspectorWindow: devQuery?.has("dev-inspector") === true,
    isOnboardingPreview,
    onboardingResourcePreview: devQuery?.get("onboarding-preview-resource") ?? null,
    isQuickChatPreview,
    standaloneDevPreview: resolveStandaloneDevPreview(runtimeQuery, development),
    isChannelsSettingsPreview,
    isAgentsSettingsPreview,
    isAutomationHooksPreview,
    isMcpSettingsPreview,
    settingsPreviewSection: isMcpSettingsPreview
      ? "extensions"
      : isAgentsSettingsPreview
        ? "agents"
        : isChannelsSettingsPreview
          ? "channels"
          : null,
    isQuickChatWindow,
    isOnboardingWindow,
    isRoleEditorWindow,
    settingsWindowKind,
    settingsWindowInitialSection: runtimeQuery?.get("settings-section") ?? null,
    isSettingsWindow: settingsWindowKind !== null,
    isOnboardingSurface: isOnboardingWindow || isOnboardingPreview,
    isQuickChatSurface: isQuickChatWindow || isQuickChatPreview,
    onboardingPreviewTheme: previewTheme(devQuery, "onboarding-preview-theme"),
    onboardingPreviewLocale: previewLocale(devQuery, "onboarding-preview-locale"),
    channelsSettingsPreviewTheme: previewTheme(devQuery, "channels-settings-preview-theme"),
    channelsSettingsPreviewLocale: previewLocale(devQuery, "channels-settings-preview-locale"),
    agentsSettingsPreviewTheme: previewTheme(devQuery, "agents-settings-preview-theme"),
    agentsSettingsPreviewLocale: previewLocale(devQuery, "agents-settings-preview-locale"),
    automationHooksPreviewTheme: previewTheme(devQuery, "automation-hooks-preview-theme"),
    automationHooksPreviewLocale: previewLocale(devQuery, "automation-hooks-preview-locale"),
    mcpSettingsPreviewTheme: previewTheme(devQuery, "mcp-settings-preview-theme"),
    mcpSettingsPreviewLocale: previewLocale(devQuery, "mcp-settings-preview-locale"),
  };
}

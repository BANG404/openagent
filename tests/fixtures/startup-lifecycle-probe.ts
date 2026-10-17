// Each probe owns its module mocks in a separate process so other suites keep
// their real SDK, Svelte and native imports.
import { mock } from "bun:test";

const [renderer, snapshot, listeners] = process.argv.slice(2);
const calls: string[] = [];
const diagnostics: string[] = [];
let requests = 0;
mock.module("svelte", () => ({ tick: async () => {} }));
mock.module("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ show: async () => calls.push("fallback-show") }),
}));
mock.module("$lib/openagent/tauriClient", () => ({
  desktopOpenAgent: {
    getStartupBootstrap: async () => {
      calls.push("snapshot");
      requests++;
      if (snapshot === "failed" || (snapshot === "retry" && requests === 1)) {
        throw new Error("fixture snapshot unavailable");
      }
      return {};
    },
  },
  invoke: async (command: string) => calls.push(command),
}));
mock.module("$lib/downloadHook", () => ({ installDownloadHook: () => {} }));
mock.module("$lib/appUpdater", () => ({ checkForAppUpdate: async () => {} }));
mock.module("$lib/quickChatWindow", () => ({ initializeQuickChatShortcut: async () => {} }));
mock.module("$lib/frontendDiagnostics", () => ({
  reportFrontendDiagnostic: (name: string) => diagnostics.push(name),
}));
mock.module("$lib/streamdown/mermaidRenderer", () => ({
  loadMermaid: () => {
    calls.push("renderer");
    if (renderer === "pending") return new Promise(() => {});
    if (renderer === "failed") return Promise.reject(new Error("fixture renderer unavailable"));
    return Promise.resolve();
  },
}));

Object.defineProperty(globalThis, "window", {
  value: { matchMedia: () => ({ matches: false }) },
});
const options = {
  isDevInspectorWindow: false,
  standaloneDevPreview: null,
  isSettingsWindow: false,
  isRoleEditorWindow: false,
  isQuickChatSurface: false,
  isOnboardingSurface: false,
  tauriAvailable: true,
  isChannelsSettingsPreview: false,
  isAgentsSettingsPreview: false,
  isMcpSettingsPreview: false,
  config: { onboarding_completed: true },
  launchContext: null,
  settingsPreviewSection: null,
  isDarkTheme: false,
  initialLoading: true,
  SettingsView: null,
  settingsSurface: null,
  restoringSurface: "new-conversation",
  activeConvId: null,
  loadSettings: async () => {},
  loadWorkspace: async () => {},
  applyStartupBootstrap: async () => {
    calls.push("apply");
  },
  restoreStartupFallback: async () => {
    calls.push("restore");
  },
  setupGlobalEventListeners: async () => {
    calls.push("subscribe");
    if (listeners === "failed") throw new Error("fixture event bus unavailable");
  },
  revealMemorySource: async () => {},
  refreshAgentCommands: async () => {},
  pollMemoryStatus: () => {},
};
// A computed import keeps Vite's HMR ambient types out of this Bun-only probe.
const startupModule = "../../src/lib/page/startup";
const { createPageStartup: createStartup } = await import(startupModule);
await createStartup(options).start();
console.log(JSON.stringify({ calls, diagnostics, loading: options.initialLoading }));

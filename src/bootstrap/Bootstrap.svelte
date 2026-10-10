<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import { open } from "@tauri-apps/plugin-dialog";
  import OnboardingFlow from "../lib/components/OnboardingFlow.svelte";
  import { DEFAULT_APP_CONFIG } from "../lib/settingsDefaults";
  import { bootstrapText } from "../lib/bootstrapI18n";
  import appIcon from "../../static/app-icon.png";

  type Status = {
    phase: string;
    error: string | null;
    downloaded_bytes: number;
    total_bytes: number;
  };
  let status = $state<Status>({
    phase: "waiting",
    error: null,
    downloaded_bytes: 0,
    total_bytes: 0,
  });
  let language = $state<"en" | "zh">(
    navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en",
  );
  const initialTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  let theme = $state<"light" | "dark">(initialTheme);
  let busy = $state(false);
  $effect(() => {
    document.documentElement.lang = language;
    void invoke("set_shell_setup_appearance", { language, theme }).catch(console.warn);
  });

  async function retry(offlineDirectory?: string) {
    if (busy) return;
    busy = true;
    status.error = null;
    try {
      await invoke("retry_shell_resources", { offlineDirectory: offlineDirectory ?? null });
    } catch (error) {
      status = { ...status, phase: "failed", error: String(error) };
    } finally {
      busy = false;
    }
  }
  async function importOffline() {
    const directory = await open({
      directory: true,
      multiple: false,
      title: bootstrapText(language, "shellImport"),
    });
    if (typeof directory === "string") await retry(directory);
  }
  onMount(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void listen<Status>("shell-resource-progress", ({ payload }) => {
      status = payload;
    })
      .then(async (stop) => {
        if (disposed) {
          stop();
          return;
        }
        unlisten = stop;
        status = await invoke<Status>("shell_resource_status");
      })
      .catch((error) => {
        status = { ...status, phase: "failed", error: String(error) };
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  });
</script>

<OnboardingFlow
  brandIconUrl={appIcon}
  config={{ ...DEFAULT_APP_CONFIG, language, theme }}
  workspacePath=""
  onSave={async (config) => config}
  onPickWorkspace={async () => {}}
  onComplete={() => {}}
  onLanguagePreview={(value) => {
    language = value;
  }}
  onThemePreview={(value) => {
    if (value === "light" || value === "dark") theme = value;
    document.documentElement.classList.toggle("dark", value === "dark");
  }}
  resourcePreparation={{
    ...status,
    busy,
    onRetry: () => {
      void retry();
    },
    onImport: () => {
      void importOffline();
    },
  }}
/>

<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { open } from "@tauri-apps/plugin-dialog";
  import SettingsActionButton from "../lib/components/ui/SettingsActionButton.svelte";
  import { bootstrapText } from "../lib/bootstrapI18n";

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
  let dark = $state(window.matchMedia("(prefers-color-scheme: dark)").matches);
  let busy = $state(false);
  const text = (key: Parameters<typeof bootstrapText>[1]) => bootstrapText(language, key);
  const progress = $derived(
    status.total_bytes > 0
      ? Math.min(100, (status.downloaded_bytes / status.total_bytes) * 100)
      : 0,
  );
  $effect(() => {
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.lang = language;
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
    const directory = await open({ directory: true, multiple: false, title: text("shellImport") });
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
        status.error = String(error);
        status.phase = "failed";
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  });
</script>

<div class="bootstrap-shell application-settings-scope" data-module="shell-resources">
  <div class="chrome" data-tauri-drag-region>
    <span data-tauri-drag-region>OpenAgent</span>
    <div class="controls">
      <SettingsActionButton
        label={language === "en" ? "中文" : "English"}
        tone="quiet"
        onclick={() => {
          language = language === "en" ? "zh" : "en";
        }}
      />
      <SettingsActionButton
        label={text(dark ? "shellLight" : "shellDark")}
        tone="quiet"
        onclick={() => {
          dark = !dark;
        }}
      />
      <SettingsActionButton
        label={text("shellClose")}
        tone="quiet"
        onclick={() => {
          void getCurrentWindow().close();
        }}
      />
    </div>
  </div>
  <main>
    <p class="brand">OpenAgent</p>
    <h1>{text(status.phase === "failed" ? "shellFailed" : "shellPreparing")}</h1>
    <p class="description">{text("shellDescription")}</p>
    <div class="application-settings-surface progress-card" aria-live="polite">
      <p>
        {text(
          status.phase === "installing"
            ? "shellInstalling"
            : status.phase === "starting"
              ? "shellStarting"
              : "shellDownloading",
        )}
      </p>
      <progress max="100" value={progress} aria-label={text("shellDownloading")}></progress>
      <p class="bytes">
        {(status.downloaded_bytes / 1048576).toFixed(1)} / {(status.total_bytes / 1048576).toFixed(
          1,
        )} MB
      </p>
      {#if status.error}<p class="error" role="alert">{text("shellErrorHelp")}</p>{/if}
    </div>
    <div class="actions">
      <SettingsActionButton
        label={text("shellRetry")}
        tone="primary"
        disabled={busy || status.phase !== "failed"}
        onclick={() => {
          void retry();
        }}
      />
      <SettingsActionButton
        label={text("shellImport")}
        disabled={busy || !["waiting", "failed"].includes(status.phase)}
        onclick={() => {
          void importOffline();
        }}
      />
    </div>
    <p class="hint">{text("shellResume")}</p>
  </main>
</div>

<style>
  .bootstrap-shell {
    min-height: 100dvh;
    color: var(--text);
  }
  .chrome {
    height: var(--desktop-titlebar-height);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    font-size: 12px;
  }
  .controls,
  .actions {
    display: flex;
    gap: 12px;
    align-items: center;
  }
  main {
    max-width: 600px;
    margin: 0 auto;
    padding: clamp(48px, 12vh, 100px) 24px 36px;
  }
  .brand {
    color: var(--text-muted);
    font-size: 14px;
    margin-bottom: 12px;
  }
  h1 {
    font-size: clamp(26px, 4vw, 36px);
    line-height: 1.25;
    font-weight: 600;
    letter-spacing: -0.03em;
  }
  .description,
  .hint {
    color: var(--text-muted);
    line-height: 1.6;
  }
  .description {
    margin: 16px 0 28px;
  }
  .progress-card {
    padding: 22px;
    border-radius: 12px;
    min-height: 128px;
  }
  progress {
    display: block;
    width: 100%;
    height: 6px;
    margin: 16px 0 12px;
    accent-color: var(--primary);
  }
  .bytes,
  .hint {
    font-size: 12px;
  }
  .bytes {
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
  .error {
    color: var(--danger);
    margin-top: 14px;
    line-height: 1.5;
  }
  .actions {
    margin-top: 24px;
    flex-wrap: wrap;
  }
  .hint {
    margin-top: 18px;
  }
</style>

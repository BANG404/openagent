<script lang="ts">
  import type { DesktopExitProgress } from "$lib/desktopExit";
  import { t, type TranslationKeys } from "$lib/i18n";

  let { progress }: { progress: DesktopExitProgress } = $props();
  const stages: Record<DesktopExitProgress["stage"], TranslationKeys> = {
    runtime: "exitStoppingWork",
    connections: "exitClosingConnections",
    windows: "exitClosingWindows",
    tools: "exitStoppingTools",
    finishing: "exitFinishing",
  };
</script>

<div class="desktop-exit-overlay" data-desktop-exit-progress>
  <section class="desktop-exit-card" role="status" aria-live="polite" aria-atomic="true">
    <h1>
      {$t(
        progress.action === "restart"
          ? "exitRestarting"
          : progress.action === "install"
            ? "exitPreparingUpdate"
            : "exitQuitting",
      )}
    </h1>
    <p>{$t(stages[progress.stage])}</p>
    <progress value={progress.completed} max={progress.total} aria-label={$t("exitProgress")}
    ></progress>
    <span class="desktop-exit-caption">{$t("exitPleaseWait")}</span>
  </section>
</div>

<style>
  .desktop-exit-overlay {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    display: grid;
    place-items: center;
    padding: 20px;
    background: var(--mica-surface);
    backdrop-filter: blur(24px);
    cursor: wait;
  }

  .desktop-exit-card {
    width: min(100%, 360px);
    padding: 24px;
    border: 1px solid var(--mica-divider);
    border-radius: 18px;
    background: var(--surface);
    color: var(--text);
  }

  h1 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }

  p {
    margin: 10px 0 16px;
    color: var(--text-muted);
    font-size: 13px;
  }

  progress {
    display: block;
    width: 100%;
    height: 4px;
    overflow: hidden;
    border: 0;
    border-radius: 2px;
    background: var(--surface2);
    accent-color: var(--primary);
  }

  progress::-webkit-progress-bar {
    background: var(--surface2);
  }

  progress::-webkit-progress-value {
    background: var(--primary);
  }

  .desktop-exit-caption {
    display: block;
    margin-top: 12px;
    color: var(--text-muted);
    font-size: 12px;
  }
</style>

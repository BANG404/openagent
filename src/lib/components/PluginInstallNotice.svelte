<script lang="ts">
  import type { PluginInstallTask } from "$lib/agentPluginInstallQueue";
  import { t } from "$lib/i18n";

  let {
    task,
    message,
    ondismiss,
  }: {
    task: PluginInstallTask;
    message: string;
    ondismiss: () => void;
  } = $props();
</script>

<div
  class="plugin-install-notice"
  class:error={task.status === "error"}
  data-plugin-id={task.pluginId ?? task.key}
  data-install-status={task.status}
  data-stage={task.progress.stage}
>
  <div class="notice-copy" role="status" aria-live="polite" aria-atomic="true">
    <svg viewBox="0 0 16 16" aria-hidden="true">
      {#if task.status === "success"}
        <path d="m3.25 8.25 3 3 6.5-6.5" />
      {:else}
        <circle cx="8" cy="8" r="5.75" />
        <path d="M8 4.75v3.5M8 10.75h.01" />
      {/if}
    </svg>
    <span>
      {#if task.status === "success"}
        {$t("pluginInstallSuccess").replace("{name}", task.label)}
      {:else}
        <strong>{task.label}</strong> — {message}
      {/if}
    </span>
  </div>
  <button type="button" class="notice-dismiss" aria-label={$t("close")} onclick={ondismiss}>
    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4.5 4.5 7 7m0-7-7 7" /></svg>
  </button>
</div>

<style>
  .plugin-install-notice {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 0;
    margin-bottom: 8px;
    color: var(--text);
    font-size: 12px;
    line-height: 1.5;
  }

  .notice-copy {
    display: flex;
    align-items: flex-start;
    min-width: 0;
    gap: 8px;
  }

  svg {
    width: 16px;
    height: 16px;
    flex: 0 0 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .notice-copy svg {
    margin-top: 1px;
  }

  .notice-copy span {
    overflow-wrap: anywhere;
  }

  .error .notice-copy svg {
    color: var(--danger);
  }

  .notice-dismiss {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }

  .notice-dismiss:hover {
    background: var(--interactive-state-bg);
    color: var(--text);
  }

  .notice-dismiss:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
</style>

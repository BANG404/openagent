<script lang="ts">
  import { fly } from "svelte/transition";
  import { toasts, dismissToast, type Toast } from "$lib/toast";
  import { t } from "$lib/i18n";

  async function runAction(toast: Toast) {
    if (!toast.action) return;
    try {
      await toast.action.onClick();
    } finally {
      dismissToast(toast.id);
    }
  }
</script>

<div class="toast-stack" role="region" aria-live="polite">
  {#each $toasts as toast (toast.id)}
    <div
      class="toast"
      class:toast-error={toast.variant === "error"}
      class:toast-success={toast.variant === "success"}
      transition:fly={{ y: -16, duration: 180 }}
    >
      <div class="toast-body">
        <div class="toast-title">{toast.title}</div>
        {#if toast.description}
          <div class="toast-desc" title={toast.description}>{toast.description}</div>
        {/if}
      </div>
      <div class="toast-actions">
        {#if toast.action}
          <button class="toast-action" onclick={() => runAction(toast)}>{toast.action.label}</button>
        {/if}
        <button
          class="toast-dismiss"
          onclick={() => dismissToast(toast.id)}
          aria-label={$t("toastDismiss")}
        >
          <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
            <path d="M3 3 L11 11 M11 3 L3 11" />
          </svg>
        </button>
      </div>
    </div>
  {/each}
</div>

<style>
  .toast-stack {
    position: fixed;
    top: 64px;
    right: 24px;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
    z-index: 900;
    pointer-events: none;
    max-width: min(440px, calc(100vw - 48px));
  }
  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 12px;
    width: min(360px, calc(100vw - 48px));
    min-height: 64px;
    box-sizing: border-box;
    padding: 12px 16px;
    background: var(--control-surface);
    border: 0;
    border-radius: 18px;
    -webkit-backdrop-filter: blur(12px) saturate(1.08);
    backdrop-filter: blur(12px) saturate(1.08);
    box-shadow: var(--raised-shadow);
  }
  .toast-error {
    box-shadow: inset 3px 0 var(--danger, #c33), var(--raised-shadow);
  }
  .toast-success {
    box-shadow: inset 3px 0 var(--success, #27864a), var(--raised-shadow);
  }
  .toast-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .toast-title {
    color: var(--text);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: -0.224px;
    line-height: 1.29;
  }
  .toast-desc {
    color: var(--text-muted);
    font-size: 13px;
    font-weight: 400;
    letter-spacing: -0.224px;
    line-height: 1.43;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    direction: rtl;
    text-align: left;
  }
  .toast-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }
  .toast-action {
    background: transparent;
    border: none;
    color: var(--primary);
    font-size: 13px;
    font-weight: 400;
    letter-spacing: -0.224px;
    padding: 6px 10px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.12s;
    font-family: inherit;
  }
  .toast-action:hover {
    background: var(--surface2);
  }
  .toast-action:active {
    transform: scale(0.95);
  }
  .toast-dismiss {
    background: transparent;
    border: none;
    color: var(--text-muted);
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.12s, color 0.12s, transform 0.12s;
    padding: 0;
  }
  .toast-dismiss:hover {
    background: var(--surface2);
    color: var(--text);
  }
  .toast-dismiss:active {
    transform: scale(0.95);
  }
</style>

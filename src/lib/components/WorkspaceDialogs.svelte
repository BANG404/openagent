<script lang="ts">
  import { Dialog } from "bits-ui";
  import { t } from "$lib/i18n";
  import type { WslDistribution } from "$lib/types";

  let {
    wslPickerOpen = $bindable(),
    wslPickerBusy,
    wslPickerError = $bindable(),
    wslDistributions,
    wslDistribution = $bindable(),
    wslLinuxPath = $bindable(),
    onSelectDistribution,
    onBrowseWsl,
    onOpenWsl,
  }: {
    wslPickerOpen: boolean;
    wslPickerBusy: boolean;
    wslPickerError: string;
    wslDistributions: WslDistribution[];
    wslDistribution: string;
    wslLinuxPath: string;
    onSelectDistribution: (distribution: string) => void | Promise<void>;
    onBrowseWsl: () => void | Promise<void>;
    onOpenWsl: () => void | Promise<void>;
  } = $props();
</script>

<Dialog.Root
  bind:open={wslPickerOpen}
  onOpenChange={(open) => {
    if (!open) wslPickerError = "";
  }}
>
  <Dialog.Portal>
    <Dialog.Overlay class="dialog-overlay" />
    <Dialog.Content class="dialog wsl-workspace-dialog" aria-busy={wslPickerBusy}>
      <Dialog.Title class="dialog-title">{$t("wslWorkspaceTitle")}</Dialog.Title>
      <Dialog.Description class="workspace-choice-description">
        {$t("wslWorkspaceDescription")}
      </Dialog.Description>
      <form
        class="wsl-workspace-form"
        onsubmit={(event) => {
          event.preventDefault();
          void onOpenWsl();
        }}
      >
        <label class="wsl-field">
          <span>{$t("wslDistribution")}</span>
          <select
            bind:value={wslDistribution}
            disabled={wslPickerBusy || wslDistributions.length === 0}
            onchange={(event) => void onSelectDistribution(event.currentTarget.value)}
          >
            {#each wslDistributions as distribution (distribution.name)}
              <option value={distribution.name}>{distribution.name}</option>
            {/each}
          </select>
        </label>
        <label class="wsl-field">
          <span>{$t("wslLinuxPath")}</span>
          <div class="wsl-path-row">
            <input
              bind:value={wslLinuxPath}
              disabled={wslPickerBusy || !wslDistribution}
              placeholder={$t("wslPathPlaceholder")}
              spellcheck="false"
              oninput={() => (wslPickerError = "")}
            />
            <button
              class="dialog-action-quiet wsl-browse-button"
              type="button"
              disabled={wslPickerBusy || !wslDistribution || !wslLinuxPath.trim()}
              onclick={() => void onBrowseWsl()}
            >
              {$t("wslBrowse")}
            </button>
          </div>
        </label>
        {#if wslPickerBusy}
          <div class="wsl-status">{$t("wslLoading")}</div>
        {:else if wslPickerError}
          <div class="wsl-error" role="alert">
            <strong>{$t("wslLoadFailed")}</strong><span>{wslPickerError}</span>
          </div>
        {/if}
        <div class="dialog-actions">
          <button class="dialog-action-quiet" type="button" onclick={() => (wslPickerOpen = false)}
            >{$t("cancel")}</button
          >
          <button
            class="btn-primary"
            type="submit"
            disabled={wslPickerBusy || !wslDistribution || !wslLinuxPath.trim()}
            >{$t("wslOpen")}</button
          >
        </div>
      </form>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  :global(.dialog-overlay) {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(3px);
    z-index: 100;
  }
  :global(.dialog) {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--control-surface);
    border: 0;
    border-radius: 14px;
    padding: 24px;
    width: 480px;
    max-width: 95vw;
    max-height: 90vh;
    overflow-y: auto;
    z-index: 101;
    backdrop-filter: blur(16px) saturate(1.08);
    box-shadow: var(--raised-shadow);
  }
  :global(.wsl-workspace-dialog) {
    width: 520px;
  }
  :global(.wsl-workspace-form) {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  :global(.wsl-field) {
    display: flex;
    flex-direction: column;
    gap: 7px;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 600;
  }
  :global(.wsl-field select),
  :global(.wsl-field input) {
    min-width: 0;
    height: 36px;
    border: 0;
    border-radius: 7px;
    outline: none;
    background: var(--bg);
    color: var(--text);
    font: inherit;
    font-size: 13px;
    font-weight: 400;
    box-shadow: var(--control-shadow);
  }
  :global(.wsl-field select) {
    padding: 0 10px;
  }
  :global(.wsl-field input) {
    flex: 1;
    padding: 0 11px;
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  }
  :global(.wsl-field select:focus),
  :global(.wsl-field input:focus) {
    box-shadow: var(--control-shadow), var(--focus-ring);
  }
  :global(.wsl-field select:disabled),
  :global(.wsl-field input:disabled) {
    cursor: not-allowed;
    opacity: 0.55;
  }
  :global(.wsl-path-row) {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  :global(.wsl-browse-button) {
    flex-shrink: 0;
  }
  :global(.wsl-status) {
    color: var(--text-muted);
    font-size: 12px;
  }
  :global(.wsl-error) {
    display: flex;
    flex-direction: column;
    gap: 4px;
    border-radius: 7px;
    padding: 9px 11px;
    background: color-mix(in srgb, #b42318 10%, var(--surface));
    color: #b42318;
    font-size: 12px;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
  :global(.workspace-choice-description) {
    margin: -8px 0 14px;
    color: var(--text-muted);
    font-size: 13px;
    line-height: 1.55;
  }
  :global(.dialog-title) {
    font-size: 17px;
    font-weight: 600;
    margin: 0 0 20px;
    color: var(--text);
    letter-spacing: -0.2px;
  }
  :global(.dialog-actions) {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 24px;
  }
  :global(.dialog-action-quiet) {
    padding: 6px 0;
    border: 0;
    background: transparent;
    color: var(--text-muted);
    font-size: 13px;
    cursor: pointer;
    transition: color 0.15s;
  }
  :global(.dialog-action-quiet:hover) {
    color: var(--text);
  }
  :global(.dialog-action-quiet:focus-visible) {
    border-radius: 3px;
    box-shadow: var(--focus-ring);
    outline: none;
  }
</style>

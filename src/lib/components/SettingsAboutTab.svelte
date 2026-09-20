<script lang="ts">
  import { appUpdateState, checkForAppUpdate } from "$lib/appUpdater";
  import { t } from "$lib/i18n";
  import ScrollArea from "$lib/components/ui/ScrollArea.svelte";

  let { release }: { release: string } = $props();
</script>

<ScrollArea height="100%" class="settings-content-col" scrollHideDelay={350}>
  <div class="about-content">
    <img class="about-logo-img" src="/app-icon.png" alt="OpenAgent" />
    <h3 class="about-app-name">OpenAgent {release}</h3>
    <a class="about-contact" href="mailto:iumm@ibat.ac.cn">iumm@ibat.ac.cn</a>
    <a
      class="about-contact"
      href="https://bang404.github.io/openagent/"
      target="_blank"
      rel="noreferrer">{$t("aboutWebsite")}</a
    >
    <button
      class="btn-secondary btn-sm about-update-button"
      disabled={$appUpdateState !== "idle"}
      aria-busy={$appUpdateState === "checking"}
      onclick={() => checkForAppUpdate(true)}
    >
      {$appUpdateState === "checking" ? $t("checkingForUpdates") : $t("checkForUpdates")}
    </button>
  </div>
</ScrollArea>

<style>
  :global(.settings-content-col) {
    flex: 1;
    min-width: 0;
    min-height: 0;
  }

  :global(.settings-content-col .ui-scroll-area-viewport) {
    padding: 24px;
    padding-inline: max(24px, calc((100% - 680px) / 2));
  }

  .about-app-name {
    margin: 0;
    color: var(--text);
    font-weight: 600;
  }

  .about-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 48px 24px;
    text-align: center;
    color: var(--text-muted);
  }

  .about-contact {
    font-size: 13px;
    color: var(--primary);
    text-decoration: none;
  }

  .about-contact:hover {
    text-decoration: underline;
  }

  .about-update-button {
    margin-top: 8px;
  }

  .about-update-button:disabled {
    cursor: wait;
    opacity: 0.6;
  }

  .about-logo-img {
    width: 64px;
    height: 64px;
    border-radius: 14px;
  }
</style>

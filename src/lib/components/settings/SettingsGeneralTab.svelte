<script lang="ts">
  import { Tabs } from "bits-ui";
  import { DEFAULT_QUICK_CHAT_SHORTCUT, formatQuickChatShortcut } from "$lib/quickChatShortcut";
  import { t } from "$lib/i18n";
  import Select from "../ui/Select.svelte";
  import Switch from "../ui/Switch.svelte";
  import ScrollArea from "../ui/ScrollArea.svelte";
  import { useSettingsContext } from "$lib/settings/context";
  const { draft, general } = useSettingsContext();
</script>

<Tabs.Content value="general" class="settings-tab-panel">
  <ScrollArea height="100%" class="settings-content-col" scrollHideDelay={350}>
    <section class="detail-section">
      <h4 class="detail-section-title">{$t("appearance")}</h4>
      <div class="application-settings-surface settings-card">
        <div class="settings-card-row">
          <span class="settings-card-copy">
            <span class="label-text">{$t("theme")}</span>
            <span class="detail-hint">{$t("themeHint")}</span>
          </span>
          <div class="settings-card-control">
            <Select
              bind:value={draft.draftConfig.theme}
              items={[
                { value: "system", label: $t("themeSystem") },
                { value: "light", label: $t("themeLight") },
                { value: "dark", label: $t("themeDark") },
              ]}
              ariaLabel={$t("theme")}
            />
          </div>
        </div>
        <div class="settings-card-row">
          <span class="settings-card-copy">
            <span class="label-text">{$t("language")}</span>
            <span class="detail-hint">{$t("languageHint")}</span>
          </span>
          <div class="settings-card-control">
            <Select
              bind:value={draft.draftConfig.language}
              items={[
                { value: "zh", label: "中文" },
                { value: "en", label: "English" },
              ]}
              ariaLabel={$t("language")}
            />
          </div>
        </div>
        <div class="settings-card-row">
          <span class="settings-card-copy">
            <span class="label-text">{$t("messageLayout")}</span>
            <span class="detail-hint">{$t("messageLayoutHint")}</span>
          </span>
          <div class="settings-card-control">
            <Select
              bind:value={draft.draftConfig.message_layout}
              items={[
                { value: "single", label: $t("messageLayoutSingle") },
                { value: "responsive_double", label: $t("messageLayoutResponsiveDouble") },
              ]}
              ariaLabel={$t("messageLayout")}
            />
          </div>
        </div>
        {#if draft.draftConfig.message_layout === "responsive_double"}
          <label class="settings-card-row">
            <span class="settings-card-copy">
              <span class="label-text">{$t("messageDoubleColumnMinWidth")}</span>
              <span class="detail-hint">{$t("messageDoubleColumnHint")}</span>
            </span>
            <input
              type="number"
              class="detail-input settings-card-number-input"
              min="960"
              max="2400"
              step="40"
              bind:value={draft.draftConfig.message_double_column_min_width}
            />
          </label>
        {/if}
        <label class="settings-card-row">
          <span class="settings-card-copy">
            <span class="label-text">{$t("bookModeFontSize")}</span>
            <span class="detail-hint">{$t("bookModeFontSizeHint")}</span>
          </span>
          <input
            type="number"
            class="detail-input settings-card-number-input"
            min="14"
            max="24"
            step="1"
            bind:value={draft.draftConfig.book_mode_font_size}
          />
        </label>
      </div>
    </section>
    <section class="detail-section" data-settings-section="context-compaction">
      <h4 class="detail-section-title">{$t("compactionTask")}</h4>
      <div class="application-settings-surface settings-card">
        <div class="settings-card-row">
          <span class="settings-card-copy">
            <span class="label-text">{$t("contextCompaction")}</span>
            <span class="detail-hint">{$t("compactionTaskDescription")}</span>
          </span>
          <div class="settings-card-control compaction-toggle-control">
            <Switch
              bind:checked={draft.draftConfig.context_compaction_enabled}
              ariaLabel={$t("contextCompaction")}
            />
          </div>
        </div>
        <label class="settings-card-row">
          <span class="settings-card-copy">
            <span class="label-text">{$t("contextCompactionThreshold")}</span>
            <span class="detail-hint">{$t("contextCompactionThresholdHint")}</span>
          </span>
          <input
            type="number"
            class="detail-input settings-card-number-input"
            min="1000"
            max="1000000"
            step="1000"
            disabled={!draft.draftConfig.context_compaction_enabled}
            bind:value={draft.draftConfig.context_compaction_threshold}
          />
        </label>
        <label class="settings-card-row">
          <span class="settings-card-copy">
            <span class="label-text">{$t("contextCompactionRecentMessageCount")}</span>
            <span class="detail-hint">{$t("contextCompactionRecentMessageCountHint")}</span>
          </span>
          <input
            type="number"
            class="detail-input settings-card-number-input"
            min="0"
            max="20"
            step="1"
            disabled={!draft.draftConfig.context_compaction_enabled}
            bind:value={draft.draftConfig.context_compaction_recent_message_count}
          />
        </label>
        <div class="settings-card-row">
          <details
            class="compaction-custom-prompt"
            open={draft.draftConfig.context_compaction_prompt.trim().length > 0}
          >
            <summary>{$t("taskCustomPrompt")}</summary>
            <label class="detail-label">
              <span class="sr-only">{$t("agentExtraPrompt")}</span>
              <textarea
                class="detail-input"
                bind:value={draft.draftConfig.context_compaction_prompt}
                placeholder={$t("compactionTaskPromptPlaceholder")}></textarea>
            </label>
          </details>
        </div>
      </div>
    </section>
    <section class="detail-section">
      <h4 class="detail-section-title">{$t("quickChat")}</h4>
      <div class="application-settings-surface shortcut-setting-row">
        <div class="shortcut-setting-copy">
          <span class="label-text">{$t("quickShortcutLabel")}</span>
          <p class="detail-hint">{$t("quickShortcutHint")}</p>
        </div>
        <div class="shortcut-setting-controls">
          <button
            type="button"
            class="shortcut-recorder"
            class:recording={general.quickShortcutRecording}
            aria-label={$t("quickShortcutLabel")}
            aria-pressed={general.quickShortcutRecording}
            onclick={() => {
              general.quickShortcutRecording = true;
              general.quickShortcutStatus = { tone: "idle", message: "" };
            }}
            onblur={() => (general.quickShortcutRecording = false)}
          >
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="2" y="3.25" width="12" height="9.5" rx="2" />
              <path d="M4.5 6h.01M7 6h.01M9.5 6h.01M12 6h.01M5.25 9.5h5.5" />
            </svg>
            <span>
              {general.quickShortcutRecording
                ? $t("quickShortcutRecording")
                : formatQuickChatShortcut(draft.draftConfig.quick_chat_shortcut)}
            </span>
          </button>
          <button
            type="button"
            class="dialog-action-quiet shortcut-reset"
            disabled={draft.draftConfig.quick_chat_shortcut === DEFAULT_QUICK_CHAT_SHORTCUT}
            onclick={() => void general.commitQuickChatShortcut(DEFAULT_QUICK_CHAT_SHORTCUT)}
          >
            {$t("reset")}
          </button>
        </div>
      </div>
      {#if general.quickShortcutStatus.message}
        <div
          class="shortcut-status {general.quickShortcutStatus.tone}"
          role={general.quickShortcutStatus.tone === "error" ? "alert" : "status"}
        >
          {general.quickShortcutStatus.message}
        </div>
      {/if}
    </section>
    <section class="detail-section">
      <h4 class="detail-section-title">{$t("privacyDiagnostics")}</h4>
      <div class="application-settings-surface startup-row">
        <div class="startup-copy">
          <span class="label-text">{$t("diagnosticLogCollection")}</span>
          <p class="detail-hint">{$t("diagnosticLogCollectionHint")}</p>
        </div>
        <Switch
          bind:checked={draft.draftConfig.diagnostic_log_collection_enabled}
          ariaLabel={$t("diagnosticLogCollection")}
        />
      </div>
    </section>
    <section class="detail-section">
      <h4 class="detail-section-title">{$t("startup")}</h4>
      <div class="application-settings-surface startup-row">
        <div class="startup-copy">
          <span class="label-text">{$t("launchOnStartup")}</span>
          <p class="detail-hint">{$t("launchOnStartupHint")}</p>
        </div>
        <Switch
          bind:checked={draft.draftConfig.launch_on_startup}
          disabled={!general.autostartReady || general.autostartSyncing}
          ariaLabel={$t("launchOnStartup")}
        />
      </div>
      {#if general.autostartStatus}
        <div class="provider-status error" style="margin-top:8px">{general.autostartStatus}</div>
      {/if}
    </section>
    <section class="detail-section">
      <h4 class="detail-section-title">{$t("mentionPalette")}</h4>
      <div class="application-settings-surface startup-row">
        <div class="startup-copy">
          <span class="label-text">{$t("showGlobalDraftsInMentions")}</span>
          <p class="detail-hint">{$t("showGlobalDraftsInMentionsHint")}</p>
        </div>
        <Switch
          bind:checked={draft.draftConfig.mention_palette_show_global_drafts}
          ariaLabel={$t("showGlobalDraftsInMentions")}
        />
      </div>
    </section>
  </ScrollArea>
</Tabs.Content>

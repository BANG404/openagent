<script lang="ts">
  import { Tabs } from "bits-ui";
  import { t } from "$lib/i18n";
  import Select from "../ui/Select.svelte";
  import Switch from "../ui/Switch.svelte";
  import ScrollArea from "../ui/ScrollArea.svelte";
  import PermissionSettings from "../PermissionSettings.svelte";
  import { approvalModeDescriptionKey } from "$lib/settingsDefaults";
  import { useSettingsContext } from "$lib/settings/context";
  const { draft, general } = useSettingsContext();
</script>

<Tabs.Content value="execution" class="settings-tab-panel">
  <ScrollArea height="100%" class="settings-content-col" scrollHideDelay={350}>
    <section class="detail-section">
      <h4 class="detail-section-title">{$t("approvalMode")}</h4>
      <div class="application-settings-surface settings-card">
        <div class="settings-card-row">
          <span class="settings-card-copy">
            <span class="label-text"
              >{$t(
                approvalModeDescriptionKey[
                  draft.draftConfig.approval_mode as keyof typeof approvalModeDescriptionKey
                ],
              )}</span
            >
            <span class="detail-hint">{$t("approvalPermissionIndependent")}</span>
          </span>
          <div class="settings-card-control">
            <Select
              bind:value={draft.draftConfig.approval_mode}
              items={[
                {
                  value: "manual",
                  label: $t("approvalModeManual"),
                  description: $t("approvalModeManualDescription"),
                },
                {
                  value: "auto",
                  label: $t("approvalModeAuto"),
                  description: $t("approvalModeAutoDescription"),
                },
                {
                  value: "off",
                  label: $t("approvalModeOff"),
                  description: $t("approvalModeOffDescription"),
                },
              ]}
              ariaLabel={$t("approvalMode")}
            />
          </div>
        </div>
      </div>
    </section>
    <section class="detail-section">
      <h4 class="detail-section-title">{$t("executionPermissions")}</h4>
      <p class="detail-section-intro">{$t("executionPermissionsDescription")}</p>
      <PermissionSettings
        profile={general.permissionProfile}
        onProfileChange={(profile) => (draft.draftConfig.permission_profile = profile)}
      />
    </section>
    <section class="detail-section">
      <h4 class="detail-section-title">{$t("agentExecution")}</h4>
      <div class="execution-settings">
        <div class="application-settings-surface execution-setting">
          <div class="startup-row execution-toggle-row">
            <div class="startup-copy">
              <span class="label-text">{$t("agentTurnLimit")}</span>
              <p class="detail-hint">{$t("agentTurnLimitHint")}</p>
            </div>
            <Switch
              bind:checked={draft.draftConfig.agent_turn_limit_enabled}
              ariaLabel={$t("agentTurnLimit")}
            />
          </div>
          <label class="execution-value-row">
            <span class="settings-card-copy">
              <span class="label-text">{$t("agentMaxTurns")}</span>
              <span class="detail-hint">{$t("agentMaxTurnsHint")}</span>
            </span>
            <input
              type="number"
              class="detail-input settings-card-number-input"
              min="1"
              max="1000"
              step="1"
              disabled={!draft.draftConfig.agent_turn_limit_enabled}
              bind:value={draft.draftConfig.agent_max_turns}
            />
          </label>
        </div>
      </div>
    </section>
  </ScrollArea>
</Tabs.Content>

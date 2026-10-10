<script lang="ts">
  import { onMount } from "svelte";
  import type { AgentPluginSummary } from "$lib/types";
  import type { createPluginSetup } from "$lib/settings/pluginSetup.svelte";
  import { t, locale } from "$lib/i18n";
  import { pluginText } from "$lib/pluginI18n";
  import Select from "../ui/Select.svelte";
  import Switch from "../ui/Switch.svelte";
  import SettingsActionButton from "../ui/SettingsActionButton.svelte";
  let {
    plugin,
    setup,
    enabled,
  }: { plugin: AgentPluginSummary; setup: ReturnType<typeof createPluginSetup>; enabled: boolean } =
    $props();
  const state = $derived(setup.state(plugin.id));
  const configurationBusy = $derived(state.busy || setup.connectorBusy(plugin.id));
  const http = $derived(
    plugin.mcp_servers.filter((server) => server.transport === "streamable-http"),
  );
  onMount(() => {
    void setup.load(plugin.id);
    for (const server of http) void setup.authorizationStatus(plugin.id, server.name);
  });
</script>

<section class="plugin-setup" data-plugin-setup={plugin.id} aria-label={$t("pluginConfiguration")}>
  {#if state.loading}
    <div class="plugin-setup-skeleton" aria-busy="true" aria-label={$t("pluginLoading")}>
      {#each plugin.configuration?.fields ?? [] as field (field.key)}
        <div class="plugin-setup-field">
          <span class="skeleton-label"></span><span class="skeleton-control"></span>
        </div>
      {/each}
    </div>
  {:else if state.configuration?.schema.fields.length}
    <h4 class="label-text">{$t("pluginConfiguration")}</h4>
    {#each state.configuration.schema.fields as field (field.key)}
      {@const label = pluginText(
        plugin.i18n,
        $locale,
        `configuration.${field.key}.label`,
        field.label,
      )}
      <div class="plugin-setup-field" data-config-field={field.key}>
        <label class="label-text" for={`plugin-config-${plugin.id}-${field.key}`}
          >{label}{field.required ? " *" : ""}</label
        >
        {#if field.type === "boolean"}
          <Switch
            id={`plugin-config-${plugin.id}-${field.key}`}
            checked={setup.value(plugin.id, field.key) === true}
            ariaLabel={label}
            disabled={configurationBusy}
            onCheckedChange={(value) => setup.edit(plugin.id, field.key, value)}
          />
        {:else if field.type === "enum"}
          <Select
            id={`plugin-config-${plugin.id}-${field.key}`}
            value={String(setup.value(plugin.id, field.key) ?? "")}
            items={field.options.map((option) => ({ value: option, label: option }))}
            ariaLabel={label}
            disabled={configurationBusy}
            onValueChange={(value) => setup.edit(plugin.id, field.key, value)}
          />
        {:else}
          <input
            id={`plugin-config-${plugin.id}-${field.key}`}
            class="detail-input"
            autocomplete="off"
            type={field.secret ? "password" : field.type === "integer" ? "number" : "text"}
            value={setup.value(plugin.id, field.key) ?? ""}
            min={field.minimum}
            max={field.maximum}
            disabled={configurationBusy}
            aria-required={field.required}
            placeholder={field.secret && state.configuration.secrets_set.includes(field.key)
              ? $t("pluginSecretUnchanged")
              : ""}
            oninput={(event) => {
              if (field.secret && event.currentTarget.value === "") {
                setup.unedit(plugin.id, field.key);
                return;
              }
              setup.edit(
                plugin.id,
                field.key,
                event.currentTarget.value === ""
                  ? null
                  : field.type === "integer"
                    ? Number(event.currentTarget.value)
                    : event.currentTarget.value,
              );
            }}
          />
        {/if}
        {#if field.description}<p class="detail-hint">
            {pluginText(
              plugin.i18n,
              $locale,
              `configuration.${field.key}.description`,
              field.description,
            )}
          </p>{/if}
        {#if field.secret && state.configuration.secrets_set.includes(field.key)}
          <div class="plugin-secret-actions">
            <span class="detail-hint">{$t("pluginSecretConfigured")}</span>
            <SettingsActionButton
              label={$t("pluginSecretClear")}
              tone="quiet"
              disabled={configurationBusy}
              onclick={() => setup.edit(plugin.id, field.key, null)}
            />
          </div>
        {/if}
      </div>
    {/each}
    {#if state.configuration.invalid_fields.length}<p class="provider-status error" role="status">
        {$t("pluginConfigurationInvalid")}: {state.configuration.invalid_fields.join(", ")}
      </p>{/if}
    {#if state.configuration.missing_required.length}<p class="detail-hint">
        {$t("pluginConfigurationRequired")}: {state.configuration.missing_required.join(", ")}
      </p>{/if}
    <div class="settings-action-group" data-config-actions>
      <SettingsActionButton
        label={$t("pluginConfigurationSave")}
        disabled={configurationBusy || Object.keys(state.edits).length === 0}
        onclick={() => setup.save(plugin.id)}
      />
      <SettingsActionButton
        label={$t("pluginRefresh")}
        tone="quiet"
        disabled={configurationBusy}
        onclick={() => setup.load(plugin.id)}
      />
    </div>
  {/if}
  {#if state.message}<p class="provider-status" class:error={state.error} role="status">
      {state.message}
    </p>{/if}
  {#each http as server (server.name)}
    {@const connector = setup.connector(plugin.id, server.name)}
    <div class="plugin-connector" data-plugin-connector={server.name}>
      <div class="plugin-connector-heading">
        <span class="label-text">{server.name}</span>
        <span class="detail-hint"
          >{connector.oauth?.authorized
            ? $t("pluginAuthorized")
            : $t("pluginAuthorizationUnchecked")}</span
        >
      </div>
      <div class="settings-action-group">
        <SettingsActionButton
          label={$t("testConnection")}
          icon="test"
          tone="quiet"
          disabled={!enabled || connector.busy || state.busy}
          onclick={() => setup.probe(plugin.id, server.name)}
        />
        {#if connector.probe?.oauth !== "not_required" && connector.probe?.oauth !== "unsupported"}
          <span data-plugin-authorize
            ><SettingsActionButton
              label={$t("mcpAuthorize")}
              disabled={!enabled || connector.busy || state.busy}
              onclick={() => setup.authorize(plugin.id, server.name)}
            /></span
          >
        {/if}
        <span data-plugin-revoke
          ><SettingsActionButton
            label={$t("pluginAuthorizationRevoke")}
            tone="quiet"
            disabled={(connector.busy && !connector.authorizing) || state.busy}
            onclick={() => setup.revoke(plugin.id, server.name)}
          /></span
        >
      </div>
      {#if connector.probe?.oauth === "not_required"}<p class="detail-hint">
          {$t("pluginAuthorizationNotRequired")}
        </p>{/if}
      {#if connector.probe?.oauth === "unsupported"}<p class="detail-hint">
          {$t("mcpOAuthUnsupported")}
        </p>{/if}
      {#if connector.message}<p class="provider-status" class:error={connector.error} role="status">
          {connector.message}
        </p>{/if}
    </div>
  {/each}
</section>

<style>
  .plugin-setup {
    display: grid;
    gap: 12px;
  }
  .plugin-setup-field {
    display: grid;
    gap: 6px;
  }
  .plugin-setup-field .detail-input {
    width: 100%;
  }
  .plugin-secret-actions,
  .plugin-connector-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .plugin-connector {
    display: grid;
    gap: 8px;
    padding-block: 12px;
    border-top: 1px solid var(--mica-divider);
  }
  .plugin-setup-skeleton {
    display: grid;
    gap: 12px;
  }
  .skeleton-label,
  .skeleton-control {
    display: block;
    background: var(--mica-divider);
    border-radius: 6px;
  }
  .skeleton-label {
    width: 35%;
    height: 18px;
  }
  .skeleton-control {
    height: 36px;
    width: 100%;
  }
</style>

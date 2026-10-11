<script lang="ts">
  import { onMount } from "svelte";
  import { t, locale } from "$lib/i18n";
  import { pluginText } from "$lib/pluginI18n";
  import { useSettingsContext } from "$lib/settings/context";
  import type { ThemeColors } from "$lib/types";
  import Select from "../ui/Select.svelte";
  const { draft, plugins } = useSettingsContext();
  let dark = $state(false);
  let defaults = $state({ accent: "", background: "", foreground: "", ui: "14", code: "13" });
  const palette = $derived(dark ? "dark" : "light");
  const fields = ["accent", "background", "foreground"] as const;
  const themes = $derived(
    plugins.agentPlugins.filter((p) => p.plugin_type === "theme" && p.theme && !p.error),
  );
  const unavailable = $derived(
    Boolean(
      draft.draftConfig.theme_plugin &&
      !themes.some((p) => p.id === draft.draftConfig.theme_plugin),
    ),
  );
  const selectedDisabled = $derived(
    Boolean(
      draft.draftConfig.theme_plugin &&
      draft.draftConfig.agent_plugins_enabled?.[draft.draftConfig.theme_plugin] === false,
    ),
  );
  const items = $derived([
    { value: "", label: $t("appearanceDefaultTheme") },
    ...themes.map((p) => ({
      value: p.id,
      label: pluginText(p.i18n, $locale, "display_name", p.name),
    })),
    ...(unavailable
      ? [
          {
            value: draft.draftConfig.theme_plugin,
            label: `${draft.draftConfig.theme_plugin} · ${$t("appearanceUnavailable")}`,
          },
        ]
      : []),
  ]);
  function selectTheme(id: string) {
    draft.draftConfig.theme_plugin = id;
    if (id) plugins.setAgentPluginEnabled(id, true);
  }
  function setColor(key: keyof ThemeColors, value: string) {
    const current = draft.draftConfig.theme_overrides;
    const colors = { ...current[palette] };
    if (value) colors[key] = value.toUpperCase();
    else delete colors[key];
    draft.draftConfig.theme_overrides = { ...current, [palette]: colors };
  }
  function reset() {
    draft.draftConfig.theme_overrides = { light: {}, dark: {}, font_family: "" };
  }
  onMount(() => {
    const root = document.documentElement;
    const read = () => {
      dark = root.classList.contains("dark");
      const style = getComputedStyle(root);
      defaults = {
        accent: style.getPropertyValue("--primary").trim(),
        background: style.getPropertyValue("--surface").trim(),
        foreground: style.getPropertyValue("--text").trim(),
        ui: style.getPropertyValue("--app-font-size").trim().replace("px", ""),
        code: style.getPropertyValue("--code-font-size").trim().replace("px", ""),
      };
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["class", "style"] });
    return () => observer.disconnect();
  });
</script>

<div class="settings-card-row" data-appearance-theme>
  <span class="settings-card-copy">
    <span class="label-text">{$t("appearancePluginTheme")}</span>
    <span class="detail-hint">{$t("appearancePluginThemeHint")}</span>
  </span>
  <div class="settings-card-control">
    {#if plugins.agentPluginsLoading && themes.length === 0}
      <div class="theme-skeleton" aria-label={$t("pluginLoading")} aria-busy="true"></div>
    {:else}
      <Select
        value={draft.draftConfig.theme_plugin}
        {items}
        onValueChange={selectTheme}
        ariaLabel={$t("appearancePluginTheme")}
      />
    {/if}
  </div>
</div>
{#if plugins.agentPluginStatus}
  <p class="detail-hint" role="status">{plugins.agentPluginStatus}</p>
{/if}
{#if unavailable}
  <p class="detail-hint" role="status">{$t("appearanceUnavailableHint")}</p>
{:else if selectedDisabled}
  <button
    class="btn-secondary"
    type="button"
    onclick={() => selectTheme(draft.draftConfig.theme_plugin)}
    >{$t("appearanceEnableTheme")}</button
  >
{/if}
{#each fields as key (key)}
  <div class="settings-card-row" data-appearance-color={key}>
    <label class="label-text" for={`appearance-${key}`}
      >{$t(
        key === "accent"
          ? "appearanceAccent"
          : key === "background"
            ? "appearanceBackground"
            : "appearanceForeground",
      )}</label
    >
    <div class="color-control">
      <span
        class="color-swatch"
        style:background={draft.draftConfig.theme_overrides[palette][key] ?? defaults[key]}
      ></span>
      <input
        id={`appearance-${key}`}
        type="text"
        class="detail-input"
        maxlength="7"
        pattern="#[0-9a-fA-F]{6}"
        placeholder={defaults[key]}
        value={draft.draftConfig.theme_overrides[palette][key] ?? ""}
        aria-label={$t(
          key === "accent"
            ? "appearanceAccent"
            : key === "background"
              ? "appearanceBackground"
              : "appearanceForeground",
        )}
        oninput={(event) => {
          const value = event.currentTarget.value.trim();
          if (!value || /^#[a-f0-9]{6}$/i.test(value)) setColor(key, value);
        }}
        onblur={(event) => {
          event.currentTarget.value = draft.draftConfig.theme_overrides[palette][key] ?? "";
        }}
      />
      <button
        class="btn-icon"
        type="button"
        aria-label={$t("appearanceResetField")}
        onclick={() => setColor(key, "")}>↺</button
      >
    </div>
  </div>
{/each}
<div class="settings-card-row" data-appearance-font>
  <span class="label-text">{$t("appearanceFont")}</span>
  <div class="settings-card-control">
    <Select
      bind:value={draft.draftConfig.theme_overrides.font_family}
      items={[
        { value: "", label: $t("appearanceFollowTheme") },
        { value: "system", label: $t("appearanceFontSystem") },
        { value: "sans", label: $t("appearanceFontSans") },
        { value: "serif", label: $t("appearanceFontSerif") },
        { value: "mono", label: $t("appearanceFontMono") },
      ]}
      ariaLabel={$t("appearanceFont")}
    />
  </div>
</div>
<p class="detail-hint palette-hint">
  {$t(dark ? "appearanceDarkOverrides" : "appearanceLightOverrides")}
</p>
<details class="appearance-advanced">
  <summary>{$t("appearanceAdvanced")}</summary>
  {#each ["ui_font_size", "code_font_size"] as key (key)}
    {@const field = key as "ui_font_size" | "code_font_size"}
    <div class="settings-card-row">
      <label class="label-text" for={`appearance-${field}`}
        >{$t(field === "ui_font_size" ? "appearanceUiSize" : "appearanceCodeSize")}</label
      >
      <div class="size-control">
        <input
          id={`appearance-${field}`}
          type="number"
          class="detail-input settings-card-number-input"
          min="10"
          max="24"
          step="1"
          placeholder={field === "ui_font_size" ? defaults.ui : defaults.code}
          bind:value={draft.draftConfig.theme_overrides[field]}
        />
        <span class="detail-hint">px</span>
      </div>
    </div>
  {/each}
</details>
<div class="appearance-reset">
  <button class="btn-secondary" type="button" data-appearance-reset onclick={reset}
    >{$t("appearanceReset")}</button
  >
</div>

<style>
  .color-control,
  .size-control {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .color-swatch {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 1px solid var(--border);
  }
  .color-control input {
    width: 102px;
  }
  .size-control input {
    width: 72px;
  }
  .palette-hint {
    padding-block: 8px;
  }
  .appearance-advanced summary {
    color: var(--text-muted);
    cursor: pointer;
    padding-block: 8px;
  }
  .appearance-reset {
    display: flex;
    justify-content: flex-end;
    padding-block: 8px;
  }
  .theme-skeleton {
    width: 100%;
    height: var(--settings-control-height);
    border-radius: 8px;
    background: var(--component-neutral-bg);
  }
</style>

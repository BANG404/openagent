<script lang="ts">
  import { Tabs } from "bits-ui";
  import { t } from "$lib/i18n";
  import { useSettingsContext } from "$lib/settings/context";
  import ScrollArea from "../ui/ScrollArea.svelte";
  import SettingsActionButton from "../ui/SettingsActionButton.svelte";
  import PluginSource from "./PluginSource.svelte";
  import Select from "../ui/Select.svelte";
  import { displayPath } from "$lib/workspacePath";
  const { integrations, plugins, openPlugin } = useSettingsContext();
  const skill = $derived(integrations.selectedSkill);
  const owner = $derived(
    skill?.scope.startsWith("plugin:")
      ? plugins.agentPlugins.find((plugin) => `plugin:${plugin.id}` === skill.scope)
      : undefined,
  );
  function sourceLabel(scope: string) {
    return scope.startsWith("plugin:")
      ? scope
      : $t(scope === "local" ? "integrationWorkspaceSkill" : "integrationGlobalSkill");
  }
</script>

<Tabs.Content value="skills" class="settings-tab-panel">
  <div class="settings-list-col">
    <div class="skill-search">
      <input
        class="detail-input"
        type="search"
        aria-label={$t("integrationSkillSearch")}
        placeholder={$t("integrationSkillSearch")}
        bind:value={integrations.query}
      />
      <Select
        id="skill-scope-filter"
        ariaLabel={$t("integrationSkillFilter")}
        bind:value={integrations.scopeFilter}
        items={(
          [
            ["all", "integrationSkillFilterAll"],
            ["global", "integrationGlobalSkill"],
            ["local", "integrationWorkspaceSkill"],
            ["plugin", "integrationPluginSkill"],
          ] as const
        ).map(([value, key]) => ({ value, label: $t(key) }))}
      />
    </div>
    <ScrollArea height="100%" class="provider-list-scroll" scrollHideDelay={350}>
      <div class="provider-list" data-skills-list>
        {#if integrations.loading}
          <div class="skill-skeleton" aria-busy="true" aria-label={$t("loadingContent")}>
            {#each [1, 2, 3, 4] as row (row)}<div></div>{/each}
          </div>
        {:else if integrations.error}
          <p class="provider-status error" role="alert">{integrations.error}</p>
        {:else}
          {#each integrations.filteredSkills as item (item.key)}
            <button
              class="provider-item"
              class:active={item.key === integrations.selectedKey}
              data-skill-path={item.path}
              data-skill-scope={item.scope}
              onclick={() => (integrations.selectedKey = item.key)}
            >
              <span class="provider-item-info">
                <strong class="provider-item-name">{item.name}</strong>
                {#if item.description}
                  <span class="skill-item-description">{item.description}</span>
                {/if}
                <span class="provider-item-url">{sourceLabel(item.scope)}</span>
              </span>
            </button>
          {:else}<p class="provider-list-empty">{$t("integrationSkillsEmpty")}</p>{/each}
        {/if}
      </div>
    </ScrollArea>
    <div class="list-footer">
      <SettingsActionButton
        label={$t("refresh")}
        icon="refresh"
        disabled={integrations.loading}
        onclick={integrations.refreshSkills}
      />
    </div>
  </div>
  <ScrollArea height="100%" class="settings-content-col" scrollHideDelay={350}>
    {#if skill && !integrations.loading && !integrations.error}
      <section class="detail-section skill-detail" data-skill-detail={skill.path}>
        <h4 class="detail-section-title">{skill.name}</h4>
        <p class="skill-description">{skill.description}</p>
        <div class="skill-metadata">
          {#if owner}<PluginSource plugin={owner} onOpen={openPlugin} />
          {:else}<p class="detail-hint">
              {$t("integrationSkillSource")}: {sourceLabel(skill.scope)}
            </p>{/if}
          <p class="skill-path">{displayPath(skill.path)}</p>
        </div>
        <div data-open-skill-directory>
          <SettingsActionButton
            label={$t("integrationOpenDirectory")}
            onclick={() => integrations.openDirectory(skill.path)}
          />
        </div>
        {#if integrations.openError}<p class="provider-status error" role="alert">
            {integrations.openError}
          </p>{/if}
      </section>
      <section class="detail-section">
        <h4 class="detail-section-title">SKILL.md</h4>
        {#if integrations.contentLoading}<div
            class="skill-skeleton"
            aria-busy="true"
            aria-label={$t("loadingContent")}
          >
            <div></div>
            <div></div>
            <div></div>
          </div>
        {:else if integrations.contentError}<p class="provider-status error" role="alert">
            {integrations.contentError}
          </p>
        {:else}<pre class="skill-content" data-skill-content>{integrations.content}</pre>{/if}
      </section>
    {/if}
  </ScrollArea>
</Tabs.Content>

<style>
  .skill-search {
    display: grid;
    gap: 8px;
    padding: 12px;
  }
  .skill-item-description {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    overflow-wrap: anywhere;
    color: var(--muted-foreground);
    font-size: 12px;
    line-height: 1.5;
  }
  .skill-description {
    margin: 0;
    font-size: 13px;
    line-height: 1.6;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .skill-path {
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--muted-foreground);
    overflow-wrap: anywhere;
  }
  .skill-content {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: 12px;
    line-height: 1.6;
    user-select: text;
  }
  .skill-detail {
    display: grid;
    gap: 12px;
    min-width: 0;
  }
  .skill-detail .detail-section-title {
    margin: 0;
  }
  .skill-metadata {
    display: grid;
    gap: 4px;
    min-width: 0;
  }
  .skill-metadata .detail-hint {
    margin: 0;
  }
  .skill-skeleton {
    display: grid;
    gap: 12px;
    padding: 12px;
  }
  .skill-skeleton div {
    height: 36px;
    border-radius: calc(var(--radius) * 0.666667);
    background: var(--control-surface);
  }
</style>

<script lang="ts">
  import { Tabs } from "bits-ui";
  import { t } from "$lib/i18n";
  import Switch from "../ui/Switch.svelte";
  import SettingsStatusToggle from "../ui/SettingsStatusToggle.svelte";
  import ScrollArea from "../ui/ScrollArea.svelte";
  import { useSettingsContext } from "$lib/settings/context";
  const { draft } = useSettingsContext();
</script>

<Tabs.Content value="agents" class="settings-tab-panel">
  <ScrollArea height="100%" class="settings-content-col" scrollHideDelay={350}>
    <header class="agents-settings-intro">
      <h3>{$t("flashAgents")}</h3>
      <p>{$t("flashAgentsDescription")}</p>
    </header>

    <section class="flash-task-group" aria-labelledby="conversation-flash-tasks">
      <div class="flash-task-group-heading">
        <h4 id="conversation-flash-tasks">{$t("conversationFlashTasks")}</h4>
        <p>{$t("conversationFlashTasksDescription")}</p>
      </div>
      <div class="application-settings-surface flash-task-card">
        <article class="flash-task-item">
          <div class="flash-task-heading">
            <div class="flash-task-copy">
              <h5>{$t("titleAgent")}</h5>
              <p>{$t("titleTaskDescription")}</p>
            </div>
            <SettingsStatusToggle
              bind:checked={draft.draftConfig.flash_agents.title.enabled}
              ariaLabel={$t("titleAgentEnabled")}
            />
          </div>
          <details
            class="flash-task-custom"
            open={draft.draftConfig.flash_agents.title.prompt.trim().length > 0}
          >
            <summary>{$t("taskCustomPrompt")}</summary>
            <label class="detail-label">
              <span class="sr-only">{$t("agentExtraPrompt")}</span>
              <textarea
                class="detail-input flash-task-textarea"
                bind:value={draft.draftConfig.flash_agents.title.prompt}
                placeholder={$t("titleAgentPromptPlaceholder")}></textarea>
            </label>
          </details>
        </article>

        <article class="flash-task-item">
          <div class="flash-task-heading">
            <div class="flash-task-copy">
              <h5>{$t("suggestionsAgent")}</h5>
              <p>{$t("suggestionsTaskDescription")}</p>
            </div>
            <SettingsStatusToggle
              bind:checked={draft.draftConfig.flash_agents.suggestions.enabled}
              ariaLabel={$t("suggestionsAgentEnabled")}
            />
          </div>
          <details
            class="flash-task-custom"
            open={draft.draftConfig.flash_agents.suggestions.prompt.trim().length > 0}
          >
            <summary>{$t("taskCustomPrompt")}</summary>
            <label class="detail-label">
              <span class="sr-only">{$t("agentExtraPrompt")}</span>
              <textarea
                class="detail-input flash-task-textarea"
                bind:value={draft.draftConfig.flash_agents.suggestions.prompt}
                placeholder={$t("suggestionsAgentPromptPlaceholder")}></textarea>
            </label>
          </details>
        </article>

        <article class="flash-task-item">
          <div class="flash-task-heading">
            <div class="flash-task-copy">
              <h5>{$t("memoryAgent")}</h5>
              <p>{$t("memoryTaskDescription")}</p>
            </div>
            <SettingsStatusToggle
              bind:checked={draft.draftConfig.flash_agents.memory.enabled}
              ariaLabel={$t("memoryAgentEnabled")}
            />
          </div>
          <div class="flash-task-suboptions">
            <div class="flash-task-suboption">
              <div>
                <h6>{$t("memoryRetrieval")}</h6>
                <p>{$t("memoryRetrievalDescription")}</p>
              </div>
              <Switch
                bind:checked={draft.draftConfig.memory_retrieval_enabled}
                disabled={!draft.draftConfig.flash_agents.memory.enabled}
                ariaLabel={$t("memoryRetrievalEnabled")}
              />
            </div>
          </div>
          <details
            class="flash-task-custom"
            open={draft.draftConfig.flash_agents.memory.prompt.trim().length > 0}
          >
            <summary>{$t("taskCustomPrompt")}</summary>
            <label class="detail-label">
              <span class="sr-only">{$t("agentExtraPrompt")}</span>
              <textarea
                class="detail-input flash-task-textarea"
                bind:value={draft.draftConfig.flash_agents.memory.prompt}
                placeholder={$t("memoryAgentPromptPlaceholder")}></textarea>
            </label>
          </details>
        </article>
      </div>
    </section>

    <section class="flash-task-group" aria-labelledby="automation-flash-tasks">
      <div class="flash-task-group-heading">
        <h4 id="automation-flash-tasks">{$t("automationFlashTasks")}</h4>
        <p>{$t("automationFlashTasksDescription")}</p>
      </div>
      <div class="application-settings-surface flash-task-card">
        <article class="flash-task-item">
          <div class="flash-task-heading">
            <div class="flash-task-copy">
              <h5>{$t("mcpServerCategoryAgent")}</h5>
              <p>{$t("mcpServerCategoryTaskDescription")}</p>
            </div>
            <SettingsStatusToggle
              bind:checked={draft.draftConfig.flash_agents.mcp_server_category.enabled}
              ariaLabel={$t("mcpServerCategoryAgentEnabled")}
            />
          </div>
          <details
            class="flash-task-custom"
            open={draft.draftConfig.flash_agents.mcp_server_category.prompt.trim().length > 0}
          >
            <summary>{$t("taskCustomPrompt")}</summary>
            <label class="detail-label">
              <span class="sr-only">{$t("agentExtraPrompt")}</span>
              <textarea
                class="detail-input flash-task-textarea"
                bind:value={draft.draftConfig.flash_agents.mcp_server_category.prompt}
                placeholder={$t("mcpServerCategoryAgentPromptPlaceholder")}></textarea>
            </label>
          </details>
        </article>

        <article class="flash-task-item">
          <div class="flash-task-heading">
            <div class="flash-task-copy">
              <h5>{$t("hookAgent")}</h5>
              <p>{$t("hookTaskDescription")}</p>
            </div>
            <SettingsStatusToggle
              bind:checked={draft.draftConfig.flash_agents.hook.enabled}
              ariaLabel={$t("hookAgentEnabled")}
            />
          </div>
          <details
            class="flash-task-custom"
            open={draft.draftConfig.flash_agents.hook.prompt.trim().length > 0}
          >
            <summary>{$t("taskCustomPrompt")}</summary>
            <label class="detail-label">
              <span class="sr-only">{$t("agentExtraPrompt")}</span>
              <textarea
                class="detail-input flash-task-textarea"
                bind:value={draft.draftConfig.flash_agents.hook.prompt}
                placeholder={$t("hookAgentPromptPlaceholder")}></textarea>
            </label>
          </details>
        </article>

        <article class="flash-task-item">
          <div class="flash-task-heading">
            <div class="flash-task-copy">
              <h5>{$t("autoApprovalTask")}</h5>
              <p>{$t("autoApprovalTaskDescription")}</p>
            </div>
            <span
              class:active={draft.draftConfig.approval_mode === "auto"}
              class="flash-task-mode-pill"
            >
              <span aria-hidden="true"></span>
              {$t(
                draft.draftConfig.approval_mode === "auto"
                  ? "filterEnabled"
                  : "managedByApprovalMode",
              )}
            </span>
          </div>
          <details
            class="flash-task-custom"
            open={draft.draftConfig.flash_agents.tool_approval.prompt.trim().length > 0}
          >
            <summary>{$t("taskCustomPrompt")}</summary>
            <label class="detail-label">
              <span class="sr-only">{$t("agentExtraPrompt")}</span>
              <textarea
                class="detail-input flash-task-textarea"
                bind:value={draft.draftConfig.flash_agents.tool_approval.prompt}
                placeholder={$t("terminalApprovalTaskPromptPlaceholder")}></textarea>
            </label>
          </details>
        </article>
      </div>
    </section>
  </ScrollArea>
</Tabs.Content>

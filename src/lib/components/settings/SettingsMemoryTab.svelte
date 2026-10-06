<script lang="ts">
  import { Accordion, Tabs } from "bits-ui";
  import { t, tr } from "$lib/i18n";
  import SegmentedControl from "../ui/SegmentedControl.svelte";
  import SettingsActionButton from "../ui/SettingsActionButton.svelte";
  import ScrollArea from "../ui/ScrollArea.svelte";
  import LoadingSkeleton from "../LoadingSkeleton.svelte";
  import { useSettingsContext } from "$lib/settings/context";
  const { memory, options } = useSettingsContext();
</script>

<Tabs.Content value="memory" class="settings-tab-panel management-tab-panel">
  <div class="memory-management-layout">
    <div class="memory-toolbar">
      <div class="memory-scope-control">
        <fieldset
          class="memory-scope-options"
          disabled={memory.memoryLoading ||
            memory.memorySaving ||
            memory.memoryBusy ||
            memory.memoryDirty}
        >
          <SegmentedControl
            fitContent
            value={memory.memoryScope}
            onValueChange={(value) => (memory.memoryScope = value)}
            items={[
              { value: "global", label: $t("globalTab") },
              { value: "local", label: $t("projectTab") },
            ]}
            ariaLabel={$t("scope")}
          />
        </fieldset>
        <p class="detail-hint">
          {memory.memoryDirty
            ? $t("memoryUnsavedHint")
            : memory.memoryScope === "local" && !options.workspacePath
              ? $t("memoryNoWorkspace")
              : $t("memoryScopeHint")}
        </p>
      </div>
      <div class="memory-heading-actions">
        <SettingsActionButton
          label={$t("memoryRefresh")}
          icon="refresh"
          tone="quiet"
          onclick={() => memory.refreshMemory()}
          disabled={memory.memoryLoading || memory.memorySaving || memory.memoryBusy}
        />
      </div>
    </div>
    <div class="management-columns memory-columns">
      <section class="management-pane memory-user-pane">
        <ScrollArea height="100%" class="memory-user-scroll" scrollHideDelay={350}>
          <div class="memory-editor-body">
            <div class="detail-section-heading">
              <h4 class="detail-section-title">{$t("userMemory")}</h4>
              <p class="detail-section-intro">{$t("memoryEditHint")}</p>
            </div>
            <textarea
              class="detail-input memory-editor"
              bind:value={memory.memoryUserContent}
              disabled={!memory.memoryLoaded ||
                memory.memoryLoading ||
                memory.memorySaving ||
                memory.memoryBusy ||
                !memory.memoryScopeAvailable()}
              aria-label={$t("userMemory")}
              placeholder={$t("memoryEditHint")}></textarea>
          </div>
        </ScrollArea>
        <div class="memory-editor-footer">
          <span class="memory-count" role="status"
            >{memory.memoryLoading
              ? $t("loadingContent")
              : !memory.memoryLoaded
                ? ""
                : memory.memoryDirty
                  ? $t("memoryUnsaved")
                  : $t("memorySaved")}</span
          >
          <div class="memory-heading-actions">
            {#if memory.memoryDirty}
              <SettingsActionButton
                label={$t("memoryDiscard")}
                tone="quiet"
                onclick={memory.discardMemoryDraft}
                disabled={memory.memoryLoading || memory.memorySaving || memory.memoryBusy}
              />
            {/if}
            <SettingsActionButton
              label={memory.memorySaving ? $t("memorySaving") : $t("save")}
              icon="check"
              tone="primary"
              onclick={memory.saveUserMemory}
              disabled={!memory.memoryDirty ||
                memory.memorySaving ||
                memory.memoryLoading ||
                memory.memoryBusy ||
                !memory.memoryScopeAvailable()}
            />
          </div>
        </div>
      </section>
      <ScrollArea height="100%" class="memory-agent-scroll" scrollHideDelay={350}>
        <section class="management-pane memory-agent-pane">
          <div class="detail-section-header">
            <div class="detail-section-heading">
              <h4 class="detail-section-title">{$t("agentMemory")}</h4>
              <p class="detail-section-intro">{$t("agentMemoryHint")}</p>
            </div>
            <span class="memory-count"
              >{$t("memoryAgentCount").replace(
                "{count}",
                String(memory.memoryAgentEntries.length),
              )}</span
            >
          </div>
          <input
            class="detail-input memory-search"
            bind:value={memory.memoryAgentSearch}
            oninput={memory.searchAgentMemories}
            disabled={memory.memoryLoading || !memory.memoryScopeAvailable()}
            placeholder={$t("memorySearchPlaceholder")}
            aria-label={$t("memorySearchPlaceholder")}
          />
          <div
            class="memory-agent-list"
            aria-busy={memory.memoryLoading || memory.memoryAgentLoading}
          >
            {#if memory.memoryLoading || memory.memoryAgentLoading}
              <LoadingSkeleton variant="detail-list" rows={4} label={$t("loadingContent")} />
            {:else if memory.memoryAgentEntries.length === 0}
              <div class="model-list-empty">
                {memory.memoryAgentSearch.trim() ? $t("memorySearchEmpty") : $t("agentMemoryEmpty")}
              </div>
            {:else}
              {#each memory.memoryAgentEntries as entry (entry.id)}
                <article class="memory-agent-item">
                  <p class="memory-agent-content">{entry.content}</p>
                  <div class="memory-agent-meta">
                    <span
                      >{$t("memoryUpdatedAt").replace(
                        "{date}",
                        memory.formatMemoryDate(entry.updated_at),
                      )}</span
                    >
                    {#if entry.source_conv_id}
                      <button
                        class="memory-source-button"
                        type="button"
                        onclick={() => options.onOpenConversation(entry.source_conv_id!)}
                        >{$t("memorySource")}</button
                      >
                    {:else}
                      <span>{$t("memoryNoSource")}</span>
                    {/if}
                    <SettingsActionButton
                      label={$t("deleteMemory")}
                      icon="trash"
                      tone="danger"
                      onclick={() => memory.removeAgentMemory(entry)}
                      disabled={memory.memoryBusy}
                    />
                  </div>
                </article>
              {/each}
            {/if}
          </div>
        </section>
      </ScrollArea>
    </div>
    <Accordion.Root type="single" class="memory-maintenance">
      <Accordion.Item value="backup" class="memory-maintenance-item">
        <Accordion.Header class="memory-maintenance-header">
          <Accordion.Trigger class="memory-maintenance-trigger">
            <span>{$t("memoryMaintenance")}</span>
            <span aria-hidden="true" class="memory-maintenance-chevron">⌄</span>
          </Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Content>
          <ScrollArea height="180px" class="memory-maintenance-scroll" scrollHideDelay={350}>
            <section class="detail-section">
              <h4 class="detail-section-title">{$t("memoryBackup")}</h4>
              <div class="memory-action-grid">
                <SettingsActionButton
                  label={$t("exportMemory")}
                  icon="download"
                  onclick={memory.exportMemory}
                  disabled={memory.memoryBusy ||
                    memory.memorySaving ||
                    memory.memoryLoading ||
                    memory.memoryDirty ||
                    !memory.memoryScopeAvailable()}
                />
                <SettingsActionButton
                  label={$t("importMemoryMerge")}
                  icon="merge"
                  onclick={() => memory.importMemory(false)}
                  disabled={memory.memoryBusy ||
                    memory.memorySaving ||
                    memory.memoryLoading ||
                    memory.memoryDirty ||
                    !memory.memoryScopeAvailable()}
                />
                <SettingsActionButton
                  label={$t("importMemoryReplace")}
                  icon="replace"
                  onclick={() => memory.importMemory(true)}
                  disabled={memory.memoryBusy ||
                    memory.memorySaving ||
                    memory.memoryLoading ||
                    memory.memoryDirty ||
                    !memory.memoryScopeAvailable()}
                />
              </div>
            </section>

            <section class="application-settings-surface detail-section danger-zone">
              <div>
                <p class="danger-title">{$t("clearMemory")}</p>
                <p class="danger-copy">{$t("clearMemoryDesc")}</p>
              </div>
              <SettingsActionButton
                label={$t("clearMemory")}
                icon="trash"
                tone="danger"
                onclick={memory.clearMemoryScope}
                disabled={memory.memoryBusy ||
                  memory.memorySaving ||
                  memory.memoryLoading ||
                  memory.memoryDirty ||
                  !memory.memoryScopeAvailable()}
              />
            </section>
          </ScrollArea>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
    {#if memory.memoryStatus}
      <div
        role="status"
        aria-live="polite"
        class="management-status provider-status {memory.memoryStatus.includes(
          tr('memoryOperationFailed'),
        )
          ? 'error'
          : 'success'}"
      >
        {memory.memoryStatus}
      </div>
    {/if}
  </div>
</Tabs.Content>

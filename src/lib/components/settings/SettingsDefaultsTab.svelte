<script lang="ts">
  import { Tabs } from "bits-ui";
  import { t } from "$lib/i18n";
  import Tooltip from "../Tooltip.svelte";
  import Select from "../ui/Select.svelte";
  import ScrollArea from "../ui/ScrollArea.svelte";
  import { useSettingsContext } from "$lib/settings/context";
  const { draft, providers } = useSettingsContext();
</script>

<Tabs.Content value="defaults" class="settings-tab-panel">
  <ScrollArea height="100%" class="settings-content-col" scrollHideDelay={350}>
    <section class="detail-section">
      <h4 class="detail-section-title">{$t("chatModel")}</h4>
      <div class="detail-label">
        <span class="label-text">{$t("providerNode")}</span>
        <Select
          value={draft.draftConfig.defaults.chat_model.provider_id}
          items={providers.enabledProviderOptions()}
          ariaLabel={$t("providerNode")}
          onValueChange={(providerId) =>
            providers.selectBindingProvider(draft.draftConfig.defaults.chat_model, providerId)}
        />
      </div>
      <div class="detail-label">
        <span class="label-text">{$t("model")}</span>
        <Select
          bind:value={draft.draftConfig.defaults.chat_model.model}
          items={providers
            .providerModels(draft.draftConfig.defaults.chat_model.provider_id)
            .map((m: string) => ({
              value: m,
              label: m,
            }))}
          placeholder={$t("model")}
          searchable
          searchPlaceholder={$t("searchModels")}
          emptyText={$t("noModels")}
          ariaLabel={$t("model")}
        />
      </div>
    </section>
    <section class="detail-section">
      <div class="detail-section-header">
        <h4 class="detail-section-title">{$t("chatModelRetryQueue")}</h4>
        <button
          class="btn-secondary btn-sm"
          onclick={() => providers.addRetryQueueModel("chat_queue")}>{$t("add")}</button
        >
      </div>
      <div class="application-settings-surface model-list-box retry-queue-list">
        {#if draft.draftConfig.model_retry.chat_queue.length > 0}
          {#each draft.draftConfig.model_retry.chat_queue as binding, index (binding)}
            <div
              class:retry-queue-dragging={providers.draggedRetryQueue?.kind === "chat_queue" &&
                providers.draggedRetryQueue.index === index}
              class="model-item retry-queue-item"
              role="listitem"
              ondragover={(event) => event.preventDefault()}
              ondrop={(event) => providers.dropRetryQueueModel("chat_queue", index, event)}
            >
              <Tooltip text={$t("retryQueueDragHandle")}>
                {#snippet trigger(props)}
                  <button
                    {...props}
                    class="retry-queue-drag-handle"
                    type="button"
                    draggable="true"
                    aria-label={$t("retryQueueDragHandle")}
                    ondragstart={(event) =>
                      providers.startRetryQueueDrag("chat_queue", index, event)}
                    ondragend={() => (providers.draggedRetryQueue = null)}>⠇</button
                  >
                {/snippet}
              </Tooltip>
              <div class="retry-queue-fields">
                <Select
                  value={binding.provider_id}
                  items={providers.enabledProviderOptions()}
                  ariaLabel={$t("providerNode")}
                  onValueChange={(providerId) =>
                    providers.selectBindingProvider(binding, providerId)}
                />
                <Select
                  bind:value={binding.model}
                  items={providers.providerModels(binding.provider_id).map((m: string) => ({
                    value: m,
                    label: m,
                  }))}
                  placeholder={$t("model")}
                  searchable
                  searchPlaceholder={$t("searchModels")}
                  emptyText={$t("noModels")}
                  ariaLabel={$t("model")}
                />
              </div>
              <button
                class="model-action-btn"
                onclick={() => providers.removeRetryQueueModel("chat_queue", index)}
                >{$t("delete")}</button
              >
            </div>
          {/each}
        {:else}
          <div class="model-list-empty">{$t("noQueuedChatFallbackModels")}</div>
        {/if}
      </div>
    </section>
    <section class="detail-section">
      <h4 class="detail-section-title">{$t("flashModel")}</h4>
      <div class="detail-label">
        <span class="label-text">{$t("providerNode")}</span>
        <Select
          value={draft.draftConfig.defaults.flash_model.provider_id}
          items={providers.enabledProviderOptions()}
          ariaLabel={$t("providerNode")}
          onValueChange={(providerId) =>
            providers.selectBindingProvider(draft.draftConfig.defaults.flash_model, providerId)}
        />
      </div>
      <div class="detail-label">
        <span class="label-text">{$t("model")}</span>
        <Select
          bind:value={draft.draftConfig.defaults.flash_model.model}
          items={providers
            .providerModels(draft.draftConfig.defaults.flash_model.provider_id)
            .map((m: string) => ({
              value: m,
              label: m,
            }))}
          placeholder={$t("model")}
          searchable
          searchPlaceholder={$t("searchModels")}
          emptyText={$t("noModels")}
          ariaLabel={$t("model")}
        />
      </div>
    </section>
    <section class="detail-section">
      <div class="detail-section-header">
        <h4 class="detail-section-title">{$t("flashModelRetryQueue")}</h4>
        <button
          class="btn-secondary btn-sm"
          onclick={() => providers.addRetryQueueModel("flash_queue")}>{$t("add")}</button
        >
      </div>
      <div class="application-settings-surface model-list-box retry-queue-list">
        {#if draft.draftConfig.model_retry.flash_queue.length > 0}
          {#each draft.draftConfig.model_retry.flash_queue as binding, index (binding)}
            <div
              class:retry-queue-dragging={providers.draggedRetryQueue?.kind === "flash_queue" &&
                providers.draggedRetryQueue.index === index}
              class="model-item retry-queue-item"
              role="listitem"
              ondragover={(event) => event.preventDefault()}
              ondrop={(event) => providers.dropRetryQueueModel("flash_queue", index, event)}
            >
              <Tooltip text={$t("retryQueueDragHandle")}>
                {#snippet trigger(props)}
                  <button
                    {...props}
                    class="retry-queue-drag-handle"
                    type="button"
                    draggable="true"
                    aria-label={$t("retryQueueDragHandle")}
                    ondragstart={(event) =>
                      providers.startRetryQueueDrag("flash_queue", index, event)}
                    ondragend={() => (providers.draggedRetryQueue = null)}>⠇</button
                  >
                {/snippet}
              </Tooltip>
              <div class="retry-queue-fields">
                <Select
                  value={binding.provider_id}
                  items={providers.enabledProviderOptions()}
                  ariaLabel={$t("providerNode")}
                  onValueChange={(providerId) =>
                    providers.selectBindingProvider(binding, providerId)}
                />
                <Select
                  bind:value={binding.model}
                  items={providers.providerModels(binding.provider_id).map((m: string) => ({
                    value: m,
                    label: m,
                  }))}
                  placeholder={$t("model")}
                  searchable
                  searchPlaceholder={$t("searchModels")}
                  emptyText={$t("noModels")}
                  ariaLabel={$t("model")}
                />
              </div>
              <button
                class="model-action-btn"
                onclick={() => providers.removeRetryQueueModel("flash_queue", index)}
                >{$t("delete")}</button
              >
            </div>
          {/each}
        {:else}
          <div class="model-list-empty">{$t("noQueuedFlashFallbackModels")}</div>
        {/if}
      </div>
    </section>
    <section class="detail-section">
      <h4 class="detail-section-title">{$t("modelRetryPolicy")}</h4>
      <p class="detail-section-intro">{$t("modelRetryPolicyDescription")}</p>
      <div class="application-settings-surface settings-card">
        <label class="settings-card-row">
          <span class="settings-card-copy">
            <span class="label-text">{$t("retryCountPerModel")}</span>
            <span class="detail-hint">{$t("retryCountPerModelHint")}</span>
          </span>
          <span class="settings-card-control settings-card-number-control">
            <input
              class="detail-input settings-card-number-input"
              type="number"
              min="0"
              max="10"
              bind:value={draft.draftConfig.model_retry.retry_count}
            />
          </span>
        </label>
        <label class="settings-card-row">
          <span class="settings-card-copy">
            <span class="label-text">{$t("retryDelaySeconds")}</span>
            <span class="detail-hint">{$t("retryDelaySecondsHint")}</span>
          </span>
          <span class="settings-card-control settings-card-number-control">
            <input
              class="detail-input settings-card-number-input"
              type="number"
              min="0"
              max="60"
              step="1"
              value={draft.draftConfig.model_retry.retry_delay_ms / 1000}
              oninput={providers.updateRetryDelaySeconds}
            />
          </span>
        </label>
      </div>
    </section>
  </ScrollArea>
</Tabs.Content>

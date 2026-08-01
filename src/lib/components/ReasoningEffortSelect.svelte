<script lang="ts">
  import { t } from "$lib/i18n";
  import type { ReasoningEffort } from "$lib/types";
  import Select from "./ui/Select.svelte";

  let {
    value,
    disabled = false,
    contentSide = "top",
    onValueChange = () => {},
  }: {
    value: ReasoningEffort;
    disabled?: boolean;
    contentSide?: "top" | "bottom";
    onValueChange?: (value: ReasoningEffort) => void;
  } = $props();

  let items = $derived([
    {
      value: "low",
      label: $t("reasoningEffortLow"),
      selectedLabel: `${$t("reasoningEffort")} · ${$t("reasoningEffortLow")}`,
    },
    {
      value: "medium",
      label: $t("reasoningEffortMedium"),
      selectedLabel: `${$t("reasoningEffort")} · ${$t("reasoningEffortMedium")}`,
    },
    {
      value: "high",
      label: $t("reasoningEffortHigh"),
      selectedLabel: `${$t("reasoningEffort")} · ${$t("reasoningEffortHigh")}`,
    },
    {
      value: "xhigh",
      label: $t("reasoningEffortXhigh"),
      selectedLabel: `${$t("reasoningEffort")} · ${$t("reasoningEffortXhigh")}`,
    },
    {
      value: "max",
      label: $t("reasoningEffortMax"),
      selectedLabel: `${$t("reasoningEffort")} · ${$t("reasoningEffortMax")}`,
      description: $t("reasoningEffortMaxHint"),
    },
  ]);
</script>

<Select
  {value}
  {items}
  {disabled}
  placeholder={$t("reasoningEffort")}
  triggerClass="reasoning-effort-trigger"
  contentClass="reasoning-effort-content"
  {contentSide}
  contentAlign="start"
  ariaLabel={$t("reasoningEffort")}
  onValueChange={(next) => onValueChange(next as ReasoningEffort)}
/>

<style>
  :global(.reasoning-effort-trigger) {
    width: auto;
    max-width: 210px;
    border: 0;
    box-shadow: none;
    background: transparent;
    padding: 5px 8px;
    color: var(--text-muted);
    font-size: 12px;
  }

  :global(.reasoning-effort-trigger:hover:not(:disabled)),
  :global(.reasoning-effort-trigger[data-state="open"]) {
    background: var(--border);
    color: var(--text);
    box-shadow: none;
  }

  :global(.reasoning-effort-trigger:focus-visible) {
    box-shadow: var(--focus-ring);
  }

  :global(.reasoning-effort-content) {
    min-width: 220px;
  }
</style>

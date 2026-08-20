<script lang="ts">
  import { t } from "$lib/i18n";
  import type { StreamItem } from "$lib/types";
  import MessageDivider from "./MessageDivider.svelte";

  interface Props {
    item: Extract<StreamItem, { type: "compaction" }>;
    itemKey: string;
    messageId?: string;
  }

  let { item, itemKey, messageId }: Props = $props();

  let label = $derived.by(() => {
    if (item.stage === "failed") return $t("compactionFailed");
    if (item.stage === "creating") return $t("compactionCreating");
    if (item.stage === "summarizing") return $t("compactionSummarizing");
    return $t("compactionChecking");
  });
</script>

<MessageDivider
  title={label}
  detail={item.stage === "failed" ? (item.error ?? undefined) : undefined}
  tone={item.stage === "failed" ? "danger" : "neutral"}
  streamItemKey={itemKey}
  {messageId}
/>

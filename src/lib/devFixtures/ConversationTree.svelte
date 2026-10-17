<script lang="ts">
  import { t, locale } from "$lib/i18n";
  import type { Conversation } from "$lib/types";
  import ConversationList from "$lib/components/ConversationList.svelte";

  let activeConvId = $state<string | null>("root");
  let embedded = $state(true);
  let narrow = $state(false);
  let searchQuery = $state("");
  let deleted = $state("");
  const labels = $derived(
    $locale === "zh"
      ? [
          "修复商品网格布局偏移",
          "图片：懒加载首屏下方的商品图片并保留原始比例",
          "购物车：添加宽度和高度",
          "检查占位尺寸",
          "验证窄屏布局",
          "另一段独立对话",
        ]
      : [
          "Fix product grid layout shift",
          "Images: lazy-load below the fold and preserve the original aspect ratio",
          "Cart: add width and height",
          "Check placeholder dimensions",
          "Verify narrow layouts",
          "Another conversation",
        ],
  );
  const ids = ["root", "images", "cart", "dimensions", "narrow", "other"];
  const parents = [undefined, "root", "root", "images", "images", undefined];
  let removedIds = $state<string[]>([]);
  const conversations = $derived<Conversation[]>(
    ids
      .filter((id) => !removedIds.includes(id))
      .map((id) => {
        const index = ids.indexOf(id);
        return {
          id,
          title: labels[index],
          parentConvId: parents[index],
          workspace: "fixture",
          messages: [],
          createdAt: 10 - index,
          updatedAt: 10 - index,
        };
      }),
  );
</script>

<div class="conversation-tree-fixture" style:width={narrow ? "200px" : "340px"}>
  <div class="fixture-controls">
    <button data-tree-mode onclick={() => (embedded = !embedded)}
      >{embedded ? "Embedded" : "Standalone"}</button
    >
    <button data-tree-width onclick={() => (narrow = !narrow)}>Width</button>
    <button data-tree-search onclick={() => (searchQuery = searchQuery ? "" : labels[1])}
      >{$t("searchResults")}</button
    >
    <button
      data-tree-reset
      onclick={() => {
        removedIds = [];
        activeConvId = "root";
      }}>Reset</button
    >
  </div>
  <ConversationList
    {conversations}
    {activeConvId}
    {embedded}
    {searchQuery}
    streamingConvIds={{ cart: true }}
    hasMore={false}
    loadingMore={false}
    onSelect={(id) => (activeConvId = id)}
    onDelete={(id) => {
      deleted = id;
      removedIds = [...removedIds, id];
    }}
    onTogglePin={() => {}}
    onLoadMore={() => {}}
  />
  <output data-tree-selected>{activeConvId}</output>
  <output data-tree-deleted>{deleted}</output>
</div>

<style>
  .conversation-tree-fixture {
    display: flex;
    flex-direction: column;
    height: 420px;
    padding: 12px;
    box-sizing: border-box;
    background: var(--card);
    color: var(--card-foreground);
  }
  .fixture-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 16px;
  }
  .fixture-controls button {
    font: inherit;
    font-size: 11px;
  }
  output {
    margin-top: 12px;
    font-size: 11px;
    color: var(--muted-foreground);
  }
</style>

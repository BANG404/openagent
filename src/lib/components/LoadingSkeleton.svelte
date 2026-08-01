<script lang="ts">
  let {
    variant = "editor",
    rows = 6,
    label = "Loading content",
  }: {
    variant?:
      | "editor"
      | "list"
      | "sidebar"
      | "draft-list"
      | "memory-list"
      | "detail-list"
      | "table"
      | "conversation"
      | "new-conversation"
      | "memory-note"
      | "composer";
    rows?: number;
    label?: string;
  } = $props();
</script>

<div class="skeleton {variant}" role="status" aria-label={label} aria-live="polite">
  <span class="sr-only">{label}</span>

  {#if variant === "conversation"}
    <div class="conversation-thread">
      <div class="user-bubble">
        <span class="block line wide"></span>
        <span class="block line short"></span>
      </div>
      <div class="assistant-copy">
        <span class="block line medium"></span>
        <span class="block line wide"></span>
        <span class="block line wide"></span>
        <span class="block line short"></span>
      </div>
      <div class="user-bubble compact">
        <span class="block line medium"></span>
      </div>
      <div class="assistant-copy compact">
        <span class="block line wide"></span>
        <span class="block line medium"></span>
        <span class="block line short"></span>
      </div>
    </div>
  {:else if variant === "new-conversation"}
    <div class="new-conversation-copy">
      <span class="block new-title"></span>
      <span class="block line wide"></span>
      <span class="block line medium"></span>
    </div>
  {:else if variant === "memory-note"}
    <div class="memory-note-copy">
      <span class="block line wide"></span>
      <span class="block line medium"></span>
    </div>
  {:else if variant === "composer"}
    <div class="composer-copy">
      <span class="block composer-placeholder"></span>
      <div class="composer-toolbar">
        <span class="block composer-action"></span>
        <span class="block composer-model"></span>
        <span class="block composer-send"></span>
      </div>
    </div>
  {:else if variant === "table"}
    <div class="schema-skeleton">
      <span class="block schema-title"></span>
      <div class="schema-cards">
        {#each Array(3) as _, index (index)}
          <span class="block schema-card"></span>
        {/each}
      </div>
    </div>
    <div class="result-skeleton">
      <span class="block"></span>
      <span class="block"></span>
    </div>
    <div class="table-head">
      {#each Array(4) as _, index (index)}<span class="block"></span>{/each}
    </div>
    {#each Array(rows) as _, rowIndex (rowIndex)}
      <div class="table-row">
        {#each Array(4) as _, columnIndex (columnIndex)}<span class="block"></span>{/each}
      </div>
    {/each}
  {:else if variant === "sidebar"}
    {#each Array(rows) as _, index (index)}
      <div class="sidebar-row" class:active={index === 0}>
        <span class="block line" style={`width:${72 - (index % 3) * 10}%`}></span>
      </div>
    {/each}
  {:else if variant === "draft-list"}
    <span class="block category-line"></span>
    {#each Array(rows) as _, index (index)}
      <div class="draft-row" class:active={index === 0}>
        <span class="block line" style={`width:${68 - (index % 3) * 9}%`}></span>
      </div>
    {/each}
  {:else if variant === "memory-list"}
    {#each Array(rows) as _, index (index)}
      <div class="memory-card">
        <span class="block meta-line"></span>
        <span class="block line" style={`width:${88 - (index % 2) * 14}%`}></span>
        <span class="block line secondary" style={`width:${58 + (index % 2) * 12}%`}></span>
      </div>
    {/each}
  {:else if variant === "detail-list"}
    {#each Array(rows) as _, index (index)}
      <div class="detail-row" class:active={index === 0}>
        <span class="block line" style={`width:${68 - (index % 3) * 10}%`}></span>
        <span class="block line secondary" style={`width:${42 + (index % 2) * 12}%`}></span>
      </div>
    {/each}
  {:else if variant === "list"}
    {#each Array(rows) as _, index (index)}
      <div class="list-row">
        <span class="block icon"></span>
        <span class="list-copy">
          <span class="block line" style={`width:${70 - (index % 3) * 12}%`}></span>
          <span class="block line secondary" style={`width:${48 + (index % 2) * 14}%`}></span>
        </span>
      </div>
    {/each}
  {:else}
    <div class="editor-toolbar">
      <span class="block editor-toggle"></span>
      {#each Array(7) as _, index (index)}
        <span class="block editor-tool" class:wide-tool={index === 1}></span>
      {/each}
    </div>
    <div class="editor-copy">
      {#each Array(rows) as _, index (index)}
        <span class="block line" style={`width:${index === rows - 1 ? 38 : 92 - (index % 4) * 9}%`}
        ></span>
      {/each}
    </div>
  {/if}
</div>

<style>
  .skeleton {
    box-sizing: border-box;
    width: 100%;
    min-height: 0;
    color: transparent;
    pointer-events: none;
  }

  .block {
    display: block;
    border-radius: 5px;
    background: linear-gradient(
      100deg,
      color-mix(in srgb, var(--text) 7%, transparent) 20%,
      color-mix(in srgb, var(--text) 13%, transparent) 38%,
      color-mix(in srgb, var(--text) 7%, transparent) 56%
    );
    background-size: 240% 100%;
    animation: shimmer 1.35s ease-in-out infinite;
  }

  .editor {
    height: 100%;
    background: var(--bg);
  }

  .editor-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 40px;
    padding: 4px 10px;
    box-sizing: border-box;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }

  .editor-toggle {
    width: 74px;
    height: 26px;
    border-radius: 7px;
  }

  .editor-tool {
    width: 25px;
    height: 25px;
    border-radius: 6px;
  }

  .editor-tool.wide-tool {
    width: 62px;
  }

  .editor-copy {
    display: grid;
    gap: 13px;
    padding: 22px 20px;
  }

  .line {
    height: 11px;
  }

  .list {
    display: grid;
    align-content: start;
    gap: 4px;
    padding: 8px;
  }

  .list-row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 52px;
    padding: 7px 8px;
  }

  .icon {
    width: 28px;
    height: 28px;
    flex: none;
    border-radius: 7px;
  }

  .list-copy {
    display: grid;
    flex: 1;
    gap: 8px;
  }

  .list-copy .secondary {
    height: 8px;
    opacity: 0.75;
  }

  .sidebar,
  .draft-list {
    display: grid;
    align-content: start;
    gap: var(--list-item-stack-gap);
    padding: 4px 6px;
  }

  .sidebar {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .sidebar-row {
    display: flex;
    align-items: center;
    height: var(--list-item-compact-height);
    padding: 0 var(--list-item-compact-padding-inline);
    border-radius: var(--list-item-compact-radius);
  }

  .sidebar-row.active,
  .draft-row.active {
    background: color-mix(in srgb, var(--surface) 58%, transparent);
  }

  .sidebar-row .line {
    height: 10px;
  }

  .draft-list {
    padding: 12px 8px 4px;
  }

  .category-line {
    width: 34%;
    height: 9px;
    margin: 4px 7px 7px;
  }

  .draft-row {
    display: flex;
    align-items: center;
    min-height: 32px;
    padding: 0 8px;
    border-radius: 6px;
  }

  .draft-row .line {
    height: 9px;
  }

  .memory-list {
    display: grid;
    align-content: start;
    gap: 8px;
    padding: 8px 12px 12px;
  }

  .memory-card {
    display: grid;
    gap: 8px;
    padding: 7px 10px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
  }

  .memory-card .meta-line {
    width: 18%;
    height: 7px;
  }

  .memory-card .secondary {
    height: 9px;
  }

  .detail-list {
    display: grid;
    align-content: start;
    gap: var(--list-item-stack-gap);
    padding: 8px;
  }

  .detail-row {
    display: grid;
    gap: 7px;
    padding: 9px 10px;
    border-radius: 8px;
  }

  .detail-row.active {
    background: var(--surface);
  }

  .detail-row .line {
    height: 9px;
  }

  .detail-row .secondary {
    height: 7px;
    opacity: 0.75;
  }

  .table {
    display: grid;
    align-content: start;
    overflow: hidden;
    background: var(--bg);
  }

  .schema-skeleton {
    display: grid;
    gap: 10px;
    padding: 11px 16px 12px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }

  .schema-title {
    width: 72px;
    height: 10px;
  }

  .schema-cards {
    display: grid;
    grid-template-columns: repeat(3, minmax(120px, 1fr));
    gap: 6px;
  }

  .schema-card {
    height: 42px;
    border: 1px solid var(--border);
    background-color: var(--bg);
  }

  .result-skeleton {
    display: flex;
    justify-content: space-between;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border);
  }

  .result-skeleton .block {
    width: 82px;
    height: 8px;
  }

  .table-head,
  .table-row {
    display: grid;
    grid-template-columns: 1.2fr 1fr 1.4fr 0.8fr;
    gap: 1px;
    border-bottom: 1px solid var(--border);
  }

  .table-head {
    background: var(--surface2);
  }

  .table-head .block,
  .table-row .block {
    height: 12px;
    margin: 10px 12px;
  }

  .table-row .block {
    height: 10px;
    margin-block: 12px;
  }

  .conversation {
    height: 100%;
    max-width: 900px;
    margin: auto;
    padding: 64px 32px 190px;
  }

  .conversation-thread {
    display: grid;
    align-content: start;
    gap: 20px;
  }

  .user-bubble {
    display: grid;
    gap: 8px;
    width: min(58%, 450px);
    margin-left: auto;
    padding: 11px 14px;
    border-radius: 18px;
    background: var(--control-surface);
    -webkit-backdrop-filter: blur(12px) saturate(1.05);
    backdrop-filter: blur(12px) saturate(1.05);
    box-shadow: var(--control-shadow);
  }

  .user-bubble.compact {
    width: min(38%, 300px);
    margin-top: 10px;
  }

  .assistant-copy {
    display: grid;
    gap: 11px;
    width: min(82%, 680px);
    margin-bottom: 18px;
  }

  .assistant-copy.compact {
    width: min(68%, 540px);
  }

  .conversation .line {
    height: 10px;
  }

  .conversation .wide,
  .new-conversation .wide {
    width: 100%;
  }
  .conversation .medium,
  .new-conversation .medium {
    width: 76%;
  }
  .conversation .short {
    width: 48%;
  }

  .new-conversation {
    position: relative;
    height: 100%;
  }

  .new-conversation-copy {
    position: absolute;
    top: calc(50% - clamp(24px, 3vh, 40px));
    left: 50%;
    display: grid;
    justify-items: center;
    gap: 13px;
    width: min(calc(100% - 64px), 620px);
    padding: 26px clamp(34px, 5vw, 64px);
    box-sizing: border-box;
    transform: translate(-50%, -50%);
  }

  .new-title {
    width: 42%;
    height: 15px;
    margin-bottom: 3px;
  }

  .new-conversation .line {
    height: 11px;
  }

  .memory-note {
    width: min(100%, 720px);
    padding: 26px clamp(34px, 5vw, 64px);
  }

  .memory-note-copy {
    display: grid;
    justify-items: center;
    gap: 13px;
    width: min(100%, 620px);
    margin: 0 auto;
  }

  .memory-note .line {
    height: 11px;
  }

  .memory-note .wide {
    width: 100%;
  }

  .memory-note .medium {
    width: 76%;
  }

  .composer {
    padding: 0;
  }

  .composer-copy {
    box-sizing: border-box;
    min-height: 87px;
    overflow: hidden;
    border: 0;
    border-radius: 18px;
    background: var(--control-surface);
    -webkit-backdrop-filter: blur(12px) saturate(1.05);
    backdrop-filter: blur(12px) saturate(1.05);
    box-shadow: var(--control-shadow);
  }

  .composer-placeholder {
    width: 36%;
    height: 10px;
    margin: 17px 18px 9px;
  }

  .composer-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 38px;
    padding: 0 9px 6px;
    box-sizing: border-box;
  }

  .composer-action,
  .composer-send {
    width: 30px;
    height: 30px;
    border-radius: 50%;
  }

  .composer-model {
    width: 92px;
    height: 24px;
    border-radius: 8px;
  }

  .composer-send {
    margin-left: auto;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @keyframes shimmer {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: -100% 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .block {
      animation: none;
    }
  }
</style>

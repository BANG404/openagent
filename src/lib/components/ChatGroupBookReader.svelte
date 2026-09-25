<script lang="ts">
  import { Dialog } from "bits-ui";
  import { t } from "$lib/i18n";
  import type { ChatGroup, ChatGroupMember, ChatGroupMessage } from "$lib/openagent";
  import { Streamdown } from "svelte-streamdown";
  import Code from "svelte-streamdown/code";
  import ChatMath from "$lib/streamdown/ChatMath.svelte";
  import Mermaid from "$lib/streamdown/Mermaid.svelte";
  import CustomToken from "$lib/streamdown/CustomToken.svelte";
  import { customExtensions, type ComponentToken } from "$lib/streamdown/extensions";
  import { chatMarkdownTheme } from "$lib/streamdown/chatMarkdownTheme";
  import { externalLinks } from "$lib/streamdown/externalLink";
  import { useOpenAgentUiCapabilities } from "$lib/openagent";
  import { mermaidConfigFor } from "$lib/mermaidTheme";

  let {
    group,
    members,
    messages,
    onClose,
  }: {
    group: ChatGroup;
    members: ChatGroupMember[];
    messages: ChatGroupMessage[];
    onClose: () => void;
  } = $props();

  let open = $state(true);
  let selectedMemberIds = $state<string[]>([]);
  let contextMode = $state<"context" | "only">("context");
  // Theme changes arrive through the document class observer below.
  let isDarkTheme = $state(false); // eslint-disable-line svelte/prefer-writable-derived
  const capabilities = useOpenAgentUiCapabilities();
  const selectedSet = $derived(new Set(selectedMemberIds));
  const selectedNames = $derived(
    members.filter((member) => selectedSet.has(member.id)).map((member) => member.role_name),
  );
  const visibleMessages = $derived.by(() => {
    if (selectedSet.size === 0) return messages;
    if (contextMode === "only") {
      return messages.filter(
        (message) => message.sender_type === "user" || selectedSet.has(message.sender_id ?? ""),
      );
    }
    const matching = new Set(
      messages
        .map((message, index) => (selectedSet.has(message.sender_id ?? "") ? index : -1))
        .filter((index) => index >= 0),
    );
    for (const index of [...matching]) {
      if (index > 0) matching.add(index - 1);
      if (index + 1 < messages.length) matching.add(index + 1);
    }
    return messages.filter((_message, index) => matching.has(index));
  });

  $effect(() => {
    isDarkTheme = document.documentElement.classList.contains("dark");
  });
  $effect(() => {
    if (!open) onClose();
  });

  function toggleMember(id: string) {
    selectedMemberIds = selectedSet.has(id)
      ? selectedMemberIds.filter((memberId) => memberId !== id)
      : [...selectedMemberIds, id];
  }

  function senderLabel(message: ChatGroupMessage): string {
    if (message.sender_type === "user") return $t("chatGroupYou");
    return (
      members.find(
        (member) =>
          member.id === message.sender_id ||
          member.conversation_id === message.sender_id ||
          member.branch_id === message.sender_id,
      )?.role_name ?? $t("chatGroupRole")
    );
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay class="group-book-overlay" />
    <Dialog.Content class="group-book-dialog">
      <header class="group-book-toolbar" data-tauri-drag-region>
        <div class="group-book-title">
          <Dialog.Title>{group.title}</Dialog.Title>
          <Dialog.Description>
            {$t("chatGroupBookMode")} · {visibleMessages.length} / {messages.length}
          </Dialog.Description>
        </div>
        <Dialog.Close class="book-close" aria-label={$t("closeBookMode")}>
          <span aria-hidden="true">×</span>
        </Dialog.Close>
      </header>

      <div class="group-book-layout">
        <aside class="group-book-toc" aria-label={$t("chatGroupBookDirectory")}>
          <div class="toc-heading">
            <span>{$t("chatGroupBookDirectory")}</span>
            <span class="toc-count">{members.length}</span>
          </div>
          <p class="toc-intro">{$t("chatGroupBookIntro")}</p>
          <button
            class:selected={selectedMemberIds.length === 0}
            class="member-filter"
            type="button"
            onclick={() => (selectedMemberIds = [])}
          >
            <span class="member-dot all"></span>
            <span>{$t("chatGroupBookAllRoles")}</span>
          </button>
          {#each members as member (member.id)}
            <button
              class:selected={selectedSet.has(member.id)}
              class="member-filter"
              type="button"
              aria-pressed={selectedSet.has(member.id)}
              onclick={() => toggleMember(member.id)}
            >
              <span class="member-dot"></span>
              <span class="member-filter-copy">
                <strong>{member.role_name}</strong>
                <small>{$t("chatGroupBookRoleLabel")}</small>
              </span>
            </button>
          {/each}
          <div class="toc-divider"></div>
          <span class="toc-label">{$t("chatGroupBookFilterMode")}</span>
          <div class="filter-mode" role="group" aria-label={$t("chatGroupBookFilterMode")}>
            <button
              class:active={contextMode === "context"}
              type="button"
              onclick={() => (contextMode = "context")}
            >
              {$t("chatGroupBookContext")}
            </button>
            <button
              class:active={contextMode === "only"}
              type="button"
              onclick={() => (contextMode = "only")}
            >
              {$t("chatGroupBookOnlyRole")}
            </button>
          </div>
        </aside>

        <main class="group-book-page" aria-label={$t("chatGroups")}>
          {#if selectedMemberIds.length > 0}
            <div class="active-filter">
              {$t("chatGroupBookShowing")}
              {selectedNames.join(", ")}
            </div>
          {/if}
          {#if visibleMessages.length === 0}
            <p class="empty">{$t("chatGroupNoMessages")}</p>
          {:else}
            {#each visibleMessages as message (message.id)}
              <article class="book-message">
                <header class="message-meta">
                  <strong>{senderLabel(message)}</strong>
                  <time datetime={new Date(message.created_at).toISOString()}>
                    {new Date(message.created_at).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </time>
                </header>
                <div class="message-content" use:externalLinks={capabilities.openUrl}>
                  <Streamdown
                    content={message.content.trimEnd()}
                    controls={{ table: false }}
                    components={{ code: Code, mermaid: Mermaid, math: ChatMath }}
                    extensions={customExtensions}
                    theme={chatMarkdownTheme}
                    shikiTheme={isDarkTheme ? "github-dark" : "github-light"}
                    mermaidConfig={mermaidConfigFor(isDarkTheme)}
                  >
                    {#snippet children({ token })}
                      {#if (token as ComponentToken).type === "component"}
                        <CustomToken token={token as ComponentToken} isDark={isDarkTheme} />
                      {/if}
                    {/snippet}
                  </Streamdown>
                </div>
              </article>
            {/each}
          {/if}
        </main>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  :global(.group-book-overlay) {
    position: fixed;
    inset: 0;
    z-index: 2147483646;
    background: var(--surface);
  }
  :global(.group-book-dialog) {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    width: 100vw;
    height: 100vh;
    padding: 24px;
    box-sizing: border-box;
    background: var(--surface);
    color: var(--text);
    outline: none;
  }
  .group-book-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 42px;
    padding: 0 4px 18px;
  }
  .group-book-title {
    display: flex;
    align-items: baseline;
    gap: 12px;
    min-width: 0;
  }
  .group-book-title :global([data-dialog-title]) {
    font-size: 18px;
    font-weight: 650;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .group-book-title :global([data-dialog-description]) {
    color: var(--text-muted);
    font-size: 12px;
  }
  :global(.book-close) {
    width: 30px;
    height: 30px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--text-muted);
    font-size: 24px;
    line-height: 1;
    cursor: pointer;
  }
  :global(.book-close:hover),
  :global(.book-close:focus-visible) {
    background: var(--interactive-state-bg);
    color: var(--text);
  }
  .group-book-layout {
    display: grid;
    grid-template-columns: 248px minmax(0, 1fr);
    min-height: 0;
    flex: 1;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  .group-book-toc {
    overflow: auto;
    padding: 26px 18px;
    border-right: 1px solid var(--border);
    background: color-mix(in srgb, var(--surface2) 45%, transparent);
  }
  .toc-heading {
    display: flex;
    justify-content: space-between;
    color: var(--text);
    font-size: 13px;
    font-weight: 650;
  }
  .toc-count,
  .toc-label {
    color: var(--text-muted);
    font-size: 11px;
  }
  .toc-intro {
    margin: 10px 0 22px;
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.5;
  }
  .member-filter {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    min-height: 34px;
    padding: 7px 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--text);
    text-align: left;
    cursor: pointer;
  }
  .member-filter:hover,
  .member-filter.selected {
    background: var(--interactive-state-bg);
  }
  .member-dot {
    width: 7px;
    height: 7px;
    flex: none;
    border-radius: 50%;
    background: var(--primary);
  }
  .member-dot.all {
    background: var(--text-muted);
  }
  .member-filter-copy {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 1px;
  }
  .member-filter-copy strong {
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 12px;
    font-weight: 600;
  }
  .member-filter-copy small {
    color: var(--text-muted);
    font-size: 10px;
  }
  .toc-divider {
    height: 1px;
    margin: 22px 0 14px;
    background: var(--border);
  }
  .filter-mode {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    margin-top: 8px;
  }
  .filter-mode button {
    min-height: 28px;
    padding: 4px 5px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--text-muted);
    font-size: 11px;
    cursor: pointer;
  }
  .filter-mode button.active,
  .filter-mode button:hover {
    background: var(--interactive-state-bg);
    color: var(--text);
  }
  .group-book-page {
    overflow: auto;
    min-width: 0;
    padding: 46px clamp(28px, 7vw, 120px) 64px;
    column-width: 460px;
    column-gap: clamp(48px, 6vw, 96px);
    column-fill: auto;
  }
  .active-filter {
    margin-bottom: 20px;
    color: var(--primary);
    font-size: 12px;
  }
  .book-message {
    break-inside: avoid;
    margin: 0 0 30px;
  }
  .message-meta {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 9px;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
    padding-bottom: 7px;
  }
  .message-meta strong {
    font-size: 13px;
  }
  .message-meta time {
    color: var(--text-muted);
    font-size: 10px;
    white-space: nowrap;
  }
  .message-content {
    font-size: 16px;
    line-height: 1.75;
    overflow-wrap: anywhere;
  }
  :global(.message-content p) {
    margin: 0 0 9px;
  }
  :global(.message-content p:last-child) {
    margin-bottom: 0;
  }
  .empty {
    color: var(--text-muted);
    font-size: 13px;
  }
  @media (max-width: 760px) {
    :global(.group-book-dialog) {
      padding: 8px;
    }
    .group-book-layout {
      grid-template-columns: 1fr;
      overflow: auto;
    }
    .group-book-toc {
      border-right: 0;
      border-bottom: 1px solid var(--border);
      padding: 16px;
    }
    .group-book-page {
      min-height: 60vh;
      padding: 28px 20px 48px;
      column-width: auto;
      column-count: 1;
    }
    .group-book-toolbar {
      padding: 0 4px 12px;
    }
    .group-book-title {
      display: block;
    }
  }
</style>

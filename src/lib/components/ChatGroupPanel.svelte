<script lang="ts">
  import { onMount, untrack } from "svelte";
  import type { ChatGroup, ChatGroupMember, ChatGroupMessage } from "$lib/openagent";
  import { desktopOpenAgent } from "$lib/openagent/tauriClient";
  import { t } from "$lib/i18n";
  import { Streamdown } from "svelte-streamdown";
  import Code from "svelte-streamdown/code";
  import ChatMath from "$lib/streamdown/ChatMath.svelte";
  import Mermaid from "$lib/streamdown/Mermaid.svelte";
  import CustomToken from "$lib/streamdown/CustomToken.svelte";
  import { customExtensions, type ComponentToken } from "$lib/streamdown/extensions";
  import {
    createChatGroupMentionExtension,
    type ChatGroupMentionToken,
  } from "$lib/streamdown/chatGroupMention";
  import { chatMarkdownTheme } from "$lib/streamdown/chatMarkdownTheme";
  import { externalLinks } from "$lib/streamdown/externalLink";
  import { useOpenAgentUiCapabilities } from "$lib/openagent";
  import { mermaidConfigFor } from "$lib/mermaidTheme";
  import MessageInput from "./MessageInput.svelte";
  import type { PaletteItem } from "./MentionPalette.svelte";

  let {
    enabled = false,
    workspace = "",
    groupIds = [],
    selectedGroupId = $bindable<string | null>(null),
    draft = $bindable(""),
    onAvailabilityChange = () => {},
  }: {
    enabled?: boolean;
    workspace?: string;
    groupIds?: string[];
    selectedGroupId?: string | null;
    draft?: string;
    onAvailabilityChange?: (available: boolean) => void;
  } = $props();

  let groups = $state<ChatGroup[]>([]);
  let members = $state<ChatGroupMember[]>([]);
  let messages = $state<ChatGroupMessage[]>([]);
  let cursor = $state(0);
  let sending = $state(false);
  let error = $state<string | null>(null);
  let membersExpanded = $state(true);
  let membersOverflow = $state(false);
  let memberStripElement = $state<HTMLDivElement | null>(null);
  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  let memberRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  let messagesRefreshInFlight = false;
  let messagesRefreshQueued = false;
  let queuedMessagesReset = false;
  let queuedMessagesGroupId: string | null = null;
  let membersRequestVersion = 0;
  let isDarkTheme = $state(false);
  const capabilities = useOpenAgentUiCapabilities();

  const selectedGroup = $derived(groups.find((group) => group.id === selectedGroupId) ?? null);
  function measureMemberOverflow(): void {
    const element = memberStripElement;
    if (!element) return;
    const previousWrap = element.style.flexWrap;
    element.style.flexWrap = "nowrap";
    membersOverflow = element.scrollWidth > element.clientWidth;
    element.style.flexWrap = previousWrap;
  }

  $effect(() => {
    members;
    selectedGroupId;
    queueMicrotask(measureMemberOverflow);
  });
  async function loadMentionItems(query: string): Promise<PaletteItem[]> {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return members
      .filter((member) => member.role_name.toLocaleLowerCase().includes(normalizedQuery))
      .map((member) => ({
        id: member.id,
        insertText: member.role_name,
        label: member.role_name,
        hint: $t("mentionRole"),
      }));
  }

  async function loadGroups(scope = workspace, allowedGroupIds = groupIds): Promise<void> {
    if (!enabled) return;
    try {
      const availableGroups = await desktopOpenAgent.listChatGroups(scope || null);
      const allowed = new Set(allowedGroupIds);
      const nextGroups = availableGroups.filter((group) => allowed.has(group.id));
      // Keep the current list mounted while the parent recomputes its tool
      // scope. Replacing it with an empty list during that short transition
      // makes the panel disappear and reload on every stream reconciliation.
      if (nextGroups.length > 0 || groups.length === 0) groups = nextGroups;
      onAvailabilityChange(groups.length > 0);
      if (!selectedGroupId && groups[0]) selectedGroupId = groups[0].id;
      if (selectedGroupId && !groups.some((group) => group.id === selectedGroupId)) {
        selectedGroupId = groups[0]?.id ?? null;
      }
    } catch (cause) {
      onAvailabilityChange(false);
      error = String(cause);
    }
  }

  async function refreshMessages(groupId: string | null, reset = false): Promise<void> {
    if (!groupId) return;
    if (messagesRefreshInFlight) {
      messagesRefreshQueued = true;
      queuedMessagesReset ||= reset;
      queuedMessagesGroupId = groupId;
      return;
    }
    messagesRefreshInFlight = true;
    const requestCursor = reset ? 0 : cursor;
    if (reset) {
      cursor = 0;
      messages = [];
    }
    try {
      const result = await desktopOpenAgent.readChatGroupMessages(groupId, requestCursor, 0, 100);
      if (result.messages.length > 0) {
        const seen = new Set(messages.map((message) => message.id));
        messages = [...messages, ...result.messages.filter((message) => !seen.has(message.id))];
        cursor = result.next_seq;
      }
    } catch (cause) {
      error = String(cause);
    } finally {
      messagesRefreshInFlight = false;
      if (messagesRefreshQueued) {
        const nextReset = queuedMessagesReset;
        const nextGroupId = queuedMessagesGroupId;
        messagesRefreshQueued = false;
        queuedMessagesReset = false;
        queuedMessagesGroupId = null;
        void refreshMessages(nextGroupId, nextReset);
      }
    }
  }

  async function loadMembers(groupId: string | null): Promise<void> {
    const requestVersion = ++membersRequestVersion;
    if (!groupId) {
      members = [];
      return;
    }
    try {
      const nextMembers = await desktopOpenAgent.listChatGroupMembers(groupId);
      if (requestVersion === membersRequestVersion && selectedGroupId === groupId) {
        members = nextMembers;
      }
    } catch (cause) {
      error = String(cause);
    }
  }

  function scheduleMemberRefresh(groupId: string): void {
    if (memberRefreshTimer) clearTimeout(memberRefreshTimer);
    memberRefreshTimer = setTimeout(() => {
      memberRefreshTimer = null;
      void loadMembers(groupId);
    }, 100);
  }

  function mentionsFromDraft(content: string): string[] {
    const found = new Set<string>();
    const pattern = /@"([^"\\]*(?:\\.[^"\\]*)*)"|@([\p{L}\p{N}_-]+)/gu;
    for (const match of content.matchAll(pattern)) {
      const name = (match[1] ?? match[2] ?? "").replaceAll('\\"', '"').trim().toLocaleLowerCase();
      const member = members.find((item) => item.role_name.toLocaleLowerCase() === name);
      if (member) found.add(member.id);
    }
    return [...found];
  }

  async function sendMessage(): Promise<void> {
    if (!selectedGroupId || !draft.trim() || sending) return;
    const content = draft.trim();
    const mentions = mentionsFromDraft(content);
    sending = true;
    error = null;
    try {
      const message = await desktopOpenAgent.sendChatGroupMessage(
        selectedGroupId,
        content,
        mentions,
      );
      if (!messages.some((item) => item.id === message.id)) messages = [...messages, message];
      cursor = Math.max(cursor, message.seq);
      draft = "";
    } catch (cause) {
      error = String(cause);
    } finally {
      sending = false;
    }
  }

  function senderMember(message: ChatGroupMessage): ChatGroupMember | undefined {
    if (!message.sender_id) return undefined;
    return members.find(
      (member) =>
        member.conversation_id === message.sender_id ||
        member.id === message.sender_id ||
        member.branch_id === message.sender_id,
    );
  }

  function senderLabel(message: ChatGroupMessage): string {
    if (message.sender_type === "user") return $t("chatGroupYou");
    return senderMember(message)?.role_name ?? $t("chatGroupRole");
  }

  function senderKey(message: ChatGroupMessage): string {
    return `${message.sender_type}:${message.sender_id ?? senderLabel(message)}`;
  }

  function senderTime(message: ChatGroupMessage): string {
    return new Date(message.created_at).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function extensionsForMessage(message: ChatGroupMessage) {
    const mentionExtension = createChatGroupMentionExtension(
      message.mentions.flatMap((memberId) => {
        const member = members.find((item) => item.id === memberId);
        return member ? [{ id: member.id, roleName: member.role_name }] : [];
      }),
    );
    return mentionExtension ? [...customExtensions, mentionExtension] : customExtensions;
  }

  $effect(() => {
    const groupId = selectedGroupId;
    untrack(() => {
      void refreshMessages(groupId, true);
      void loadMembers(groupId);
    });
  });

  $effect(() => {
    const scope = workspace;
    const active = enabled;
    const allowedGroupIds = groupIds;
    untrack(() => {
      if (!active) return;
      void loadGroups(scope, allowedGroupIds);
    });
  });

  onMount(() => {
    const updateTheme = () => {
      isDarkTheme = document.documentElement.classList.contains("dark");
    };
    updateTheme();
    const themeObserver = new MutationObserver(updateTheme);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    const memberResizeObserver = new ResizeObserver(measureMemberOverflow);
    if (memberStripElement) memberResizeObserver.observe(memberStripElement);
    measureMemberOverflow();
    refreshTimer = setInterval(() => void refreshMessages(selectedGroupId), 2000);
    let unsubscribe: (() => void) | undefined;
    void desktopOpenAgent
      .subscribeToChatGroupEvents({
        onMessage: (message) => {
          if (message.group_id !== selectedGroupId) return;
          if (messages.some((item) => item.id === message.id)) return;
          messages = [...messages, message];
          cursor = Math.max(cursor, message.seq);
          // A role can be created and mentioned before the member-change
          // event reaches this panel. Refresh after the durable message so
          // persisted mention ids always have a role-name mapping.
          scheduleMemberRefresh(message.group_id);
        },
        onUpdated: (group) => {
          if (!groupIds.includes(group.id)) return;
          groups = [group, ...groups.filter((item) => item.id !== group.id)];
        },
        onMemberChanged: (member) => {
          if (member.group_id !== selectedGroupId) return;
          // Apply the event immediately so a role reply can use its name even
          // before the full member list refresh completes.
          members = [...members.filter((item) => item.id !== member.id), member].sort(
            (left, right) => left.joined_at - right.joined_at,
          );
          scheduleMemberRefresh(member.group_id);
        },
      })
      .then((cleanup) => {
        unsubscribe = cleanup;
      })
      .catch(() => {});
    return () => {
      if (refreshTimer) clearInterval(refreshTimer);
      if (memberRefreshTimer) clearTimeout(memberRefreshTimer);
      themeObserver.disconnect();
      memberResizeObserver.disconnect();
      unsubscribe?.();
    };
  });
</script>

{#if enabled}
  <section class="group-panel" aria-label={$t("chatGroups")}>
    {#if groups.length === 0}
      <p class="empty">{$t("chatGroupEmpty")}</p>
    {/if}

    {#if selectedGroup}
      <section class="member-section" aria-label={$t("chatGroupMembers")}>
        {#if membersOverflow}
          <button
            class="member-toggle"
            type="button"
            aria-expanded={membersExpanded}
            onclick={() => (membersExpanded = !membersExpanded)}
          >
            <span>{$t("chatGroupMembers")}</span>
            <svg
              class:expanded={membersExpanded}
              class="member-chevron"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path d="m4 6 4 4 4-4" />
            </svg>
          </button>
        {/if}
        <div
          bind:this={memberStripElement}
          class:collapsed={!membersExpanded}
          class="member-strip"
          role="list"
        >
          {#each members as member (member.id)}
            <span class="mention-chip" role="listitem">{member.role_name}</span>
          {/each}
        </div>
      </section>

      <div class="message-list" aria-live="polite">
        {#if messages.length === 0}
          <p class="empty">{$t("chatGroupNoMessages")}</p>
        {:else}
          {#each messages as message, index (message.id)}
            {@const showSender =
              index === 0 || senderKey(messages[index - 1]) !== senderKey(message)}
            <article class:message-group-start={showSender} class="message-row">
              <div class="message-body">
                {#if showSender}
                  <div class="speaker-divider" aria-label={senderLabel(message)}>
                    <span class="sender">{senderLabel(message)}</span>
                    <time datetime={new Date(message.created_at).toISOString()}
                      >{senderTime(message)}</time
                    >
                  </div>
                  <div class="speaker-rule" aria-hidden="true"></div>
                {/if}
                <div class="group-message-markdown" use:externalLinks={capabilities.openUrl}>
                  <Streamdown
                    content={message.content.trimEnd()}
                    controls={{ table: false }}
                    components={{ code: Code, mermaid: Mermaid, math: ChatMath }}
                    extensions={extensionsForMessage(message)}
                    theme={chatMarkdownTheme}
                    shikiTheme={isDarkTheme ? "github-dark" : "github-light"}
                    mermaidConfig={mermaidConfigFor(isDarkTheme)}
                  >
                    {#snippet children({ token })}
                      {#if (token as ComponentToken).type === "component"}
                        <CustomToken token={token as ComponentToken} isDark={isDarkTheme} />
                      {:else if (token as ChatGroupMentionToken).type === "chatGroupMention"}
                        <span class="chat-group-mention"
                          >{(token as ChatGroupMentionToken).label}</span
                        >
                      {/if}
                    {/snippet}
                  </Streamdown>
                </div>
              </div>
            </article>
          {/each}
        {/if}
      </div>

      <MessageInput
        bind:value={draft}
        attachments={[]}
        selectedModel=""
        modelOptions={[]}
        placeholder={$t("chatGroupMessagePlaceholder")}
        disabled={!selectedGroupId || sending}
        isStreaming={false}
        sendDisabled={sending || !draft.trim()}
        sendTitle={$t("chatGroupSend")}
        showAttachments={false}
        showModelSelector={false}
        showReasoningEffort={false}
        showApprovalMode={false}
        showWorkspaceSwitcher={false}
        enableMentions={true}
        {loadMentionItems}
        onSend={() => void sendMessage()}
        onStop={() => {}}
      />
    {/if}

    {#if error}<p class="error">{error}</p>{/if}
  </section>
{/if}

<style>
  .group-panel {
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
  }
  .member-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .member-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    border: 0;
    background: transparent;
    color: var(--text-muted);
    padding: 2px 0;
    font-size: 12px;
    text-align: left;
  }
  .member-chevron {
    width: 14px;
    height: 14px;
    color: var(--text-muted);
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
    transform: rotate(-90deg);
    transition: transform 120ms ease;
  }
  .member-chevron.expanded {
    transform: rotate(0deg);
  }
  .member-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .member-strip.collapsed {
    flex-wrap: nowrap;
    overflow: hidden;
  }
  .group-panel :global(.composer-compact .input) {
    min-height: 64px;
  }
  .mention-chip {
    border: 1px solid var(--border);
    border-radius: 999px;
    background: transparent;
    color: var(--text-muted);
    padding: 3px 7px;
    font-size: 12px;
  }
  .message-list {
    min-height: 120px;
    flex: 1;
    overflow: auto;
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    padding: 8px 0;
  }
  .message-row {
    padding: 5px 4px;
  }
  .message-row.message-group-start {
    margin-top: 26px;
    padding-top: 0;
  }
  .message-row:first-child {
    margin-top: 6px;
  }
  .message-row:not(.message-group-start) {
    padding-top: 3px;
    padding-bottom: 3px;
  }
  .message-body {
    min-width: 0;
  }
  .speaker-divider {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
  }
  .speaker-rule {
    margin-bottom: 14px;
    border-top: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
  }
  .sender {
    color: var(--text);
    font-size: 13px;
    line-height: 1.3;
    white-space: nowrap;
  }
  .speaker-divider time {
    color: var(--text-muted);
    font-size: 10px;
    white-space: nowrap;
  }
  .group-message-markdown {
    margin: 3px 0 0;
    overflow-wrap: anywhere;
  }
  :global(.group-message-markdown > *) {
    margin-top: 0;
  }
  :global(.group-message-markdown p) {
    margin: 0 0 7px;
    white-space: pre-wrap;
  }
  :global(.group-message-markdown p:last-child) {
    margin-bottom: 0;
  }
  :global(.group-message-markdown h1),
  :global(.group-message-markdown h2),
  :global(.group-message-markdown h3),
  :global(.group-message-markdown h4),
  :global(.group-message-markdown h5),
  :global(.group-message-markdown h6) {
    margin: 4px 0 6px;
    font-size: 1em;
    font-weight: 650;
  }
  :global(.group-message-markdown ul),
  :global(.group-message-markdown ol) {
    margin: 4px 0 7px;
    padding-left: 1.35em;
  }
  :global(.group-message-markdown blockquote) {
    margin: 5px 0;
    border-left: 3px solid var(--border);
    padding-left: 9px;
    color: var(--text-muted);
  }
  :global(.group-message-markdown [data-streamdown-code]) {
    margin: 6px 0;
    overflow: auto;
    border-radius: 4px;
    font-size: 12px;
  }
  .chat-group-mention {
    border-radius: 4px;
    background: color-mix(in srgb, var(--primary) 12%, transparent);
    color: var(--primary);
    padding: 1px 4px;
    font-weight: 650;
    white-space: nowrap;
  }
  .empty,
  .error {
    color: var(--text-muted);
    font-size: 12px;
  }
  .error {
    color: var(--danger, #b42318);
    overflow-wrap: anywhere;
  }
</style>

<script lang="ts">
  import { onMount, untrack } from "svelte";
  import type { AgentRole, ChatGroup, ChatGroupMember, ChatGroupMessage } from "$lib/openagent";
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
  import LoadingSkeleton from "./LoadingSkeleton.svelte";
  import ScrollArea from "./ui/ScrollArea.svelte";
  import Tooltip from "./Tooltip.svelte";
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
  let roleDefinitions = $state<AgentRole[]>([]);
  let messages = $state<ChatGroupMessage[]>([]);
  let cursor = $state(0);
  let sending = $state(false);
  let error = $state<string | null>(null);
  let groupsLoading = $state(false);
  let messagesLoading = $state(false);
  let membersExpanded = $state(false);
  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  let memberRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  let initialLoadTimer: ReturnType<typeof setTimeout> | null = null;
  let messagesRefreshInFlight = false;
  let messagesRefreshQueued = false;
  let queuedMessagesReset = false;
  let queuedMessagesGroupId: string | null = null;
  let membersRequestVersion = 0;
  let groupsRequestVersion = 0;
  let isDarkTheme = $state(false);
  const capabilities = useOpenAgentUiCapabilities();

  type ChatGroupSnapshot = {
    groups: ChatGroup[];
    members: ChatGroupMember[];
    messages: ChatGroupMessage[];
    cursor: number;
    selectedGroupId: string | null;
    draft: string;
    membersExpanded: boolean;
  };
  const snapshots = new Map<string, ChatGroupSnapshot>();
  let currentSnapshotKey = $state<string | null>(null);
  let snapshotKey = $derived(`${workspace}\u0000${groupIds.join("\u0001")}`);

  const selectedGroup = $derived(groups.find((group) => group.id === selectedGroupId) ?? null);
  function roleTooltip(member: ChatGroupMember): string {
    const role = roleDefinitions.find((item) => item.id === member.role_id);
    if (!role) return member.role_name;
    const details = [role.description.trim()];
    if (role.skill_ids.length > 0) details.push(`Skills: ${role.skill_ids.join(", ")}`);
    if (role.mcp_server_ids.length > 0) details.push(`MCP: ${role.mcp_server_ids.join(", ")}`);
    return `${role.name}\n${details.filter(Boolean).join("\n")}`;
  }
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
    const requestVersion = ++groupsRequestVersion;
    groupsLoading = true;
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
    } finally {
      if (requestVersion === groupsRequestVersion) groupsLoading = false;
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
      messagesLoading = true;
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
      if (reset) messagesLoading = false;
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

  type MessageGroup = {
    key: string;
    messages: ChatGroupMessage[];
  };

  const messageGroups = $derived.by(() => {
    const grouped: MessageGroup[] = [];
    for (const message of messages) {
      const key = senderKey(message);
      const current = grouped[grouped.length - 1];
      if (current && senderKey(current.messages[0]) === key) {
        current.messages.push(message);
      } else {
        grouped.push({ key: `${key}:${message.id}`, messages: [message] });
      }
    }
    return grouped;
  });

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
    const key = snapshotKey;
    untrack(() => {
      if (key === currentSnapshotKey) return;
      if (currentSnapshotKey !== null) {
        snapshots.set(currentSnapshotKey, {
          groups,
          members,
          messages,
          cursor,
          selectedGroupId,
          draft,
          membersExpanded,
        });
      }
      const snapshot = snapshots.get(key);
      currentSnapshotKey = key;
      if (snapshot) {
        groups = snapshot.groups;
        members = snapshot.members;
        messages = snapshot.messages;
        cursor = snapshot.cursor;
        selectedGroupId = snapshot.selectedGroupId;
        draft = snapshot.draft;
        membersExpanded = snapshot.membersExpanded;
        groupsLoading = false;
        messagesLoading = false;
      } else {
        groups = [];
        members = [];
        messages = [];
        cursor = 0;
        selectedGroupId = null;
        groupsLoading = enabled;
        messagesLoading = false;
      }
    });
  });

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
    const roleLoadTimer = setTimeout(() => {
      void desktopOpenAgent
        .invokeProduct("list_agent_roles", {})
        .then((roles) => {
          roleDefinitions = roles;
        })
        .catch(() => {});
    }, 280);
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
      if (initialLoadTimer) clearTimeout(initialLoadTimer);
      clearTimeout(roleLoadTimer);
      themeObserver.disconnect();
      unsubscribe?.();
    };
  });
</script>

{#if enabled}
  <section class="group-panel" aria-label={$t("chatGroups")}>
    {#if groupsLoading && groups.length === 0}
      <LoadingSkeleton variant="detail-list" rows={4} label={$t("loadingContent")} />
    {:else if groups.length === 0}
      <p class="empty">{$t("chatGroupEmpty")}</p>
    {/if}

    {#if selectedGroup}
      <header class="group-heading">
        <div class="group-heading-copy">
          <strong>{selectedGroup.title}</strong>
          <span>{messages.length} {$t("chatGroupMessages")}</span>
        </div>
      </header>
      {#if members.length > 0}
        <section class="member-section" aria-label={$t("chatGroupMembers")}>
          <button
            class="member-toggle"
            type="button"
            aria-expanded={membersExpanded}
            aria-controls="chat-group-members"
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
          <div
            class:collapsed={!membersExpanded}
            class="member-strip"
            id="chat-group-members"
            role="list"
          >
            {#each members as member (member.id)}
              <Tooltip text={roleTooltip(member)} side="top" align="start">
                <span class="mention-chip" role="listitem" aria-label={roleTooltip(member)}>
                  {member.role_name}
                </span>
              </Tooltip>
            {/each}
          </div>
        </section>
      {/if}

      <div class="message-stack">
        <ScrollArea height="100%" class="message-list" scrollHideDelay={350}>
          <div class="message-list-content" aria-live="polite">
            {#if messagesLoading && messages.length === 0}
              <LoadingSkeleton variant="detail-list" rows={4} label={$t("loadingContent")} />
            {:else if messages.length === 0}
              <p class="empty">{$t("chatGroupNoMessages")}</p>
            {:else}
              {#each messageGroups as messageGroup (messageGroup.key)}
                {@const firstMessage = messageGroup.messages[0]}
                <section class="message-group">
                  <div class="speaker-divider" aria-label={senderLabel(firstMessage)}>
                    <span class="sender">{senderLabel(firstMessage)}</span>
                    <time datetime={new Date(firstMessage.created_at).toISOString()}
                      >{senderTime(firstMessage)}</time
                    >
                  </div>
                  <div class="speaker-rule" aria-hidden="true"></div>
                  {#each messageGroup.messages as message (message.id)}
                    <article class="message-row">
                      <div class="message-body">
                        <div
                          class="group-message-markdown"
                          use:externalLinks={capabilities.openUrl}
                        >
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
                </section>
              {/each}
            {/if}
          </div>
        </ScrollArea>

        <div class="group-input-area">
          <div class="group-input-inner">
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
          </div>
        </div>
      </div>
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
    gap: 7px;
    padding: 12px;
  }
  .member-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .group-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .group-heading-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
  }
  .group-heading-copy strong {
    overflow: hidden;
    color: var(--text);
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .group-heading-copy span {
    color: var(--text-muted);
    font-size: 10px;
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
    cursor: pointer;
  }
  .member-toggle:hover,
  .member-toggle:focus-visible {
    color: var(--text);
    outline: none;
  }
  .member-toggle:focus-visible {
    box-shadow: inset 0 -1px var(--focus-ring-color, var(--primary));
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
    display: none;
  }
  .group-panel :global(.composer-compact .input) {
    min-height: 64px;
  }
  .mention-chip {
    display: block;
    max-width: 100%;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: transparent;
    color: var(--text-muted);
    padding: 3px 7px;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .message-stack {
    position: relative;
    min-height: 0;
    flex: 1;
  }
  :global(.message-list) {
    position: absolute;
    inset: 0;
    width: 100%;
    min-height: 0;
    border: 0;
    padding: 0;
  }
  :global(.message-list .ui-scroll-area-viewport) {
    overflow-x: hidden;
    padding: 0 8px 0 0;
  }
  .message-list-content {
    min-height: 100%;
    padding: 0 0 112px;
  }
  .group-input-area {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 3;
    pointer-events: none;
  }
  .group-input-inner {
    pointer-events: auto;
  }
  .message-group {
    min-width: 0;
    margin-top: 26px;
  }
  .message-group:first-child {
    margin-top: 0;
  }
  .message-row {
    padding: 5px 4px;
  }
  .message-row:first-of-type {
    padding-top: 0;
  }
  .message-row:not(:first-of-type) {
    padding-top: 3px;
    padding-bottom: 3px;
  }
  .message-body {
    min-width: 0;
  }
  .speaker-divider {
    position: sticky;
    z-index: 1;
    top: 0;
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 0 -4px 8px;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
    background: var(--surface);
    padding: 6px 4px 7px;
  }
  .speaker-rule {
    display: none;
  }
  .sender {
    min-width: 0;
    overflow: hidden;
    color: var(--text);
    font-size: 17px;
    font-weight: 650;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sender::first-letter {
    font-size: 1.35em;
    font-weight: 700;
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

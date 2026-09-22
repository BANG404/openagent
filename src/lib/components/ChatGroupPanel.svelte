<script lang="ts">
  import { onMount, untrack } from "svelte";
  import type { ChatGroup, ChatGroupMember, ChatGroupMessage } from "$lib/openagent";
  import { desktopOpenAgent } from "$lib/openagent/tauriClient";
  import { t } from "$lib/i18n";
  import Select from "$lib/components/ui/Select.svelte";

  let {
    enabled = false,
    workspace = "",
    selectedGroupId = $bindable<string | null>(null),
    draft = $bindable(""),
  }: {
    enabled?: boolean;
    workspace?: string;
    selectedGroupId?: string | null;
    draft?: string;
  } = $props();

  let groups = $state<ChatGroup[]>([]);
  let members = $state<ChatGroupMember[]>([]);
  let messages = $state<ChatGroupMessage[]>([]);
  let selectedMentions = $state<string[]>([]);
  let cursor = $state(0);
  let sending = $state(false);
  let error = $state<string | null>(null);
  let refreshTimer: ReturnType<typeof setInterval> | null = null;

  const selectedGroup = $derived(groups.find((group) => group.id === selectedGroupId) ?? null);
  const groupItems = $derived(groups.map((group) => ({ value: group.id, label: group.title })));

  async function loadGroups(scope = workspace): Promise<void> {
    if (!enabled) return;
    try {
      groups = await desktopOpenAgent.listChatGroups(scope || null);
      if (!selectedGroupId && groups[0]) selectedGroupId = groups[0].id;
      if (selectedGroupId && !groups.some((group) => group.id === selectedGroupId)) {
        selectedGroupId = groups[0]?.id ?? null;
      }
    } catch (cause) {
      error = String(cause);
    }
  }

  async function refreshMessages(groupId: string | null, reset = false): Promise<void> {
    if (!groupId) return;
    if (reset) {
      cursor = 0;
      messages = [];
    }
    try {
      const result = await desktopOpenAgent.readChatGroupMessages(groupId, cursor, 0, 100);
      if (result.messages.length > 0) {
        const seen = new Set(messages.map((message) => message.id));
        messages = [...messages, ...result.messages.filter((message) => !seen.has(message.id))];
        cursor = result.next_seq;
      }
    } catch (cause) {
      error = String(cause);
    }
  }

  async function loadMembers(groupId: string | null): Promise<void> {
    if (!groupId) {
      members = [];
      return;
    }
    try {
      members = await desktopOpenAgent.listChatGroupMembers(groupId);
    } catch (cause) {
      error = String(cause);
    }
  }

  async function createGroup(): Promise<void> {
    const title = window.prompt($t("chatGroupCreatePrompt"));
    if (!title?.trim()) return;
    try {
      const group = await desktopOpenAgent.createChatGroup(title.trim());
      groups = [group, ...groups.filter((item) => item.id !== group.id)];
      selectedGroupId = group.id;
    } catch (cause) {
      error = String(cause);
    }
  }

  function toggleMention(member: ChatGroupMember): void {
    const token = `@${member.role_name} `;
    if (selectedMentions.includes(member.id)) {
      selectedMentions = selectedMentions.filter((id) => id !== member.id);
      draft = draft.replace(token, "");
      return;
    }
    selectedMentions = [...selectedMentions, member.id];
    if (!draft.includes(token)) draft = `${token}${draft}`;
  }

  async function sendMessage(): Promise<void> {
    if (!selectedGroupId || !draft.trim() || sending) return;
    sending = true;
    error = null;
    try {
      const message = await desktopOpenAgent.sendChatGroupMessage(
        selectedGroupId,
        draft.trim(),
        selectedMentions,
      );
      messages = [...messages, message];
      cursor = Math.max(cursor, message.seq);
      draft = "";
      selectedMentions = [];
    } catch (cause) {
      error = String(cause);
    } finally {
      sending = false;
    }
  }

  function senderLabel(message: ChatGroupMessage): string {
    if (message.sender_type === "user") return $t("chatGroupYou");
    return (
      members.find((member) => member.conversation_id === message.sender_id)?.role_name ??
      $t("chatGroupRole")
    );
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
    untrack(() => {
      if (!active) return;
      members = [];
      messages = [];
      cursor = 0;
      void loadGroups(scope);
    });
  });

  onMount(() => {
    refreshTimer = setInterval(() => void refreshMessages(selectedGroupId), 2000);
    let unsubscribe: (() => void) | undefined;
    void desktopOpenAgent
      .subscribeToChatGroupEvents({
        onMessage: (message) => {
          if (message.group_id !== selectedGroupId) return;
          if (messages.some((item) => item.id === message.id)) return;
          messages = [...messages, message];
          cursor = Math.max(cursor, message.seq);
        },
        onUpdated: (group) => {
          groups = [group, ...groups.filter((item) => item.id !== group.id)];
        },
        onMemberChanged: (member) => {
          if (member.group_id === selectedGroupId) void loadMembers(selectedGroupId);
        },
      })
      .then((cleanup) => {
        unsubscribe = cleanup;
      })
      .catch(() => {});
    return () => {
      if (refreshTimer) clearInterval(refreshTimer);
      unsubscribe?.();
    };
  });
</script>

{#if enabled}
  <section class="group-panel" aria-label={$t("chatGroups")}>
    <header class="group-header">
      <div>
        <strong>{$t("chatGroups")}</strong>
        {#if selectedGroup}<span>{selectedGroup.title}</span>{/if}
      </div>
      <button type="button" class="text-button" onclick={() => void createGroup()}>
        {$t("chatGroupNew")}
      </button>
    </header>

    {#if groups.length > 0}
      <label class="group-select-label" for="chat-group-select">{$t("chatGroupSelect")}</label>
      <Select
        id="chat-group-select"
        value={selectedGroupId ?? ""}
        items={groupItems}
        triggerClass="chat-group-select"
        ariaLabel={$t("chatGroupSelect")}
        onValueChange={(value) => (selectedGroupId = value)}
      />
    {:else}
      <p class="empty">{$t("chatGroupEmpty")}</p>
    {/if}

    {#if selectedGroup}
      <div class="member-strip" aria-label={$t("chatGroupMembers")}>
        {#each members as member (member.id)}
          <button
            type="button"
            class:selected={selectedMentions.includes(member.id)}
            aria-pressed={selectedMentions.includes(member.id)}
            class="mention-chip"
            onclick={() => toggleMention(member)}>@{member.role_name}</button
          >
        {/each}
      </div>

      <div class="message-list" aria-live="polite">
        {#if messages.length === 0}
          <p class="empty">{$t("chatGroupNoMessages")}</p>
        {:else}
          {#each messages as message (message.id)}
            <article class="message-row">
              <span class="sender">{senderLabel(message)}</span>
              <p>{message.content}</p>
              {#if message.mentions.length > 0}<small>{$t("chatGroupMentioned")}</small>{/if}
            </article>
          {/each}
        {/if}
      </div>

      <form
        class="composer"
        onsubmit={(event) => {
          event.preventDefault();
          void sendMessage();
        }}
      >
        <textarea bind:value={draft} rows="3" placeholder={$t("chatGroupMessagePlaceholder")}
        ></textarea>
        <button type="submit" disabled={sending || !draft.trim()}>{$t("chatGroupSend")}</button>
      </form>
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
  .group-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
  }
  .group-header div {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
  }
  .group-header span {
    overflow: hidden;
    color: var(--text-muted);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .text-button,
  .composer button {
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--surface);
    color: var(--text);
    padding: 5px 8px;
    cursor: pointer;
  }
  .text-button:hover,
  .composer button:hover:not(:disabled) {
    background: var(--surface-hover);
  }
  .group-select-label {
    color: var(--text-muted);
    font-size: 11px;
  }
  textarea {
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
  }
  :global(.chat-group-select) {
    width: 100%;
  }
  .member-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .mention-chip {
    border: 1px solid var(--border);
    border-radius: 999px;
    background: transparent;
    color: var(--text-muted);
    padding: 3px 7px;
    cursor: pointer;
    font-size: 12px;
  }
  .mention-chip.selected {
    border-color: var(--primary);
    color: var(--primary);
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
    border-bottom: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
    padding: 7px 2px;
  }
  .message-row:last-child {
    border-bottom: 0;
  }
  .sender {
    color: var(--text-muted);
    font-size: 11px;
  }
  .message-row p {
    margin: 3px 0 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .message-row small {
    color: var(--primary);
    font-size: 10px;
  }
  .composer {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  textarea {
    min-height: 64px;
    resize: vertical;
    padding: 8px;
  }
  .composer button {
    align-self: flex-end;
  }
  .composer button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
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

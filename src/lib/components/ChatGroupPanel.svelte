<script lang="ts">
  import { onMount, tick, untrack } from "svelte";
  import type { ChatGroup, ChatGroupMember, ChatGroupMessage } from "$lib/openagent";
  import { desktopOpenAgent } from "$lib/openagent/tauriClient";
  import { t } from "$lib/i18n";
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
  import MentionPalette, { type PaletteItem } from "./MentionPalette.svelte";
  import Select from "$lib/components/ui/Select.svelte";

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
  let selectedMentions = $state<string[]>([]);
  let mentionMode = $state(false);
  let mentionQuery = $state("");
  let mentionStart = $state(0);
  let mentionActiveIdx = $state(0);
  let textareaEl = $state<HTMLTextAreaElement | null>(null);
  let cursor = $state(0);
  let sending = $state(false);
  let error = $state<string | null>(null);
  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  let isDarkTheme = $state(false);
  const capabilities = useOpenAgentUiCapabilities();

  const selectedGroup = $derived(groups.find((group) => group.id === selectedGroupId) ?? null);
  const mentionItems = $derived<PaletteItem[]>(
    members
      .filter((member) =>
        member.role_name.toLocaleLowerCase().includes(mentionQuery.trim().toLocaleLowerCase()),
      )
      .map((member) => ({
        id: member.id,
        insertText: member.role_name,
        label: member.role_name,
        hint: $t("mentionRole"),
      })),
  );
  const groupItems = $derived(groups.map((group) => ({ value: group.id, label: group.title })));

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

  function toggleMention(member: ChatGroupMember): void {
    // Reconcile against the text first: the user may have removed a mention
    // directly with Backspace since the last chip interaction.
    const draftMentions = mentionsFromDraft(draft);
    selectedMentions = draftMentions;
    if (draftMentions.includes(member.id)) {
      draft = removeMentionFromDraft(draft, member.role_name);
      selectedMentions = mentionsFromDraft(draft);
      return;
    }
    const token = /\s/.test(member.role_name)
      ? `@"${member.role_name.replaceAll('"', '\\\\"')}" `
      : `@${member.role_name} `;
    draft = `${token}${draft}`;
    selectedMentions = mentionsFromDraft(draft);
  }

  function closeMentionPalette(): void {
    mentionMode = false;
    mentionQuery = "";
    mentionStart = 0;
    mentionActiveIdx = 0;
  }

  function syncMentionPalette(): void {
    if (!textareaEl) return;
    const caret = textareaEl.selectionStart ?? draft.length;
    for (let index = caret - 1; index >= 0; index -= 1) {
      if (draft[index] === "@") {
        const previous = index === 0 ? "" : draft[index - 1];
        if (previous === "" || /\s/.test(previous)) {
          mentionStart = index;
          mentionQuery = draft.slice(index + 1, caret).replace(/^"/, "");
          mentionMode = !/[\s\n]/.test(draft.slice(index + 1, caret).replace(/^"[^"]*$/, ""));
          if (mentionMode)
            mentionActiveIdx = Math.min(mentionActiveIdx, Math.max(mentionItems.length - 1, 0));
          return;
        }
        break;
      }
      if (/\s/.test(draft[index])) break;
    }
    closeMentionPalette();
  }

  function applyMention(item: PaletteItem): void {
    if (!textareaEl) return;
    const caret = textareaEl.selectionStart ?? draft.length;
    const before = draft.slice(0, mentionStart);
    const after = draft.slice(caret);
    const name = item.insertText ?? item.label;
    const token = /\s/.test(name) ? `@"${name.replaceAll('"', "\\\\" + '"')}"` : `@${name}`;
    const insertion = `${token} `;
    draft = `${before}${insertion}${after}`;
    if (!selectedMentions.includes(item.id)) selectedMentions = [...selectedMentions, item.id];
    const newCaret = before.length + insertion.length;
    closeMentionPalette();
    void tick().then(() => {
      textareaEl?.focus();
      textareaEl?.setSelectionRange(newCaret, newCaret);
    });
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

  function removeMentionFromDraft(content: string, roleName: string): string {
    const pattern = /@"([^"\\]*(?:\\.[^"\\]*)*)"|@([\p{L}\p{N}_-]+)/gu;
    let removed = false;
    return content.replace(
      pattern,
      (token, quoted: string | undefined, bare: string | undefined) => {
        if (removed) return token;
        const name = (quoted ?? bare ?? "").replaceAll('\\"', '"').trim();
        if (name.toLocaleLowerCase() !== roleName.toLocaleLowerCase()) return token;
        removed = true;
        return "";
      },
    );
  }

  function syncSelectedMentions(): void {
    const next = mentionsFromDraft(draft);
    if (
      next.length !== selectedMentions.length ||
      next.some((id, index) => id !== selectedMentions[index])
    ) {
      selectedMentions = next;
    }
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
      selectedMentions = [];
      closeMentionPalette();
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

  function mentionedRoleNames(message: ChatGroupMessage): string[] {
    return message.mentions.map(
      (memberId) =>
        members.find((member) => member.id === memberId)?.role_name ?? $t("chatGroupRole"),
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
    const allowedGroupIds = groupIds;
    untrack(() => {
      if (!active) return;
      onAvailabilityChange(false);
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
          void loadMembers(selectedGroupId);
        },
      })
      .then((cleanup) => {
        unsubscribe = cleanup;
      })
      .catch(() => {});
    return () => {
      if (refreshTimer) clearInterval(refreshTimer);
      themeObserver.disconnect();
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
              <div class="group-message-markdown" use:externalLinks={capabilities.openUrl}>
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
              {#if message.mentions.length > 0}
                <small class="mentions">
                  {$t("chatGroupMentioned")}:
                  {#each mentionedRoleNames(message) as roleName, index (message.mentions[index])}
                    {#if index > 0},
                    {/if}@{roleName}
                  {/each}
                </small>
              {/if}
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
        {#if mentionMode}
          <div class="palette-anchor">
            <MentionPalette
              items={mentionItems}
              activeIdx={mentionActiveIdx}
              emptyText={$t("chatGroupNoMessages")}
              onSelect={applyMention}
              onHover={(idx) => (mentionActiveIdx = idx)}
            />
          </div>
        {/if}
        <textarea
          bind:this={textareaEl}
          bind:value={draft}
          rows="3"
          placeholder={$t("chatGroupMessagePlaceholder")}
          oninput={() => {
            syncSelectedMentions();
            syncMentionPalette();
          }}
          onselect={syncMentionPalette}
          onclick={syncMentionPalette}
          onkeydown={(event) => {
            if (mentionMode && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
              event.preventDefault();
              mentionActiveIdx =
                event.key === "ArrowDown"
                  ? (mentionActiveIdx + 1) % Math.max(mentionItems.length, 1)
                  : (mentionActiveIdx - 1 + mentionItems.length) % Math.max(mentionItems.length, 1);
            } else if (
              mentionMode &&
              (event.key === "Enter" || event.key === "Tab") &&
              mentionItems.length > 0
            ) {
              event.preventDefault();
              applyMention(mentionItems[mentionActiveIdx]);
            } else if (event.key === "Escape" && mentionMode) {
              event.preventDefault();
              closeMentionPalette();
            } else if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void sendMessage();
            }
          }}
          onblur={() => setTimeout(closeMentionPalette, 100)}></textarea>
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
  .composer button {
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--surface);
    color: var(--text);
    padding: 5px 8px;
    cursor: pointer;
  }
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
  .message-row small {
    color: var(--primary);
    font-size: 10px;
  }
  .composer {
    position: relative;
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

<script lang="ts">
  import Tooltip from "../Tooltip.svelte";
  import AttachmentPreview from "../AttachmentPreview.svelte";
  import UserQuote from "../UserQuote.svelte";
  import { t } from "$lib/i18n";
  import { getSiblingInfoForUserMessage, type ConvTree } from "$lib/checkpointTree";
  import type { ChatMessage } from "$lib/types";
  import type { UserMessageEditor } from "$lib/transcript/userEditor.svelte";
  import {
    attachmentReferenceMap,
    isLongUserMessage,
    renderUserContent,
  } from "$lib/transcript/userContent";

  interface Props {
    msg: ChatMessage;
    msgIdx: number;
    activeConvId: string | null;
    activeTree: ConvTree | undefined;
    isStreaming: boolean;
    editable: boolean;
    debugMode: boolean;
    edit: UserMessageEditor;
    attachmentPreviewLoader?: (
      locator: string,
      name: string,
    ) => Promise<{ kind: "image" | "text" | "file"; data_url?: string; text?: string }>;
  }
  let {
    msg,
    msgIdx,
    activeConvId,
    activeTree,
    isStreaming,
    editable,
    debugMode,
    edit,
    attachmentPreviewLoader,
  }: Props = $props();

  function formatTime(ts: number) {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  let siblingInfo = $derived(
    activeConvId ? getSiblingInfoForUserMessage(activeTree, msg.id) : null,
  );
  let attachmentItems = $derived(msg.items?.filter((item) => item.type === "attachment") ?? []);
  let attachments = $derived(attachmentItems.map((item) => item.attachment));
  let quoteItems = $derived(msg.items?.filter((item) => item.type === "quote") ?? []);
  let contexts = $derived(quoteItems.map((item) => item.context));
  let contentReferences = $derived(attachmentReferenceMap(attachments));
  let isEditingThisMessage = $derived(edit.editingMsgId === msg.id);
  let retainedAttachmentCount = $derived(
    attachments.filter((attachment) => !edit.removedAttachmentPaths.has(attachment.path)).length,
  );
  let retainedContextCount = $derived(
    contexts.filter((context) => !edit.removedContextKeys.has(edit.contextKey(context))).length,
  );
  let isDirty = $derived(
    isEditingThisMessage &&
      (edit.editingText !== msg.content ||
        edit.removedAttachmentPaths.size > 0 ||
        edit.removedContextKeys.size > 0),
  );
  let canSubmitEdit = $derived(
    isDirty &&
      (edit.editingText.trim().length > 0 ||
        retainedAttachmentCount > 0 ||
        retainedContextCount > 0),
  );
</script>

<div class="user-msg message-record" id={`message-${msg.id}`} data-message-id={msg.id}>
  {#if contexts.length > 0}
    <div class="user-contexts">
      {#each contexts.filter((context) => !isEditingThisMessage || !edit.removedContextKeys.has(edit.contextKey(context))) as context (edit.contextKey(context))}
        <UserQuote
          {context}
          onRemove={!editable || isStreaming || !isEditingThisMessage
            ? undefined
            : () => edit.stageContextRemoval(msg, context)}
        />
      {/each}
    </div>
  {/if}
  {#if edit.editingMsgId === msg.id}
    <textarea
      bind:this={edit.editingTextarea}
      class="user-content-edit bg-conversation-component"
      value={edit.editingText}
      readonly={isStreaming}
      oninput={(e) => {
        edit.editingText = e.currentTarget.value;
      }}
      onkeydown={(e) => {
        if (e.key === "Enter" && !e.shiftKey && canSubmitEdit) {
          e.preventDefault();
          edit.commitEdit(activeConvId!, msgIdx, attachments, contexts);
        } else if (e.key === "Escape") {
          edit.cancelEdit();
          (e.currentTarget as HTMLTextAreaElement).blur();
        }
      }}></textarea>
  {:else if editable}
    <Tooltip text={$t("editMsgTitle")}>
      {#snippet trigger(props)}
        <div
          {...props}
          class="user-content bg-conversation-component"
          class:collapsed={edit.isUserMessageCollapsed(msg)}
          role="button"
          tabindex="0"
          aria-label={$t("editMsgTitle")}
          onclick={() => edit.startEdit(msg)}
          onkeydown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              edit.startEdit(msg);
            }
          }}
        >
          <span
            class="user-content-text composer-md"
            use:renderUserContent={{
              content: msg.content,
              references: contentReferences,
            }}
          ></span>
          <span class="user-edit-hint" aria-hidden="true">
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              width="13"
              height="13"
            >
              <path d="M11.5 2.5a1.4 1.4 0 0 1 2 2L6 12l-3 .75.75-3 7.75-7.25Z" />
              <path d="m10 4 2 2" />
            </svg>
          </span>
        </div>
      {/snippet}
    </Tooltip>
  {:else}
    <div
      class="user-content readonly bg-conversation-component"
      class:collapsed={edit.isUserMessageCollapsed(msg)}
    >
      <span
        class="user-content-text composer-md"
        use:renderUserContent={{ content: msg.content, references: contentReferences }}
      ></span>
    </div>
  {/if}
  {#if attachments.length > 0}
    <div class="user-attachments">
      {#each attachments.filter((attachment) => !isEditingThisMessage || !edit.removedAttachmentPaths.has(attachment.path)) as attachment (attachment.path)}
        <AttachmentPreview
          {attachment}
          loadPreview={attachmentPreviewLoader}
          onRemove={!editable || isStreaming
            ? undefined
            : () => edit.stageAttachmentRemoval(msg, attachment.path)}
        />
      {/each}
    </div>
  {/if}
  {#if isLongUserMessage(msg.content) && edit.editingMsgId !== msg.id}
    <button
      class="user-collapse-btn"
      type="button"
      aria-expanded={!edit.isUserMessageCollapsed(msg)}
      onclick={(e) => {
        e.stopPropagation();
        edit.toggleUserMessage(msg.id);
      }}>{edit.isUserMessageCollapsed(msg) ? $t("expandSection") : $t("collapseSection")}</button
    >
  {/if}
  <div class="edit-actions" class:show={isDirty}>
    <button class="edit-cancel-btn" type="button" onclick={edit.cancelEdit}>{$t("cancel")}</button>
    <button
      class="edit-confirm-btn"
      type="button"
      disabled={!canSubmitEdit}
      onclick={() => edit.commitEdit(activeConvId!, msgIdx, attachments, contexts)}
      >{$t("send")}</button
    >
  </div>
  <div class="msg-meta-row">
    {#if debugMode && msg.checkpointId}
      <Tooltip text={msg.checkpointId}>
        <code class="debug-checkpoint">checkpoint: {msg.checkpointId}</code>
      </Tooltip>
    {/if}
    {#if siblingInfo}
      <div class="msg-branch-nav">
        <Tooltip text={isStreaming ? $t("branchLockedWhileStreaming") : ""}>
          <button
            class="branch-nav-btn"
            disabled={siblingInfo.activeIdx === 0 || isStreaming}
            onclick={() => edit.switchBranch(siblingInfo.parentKey, siblingInfo.activeIdx - 1)}
            >‹</button
          >
        </Tooltip>
        <span class="branch-nav-label"
          >{siblingInfo.activeIdx + 1} / {siblingInfo.siblings.length}</span
        >
        <Tooltip text={isStreaming ? $t("branchLockedWhileStreaming") : ""}>
          <button
            class="branch-nav-btn"
            disabled={siblingInfo.activeIdx === siblingInfo.siblings.length - 1 || isStreaming}
            onclick={() => edit.switchBranch(siblingInfo.parentKey, siblingInfo.activeIdx + 1)}
            >›</button
          >
        </Tooltip>
      </div>
    {/if}
    {#if msg.timestamp > 0}<span class="ts">{formatTime(msg.timestamp)}</span>{/if}
  </div>
</div>

<style>
  .debug-checkpoint {
    font-family: var(--font-mono, ui-monospace, monospace);
    overflow-wrap: anywhere;
  }

  .debug-checkpoint {
    margin-right: auto;
    color: var(--text-muted);
    font-size: 10px;
  }

  .user-msg {
    align-self: flex-end;
    max-width: 72%;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }

  .user-attachments {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
    margin-top: 6px;
  }

  .user-contexts {
    display: flex;
    width: min(100%, 680px);
    flex-direction: column;
    align-items: flex-end;
    gap: 5px;
    margin-bottom: 6px;
  }

  .user-content-edit {
    display: block;
    width: auto;
    max-width: 100%;
    box-sizing: border-box;
    border: 0;
    border-radius: var(--app-radius);
    padding: 9px 14px;
    margin: 0;
    font-family: inherit;
    font-size: 14px;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--text);
    line-height: 1.47;
    letter-spacing: -0.374px;
    text-align: left;
    resize: none;
    outline: none;
    overflow: hidden;
    field-sizing: content;
    -webkit-backdrop-filter: blur(12px) saturate(1.05);
    backdrop-filter: blur(12px) saturate(1.05);
    box-shadow: none;
    transition: box-shadow var(--motion-fast) var(--ease-standard);
  }
  .user-content {
    position: relative;
    width: auto;
    max-width: 100%;
    box-sizing: border-box;
    padding: 9px 14px;
    border: 0;
    border-radius: var(--app-radius);
    color: var(--text);
    font-size: 14px;
    line-height: 1.47;
    letter-spacing: -0.374px;
    cursor: text;
    text-align: left;
    outline: none;
    -webkit-backdrop-filter: blur(12px) saturate(1.05);
    backdrop-filter: blur(12px) saturate(1.05);
    box-shadow: none;
  }
  .user-edit-hint {
    position: absolute;
    top: 50%;
    right: calc(100% + 7px);
    display: inline-flex;
    width: 24px;
    height: 24px;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background: var(--control-surface);
    color: var(--text-muted);
    box-shadow: var(--control-shadow);
    opacity: 0;
    pointer-events: none;
    transform: translate(3px, -50%);
    transition:
      opacity var(--motion-fast) var(--ease-standard),
      transform var(--motion-fast) var(--ease-standard),
      color var(--motion-fast) var(--ease-standard);
  }
  .user-content:hover .user-edit-hint,
  .user-content:focus-visible .user-edit-hint {
    color: var(--text);
    opacity: 1;
    transform: translate(0, -50%);
  }
  .user-content:focus-visible {
    box-shadow: var(--focus-ring);
  }
  .user-content.readonly {
    cursor: default;
  }
  .user-content-text {
    display: block;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .user-content.collapsed .user-content-text {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: var(--user-message-collapse-lines);
    line-clamp: var(--user-message-collapse-lines);
    overflow: hidden;
  }
  .user-content.collapsed::after {
    content: "";
    position: absolute;
    right: 0;
    bottom: 9px;
    width: 64px;
    height: 2.2em;
    background: linear-gradient(90deg, transparent, var(--user-message-bg) 72%);
    pointer-events: none;
  }
  .user-collapse-btn {
    margin-top: 4px;
    padding: 2px 6px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--text-muted);
    font: inherit;
    font-size: 11px;
    cursor: pointer;
  }
  .user-collapse-btn:hover {
    background: var(--interactive-state-bg);
    color: var(--text);
  }
  .user-content-edit:not(:read-only):focus {
    box-shadow: var(--focus-ring);
  }
  .user-content-edit:read-only {
    cursor: default;
  }

  .edit-actions {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
    overflow: hidden;
    max-height: 0;
    opacity: 0;
    transform: translateY(6px);
    transition:
      max-height var(--motion-panel) var(--ease-standard),
      opacity var(--motion-panel) var(--ease-standard),
      transform var(--motion-panel) var(--ease-standard),
      margin-top var(--motion-panel) var(--ease-standard);
    pointer-events: none;
  }
  .edit-actions.show {
    max-height: 40px;
    margin-top: 5px;
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }
  .edit-cancel-btn,
  .edit-confirm-btn {
    padding: 4px 12px;
    border-radius: 6px;
    font-size: 12px;
    cursor: pointer;
    border: 0;
    background: var(--surface2);
    color: var(--text-muted);
    transition:
      background var(--motion-fast) var(--ease-standard),
      color var(--motion-fast) var(--ease-standard);
  }
  .edit-confirm-btn {
    background: var(--primary);
    color: white;
  }
  .edit-cancel-btn:hover {
    background: var(--interactive-state-bg);
    color: var(--text);
  }
  .edit-confirm-btn:hover:not(:disabled) {
    background: var(--primary-hover);
  }
  .edit-confirm-btn:disabled {
    cursor: default;
    opacity: 0.45;
  }

  .msg-meta-row {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }
  .msg-meta-row .ts {
    margin-top: 0;
  }

  .msg-branch-nav {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    color: var(--text-muted);
    font-size: 11px;
    user-select: none;
  }
  .branch-nav-btn {
    width: 18px;
    height: 18px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-muted);
    cursor: pointer;
    font-size: 13px;
    line-height: 1;
    padding: 0;
    transition:
      background var(--motion-fast) var(--ease-standard),
      color var(--motion-fast) var(--ease-standard);
  }
  .branch-nav-btn:hover:not(:disabled) {
    background: var(--interactive-state-bg);
    color: var(--text);
  }
  .branch-nav-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .branch-nav-label {
    min-width: 32px;
    text-align: center;
    letter-spacing: 0.2px;
  }
  .ts {
    font-size: 10px;
    color: var(--text-muted);
    margin-top: 4px;
    display: block;
    user-select: none;
  }
</style>

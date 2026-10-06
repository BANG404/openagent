import { tick } from "svelte";
import type { ChatAttachment, ChatMessage, UserMessageContext } from "$lib/types";
import { isLongUserMessage } from "./userContent";

interface Options {
  readonly activeConvId: string | null;
  readonly editable: boolean;
  readonly isStreaming: boolean;
  onCommitEdit: (
    convId: string,
    userMsgIdx: number,
    text: string,
    attachments: ChatAttachment[],
    contexts: UserMessageContext[],
  ) => void;
  onSwitchBranch: (convId: string, parentKey: string, targetIdx: number) => void;
}

export function createUserMessageEditor(options: Options) {
  let editingMsgId = $state<string | null>(null);
  let editingText = $state("");
  let removedAttachmentPaths = $state(new Set<string>());
  let removedContextKeys = $state(new Set<string>());
  let editingTextarea = $state<HTMLTextAreaElement | null>(null);
  let expandedUserMessageIds = $state(new Set<string>());

  $effect(() => {
    options.activeConvId;
    cancelEdit();
  });

  function cancelEdit() {
    editingMsgId = null;
    editingText = "";
    removedAttachmentPaths = new Set();
    removedContextKeys = new Set();
  }

  function contextKey(context: UserMessageContext): string {
    return `${context.sourceMessageId ?? ""}\u0000${context.text}`;
  }

  function commitEdit(
    convId: string,
    userMsgIdx: number,
    attachments: ChatAttachment[],
    contexts: UserMessageContext[],
  ) {
    const text = editingText;
    const retainedAttachments = attachments.filter(
      (attachment) => !removedAttachmentPaths.has(attachment.path),
    );
    const retainedContexts = contexts.filter(
      (context) => !removedContextKeys.has(contextKey(context)),
    );
    cancelEdit();
    options.onCommitEdit(convId, userMsgIdx, text, retainedAttachments, retainedContexts);
  }

  function switchBranch(parentKey: string, targetIdx: number) {
    // The selected branch can render a different version of the same turn.
    // Never carry an editor from the previous branch into that new message.
    cancelEdit();
    options.onSwitchBranch(options.activeConvId!, parentKey, targetIdx);
  }

  async function startEdit(msg: ChatMessage) {
    if (!options.editable || options.isStreaming) return;
    editingMsgId = msg.id;
    editingText = msg.content;
    removedAttachmentPaths = new Set();
    removedContextKeys = new Set();
    await tick();
    editingTextarea?.focus();
  }

  async function stageAttachmentRemoval(msg: ChatMessage, attachmentPath: string) {
    if (options.isStreaming) return;
    if (editingMsgId !== msg.id) {
      editingMsgId = msg.id;
      editingText = msg.content;
      removedAttachmentPaths = new Set();
      removedContextKeys = new Set();
    }
    removedAttachmentPaths = new Set([...removedAttachmentPaths, attachmentPath]);
    await tick();
    editingTextarea?.focus();
  }

  async function stageContextRemoval(msg: ChatMessage, context: UserMessageContext) {
    if (options.isStreaming) return;
    if (editingMsgId !== msg.id) {
      editingMsgId = msg.id;
      editingText = msg.content;
      removedAttachmentPaths = new Set();
      removedContextKeys = new Set();
    }
    removedContextKeys = new Set([...removedContextKeys, contextKey(context)]);
    await tick();
    editingTextarea?.focus();
  }

  function isUserMessageCollapsed(msg: ChatMessage) {
    return isLongUserMessage(msg.content) && !expandedUserMessageIds.has(msg.id);
  }

  function toggleUserMessage(msgId: string) {
    const next = new Set(expandedUserMessageIds);
    if (next.has(msgId)) next.delete(msgId);
    else next.add(msgId);
    expandedUserMessageIds = next;
  }

  return {
    get editingMsgId() {
      return editingMsgId;
    },
    get editingText() {
      return editingText;
    },
    set editingText(value: typeof editingText) {
      editingText = value;
    },
    get removedAttachmentPaths() {
      return removedAttachmentPaths;
    },
    get removedContextKeys() {
      return removedContextKeys;
    },
    get editingTextarea() {
      return editingTextarea;
    },
    set editingTextarea(value: typeof editingTextarea) {
      editingTextarea = value;
    },
    contextKey,
    cancelEdit,
    commitEdit,
    switchBranch,
    startEdit,
    stageAttachmentRemoval,
    stageContextRemoval,
    isUserMessageCollapsed,
    toggleUserMessage,
  };
}

export type UserMessageEditor = ReturnType<typeof createUserMessageEditor>;

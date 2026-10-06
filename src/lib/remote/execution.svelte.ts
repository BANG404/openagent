import type { OpenAgentClient, RemoteConversationState, RemoteInterrupt } from "$lib/openagent";
import type { ChatAttachment, ChatMessage, StreamItem, UserMessageContext } from "$lib/types";
import type { ConvTree } from "$lib/checkpointTree";
import {
  findForkParentCheckpointId,
  getActiveTipNode,
  findUserMessageIndexForAssistant,
} from "$lib/checkpointTree";
import {
  enqueueChatMessage,
  dequeueChatMessage,
  removeQueuedChatMessage,
  clearQueuedChatMessages,
  type QueuedChatMessages,
} from "$lib/chatQueue";
import { decodeModelBinding } from "$lib/modelBinding";
import { tr } from "$lib/i18n";
import { randomUuid } from "$lib/uuid";
import { InterruptResolutionTracker } from "$lib/interruptResolutionTracker";

export type OptimisticInterruptResolution = { state: "answered" | "cancelled"; response: unknown };

interface ExecutionOptions {
  client: OpenAgentClient;
  conversation: RemoteConversationState | null;
  instruction: string;
  attachments: ChatAttachment[];
  contexts: UserMessageContext[];
  selectedModel: string;
  busy: boolean;
  error: string;
  commandNotice: string;
  readonly activeInterrupt: RemoteInterrupt | null;
  readonly running: boolean;
  readonly projectedMessages: ChatMessage[];
  readonly remoteHistory: { readonly activeTree: ConvTree | undefined };
  createConversation: () => Promise<string>;
  loadConversationHistory: (convId: string) => Promise<void>;
  perform: (action: () => Promise<void>) => Promise<void>;
}

/** Owns submission, queueing, fork execution, and interrupt recovery for one remote surface. */
export function createRemoteExecutionController(options: ExecutionOptions) {
  let optimisticUser = $state<ChatMessage | null>(null);
  let pendingAssistantMessageId = $state<string | null>(null);
  let streamPaused = $state(false);
  let forkDisplayMessages = $state<ChatMessage[] | null>(null);
  let queuedChatMessages = $state<QueuedChatMessages>({});
  let resolvingInterrupts = $state<Record<string, OptimisticInterruptResolution>>({});
  const interruptResolutions = new InterruptResolutionTracker();
  function selectedModelBinding() {
    return options.selectedModel ? decodeModelBinding(options.selectedModel) : null;
  }
  async function sendInstruction() {
    const text =
      options.instruction.trim() ||
      (options.attachments.length > 0
        ? tr("attachmentOnlyPrompt")
        : options.contexts.length > 0
          ? tr("quoteOnlyPrompt")
          : "");
    if (
      (!text && options.attachments.length === 0 && options.contexts.length === 0) ||
      options.activeInterrupt ||
      options.busy
    )
      return;
    if (options.running) {
      if (!options.conversation) return;
      queuedChatMessages = enqueueChatMessage(queuedChatMessages, options.conversation.conv_id, {
        text,
        attachments: options.attachments,
        contexts: options.contexts,
        model: options.selectedModel,
      });
      options.instruction = "";
      options.attachments = [];
      options.contexts = [];
      if (streamPaused) await setStreamPaused(false);
      return;
    }
    options.busy = true;
    options.error = "";
    options.commandNotice = "";
    const submittedAttachments = options.attachments;
    const submittedContexts = options.contexts;
    const submittedText = text;
    try {
      const convId = options.conversation?.conv_id ?? (await options.createConversation());
      const userMessageId = randomUuid();
      const assistantMessageId = randomUuid();
      optimisticUser = {
        id: userMessageId,
        role: "user",
        content: text,
        timestamp: Date.now(),
        items: [
          ...(text ? [{ type: "text" as const, content: text }] : []),
          ...submittedContexts.map((context) => ({ type: "quote" as const, context })),
          ...submittedAttachments.map((attachment) => ({
            type: "attachment" as const,
            attachment,
          })),
        ],
      };
      pendingAssistantMessageId = assistantMessageId;
      options.instruction = "";
      options.attachments = [];
      options.contexts = [];
      const outcome = await options.client.submitInput({
        convId,
        text,
        attachments: submittedAttachments.map((attachment) => attachment.path),
        contexts: submittedContexts,
        modelBinding: selectedModelBinding(),
        userMessageId,
        assistantMessageId,
      });
      if (outcome.type === "immediate_command") {
        optimisticUser = null;
        pendingAssistantMessageId = null;
        options.commandNotice = outcome.changed
          ? tr("compactionCompleted")
          : tr("compactConversationSkipped");
        options.conversation = await options.client.getRemoteConversationState(convId);
        await options.loadConversationHistory(convId);
      }
    } catch (cause) {
      optimisticUser = null;
      pendingAssistantMessageId = null;
      options.instruction = submittedText;
      options.attachments = submittedAttachments;
      options.contexts = submittedContexts;
      options.error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      options.busy = false;
    }
  }

  async function sendNextQueuedMessage(convId: string) {
    if (options.conversation?.conv_id !== convId || options.activeInterrupt) return;
    const dequeued = dequeueChatMessage(queuedChatMessages, convId);
    queuedChatMessages = dequeued.queue;
    if (!dequeued.next) return;
    options.instruction = dequeued.next.text;
    options.attachments = dequeued.next.attachments;
    options.contexts = dequeued.next.contexts;
    options.selectedModel = dequeued.next.model;
    await sendInstruction();
  }

  function removeQueuedMessage(convId: string, index: number) {
    queuedChatMessages = removeQueuedChatMessage(queuedChatMessages, convId, index);
  }

  function clearQueuedMessages(convId: string) {
    queuedChatMessages = clearQueuedChatMessages(queuedChatMessages, convId);
  }

  async function forkConversationRun(
    userMessageIndex: number,
    text: string,
    sourceAttachments: ChatAttachment[],
    sourceContexts: UserMessageContext[],
  ) {
    if (!options.conversation || !options.remoteHistory.activeTree || options.running) return;
    const userMessage = options.projectedMessages[userMessageIndex];
    if (!userMessage || userMessage.role !== "user") return;
    const parentCheckpointId = findForkParentCheckpointId(
      options.remoteHistory.activeTree,
      userMessage.id,
    );
    if (parentCheckpointId === undefined) return;
    const sourceCheckpointId = getActiveTipNode(options.remoteHistory.activeTree)?.ckId;
    if (!sourceCheckpointId) return;
    const normalizedText = text.trim();
    if (!normalizedText && sourceAttachments.length === 0 && sourceContexts.length === 0) return;

    options.busy = true;
    options.error = "";
    const userMessageId = randomUuid();
    const assistantMessageId = randomUuid();
    forkDisplayMessages = options.projectedMessages.slice(0, userMessageIndex);
    optimisticUser = {
      id: userMessageId,
      role: "user",
      content: normalizedText,
      timestamp: Date.now(),
      items: [
        ...(normalizedText ? [{ type: "text" as const, content: normalizedText }] : []),
        ...sourceContexts.map((context) => ({ type: "quote" as const, context })),
        ...sourceAttachments.map((attachment) => ({ type: "attachment" as const, attachment })),
      ],
    };
    pendingAssistantMessageId = assistantMessageId;
    try {
      await options.client.forkRemoteConversationRun({
        convId: options.conversation.conv_id,
        text: normalizedText,
        sourceCheckpointId,
        parentCheckpointId,
        forkedFromMessageId: userMessage.id,
        attachments: sourceAttachments.map((attachment) => ({
          locator: attachment.path,
          name: attachment.name,
        })),
        contexts: sourceContexts,
        modelBinding: selectedModelBinding(),
        userMessageId,
        assistantMessageId,
      });
    } catch (cause) {
      forkDisplayMessages = null;
      optimisticUser = null;
      pendingAssistantMessageId = null;
      options.error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      options.busy = false;
    }
  }

  async function commitEdit(
    convId: string,
    userMessageIndex: number,
    text: string,
    editedAttachments: ChatAttachment[],
    editedContexts: UserMessageContext[],
  ) {
    if (options.conversation?.conv_id !== convId) return;
    await forkConversationRun(userMessageIndex, text, editedAttachments, editedContexts);
  }

  async function reExecute(convId: string, assistantMessageIndex: number) {
    if (options.conversation?.conv_id !== convId) return;
    const assistant = options.projectedMessages[assistantMessageIndex];
    if (!assistant || assistant.role !== "assistant") return;
    const userMessageIndex = findUserMessageIndexForAssistant(
      options.projectedMessages,
      assistantMessageIndex,
    );
    const userMessage = options.projectedMessages[userMessageIndex];
    if (!userMessage || userMessage.role !== "user") return;
    const sourceAttachments = (userMessage.items ?? [])
      .filter(
        (item): item is Extract<StreamItem, { type: "attachment" }> => item.type === "attachment",
      )
      .map((item) => item.attachment);
    const sourceContexts = (userMessage.items ?? [])
      .filter((item): item is Extract<StreamItem, { type: "quote" }> => item.type === "quote")
      .map((item) => item.context);
    await forkConversationRun(
      userMessageIndex,
      userMessage.content,
      sourceAttachments,
      sourceContexts,
    );
  }

  async function stopMessage() {
    if (!options.conversation || !options.running) return;
    const convId = options.conversation.conv_id;
    clearQueuedMessages(convId);
    await options.perform(() =>
      options.client.cancelRemoteConversation(options.conversation!.conv_id),
    );
  }

  async function setStreamPaused(paused: boolean) {
    if (!options.conversation || !options.running) return;
    const previous = streamPaused;
    streamPaused = paused;
    try {
      await options.client.setConversationStreamPaused(options.conversation.conv_id, paused);
    } catch (cause) {
      if (streamPaused === paused) streamPaused = previous;
      options.error = cause instanceof Error ? cause.message : String(cause);
    }
  }

  async function answer(requestId: string, values: Record<string, unknown>) {
    await resolveRemoteInterrupt(requestId, { values }, "answered");
  }

  async function cancelAnswer(requestId: string) {
    await resolveRemoteInterrupt(requestId, { cancelled: true }, "cancelled");
  }

  async function cancelInlineInterrupt(requestId: string) {
    if (options.activeInterrupt?.kind === "tool_approval") await approve(requestId, false);
    else await cancelAnswer(requestId);
  }

  async function approve(requestId: string, approved: boolean) {
    await resolveRemoteInterrupt(requestId, { values: { approved } }, "answered");
  }

  async function resolveRemoteInterrupt(
    requestId: string,
    response: unknown,
    state: "answered" | "cancelled",
  ) {
    if (!options.conversation) return;
    const convId = options.conversation.conv_id;
    const resolution = interruptResolutions.begin(requestId, convId);
    if (!resolution) return;
    resolvingInterrupts = { ...resolvingInterrupts, [requestId]: { state, response } };
    options.busy = true;
    options.error = "";
    const assistantMessageId = pendingAssistantMessageId ?? randomUuid();
    if (resolution.firstForConversation) pendingAssistantMessageId = assistantMessageId;
    try {
      await options.client.resumeInterrupt({
        convId,
        interruptId: requestId,
        response: JSON.stringify(response),
        assistantMessageId,
      });
    } catch (cause) {
      const { [requestId]: _failed, ...remaining } = resolvingInterrupts;
      resolvingInterrupts = remaining;
      if (!interruptResolutions.hasOtherInConversation(convId, requestId)) {
        pendingAssistantMessageId = null;
      }
      options.error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      interruptResolutions.finish(requestId);
      options.busy = interruptResolutions.size > 0;
    }
  }

  return {
    get optimisticUser() {
      return optimisticUser;
    },
    set optimisticUser(next) {
      optimisticUser = next;
    },
    get pendingAssistantMessageId() {
      return pendingAssistantMessageId;
    },
    set pendingAssistantMessageId(next) {
      pendingAssistantMessageId = next;
    },
    get streamPaused() {
      return streamPaused;
    },
    set streamPaused(next) {
      streamPaused = next;
    },
    get forkDisplayMessages() {
      return forkDisplayMessages;
    },
    set forkDisplayMessages(next) {
      forkDisplayMessages = next;
    },
    get queuedChatMessages() {
      return queuedChatMessages;
    },
    set queuedChatMessages(next) {
      queuedChatMessages = next;
    },
    get resolvingInterrupts() {
      return resolvingInterrupts;
    },
    set resolvingInterrupts(next) {
      resolvingInterrupts = next;
    },
    sendInstruction,
    sendNextQueuedMessage,
    removeQueuedMessage,
    clearQueuedMessages,
    commitEdit,
    reExecute,
    stopMessage,
    setStreamPaused,
    answer,
    cancelAnswer,
    cancelInlineInterrupt,
    approve,
  };
}

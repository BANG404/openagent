import type { OpenAgentClient, RemoteConversationState, RemoteInterrupt } from "$lib/openagent";
import type { ChatAttachment, ChatMessage, StreamItem, UserMessageContext } from "$lib/types";
import type { ConvTree } from "$lib/checkpointTree";
import {
  findForkParentCheckpointId,
  getActiveTipNode,
  findUserMessageIndexForAssistant,
} from "$lib/checkpointTree";
import { createInputQueueController } from "$lib/inputQueue.svelte";
import type { InputDelivery } from "$lib/openagent";
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
  const inputQueue = createInputQueueController(options.client);
  let resolvingInterrupts = $state<Record<string, OptimisticInterruptResolution>>({});
  const interruptResolutions = new InterruptResolutionTracker();
  function selectedModelBinding() {
    return options.selectedModel ? decodeModelBinding(options.selectedModel) : null;
  }
  async function submitInstruction(delivery: InputDelivery) {
    const text =
      options.instruction.trim() ||
      (options.attachments.length
        ? tr("attachmentOnlyPrompt")
        : options.contexts.length
          ? tr("quoteOnlyPrompt")
          : "");
    if (!text || options.busy || options.activeInterrupt) return;
    const sourceConvId = options.conversation?.conv_id;
    if (sourceConvId && inputQueue.pending[sourceConvId]) return;
    const paused = streamPaused;
    const submittedInstruction = options.instruction;
    const submittedAttachments = options.attachments;
    const submittedContexts = options.contexts;
    const modelBinding = delivery === "steer" ? null : selectedModelBinding();
    const expectedRunId = sourceConvId ? inputQueue.snapshots[sourceConvId]?.activeRunId : null;
    const enqueue = delivery === "steer" || options.running;
    options.busy = true;
    options.error = "";
    try {
      const convId = sourceConvId ?? (await options.createConversation());
      const input = {
        convId,
        text,
        attachments: submittedAttachments.map((attachment) => attachment.path),
        contexts: submittedContexts,
        modelBinding,
      };
      if (enqueue) {
        await inputQueue.submit(input, delivery, delivery === "steer" ? expectedRunId : undefined);
      } else {
        const userMessageId = randomUuid();
        const assistantMessageId = randomUuid();
        optimisticUser = {
          id: userMessageId,
          role: "user",
          content: text,
          timestamp: Date.now(),
          items: [
            ...submittedContexts.map((context) => ({ type: "quote" as const, context })),
            ...submittedAttachments.map((attachment) => ({
              type: "attachment" as const,
              attachment,
            })),
          ],
        };
        pendingAssistantMessageId = assistantMessageId;
        try {
          await options.client.submitInput({ ...input, userMessageId, assistantMessageId });
        } catch (cause) {
          if (pendingAssistantMessageId === assistantMessageId) {
            optimisticUser = null;
            pendingAssistantMessageId = null;
          }
          throw cause;
        }
      }
      if (paused && options.conversation?.conv_id === convId) await setStreamPaused(false);
      if (
        options.conversation?.conv_id === convId &&
        options.instruction === submittedInstruction &&
        options.attachments === submittedAttachments &&
        options.contexts === submittedContexts
      ) {
        options.instruction = "";
        options.attachments = [];
        options.contexts = [];
      }
    } catch (cause) {
      options.error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      options.busy = false;
    }
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
    inputQueue,
    get resolvingInterrupts() {
      return resolvingInterrupts;
    },
    set resolvingInterrupts(next) {
      resolvingInterrupts = next;
    },
    sendInstruction: () => submitInstruction("next_turn"),
    steerInstruction: () => submitInstruction("steer"),
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

import type { ChatRunStartedEvent } from "../openagent";
import type { ChatMessage, Conversation } from "../types";
import { insertProjectedUserMessage } from "./chatProjection";

export interface ChatRunStartOptions {
  readonly workspacePath: string;
  conversations: Conversation[];
  readonly loadedConvIds: Set<string>;
  now: () => number;
  newConversationLabel: () => string;
  promoteConversation: (conversation: Conversation) => void;
  selectRole: (convId: string, roleId: string | null | undefined) => void;
  startStream: (convId: string, assistantId: string, startedAt: number) => void;
  loadMessages: (convId: string, loading: boolean) => Promise<void>;
}

/** Shared consumer projection; role/recents/usage remain host affordances. */
export function createChatRunStart(options: ChatRunStartOptions) {
  return (event: ChatRunStartedEvent): void => {
    if (event.workspace !== options.workspacePath) return;
    const startedAt = options.now();
    const userMessage: ChatMessage | undefined =
      event.user_visible === false
        ? undefined
        : {
            id: event.msg_id,
            role: "user",
            content: event.message,
            timestamp: startedAt,
          };
    const insertUserMessage = () => {
      if (userMessage)
        options.conversations = insertProjectedUserMessage(
          options.conversations,
          event.conv_id,
          userMessage,
          event.asst_msg_id,
          options.now(),
        );
    };
    const incoming: Conversation = {
      id: event.conv_id,
      title: event.title || options.newConversationLabel(),
      messages: userMessage ? [userMessage] : [],
      createdAt: event.created_at * 1000,
      updatedAt: startedAt,
      pinned: event.pinned,
      parentConvId: event.parent_conv_id ?? undefined,
      compactedFromConvId: event.compacted_from_conv_id ?? undefined,
      flowKind: event.flow_kind ?? undefined,
      flowStatus: event.flow_status ?? undefined,
      roleId: event.role_id ?? undefined,
    };
    const index = options.conversations.findIndex(
      (conversation) => conversation.id === event.conv_id,
    );
    if (index === -1) options.conversations = [incoming, ...options.conversations];
    else {
      const existing = options.conversations[index];
      options.conversations[index] = {
        ...existing,
        title: event.title || existing.title,
        pinned: event.pinned,
        parentConvId: event.parent_conv_id ?? undefined,
        compactedFromConvId: event.compacted_from_conv_id ?? undefined,
        flowKind: event.flow_kind ?? undefined,
        flowStatus:
          event.flow_status ??
          (existing.flowStatus === "pending" ? "running" : existing.flowStatus),
        roleId: event.role_id ?? undefined,
        updatedAt: startedAt,
      };
      insertUserMessage();
    }
    options.promoteConversation(index === -1 ? incoming : options.conversations[index]);
    options.selectRole(event.conv_id, event.role_id);
    options.startStream(event.conv_id, event.asst_msg_id, startedAt);
    if (event.is_new) options.loadedConvIds.add(event.conv_id);
    else if (!options.loadedConvIds.has(event.conv_id)) {
      void options.loadMessages(event.conv_id, false).finally(insertUserMessage);
    }
  };
}

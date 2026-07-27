// Pure converters + thin Tauri-fetch wrappers for conversation persistence.
// All state mutation stays in the calling component.

import { invoke } from "$lib/openagent/tauriClient";
import type {
  Conversation,
  ConversationMeta,
  ConversationPage,
  ConversationPageCursor,
  FileChange,
  RenderableCheckpoint,
} from "./types";

export function metaToConversation(m: ConversationMeta): Conversation {
  return {
    id: m.id,
    title: m.title,
    messages: [],
    createdAt: m.created_at * 1000,
    updatedAt: m.updated_at * 1000,
    pinned: m.pinned,
    parentConvId: m.parent_conv_id,
    compactedFromConvId: m.compacted_from_conv_id,
    flowKind: m.flow_kind,
    flowStatus: m.flow_status,
    roleId: m.role_id,
  };
}

export async function fetchConversationPage(
  wsPath: string | null,
  cursor: ConversationPageCursor | null = null,
  limit = 30,
  searchQuery: string | null = null,
  filterByRole = false,
  roleId: string | null = null,
): Promise<{ conversations: Conversation[]; nextCursor: ConversationPageCursor | null }> {
  const page = await invoke<ConversationPage>("get_conversation_page", {
    workspace: wsPath || null,
    cursor,
    limit,
    searchQuery,
    filterByRole,
    roleId,
  });
  return {
    conversations: page.items.map(metaToConversation),
    nextCursor: page.next_cursor,
  };
}

export async function fetchConversationMeta(convId: string): Promise<Conversation | null> {
  const meta = await invoke<ConversationMeta | null>("get_conversation_meta", { convId });
  return meta ? metaToConversation(meta) : null;
}

export async function fetchChildConversations(
  parentConvId: string,
  wsPath: string | null,
): Promise<Conversation[]> {
  const metadata = await invoke<ConversationMeta[]>("get_child_conversations", {
    parentConvId,
    workspace: wsPath,
  });
  return metadata.map(metaToConversation);
}

export async function fetchRenderableCheckpoints(convId: string): Promise<RenderableCheckpoint[]> {
  return invoke<RenderableCheckpoint[]>("get_renderable_checkpoints", { convId });
}

export async function fetchFileChanges(convId: string): Promise<FileChange[]> {
  return invoke<FileChange[]>("get_file_changes", { convId });
}

export async function revertFileChange(changeId: string): Promise<string> {
  return invoke<string>("revert_file_change", { changeId });
}

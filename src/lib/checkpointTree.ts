// Conversation as a tree of recovery checkpoints. One logical Turn may span
// several nodes while tools, interrupts, and resumes advance the same branch.
// Turn metadata is reduced along the selected path and attached to its stable
// response message before the product transcript is rendered.

import { appendChunk } from "./chatStream";
import { normalizeCheckpointFlow, type CheckpointFlow } from "./checkpointFlow";
import type {
  ChatMessage,
  CheckpointMetadataFields,
  CheckpointMessage,
  CheckpointTurnMetadata,
  RenderableCheckpoint,
  StreamItem,
  UserInputRequest,
} from "./types";

export const ROOT_KEY = "__root__";

/**
 * A background checkpoint reconciliation can finish after the next queued turn
 * has already inserted its optimistic user message. Preserve only messages
 * created after that reconciliation started; everything from the captured
 * prefix is replaced by the durable snapshot.
 */
export function preserveMessagesAddedDuringHydration(
  visible: ChatMessage[],
  hydrated: ChatMessage[],
  messageIdsAtStart?: ReadonlySet<string>,
): ChatMessage[] {
  if (!messageIdsAtStart) return hydrated;
  const hydratedIds = new Set(hydrated.map((message) => message.id));
  const appended = visible.filter(
    (message) => !messageIdsAtStart.has(message.id) && !hydratedIds.has(message.id),
  );
  return appended.length > 0 ? [...hydrated, ...appended] : hydrated;
}

export interface CkTreeNode {
  ckId: string;
  parentCkId: string | null;
  createdAt: number;
  user?: ChatMessage;
  assistant?: ChatMessage;
  systemMessages?: ChatMessage[];
  flowKind?: "goal" | "graph" | "graph-node";
  flowStatus?: string;
  flow?: CheckpointFlow;
  turn?: CheckpointTurnMetadata;
  /** User-visible messages in this checkpoint's complete self-contained snapshot. */
  timelineMessages: ChatMessage[];
  /** Whether timelineMessages contains the complete parent snapshot as well. */
  isSelfContainedSnapshot: boolean;
  childIds: string[]; // sorted by createdAt ASC
}

export interface ConvTree {
  nodes: Record<string, CkTreeNode>;
  rootIds: string[]; // ckIds whose parentCkId is null
  activeChild: Record<string, number>; // parentCkId (or ROOT_KEY) → index into childIds/rootIds
}

function checkpointTurnMetadata(metadata: string): CheckpointTurnMetadata | undefined {
  try {
    const parsed = JSON.parse(metadata) as Partial<CheckpointMetadataFields>;
    const turn = parsed.turn;
    return turn && typeof turn.id === "string" ? turn : undefined;
  } catch {
    return undefined;
  }
}

export function isCompactionBoundary(message: ChatMessage): boolean {
  if (!message.checkpointId) return false;
  return (
    (message.role === "system" || message.role === "user") &&
    message.tags?.includes("context_compaction") === true
  );
}

function isHiddenCheckpointRecord(record: CheckpointMessage): boolean {
  // Legacy compaction system messages are restoration-only. Tagged replay
  // users remain durable UI boundaries so MessageList can place the divider
  // inside a continued assistant reply without exposing a user-authored turn.
  return (
    record.role === "system" ||
    record.tags.includes("goal_continuation") ||
    record.tags.includes("graph_continuation") ||
    record.tags.includes("graph_node_bootstrap") ||
    record.tags.includes("graph_node_continuation")
  );
}

function normalizeAskUserOptions(options: unknown): unknown {
  if (!Array.isArray(options)) return options;
  return options.flatMap((option) => {
    if (typeof option === "string") return [option];
    if (!option || typeof option !== "object" || Array.isArray(option)) return [];
    const record = option as Record<string, unknown>;
    const value =
      typeof record.value === "string"
        ? record.value
        : typeof record.label === "string"
          ? record.label
          : null;
    return value === null ? [] : [value];
  });
}

function normalizeAskUserFields(fields: unknown): unknown {
  if (!Array.isArray(fields)) return fields;
  return fields.map((field) => {
    if (!field || typeof field !== "object" || Array.isArray(field)) return field;
    const record = field as Record<string, unknown>;
    if (record.type !== "select" && record.type !== "checkbox_group") return field;
    return { ...record, options: normalizeAskUserOptions(record.options) };
  });
}

export function askUserRequestFromToolUse(
  part: Record<string, unknown>,
  convId: string | null = null,
): UserInputRequest | null {
  if (
    part.name !== "ask_user" ||
    !part.input ||
    typeof part.input !== "object" ||
    Array.isArray(part.input)
  ) {
    return null;
  }
  const request: Record<string, unknown> = {
    ...(part.input as Record<string, unknown>),
    request_id: String(part.id ?? ""),
    conv_id: convId,
    kind: "ask_user" as const,
  };
  request.fields = normalizeAskUserFields(request.fields);
  return request.request_id && Array.isArray(request.fields)
    ? (request as unknown as UserInputRequest)
    : null;
}

function parsePersistedUserInputResponse(result: string): unknown {
  try {
    return JSON.parse(result);
  } catch {
    return result;
  }
}

function recordToMessage(
  r: CheckpointMessage,
  checkpointId: string,
  convId: string | null = null,
): ChatMessage {
  let content = "";
  const derivedItems: StreamItem[] = persistedItems(r.items);
  for (const part of r.content) {
    if (part.type === "text" && typeof part.text === "string") {
      // Host-added attachment labels and draft context follow the user's first
      // text block and are provider-only. Assistant text blocks all render.
      if (r.role !== "user" || !content) {
        content += part.text;
        derivedItems.push(...appendChunk([], part.text));
      }
    } else if (part.type === "attachment") {
      derivedItems.push({
        type: "attachment",
        attachment: {
          path: String(part.blob_id ?? ""),
          name: String(part.name ?? "attachment"),
          kind: part.kind === "image" ? "image" : "document",
          mimeType: typeof part.mime_type === "string" ? part.mime_type : undefined,
        },
      });
    } else if (part.type === "reasoning" && typeof part.text === "string") {
      derivedItems.push({ type: "thinking", content: part.text });
    } else if (part.type === "tool_use") {
      const askUserRequest = askUserRequestFromToolUse(part, convId);
      if (askUserRequest) {
        derivedItems.push({ type: "user_input", request: askUserRequest, state: "pending" });
      } else {
        derivedItems.push({
          type: "tool_call",
          name: String(part.name ?? "tool"),
          args: JSON.stringify(part.input ?? {}),
          toolUseId: String(part.id ?? ""),
        });
      }
    } else if (part.type === "tool_result") {
      derivedItems.push({
        type: "tool_call",
        name: "tool_result",
        args: JSON.stringify({ tool_use_id: part.tool_use_id ?? "" }),
        result: toolResultText(part.content),
      });
    } else if (part.type === "runtime_error" || part.type === "runtime_interrupted") {
      derivedItems.push({
        type: "runtime_notice",
        kind: part.type === "runtime_error" ? "error" : "interrupted",
        reason: String(part.reason ?? ""),
      });
    }
  }
  const isToolResult = r.content.some((part) => part.type === "tool_result");
  return {
    id: r.id,
    role: isToolResult ? "assistant" : (r.role as ChatMessage["role"]),
    content,
    timestamp: r.timestamp,
    items: derivedItems.length ? derivedItems : undefined,
    aborted: r.status === "aborted" || undefined,
    checkpointId,
    firstTokenAt: r.first_token_at ?? undefined,
    completedAt: r.completed_at ?? undefined,
    tags: r.tags,
    agentTag: r.tags[0],
  };
}

/** Project one complete checkpoint snapshot into the shared chat display model. */
export function checkpointRecordsToMessages(
  records: CheckpointMessage[],
  checkpointId: string,
  convId: string | null = null,
): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (const record of orderCheckpointRecords(records)) {
    const isCompactionBoundaryRecord =
      record.role === "system" && record.tags.includes("context_compaction");
    if (isCompactionBoundaryRecord || isHiddenCheckpointRecord(record)) continue;
    const toolResults = record.content.filter((part) => part.type === "tool_result");
    if (
      toolResults.length > 0 &&
      toolResults.every((part) => {
        const toolUseId = String(part.tool_use_id ?? "");
        return (
          Boolean(toolUseId) &&
          attachPersistedToolResult(messages, toolUseId, toolResultText(part.content))
        );
      })
    )
      continue;
    messages.push(recordToMessage(record, checkpointId, convId));
  }
  return messages;
}

function persistedItems(items: string | null | undefined): StreamItem[] {
  if (!items) return [];
  try {
    const parsed: unknown = JSON.parse(items);
    return Array.isArray(parsed) ? (parsed as StreamItem[]) : [];
  } catch {
    return [];
  }
}

function toolResultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item),
    )
    .map((item) => {
      if (item.type === "text" && typeof item.text === "string") return item.text;
      if (item.type === "json" && "value" in item) {
        try {
          return JSON.stringify(item.value) ?? String(item.value);
        } catch {
          return String(item.value);
        }
      }
      if (item.type === "image") return "[image]";
      return "";
    })
    .filter((item) => item.length > 0)
    .join("\n");
}

function attachPersistedToolResult(
  messages: ChatMessage[],
  toolUseId: string,
  result: string,
): boolean {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex--) {
    const message = messages[messageIndex];
    if (!message.items) continue;
    const itemIndex = message.items.findIndex(
      (item) =>
        (item.type === "tool_call" && item.toolUseId === toolUseId && item.result === undefined) ||
        (item.type === "user_input" &&
          item.request.request_id === toolUseId &&
          item.state === "pending"),
    );
    if (itemIndex < 0) continue;
    const items = [...message.items];
    const item = items[itemIndex];
    if (item.type === "tool_call") {
      items[itemIndex] = { ...item, result };
    } else if (item.type === "user_input") {
      const response = parsePersistedUserInputResponse(result);
      const cancelled =
        Boolean(
          response &&
          typeof response === "object" &&
          !Array.isArray(response) &&
          (response as Record<string, unknown>).cancelled === true,
        ) ||
        (typeof response === "string" &&
          response.includes("was not approved because the user continued the conversation"));
      items[itemIndex] = {
        ...item,
        state: cancelled ? "cancelled" : "answered",
        response,
      };
    } else {
      continue;
    }
    messages[messageIndex] = { ...message, items };
    return true;
  }
  return false;
}

// Checkpoints written before frontend hints gained positional insertion placed
// them after the final assistant record. Repair that legacy layout while
// reading so existing conversations replay in the original retry order.
function orderCheckpointRecords(records: CheckpointMessage[]): CheckpointMessage[] {
  return records;
}

// Build the recovery tree from complete checkpoint snapshots and metadata.
export function buildTreeFromCheckpoints(
  checkpoints: RenderableCheckpoint[],
  previousTree?: ConvTree,
): ConvTree {
  const nodes: Record<string, CkTreeNode> = {};
  const checkpointsById = new Map(
    checkpoints.map((checkpoint) => [checkpoint.meta.checkpoint_id, checkpoint]),
  );
  for (const checkpoint of checkpoints) {
    const m = checkpoint.meta;
    nodes[m.checkpoint_id] = {
      ckId: m.checkpoint_id,
      parentCkId: m.parent_checkpoint_id,
      createdAt: m.created_at,
      flowKind:
        checkpoint.data.flow?.kind === "goal" &&
        typeof checkpoint.data.flow.state.graph_node_id === "string"
          ? "graph-node"
          : checkpoint.data.flow?.kind,
      flowStatus:
        typeof checkpoint.data.flow?.state.status === "string"
          ? checkpoint.data.flow.state.status
          : undefined,
      flow: checkpoint.data.flow
        ? normalizeCheckpointFlow(checkpoint.data.flow.kind, checkpoint.data.flow.state)
        : undefined,
      turn: checkpointTurnMetadata(m.metadata),
      timelineMessages: [],
      isSelfContainedSnapshot: false,
      childIds: [],
    };
  }

  for (const checkpoint of checkpoints) {
    const ckId = checkpoint.meta.checkpoint_id;
    const node = nodes[ckId];
    const records = orderCheckpointRecords(checkpoint.data.messages);
    for (const record of records) {
      const isCompactionBoundaryRecord =
        record.role === "system" && record.tags.includes("context_compaction");
      if (isCompactionBoundaryRecord) {
        continue;
      }
      // System context remains in the durable checkpoint stream for
      // restoration, but is never a chat UI message. A tagged replayed user
      // record is intentionally retained as the visible compaction boundary.
      if (isHiddenCheckpointRecord(record)) continue;
      const toolResults = record.content.filter((part) => part.type === "tool_result");
      if (
        toolResults.length > 0 &&
        toolResults.every((part) => {
          const toolUseId = String(part.tool_use_id ?? "");
          return (
            Boolean(toolUseId) &&
            attachPersistedToolResult(
              node.timelineMessages,
              toolUseId,
              toolResultText(part.content),
            )
          );
        })
      ) {
        continue;
      }
      const message = recordToMessage(record, ckId);
      node.timelineMessages.push(message);
      if (record.role === "user") node.user = message;
      else if (record.role === "assistant") node.assistant = message;
      else node.systemMessages = [...(node.systemMessages ?? []), message];
    }
    // Checkpoints are complete snapshots. Compaction can replace older
    // provider-generated IDs, so identity comparison with the parent's
    // rendered messages incorrectly treats a complete snapshot as a delta.
    // That then concatenates snapshots along the path and produces duplicate
    // Svelte keyed-each IDs. Older legacy records were stored per-turn and
    // are still detected by their smaller message count.
    const parentCheckpoint = checkpoint.meta.parent_checkpoint_id
      ? checkpointsById.get(checkpoint.meta.parent_checkpoint_id)
      : undefined;
    node.isSelfContainedSnapshot =
      !parentCheckpoint || records.length >= parentCheckpoint.data.messages.length;
  }

  const rootIds: string[] = [];
  for (const node of Object.values(nodes)) {
    if (node.parentCkId && nodes[node.parentCkId]) {
      nodes[node.parentCkId].childIds.push(node.ckId);
    } else {
      rootIds.push(node.ckId);
    }
  }
  const sortByCreated = (a: string, b: string) => nodes[a].createdAt - nodes[b].createdAt;
  rootIds.sort(sortByCreated);
  for (const n of Object.values(nodes)) n.childIds.sort(sortByCreated);

  const activeChild: Record<string, number> = {};
  if (rootIds.length > 0) activeChild[ROOT_KEY] = rootIds.length - 1;
  for (const n of Object.values(nodes)) {
    if (n.childIds.length > 0) activeChild[n.ckId] = n.childIds.length - 1;
  }

  // Checkpoint reloads happen after a turn completes. Keep the branch the user
  // was viewing when it still exists instead of resetting every fork to its
  // newest sibling.
  if (previousTree) {
    const previousSiblings = (parentKey: string) =>
      parentKey === ROOT_KEY
        ? previousTree.rootIds
        : (previousTree.nodes[parentKey]?.childIds ?? []);
    const nextSiblings = (parentKey: string) =>
      parentKey === ROOT_KEY ? rootIds : (nodes[parentKey]?.childIds ?? []);

    for (const [parentKey, previousIndex] of Object.entries(previousTree.activeChild)) {
      const selectedId = previousSiblings(parentKey)[previousIndex];
      const nextIndex = selectedId ? nextSiblings(parentKey).indexOf(selectedId) : -1;
      if (nextIndex >= 0) activeChild[parentKey] = nextIndex;
    }
  }

  return { nodes, rootIds, activeChild };
}

// Walk the tree along activeChild and emit the visible messages.
// User messages get checkpointId stamped on them so UI can find sibling info.
export function computeActivePath(tree: ConvTree): ChatMessage[] {
  const path: ChatMessage[] = [];
  const selectedNodes: CkTreeNode[] = [];
  if (tree.rootIds.length === 0) return path;
  let ckId: string | undefined =
    tree.rootIds[tree.activeChild[ROOT_KEY] ?? tree.rootIds.length - 1];
  let tip: CkTreeNode | undefined;
  while (ckId) {
    const node: CkTreeNode | undefined = tree.nodes[ckId];
    if (!node) break;
    selectedNodes.push(node);
    path.push(
      ...node.timelineMessages.map((message) =>
        message.role === "user" ? { ...message, checkpointId: node.ckId } : message,
      ),
    );
    tip = node;
    const childIdx: number | undefined = tree.activeChild[node.ckId];
    if (childIdx === undefined || childIdx < 0 || node.childIds.length === 0) break;
    ckId = node.childIds[childIdx];
  }
  // A checkpoint snapshot is authoritative.  Once the selected tip has a
  // self-contained transcript, render it directly rather than reconstructing
  // the same conversation from its parents.
  if (tip?.isSelfContainedSnapshot) {
    return attachSelectedTurnMetadata(
      tip.timelineMessages.map((message) =>
        message.role === "user" ? { ...message, checkpointId: tip.ckId } : message,
      ),
      selectedNodes,
    );
  }
  return attachSelectedTurnMetadata(path, selectedNodes);
}

export function getActiveTipNode(tree: ConvTree | undefined): CkTreeNode | undefined {
  if (!tree || tree.rootIds.length === 0) return undefined;
  let ckId: string | undefined =
    tree.rootIds[tree.activeChild[ROOT_KEY] ?? tree.rootIds.length - 1];
  let tip: CkTreeNode | undefined;
  while (ckId) {
    const node: CkTreeNode | undefined = tree.nodes[ckId];
    if (!node) break;
    tip = node;
    const childIdx: number | undefined = tree.activeChild[node.ckId];
    if (childIdx === undefined || childIdx < 0 || node.childIds.length === 0) break;
    ckId = node.childIds[childIdx];
  }
  return tip;
}

function attachSelectedTurnMetadata(
  messages: ChatMessage[],
  selectedNodes: CkTreeNode[],
): ChatMessage[] {
  const byResponseMessageId = new Map<string, CheckpointTurnMetadata>();
  for (const node of selectedNodes) {
    if (node.turn) byResponseMessageId.set(node.turn.response_message_id, node.turn);
  }
  if (byResponseMessageId.size === 0) return messages;
  return messages.map((message) => {
    const turn = byResponseMessageId.get(message.id);
    return turn ? { ...message, turn } : message;
  });
}

// Select the unique root-to-tip path. The persisted value is a checkpoint id,
// rather than sibling indexes, so it remains valid when older siblings change.
export function selectActivePathToCheckpoint(tree: ConvTree, tipCheckpointId: string): ConvTree {
  if (!tree.nodes[tipCheckpointId]) return tree;
  const activeChild = { ...tree.activeChild };
  let ckId: string | null = tipCheckpointId;
  while (ckId) {
    const node: CkTreeNode | undefined = tree.nodes[ckId];
    if (!node) break;
    const parentKey = node.parentCkId ?? ROOT_KEY;
    const siblings = node.parentCkId ? (tree.nodes[node.parentCkId]?.childIds ?? []) : tree.rootIds;
    const index = siblings.indexOf(ckId);
    if (index >= 0) activeChild[parentKey] = index;
    ckId = node.parentCkId;
  }
  return { ...tree, activeChild };
}

/**
 * Merge a newly persisted live checkpoint into the recovery tree and select
 * that exact durable tip. The transcript owner can keep rendering its
 * optimistic stream while Goal/Graph state advances from checkpoint data.
 */
export function reconcileLiveCheckpointTip(
  checkpoints: RenderableCheckpoint[],
  previousTree: ConvTree | undefined,
  tipCheckpointId: string,
): ConvTree {
  const tree = buildTreeFromCheckpoints(checkpoints, previousTree);
  if (!tree.nodes[tipCheckpointId]) return previousTree ?? tree;
  return selectActivePathToCheckpoint(tree, tipCheckpointId);
}

// Sibling info for a checkpoint — used to render ‹n/m› on user messages.
export function getSiblingInfo(
  tree: ConvTree | undefined,
  ckId: string,
): { parentKey: string; siblings: string[]; activeIdx: number } | null {
  if (!tree) return null;
  const node = tree.nodes[ckId];
  if (!node) return null;
  const parentKey = node.parentCkId ?? ROOT_KEY;
  const siblings = node.parentCkId ? (tree.nodes[node.parentCkId]?.childIds ?? []) : tree.rootIds;
  if (siblings.length < 2) return null;
  const activeIdx = tree.activeChild[parentKey] ?? siblings.length - 1;
  return { parentKey, siblings, activeIdx };
}

// A self-contained checkpoint renders its complete timeline directly, so every
// visible user message is stamped with the tip checkpoint. Locate the node that
// actually introduced the user message before looking up its siblings.
export function getSiblingInfoForUserMessage(
  tree: ConvTree | undefined,
  userMessageId: string,
): { parentKey: string; siblings: string[]; activeIdx: number } | null {
  if (!tree) return null;
  const introduction = findUserMessageIntroduction(tree, userMessageId);
  return introduction ? getSiblingInfo(tree, introduction.ckId) : null;
}

// Complete checkpoints repeat the entire transcript, so the visible tip's
// checkpoint id is not the turn that owns every rendered message. Walk the
// selected recovery path from root to tip and use the first checkpoint that
// contains this stable application message id. Its parent is the exact
// provider-history prefix from before that user turn.
export function findForkParentCheckpointId(
  tree: ConvTree | undefined,
  userMessageId: string,
): string | null | undefined {
  if (!tree) return undefined;
  return findUserMessageIntroduction(tree, userMessageId)?.parentCkId;
}

function findUserMessageIntroduction(
  tree: ConvTree,
  userMessageId: string,
): CkTreeNode | undefined {
  for (const ckId of ckIdsOnActivePath(tree)) {
    const node = tree.nodes[ckId];
    if (
      node &&
      (node.user?.id === userMessageId ||
        node.timelineMessages.some(
          (message) => message.role === "user" && message.id === userMessageId,
        ))
    ) {
      return node;
    }
  }
  return undefined;
}

function ckIdsOnActivePath(tree: ConvTree): string[] {
  const ids: string[] = [];
  if (tree.rootIds.length === 0) return ids;
  let ckId: string | undefined =
    tree.rootIds[tree.activeChild[ROOT_KEY] ?? tree.rootIds.length - 1];
  while (ckId) {
    const node: CkTreeNode | undefined = tree.nodes[ckId];
    if (!node) break;
    ids.push(ckId);
    if (node.childIds.length === 0) break;
    const childIndex: number = tree.activeChild[ckId] ?? node.childIds.length - 1;
    if (childIndex < 0) break;
    ckId = node.childIds[childIndex];
  }
  return ids;
}

// Insert a freshly-finalized turn into the tree and select it on the active path.
// Returns the new tree plus the parentCkId actually chosen (so the caller can stamp
// the user message and know where the branch attached). If pendingParentCk is set
// for this conv, it overrides the natural "extend the tip" behavior — used for
// re-execution to attach a sibling instead.
export function attachNewTurn(
  prevTree: ConvTree | undefined,
  ckId: string,
  user: ChatMessage | undefined,
  assistant: ChatMessage,
  pendingParentCk: string | null | undefined,
): { tree: ConvTree; parentCkId: string | null } {
  const base = prevTree ?? { nodes: {}, rootIds: [], activeChild: {} };
  const existing = base.nodes[ckId];
  if (existing) {
    return {
      tree: selectActivePathToCheckpoint(base, ckId),
      parentCkId: existing.parentCkId,
    };
  }
  const nodes: Record<string, CkTreeNode> = { ...base.nodes };

  let parentCkId: string | null;
  if (pendingParentCk !== undefined) {
    parentCkId = pendingParentCk;
  } else {
    const path = computeActivePath(base);
    const tip = [...path].reverse().find((m) => m.role === "assistant" && m.checkpointId);
    parentCkId = tip?.checkpointId ?? null;
  }

  nodes[ckId] = {
    ckId,
    parentCkId,
    createdAt: Math.floor(Date.now() / 1000),
    user,
    assistant,
    timelineMessages: [...(user ? [user] : []), assistant],
    // The optimistic stream contains only the new turn. Reloading the durable
    // checkpoint immediately after completion replaces it with the full tip.
    isSelfContainedSnapshot: false,
    childIds: [],
  };

  let rootIds = base.rootIds;
  if (parentCkId && nodes[parentCkId]) {
    const parent = nodes[parentCkId];
    nodes[parentCkId] = { ...parent, childIds: [...parent.childIds, ckId] };
  } else {
    rootIds = [...base.rootIds, ckId];
  }

  const parentKey = parentCkId ?? ROOT_KEY;
  const siblings = parentCkId ? nodes[parentCkId].childIds : rootIds;
  const activeChild = { ...base.activeChild, [parentKey]: siblings.length - 1 };

  return { tree: { nodes, rootIds, activeChild }, parentCkId };
}

// Collect all checkpoint ids reachable along the currently active path given a tree
// (and an optional override for activeChild — used to preview what the path WOULD be
// after a branch switch, so we can diff against the current path).
export function ckIdsAlongActivePath(
  tree: ConvTree,
  activeChildOverride?: Record<string, number>,
): Set<string> {
  const set = new Set<string>();
  if (tree.rootIds.length === 0) return set;
  const pick = (k: string, fallback: number) =>
    activeChildOverride?.[k] ?? tree.activeChild[k] ?? fallback;
  let ckId: string | undefined = tree.rootIds[pick(ROOT_KEY, tree.rootIds.length - 1)];
  while (ckId) {
    const node: CkTreeNode | undefined = tree.nodes[ckId];
    if (!node) break;
    set.add(node.ckId);
    if (node.childIds.length === 0) break;
    const idx = pick(node.ckId, node.childIds.length - 1);
    if (idx < 0) break;
    ckId = node.childIds[idx];
  }
  return set;
}

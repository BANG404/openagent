---
name: openagent-conversation-runtime
description: Preserve OpenAgent conversation-runtime invariants. Use for changes to chat streaming, checkpoint persistence/restoration, provider-history projection, compaction, tool calls/results, ask_user or approval interrupts, cancellation/failure, branching/editing, message IDs, attachments, or runtime transcript records.
---

# OpenAgent conversation runtime

Apply these rules before editing runtime conversation code. Prefer one canonical
state transition over reconciliation or reconstruction heuristics.

## Sources of truth

- `CheckpointData.messages` is the durable application-owned message stream.
  Every checkpoint stores a complete snapshot, never a parent-relative delta.
- `conversation_snapshots` is the sole in-memory authority. Frontend rendering
  and provider history are projections of it.
- `conversation_histories` and `FinalResponse.history` are disposable runtime
  projections; never use either as a persistence source.
- Parent checkpoint links describe ancestry only. Never merge or reconstruct a
  snapshot from parents.
- `CheckpointMessage.id` is an application-owned stable UUID allocated when
  the message is appended. Never infer identity from role, payload, or provider
  position.

## Message reduction and persistence

- One `CheckpointMessage` is one logical message with ordered `content`.
  Reduce stream items in event order and coalesce only compatible trailing
  assistant text/reasoning fragments.
- `StreamResponseFinish` is control flow, not content. Do not semantically
  deduplicate, reorder, realign, or retag persisted messages.
- Seed a new user prompt, including its stable display ID, into the canonical
  snapshot before long preflight work or streaming begins.
- Use the same terminal-snapshot path for success, interruption, cancellation,
  and failure. Preserve completed tool rounds even if no `FinalResponse`
  arrives.
- Cancellation must add cancellation results for unmatched tool calls, mark
  trailing assistant records aborted, and append the durable UI-only
  `runtime_interrupted` record. Failure appends `runtime_error`, retaining all
  retry/fallback attempts in order.
- UI-only records are durable but must be filtered from provider projection.

## Provider projection

- Convert `SerializableMessage` / `SerializableContent` to Rig messages only at
  the request boundary.
- Before every distinct provider completion, persist the complete recovery
  snapshot and evaluate compaction.
- Start projection at the newest compaction boundary. Combine consecutive
  trailing protocol `ToolResult` user messages only in the provider projection;
  keep each durable source message unchanged.
- Never send an orphaned `ToolCall` or `ToolResult`. A compacted request may
  contain a ToolResult only when its matching ToolCall remains in that request.
- Keep the original system prompt as provider preamble/debug data, not a
  checkpoint message. Ignore provider-echoed system preambles on finalization.
- Omit OpenAI image `detail` during provider projection for compatible
  multimodal routing.

## Compaction

- A compaction boundary is a complete tagged `system prompt + summary` message,
  immediately followed by a separately tagged textual replay of the user
  prompt.
- The replay is a new application message with its own UUID. Preserve its
  attachment references; never replace or deduplicate the original user
  message.
- For preflight compaction, first persist `history + original prompt`; summarize
  only the preceding provider history while using the pending prompt for token
  budgeting. Then append and persist boundary + replay before streaming.
- For in-flight compaction, first persist every observed stream item, then
  append and persist boundary + replay under the snapshot update lock before
  projecting the next request.
- Treat the newest compacted recovery snapshot as an immutable prefix. Append
  only response messages after its exact request boundary.
- Do not immediately recompact a fresh boundary merely because its summary is
  large; require new post-boundary tool-result context.
- Fail projection if a compaction boundary is not immediately followed by its
  textual replay. Never select a protocol ToolResult as that replay.

## Interrupts, approvals, and branches

- Match every pending `ToolCall` to its `ToolResult`; do not assume only the
  final call is unresolved. Keep the phase interrupted until none remain.
- Remove synthetic interrupt results. Append the real answer/approval/denial
  result before the resumed provider projection.
- Before accepting a new user turn from an interrupted tip, append durable
  denials for all unmatched calls.
- Serialize resumes per conversation. Advance one selected checkpoint chain,
  reject stale request IDs, and persist the new branch tip before emitting its
  result or starting another provider request.
- Resume from the explicit frontend branch head, otherwise from the durable
  active tip; never choose by global checkpoint creation time.
- Editing a historical user message branches from the parent of the first
  checkpoint on the selected recovery path containing that message ID.
  `forked_from_checkpoint_id` must not already contain
  `forked_from_message_id`.

## Attachments and compatibility

- Store attachment bytes in content-addressed `attachment_blobs`. Checkpoint
  content stores blob ID, filename, MIME type, and display kind—never source
  paths or inline bytes.
- Hydrate bytes on load and omit them from checkpoint JSON/IPC payloads.
- Keep the legacy path-based rendering fallback only for existing checkpoints
  lacking complete display metadata; do not add new compatibility machinery.

## Verification

Run the smallest relevant Rust/tests first. Then use the
`inspect-conversation-checkpoints` skill on an affected conversation. If the
debug API is running, also run `renderability <conv-id>` and report its
warnings/errors.

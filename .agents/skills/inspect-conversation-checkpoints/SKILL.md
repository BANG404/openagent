---
name: inspect-conversation-checkpoints
description: Inspect OpenAgent conversation, branch, and checkpoint records for debugging. Use when asked to find a conversation by ID, title, workspace, or time; investigate a checkpoint ID, recovery state, cancellation, compaction, branch tip, transcript mismatch, or missing tool round; or gather evidence before changing conversation persistence or restoration code.
---

# Inspect Conversation Checkpoints

Perform read-only diagnosis. Treat conversations, checkpoints, traces, and file-change records as user data. Never update or delete SQLite records while investigating.

## Choose the data source

- For wording, earlier decisions, or message identifiers in the **active conversation**, call `search_conversation_messages`. Page with `offset` and `limit`; use `query` only after a broad listing has identified useful terms.
- For a named conversation or checkpoint outside the active context, run the bundled collector from the repository root. The collector opens SQLite in read-only/query-only mode.

```powershell
bun .agents/skills/inspect-conversation-checkpoints/scripts/inspect-conversation-records.ts --conversation <conversation-id>
bun .agents/skills/inspect-conversation-checkpoints/scripts/inspect-conversation-records.ts --checkpoint <checkpoint-id>
```

Add `--json` for machine-readable output, `--include-content` only when payload-level inspection is necessary, or `--db <path>` for a nonstandard database. Use the development Inspector (`?dev-inspector`) when an interactive timeline is more useful.
- For a source-level question, inspect `sdk/rust/openagent-app/src/conversation_memory.rs`, `checkpoint.rs`, and `commands/conversation_store.rs`. Do not infer storage semantics from frontend rendering alone.

## Investigation workflow

1. Record the target: conversation ID, checkpoint ID if known, workspace, approximate time, and observed symptom.
2. Locate the conversation metadata. Compare `active_tip_checkpoint_id` with branches' `head_checkpoint_id`; the active tip is the selected latest checkpoint for restoration and rendering.
3. List checkpoint metadata for the conversation, newest first. For each relevant item, note `checkpoint_id`, `parent_checkpoint_id`, `created_at`, lifecycle phase, and turn grouping metadata.
4. Read the target checkpoint payload. Check its complete `messages` snapshot, display metadata, summaries/compaction tags, tool calls and matching results, and continuation state.
5. Correlate with `task_traces` and `file_changes` only when diagnosing model execution or rollback. These may contain sensitive prompts, tools, completions, and patches; report only the minimum relevant excerpts.
6. State the evidence, the most likely cause, and any uncertainty. Distinguish persisted facts from an inference.

## Runtime completion check

After changing agent runtime, checkpoint persistence, restoration, interrupts,
tools, compaction, branches, or provider-history projection, run this read-only
rendering check against the affected debug conversation before handoff:

```powershell
python .agents/skills/openagent-dev-chat/scripts/openagent_dev.py renderability <conversation-id>
python .agents/skills/openagent-dev-chat/scripts/openagent_dev.py diagnose <conversation-id>
```

Treat `errors` as a failed verification. The check mirrors
`src/lib/checkpointTree.ts`: selected parent availability, non-empty unique
visible message IDs for Svelte keyed rendering, tool-result linkage, and a
tagged replayed user message immediately after each compaction boundary. Record
warnings (for example, a standalone legacy tool result) rather than claiming a
fully clean runtime check. If no debug instance is available, use the bundled
read-only collector and explicitly state that frontend renderability was not
runtime-verified.

## Interpretation rules

- A checkpoint is a complete snapshot, not a delta reconstructed from its parent. Parent links describe recovery or branch ancestry.
- Do not treat an arbitrary latest-created checkpoint as the selected transcript: use the current branch tip / `active_tip_checkpoint_id`.
- A `before_completion` checkpoint preserves `history + prompt` before each distinct provider request. A terminal checkpoint should retain that state plus partial or final output.
- After compaction, a readable summary may replace older agent messages. Do not send a protocol `ToolResult` into a provider request unless its matching `ToolCall` remains in that same request.
- UI-only checkpoint hints are durable display data but must not be restored to the provider as agent messages.

## Report format

Return a compact evidence table or bullets containing:

- Target and scope.
- Selected branch and tip checkpoint.
- Relevant checkpoints in chronological order, with phase and parent relationship.
- Message/tool/compaction findings.
- Trace or file-change correlation, if inspected.
- Conclusion and a clearly labelled recommended next diagnostic step.

Do not expose raw system prompts, provider secrets, or unrelated transcript content.

---
name: openagent-goal-graph
description: Preserve OpenAgent Goal and Graph execution invariants. Use for changes to /goal or /graph routing, CheckpointData.flow, Goal continuation, Graph nodes and reducers, child conversations, branch-local flow state, flow badges, goal tools, subagent-started, or goal-loop-iteration-started events.
---

# OpenAgent Goal and Graph

Treat Goal/Graph execution as checkpoint-owned branch state, not a separate
service or event-derived state machine.

## Durable state

- `CheckpointData.flow` is the only durable authority for branch-local Goal and
  Graph state. Do not add or consult a separate goal-run table.
- Persist flow and `CheckpointData.messages` together in every recovery and
  terminal checkpoint.
- Derive a Goal as completed only when its To-Do list is non-empty and every
  item is completed.
- Flow badges project the selected active-tip checkpoint. Events are transient
  notifications, never state authority.

## Provider boundary and continuation

- Route `/goal` and `/graph` through `submit_agent_input`.
- Keep the original prefixed user text in checkpoints. Replace only its textual
  content with the host-built Goal/Graph instruction at provider projection.
- Continue an unfinished Goal with a new tagged, agent-visible user control
  message that is durable but hidden from transcript rendering.
- Every hidden continuation round emits `goal-loop-iteration-started` with its
  new preallocated assistant message ID.

## Graph execution

- Start each graph node in its own child conversation/branch with its own
  checkpoint Goal and hidden tagged bootstrap message.
- The parent Graph stores topology, node status, dependency results, and child
  conversation/checkpoint references; do not duplicate child Goal state.
- Reduce parallel node results through one serialized parent reducer so they
  cannot create competing parent states.
- Persist each Graph advance to both the selected branch head and conversation
  active tip before starting more nested work.
- Emit `subagent-started` with the node's preallocated assistant message ID and
  branch ID so the frontend can mount its live row before content arrives.

## Verification

Run focused Goal/Graph tests, then the relevant Rust/frontend checks. Inspect an
affected conversation with `inspect-conversation-checkpoints`; verify parent
and child tips, hidden control messages, and flow projection.

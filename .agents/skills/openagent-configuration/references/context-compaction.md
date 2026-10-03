## Context compaction

General Settings owns the compaction enable switch, global threshold, recent
event count, and custom instructions. These controls use the existing
configuration fields and autosave path. Compaction is performed by the selected
Chat model and must not appear among Flash tasks.

Run `bun run test:blackbox:compaction-settings` against a debug Tauri instance
using the same isolated `OPENAGENT_HOME` and explicit `TAURI_PILOT_SOCKET`.
The scenario verifies General/Flash placement, disabled numeric controls,
saved values after reopening, and light/English plus dark/Chinese states,
then restores the edited fields.

Automatic context compaction is enabled by default. A fresh or missing
`context_compaction_threshold` defaults to 200,000 approximate tokens. An
explicitly saved global threshold remains unchanged, and an optional per-model
threshold takes precedence for that model.

Each compacted user boundary ends with a recent checkpoint timeline containing
user messages, tool calls, and assistant text in chronological order. The
`context_compaction_recent_message_count` setting controls the retained event
count, defaults to 5, accepts 0 through 20, and uses 0 to omit the timeline.
Tool results, reasoning, product-only records, and earlier compaction boundaries
are not copied into this supplemental timeline. Oversized individual event
fields are explicitly truncated so the supplemental context cannot consume the
summary budget. The selected Chat model generates summaries in an internal,
non-rendered turn using the complete provider history as the cacheable prefix;
only the tagged compaction boundary is durable while the complete visible
checkpoint transcript remains available.

The runtime estimate is Unicode-aware: ASCII text uses an approximate
four-characters-per-token ratio, while non-ASCII text is counted closer to one
token per character. This keeps automatic compaction from underestimating
Chinese and other non-ASCII transcripts.

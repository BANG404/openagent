## Context compaction

Flash task settings owns the compaction enable switch, global threshold, recent
event count, and custom instructions. These controls use the existing
configuration fields and autosave path. Compaction uses the configured Flash
model, typed structured output and the shared Flash retry/fallback queue.

Run `bun run test:blackbox:compaction-settings` against a debug Tauri instance
using the same isolated `OPENAGENT_HOME` and explicit `TAURI_PILOT_SOCKET`.
The scenario verifies General/Flash placement, disabled numeric controls,
saved values after reopening, and light/English plus dark/Chinese states,
model-window validation and persistence, then restores the edited fields.
Use a fixture with at least one configured model. The scenario selects appearance
controls by their labels rather than their position among theme overrides, and
splits bounded native evaluations so no single RPC exceeds its execution deadline.

Automatic context compaction is enabled by default. A fresh or missing
`context_compaction_threshold` defaults to 200,000 approximate tokens. An
explicitly saved global threshold remains unchanged, and an optional per-model
threshold takes precedence for that model.
An optional model context window is configured in the model dialog. The effective
trigger is the smaller of the configured threshold and 90% of that window;
the saved global and model thresholds are not overwritten. Empty windows retain
the configured threshold, and older configuration loads without a window.

Each compacted user boundary ends with a recent checkpoint timeline containing
user messages, tool calls, and assistant text in chronological order. The
`context_compaction_recent_message_count` setting controls the retained event
count, defaults to 5, accepts 0 through 20, and uses 0 to omit the timeline.
Tool results, reasoning, product-only records, and earlier compaction boundaries
are not copied into this supplemental timeline. Oversized individual event
fields are explicitly truncated so the supplemental context cannot consume the
summary budget. The Flash model extracts a validated structured summary from
the provider transcript. Only the tagged compaction boundary enters the durable
transcript while the complete visible
checkpoint transcript remains available.

The runtime estimate is Unicode-aware: ASCII text uses an approximate
four-characters-per-token ratio, while non-ASCII text is counted closer to one
token per character. This keeps automatic compaction from underestimating
Chinese and other non-ASCII transcripts.
The selected request is checked before model execution, including its system
prompt, tool definitions and attachments. Provider usage calibrates subsequent
context growth; the composer displays active context including the latest output,
and its denominator is the effective trigger. Cache/cost totals retain their
separate cumulative meaning. Summaries must pass their budget before persistence;
failed or cancelled compaction keeps the original transcript available.

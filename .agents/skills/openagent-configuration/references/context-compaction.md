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
`context_compaction_threshold` defaults to 200,000 provider-reported context
tokens. An explicitly saved global threshold remains unchanged, and an optional per-model
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

Flash compaction can read historical user images and image-bearing tool results
when the actual Flash model has vision enabled. Retries and fallbacks each use
their own model capability. Unsupported media receives an explicit omission
marker; plain text attachments remain readable. PDF input requires a supported
visual API (Anthropic, Gemini or OpenAI Responses). Audio/video are currently
omitted.
The compressed boundary stays textual and original attachments remain durable.
Runtime ownership and verification live in the SDK conversation-runtime skill's
`references/context-budget.md`.

Automatic thresholds use the latest completed provider request's input plus
output tokens, with cached input counted once. Sending a user message does not
estimate or compare its size against the compaction threshold. The context
indicator uses the same provider usage and receives no estimated pre-request
update. Missing usage skips automatic threshold triggering; manual compaction
and provider context-limit recovery remain available.

A tool response can request compaction after its calls and results finish,
before the next model request. A final reply is saved before compaction and does
not cause another Chat reply. Local Unicode-aware estimates remain for summary
budget validation and diagnostics. Failed or cancelled compaction preserves the
original transcript.

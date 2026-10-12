# Langfuse observability candidate

`plugins/langfuse/` is the local unpublished `langfuse` integration package.
Install its directory through the ordinary local installer. Keep it outside the
published development index and official registry until its independent source
repository and immutable release are authorized and published; those indices
qualify pinned published packages, not unpublished source directories.

The package owns configuration, OTLP mapping, local pending records and retries.
Use only public lifecycle routing, tool fields and explicitly consented
[conversation observations](conversation-observations.md). Never scrape internal
Inspector/provider traces, databases or model context to enrich an external
observability integration. Current public hooks expose model timing but no model
identity, prompt, reasoning, token usage or costs; absent values stay absent.
Current-turn authored text is available only through `conversation-observations-v1`.

Upload, message capture and tool-content capture are separate explicit opt-ins in the generic
plugin settings form. Normal network/process policy applies. The plugin does not
request computer access. Hook stdout must remain empty because text would become
model context. Diagnostics never include remote response bodies or credentials.
Endpoints require HTTPS except loopback and literal RFC1918 IPv4 HTTP addresses
for self-hosted services. HTTP sends project authentication without encryption;
private hostnames and all public addresses still require HTTPS. Redirects stay
disabled, including redirects from a private endpoint to a public service.

Require `context-sessions-v1`. Each conversation/branch/durable context stage is
one session; successful compaction starts a new session linked by
`previous_session_id`. Normal turns, retries, approval resumes and restart retain
the ID. Child conversations stay independent, with parent/role IDs in metadata.
An execution crossing compaction exports separate deterministic traces per stage.
Old pending records without context identity retain their original trace/session
IDs and declare `legacy_unknown`; they are not enriched retroactively. Stop exports completed,
failed, cancelled and interrupted executions without waking the Agent. Model and
tool hook pairs establish timing; unfinished pairs are marked incomplete.
Queued content is bounded, receipts compacted only after complete OTLP acceptance,
and failed records remain retryable. Disablement blocks capture and pending export.

Run the package validator with the platform locales and package-owned tests, then
qualify actual Runtime installation/configuration and an Agent turn against a
loopback mock OTLP receiver in an isolated home. Native settings qualification
covers light/dark and English/Chinese, preserving secrets across save/reopen.
External qualification uses the same verifier with `--live` and explicitly
supplied process-only Langfuse environment variables. It authenticates the project,
executes a fixture model/tool turn, reads Agent/generation/tool hierarchy back,
and checks private-key redaction, content opt-out, opt-in, revocation and disablement. Select
`--read-api=v1` only for deployments without observations v2. Remove the fixture's
private credential settings and redact retained evidence. Never embed real keys
in source, arguments, screenshots or reports. See the package README for limits.

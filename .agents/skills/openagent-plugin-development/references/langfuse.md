# Langfuse host integration

`plugins/langfuse/` follows the independent `BANG404/openagent-langfuse` repository.
The official registry follows compatible immutable Releases with SHA-256; the
development index selects its main branch. Publish package sources and archives
independently, without a parent gitlink or catalog version bump.
The package [README](https://github.com/BANG404/openagent-langfuse/blob/main/README.md)
owns OTLP mapping, queues, retries, endpoint policy and trace/session representation.

## Host boundary and consent

Use public lifecycle routing, tool fields and explicitly consented
[conversation observations](conversation-observations.md). Message capture,
model-content capture, tool capture and upload are independent opt-ins in the
generic settings form. Do not scrape Inspector/provider traces, databases or
model context to enrich telemetry. System prompts, reasoning and attachment
bytes stay excluded. Hook stdout must not inject text into model context;
normal process/network policy applies without a computer-access grant.
Disabling capture or export must also apply to pending records.

## Acceptance

Run the package validator with platform locales and package tests, then qualify
Runtime installation, saved configuration and an Agent turn against a loopback
mock OTLP receiver in an isolated home. Verify light/dark and Chinese/English,
secret preservation across save/reopen, opt-out, opt-in, revocation and disablement.
Use package-owned verifiers for live qualification only with explicitly supplied
process-local credentials. Remove fixture private settings and redact retained
evidence; diagnostics must not include credentials or remote response bodies.

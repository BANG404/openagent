# Opt-in conversation observations

Under plugin protocol 1, a package must require `conversation-observations-v1`
and declare `extensions.openagent.conversation_observations` with `version: 1`
and a `consent_field`. That field belongs to the package's configuration schema,
is boolean, explicitly defaults to false and has no MCP binding. The Plugin Kit
[format reference](https://github.com/BANG404/openagent-plugin-kit/blob/main/docs/plugin-format.md#conversation-observations)
owns the public payload schema and limits. Runtime and validator reject unsafe
declarations and unknown required features before execution.

Only an explicitly saved true value allows that package's Stop command hook to
receive a top-level version-1 `observation`. It contains this execution's authored
user text and visible assistant segment with stable message IDs and explicit
truncation. Resumes include only their fresh output. It does not expose history,
system prompts, reasoning, attachments, tool content, recalled context or internal
messages. Ordinary hooks, sidebar frames and other packages receive no projection.
Missing/unreadable settings fail closed. Process/network policy still applies.

Use separate message capture, tool capture and upload switches, all default off.
Revocation suppresses bodies in pending exports; enabling capture cannot recover
past messages. Do not scrape Inspector records or user databases to fill gaps.
Qualify opt-out, opt-in, owner isolation, cancellation/resume boundaries, bounded
UTF-8, retry and revocation with isolated Runtime fixtures and fake model content.

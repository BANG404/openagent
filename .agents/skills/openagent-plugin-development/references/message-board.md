# Message board package

The independent [Message Board repository](https://github.com/BANG404/message-board)
is pinned as a Git submodule at `plugins/message-board/` and adapts
Codex's agent message board to the portable Agent Plugin boundary. Its
stdio MCP server exposes the nine board tools (channels, threads, search,
bounded reads, subscriptions, and idempotent posts) and stores state only in
the loader-provided `PLUGIN_DATA` directory.

The portable MCP transport cannot receive the Runtime's authoritative agent
path or wake an idle child turn. The package therefore requires an explicit
`agent_id` on every tool call and treats `agents_to_notify` as handoff metadata;
the host remains responsible for process lifecycle and any future notification
bridge. Do not add transcript access, model context, or host credentials to the
plugin. The package owns implementation and publication; the parent owns its
gitlink, development index entry, and `tests/messageBoardPlugin.test.ts`
integration coverage. Changes to the board schema must preserve bounded output
and request idempotency. Initialize the submodule before running host tests.

The board is shared by all processes using the same loader-owned `PLUGIN_DATA`;
channel naming separates tasks and workspaces. Caller-supplied `agent_id` values
are labels rather than authenticated identities. The package never infers
workspace scope from its capability declaration and never writes a fallback
directory inside the workspace or installed package.

Version 1.1.0 serializes operations across independent MCP processes, reloads
state under an exclusive lock, and atomically replaces version-one snapshots.
It preserves legacy data and idempotency keys. Damaged or unsupported state
returns a tool error without replacing the original file. A busy lock is
retryable; stale-lock removal requires stopping all servers sharing the board.
The package README owns the recovery procedure.

Thread pagination returns the root separately from replies. Previews and offset
reads count Unicode code points, while the serialized result budget counts
UTF-8 bytes. Reads reduce their requested page or preview size and return an
accurate continuation. Explicit recipients remain handoff metadata; subscriptions
update their last matching message without waking a host Agent.
The shared Runtime may inject `_openagent` context into tool arguments. Accept
that object without persisting it or using it as an agent identity; excluding it
from request fingerprints keeps retries stable across host contexts.

Run package tests with `node --test tests/*.test.mjs`, the current
plugin-kit validator, and `bun run test:blackbox:message-board` against a fresh
isolated Tauri instance. The native scenario installs the local candidate through
the normal Runtime installer, exercises all nine tools, verifies disable and
re-enable, and uninstalls/reinstalls while preserving data. Published-source
qualification additionally uses `BLACKBOX_PLUGIN_IDS=message-board` with the
ordinary plugin lifecycle runner. Record package and SDK revisions separately.
The package declares complete English and Chinese metadata and operational
notices through the shared i18n contract. It consumes live SDK request context,
or reads `locale.get` for independent process calls,
preserves user-authored content and IDs, and keeps locale out of persisted state
and retry fingerprints. Qualify with the full locale set from
`src/lib/platformLocales.json`; inspect both cards and live switching in both
themes. Validation alone does not qualify an unpublished candidate or replace
native verification. Publish accepted package sources before advancing the
default parent's gitlink and activating the catalog.

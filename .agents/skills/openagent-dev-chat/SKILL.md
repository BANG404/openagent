---
name: openagent-dev-chat
description: Drive and diagnose the currently running OpenAgent Tauri debug instance through its authenticated loopback API. Use for agent-driven chat or goal runs, checkpoint/compaction diagnosis, tool approval, ask-user recovery, and low-noise debug traces from `bun tauri dev`.
---

# OpenAgent Dev Chat

Use `scripts/openagent_dev.py`; it discovers the local API and forces UTF-8
terminal output, including on a Windows GBK console. It defaults to compact JSON
and never returns complete prompts, tool schemas, or historical snapshots unless
you explicitly call the raw `traces` or `checkpoints` commands.

## Minimal recovery loop

```powershell
python scripts/openagent_dev.py health
python scripts/openagent_dev.py commands
python scripts/openagent_dev.py resolve "/goal Inspect the failing checkpoint flow"
python scripts/openagent_dev.py chat "Inspect the failing checkpoint flow"
python scripts/openagent_dev.py interrupts <conv-id>
python scripts/openagent_dev.py approve <conv-id> <interrupt-id>
python scripts/openagent_dev.py conversation <conv-id>
python scripts/openagent_dev.py diagnose <conv-id>
```

## Trigger pre-flight context compaction

Use the dedicated diagnostic instead of manually fabricating a large
checkpoint. It reads the running application's configured compaction threshold,
creates an isolated conversation containing random user and assistant text at
that size, and then submits a normal user message through the product chat path:

```powershell
python scripts/openagent_dev.py context-compaction
```

The result reports `configured_threshold_tokens`, `seeded_estimated_tokens`,
and the conversation ID. A successful request should contain a durable
compaction boundary; verify it with `renderability <conv-id>` and `diagnose
<conv-id>`. The command fails clearly when context compaction is disabled in
the running configuration.

An HTTP 200 means only that the API request completed. Inspect `phase`: a value
of `interrupted` requires recovery, while `final_completed` is the normal
terminal state.

Use `approve` and `deny` for a tool approval. They always submit the correct
payload (`{"values":{"approved":true|false}}`). For an `ask_user` interrupt,
first inspect its listed fields, then answer exactly once:

```powershell
python scripts/openagent_dev.py answer <conv-id> <interrupt-id> --json '{"values":{"choice":"A"}}'
```

Do not use a bare `{"approved":true}` value: it is invalid and rejected.

## Replay a checkpoint snapshot

For an intentional recovery/replay experiment, the development API can replace
one checkpoint's complete `CheckpointData` payload. It is a durable write, so
first save the original with `checkpoints <conv-id> --full`, edit only the
target payload, and repeat the checkpoint ID as an explicit confirmation:

```powershell
python scripts/openagent_dev.py replace-checkpoint <conv-id> <checkpoint-id> --data-file .\checkpoint-data.json --confirm-checkpoint <checkpoint-id>
```

The result includes `renderability.errors` and `renderability.warnings`; do not
claim the replay is valid if errors are present. If the edited checkpoint is
the active tip, the runtime snapshot cache is refreshed, so `interrupts`,
`answer`, `approve`, `deny`, and the next chat request exercise the replacement
state. An interrupted `ask_user` snapshot must retain its unresolved tool call;
inspect it with `interrupts` and answer it once with `answer` before assessing
the resumed trace.

## Output and sensitive context

Use `--compact` (the default) for one-line agent output, `--json` for formatted
JSON, or `--text` for a short human view. `traces` and `checkpoints` are raw,
high-volume Inspector data; call them only after `conversation` or `diagnose`
identifies a concrete need. Never copy their complete prompts, tool schemas, or
trace payloads to an issue, commit message, or final response.

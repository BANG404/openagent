# Conversation performance simulation

Mermaid prewarming runs alongside startup bootstrap. Never await it before
requesting durable state, installing Runtime event delivery or revealing the
conversation surface. `tests/startupLifecycle.test.ts` isolates its module mocks
per process and covers pending/failed renderer imports, snapshot retry/fallback
and listener failure while preserving restore-before-subscribe ordering.

The native main window appears before provisioning or history restoration. Its
shared loading shell remains mounted through product bootstrap and adds waiting
feedback after three seconds. Bootstrap and selected read-only history requests
have a ten-second transport deadline, including response bodies. The native shell
reads settings alone for window routing; only the product requests the complete
startup transcript. A failed
checkpoint load releases its spinner, keeps other conversations accessible and
offers Retry. Do not apply this deadline to writes, installations or agent runs.
The deadline bounds an individual read, not the total provisioning time or
synchronous rendering of an arbitrarily large transcript. Sidebar history stays
paged; restoring the active conversation must not eagerly restore every history.
Workspace snapshot tests cover 0, 1, 29, 30, 31 and 1,000 histories with a
1,000-message selected transcript, retaining its array without copying it into
inactive histories. The 29/30/31 cases straddle the default sidebar page size.

Run `bun run test:perf:browser --profile smoke` before larger `standard` or
`stress` runs. The runner owns a Vite server on loopback and a unique Playwright
session through the workspace wrapper. `--base-url` selects an existing local
source frontend. Close only owned processes/sessions. Reports, scripts and
screenshots go to a unique temporary directory, or `--output <directory>`.

The development-only streaming preview accepts
`streaming-transcript-preview-performance` and lazily imports its fixture.
No performance data or controls appear in production. The preview renders the
real `MessageList`, Markdown/code, paired tools and compaction dividers from
synthetic complete checkpoints through the existing checkpoint controller.
It measures projection, first/repeated hydration, 32 rendered updates per cycle,
stream updates, repeated compaction/hydration, scrolling and full restore.
Fixture sizes use the shared `smoke`/`standard`/`stress` options, with explicit
turn, payload, compaction interval and cycle overrides. Each run covers light
and dark in English and Chinese.

Assertions retain earliest/latest input and output, hide provider-only replay,
require one divider per compaction and preserve historical DOM identity across
warm hydration and compaction. A clear-and-restore pass checks that the
checkpoint cache cannot leave a stale or incomplete transcript. A unit fixture
also projects 1,000 turns and validates unique IDs and paired tools.

Browser reports retain hydration, streaming and scroll frame samples, long-task
durations when supported, DOM count and optional JS heap bytes. Frame samples
include two animation frames and rendering, so they are not raw reducer time or
an FPS measure. JS heap is Chromium-specific and is neither process RSS nor a
cross-browser memory limit. Missing metrics are `null`/unsupported, never zero.
Default gates assert correctness. `--max-frame-p95-ms` adds a caller-selected
latency gate after artifacts are saved. `--max-hydration-ms` gates cold/warm
hydration, compaction hydration and full restore separately. For interactive
acceptance, target five seconds and use ten seconds as the maximum for the
1,000-turn stress fixture; retain failures and actual measurements when the
five-second target is missed. Streaming budgets are separate from loading
budgets. Compare repeated runs with identical
hardware, build mode and sizes; browser dev timings do not predict release
desktop timings. Use an OS/native profiler to attribute CPU and memory growth.

The Runtime matrix is separately available through
`bun run test:perf:conversation --profile smoke|standard|stress`. It owns actual
message accumulation, persistence, repeated compaction, restart and provider
projection cache verification in the private SDK. Browser data is synthetic and
must never be described as exercising a real model or measuring model cache
hits. Real-provider cache measurement remains an explicit SDK opt-in probe.

## Cache evaluation

Treat each cache as a derived view with a separate owner and invalidation rule:

| Layer                                 | Identity and authority                                                     | Required checks                                                                            |
| ------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Durable checkpoint                    | Conversation and checkpoint ID; SQLite is authoritative                    | Restart, selected tip, full authored history and unique message/tool IDs                   |
| Runtime snapshot and provider history | Conversation plus selected tip; history derives from the complete snapshot | Older-tip navigation, clear/reload, compaction, restart and no tool replay                 |
| Frontend transcript                   | Conversation, selected checkpoint and live reconciliation version          | Repeated hydration, stable historical nodes, live completion, compaction and clear/restore |
| Provider prompt cache                 | Provider/model and exact stable prefix; provider reports usage             | Prefix changes, usage normalization and explicit live cache probe                          |

Compaction reduces the model projection. It does not remove durable messages or
bound the frontend DOM. A warm cache therefore cannot establish that long-chat
rendering or storage growth is bounded. Compare samples as history grows, and
inspect both hydrated DOM size and retained heap before choosing an eviction
budget. The current fixture exercises one conversation and does not establish
cross-conversation cache capacity, concurrent throughput or a leak-free heap.

If measurements justify a new projection cache, key it by conversation,
checkpoint revision, locale and rendering configuration; never key solely by
message count or conversation ID. Retain immutable historical records and
recompute only the live suffix. Use a measured byte budget with LRU eviction for
inactive conversations, pin the active streaming view, and reload evicted views
from the durable checkpoint. Branch changes, edits, deletions and configuration
changes must invalidate matching entries. Add multi-conversation eviction and
out-of-order refresh coverage before shipping such a cache. These are design
constraints for a subsequent optimization, not caches introduced by this test.

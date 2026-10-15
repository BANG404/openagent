# Conversation performance simulation

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
latency gate after artifacts are saved. Compare repeated runs with identical
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

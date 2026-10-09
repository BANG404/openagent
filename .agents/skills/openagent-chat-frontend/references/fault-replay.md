# Frontend incident replay

The frontend replay foundation and the initial developer recorder are implemented.
The private SDK has a bounded async model-boundary journal and a constrained
Runtime case runner and an embedded controller for a qualified anchored capture
profile. Desktop SDK arming, reload continuation
and general wire-level adapters remain planned in
[the architecture proposal](fault-replay-design.md).

`bun run replay validate|replay --case <case.json>` dispatches by the versioned
target. A Runtime case requires the private SDK checkout and Cargo; the command
builds that checkout's replay CLI and reports its actual revision and dirty state.
It records a SHA-256 of tracked changes and untracked source, and refuses a
source change during the command, so dirty development runs remain identifiable.
The replay build directory is isolated by that source digest so another checkout
cannot supply a previously built Runtime through a shared Cargo target cache.
It never substitutes an installed Runtime or development sidecar. SDK payload
validation and execution remain private; unsupported cases and missing SDK
capabilities fail. The common command currently bounds inline cases to 16 MiB.
Frontend extraction does not infer Runtime inputs or execution anchors.
An SDK journal's committed prefix supports private diagnosis; an incomplete
prefix cannot become a complete Runtime case. Desktop arming still requires its
own qualification. Runtime target version 2 carries
qualified durable history and observed input/Stop; unsupported versions or
capabilities refuse validation. Runtime target version 3 adds automatically
recorded, explicitly scheduled tool outcomes for the SDK's qualified adapter
subset. It preserves typed success/error/refusal results and the canonical
validation/retry/persistence path. Runtime target version 4 adds observed manual
and automatic approvals, resume queue/acquisition and accepted/rejected replies,
including intermediate batch persistence. It verifies actual command results
and classifier execution instead of injecting approval decisions. Its tool and
classifier capabilities remain bounded by the private SDK contract.
General effects and nonzero retry-delay clocks still require separate capabilities and qualification; a
passing subset is not coverage of an ordinary fully configured desktop Runtime.
The common `replay:extract` command dispatches
Runtime captures to the current private SDK, verifies its source fingerprint,
and replays with independently authored assertions before writing a private case.
Provider-only Runtime captures do not imply general tool/effect coverage.

## Private developer recording

In a source development main window, `window.openagentFaultCapture.start({
conversations: ["<selected-conversation>"], includePrivateContent: true })` explicitly
arms a session. `stop()` finalizes it. The initial target requires an idle,
text-only supported conversation state and established single-consumer chat
subscriptions. Start snapshots only the selected conversations synchronously,
then buffers observations while the native journal is created. This is a
consumer-observation anchor, not an SDK producer-completeness claim.

The shared client uses `RecordingTransport`; inactive observation serializes no
payload. Product reads, actual consumer callbacks and shared projection/hydration
action boundaries retain their existing code paths. The anchor also retains
workspace, loaded-conversation markers and the localized interruption label;
otherwise replay could spuriously reload already loaded history on run-start.
Only independent action boundaries become schedule inputs. Synchronous child
actions inside a recorded event handler are suppressed by the observation seam,
because the real handler performs them again during replay; scheduling both
would create duplicate hydration requests. Host post-terminal hydration re-enters
through `duringIndependentFrontendAction`: the target's host affordance does not
issue it, and its recorded independent action invalidates the loaded marker
before entering the shared hydration controller.
Supported payloads are private local data. Credential-named fields invalidate the recording before
ingestion. Unsupported operations/events, subscription changes, resync, pending
requests and writer failures cannot yield a qualified full case. Initial coverage
is bounded by the replay target's capability set; Runtime execution, approvals
and other effects still require their target adapters.

The target observes the frontend projection of successful plain-text ordinary
submission. `agent.submit_input` and explicitly listed host affordances
(`get_chat_task_usages`, `get_conversation_meta`, empty `get_file_changes`, `set_chat_queue_pending(false)`,
`cancel_chat_message` and fallback-title writes) are outside its schedule. The
real app still performs them. Rejections, nonempty file responses, queued input,
slash commands, attachment/context submission, immediate-command outcomes and
other scoped operations invalidate capture qualification. Stop before consumer/
transport idle is incomplete. Do not infer SDK, title, usage polling, file or
queue coverage from such a case.
An ordinary captured turn uses an established conversation/branch; creating a
new conversation or branch remains unsupported by this projection target.

Native files live under the selected application root's
`diagnostics/replay/<session-id>/`. `manifest.json` remains unfinalized evidence,
`records.jsonl` is append-only, and successful stop atomically publishes
`finalized.json` with byte count, SHA-256 and committed sequence. Reload/process
loss leaves an unfinalized capture. No automatic upload or normal product UI
control is introduced. See the configuration owner for budgets and retention.

After private content review, supply independently written assertions and run:

```powershell
bun run replay:extract --capture <private-capture-directory> --assertions <assertions.json> --out <new-private-case.json> --id <case-id> --private-reviewed
```

Extraction verifies fixed contained files, journal hash and watermark, checks
target support and replays the case before writing a new private file. It never
overwrites an output or derives correct expectations from captured behavior.
The output must be outside every Git checkout and the original capture directory;
existing files are never overwritten. A failed independent assertion creates no case.
`--private-reviewed` acknowledges local review; it is not a sanitizer or public
export authorization. Public fixtures still require synthetic replacement and
review. Interrupted sessions are diagnostic-only until prefix support is added.

## Run a case

Prepare the worktree and its exact SDK client, then run:

```powershell
bun run replay validate --case src/lib/replay/fixtures/hydration-race.json
bun run replay replay --case src/lib/replay/fixtures/hydration-race.json
```

The command reads a bounded JSON file, emits a metadata-only JSON report and
exits nonzero for every unsuccessful status. `validate` checks the envelope;
`replay` additionally admits the target's supported capabilities and exercises
the current client and page controllers. Reports identify the committed host
revision and whether the worktree is dirty; local edits are exercised too, so
a dirty result is not evidence that the printed revision alone passes. No provider, application
database, process tool or real transport is available to the replay target.

The current `format_version: 1`/`target_version: 1` bundle has inline `initial`,
`records`, `schedule` and `assertions`. This single bounded file is the first
implementation of the logical case layout in the proposal. Content-addressed
payload files remain planned; local journal conversion is implemented. Do not interpret
ordinary log files or metadata traces as compatible cases.

## Supported coverage

`createChatReplayTarget` runs the actual SDK chat subscription projection,
`subscribePageChatEvents`, `createCheckpointController`, shared stream-start/
user-insertion helpers, `createChatRunStart` and `createChatFinalizer`. The shipped page consumes the
same helpers/finalizer, with its normal effects. A plain scoped state facade
replaces Svelte reactivity during headless replay; it does not duplicate the
production transitions.

Full cases currently support initial user/assistant text, thinking and runtime
notices, explicit existing
streams, announced run starts, response-start/memory-retrieval/model-usage event
projection, tool-call/result correlation, text/thinking chunks, checkpoint/done/
cancelled events and hydration through scripted product operations. Actions
are `hydrate`, `insert-user` and `start-stream`. Unsupported events, effects,
content kinds, initial states and prefix cases stop with `unsupported`.
The target does not yet prove queue submission, approvals, plugin frames,
unannounced run recovery, resync, reload, files, usage polling/suggestions or Runtime behavior.
Do not extend coverage by replacing an unsupported capability with a no-op.
No-op host affordances are limited to recents, notifications, timing persistence
and absent file/usage work outside this target's stated coverage.

The initial recording rejection preserves a generic safe operation-error code;
cases depending on a particular server error message/category are not qualified
by this recorder. Provider system prompts and tool definitions are removed from
checkpoint responses before ingestion because they are outside the frontend
projection. Exact chunk boundaries and supplied tool/assistant identities remain.
Responses returning `undefined` use `output_kind: "undefined"` with a null JSON
placeholder; replay resolves `undefined` again. A plain null stays null. System
checkpoint messages are refused before recording rather than storing provider
context or changing snapshot cardinality.

`bun run test:blackbox:fault-recording` qualifies the native writer and the
record -> hash verification -> independent assertions -> extraction -> replay
chain in light/dark and en/zh. Its source is synthetic; this is not evidence that
a historical incident failed before a fix.

`bun run test:blackbox:live-fault-replay` uses an isolated main window, ordinary
composer and real SDK Runtime with a loopback Ollama fixture. It records normal
completion and Stop during an actual partial provider response in light/dark
and en/zh, checks native journal integrity, extracts with predetermined content/
record-count/cleanup expectations, then repeats each offline case five times.
Cancellation preserves the user, partial assistant and separate durable
interruption notice: the SDK terminal checkpoint contract owns those three
records. Select the exact `TAURI_PILOT_SOCKET` and a dedicated `OPENAGENT_HOME`
containing `fault-replay`; configured workspace must be `<home>/workspace`.
The runner restores settings and deletes only conversations it created. Captures
and screenshots stay private in temporary fixture directories. This qualifies
real consumer recording paths, not a historical affected revision or SDK replay.
Runtime/approval/reload qualification still needs its target adapters.

Each request must match the next recorded operation and payload in observed
request-start order. `await-request` checks that the current code has issued it;
`resolve`/`reject` releases its scripted promise; `deliver` enters actual client
subscription callbacks. Explicit `drain`/assertion gates drain released promise
chains without advancing logical time. The current target bounds microtask
draining and rejects remaining full-case work rather than assuming quiescence.
Internal task races and timer-dependent cases need their own scoped seams.

All records and assertions must be scheduled, request outcomes must pair with
starts, producer sequences must be contiguous and links must point backward.
Malformed identities, unsafe keys, excessive depth/bytes, unsupported versions
and dangling links cannot reach the target. Request mismatches remain fatal even
if product code catches the transport rejection. A failing assertion reports its
stable ID without exposing payload values. These checks validate bundle integrity,
not completeness of a real recording; the recorder must supply anchor/watermark
evidence before any capture is accepted.

The three bundled fixtures cover repeated conflicting tool results, a delayed
old terminal after a new stream, and user insertion during terminal hydration.
They are wholly synthetic and labelled coverage cases; no affected historical
revision has been qualified with the new harness yet. Bun tests repeat each
schedule 20 times and exercise invalid, incomplete, unsupported and negative
assertion paths. They do not claim verified incident reproduction.

## Native verification

The developer-only `streaming-transcript-preview-replay` variant runs these same
cases and renders final observations using the real MessageList. It stays in
the lazily loaded standalone preview tree, outside normal product startup.
Use a task-owned source development instance and explicit pilot socket:

```powershell
$env:OPENAGENT_HOME = Join-Path $env:TEMP 'openagent-fault-replay-native'
$env:OPENAGENT_DEV_RUNTIME_SOURCE = '1'
bun tauri dev --multi-instance fault-replay
# In the runner shell, use that instance's exact TAURI_PILOT_SOCKET and home.
bun run test:blackbox:fault-replay
```

The committed native scenario runs every fixture in light/dark and en/zh,
asserts the report plus visible user/assistant preservation, and returns to the
original page. It verifies rendering after the shared controller transitions;
it does not substitute for real composer/queue interaction coverage when those
capabilities are added. Recorder implementation must also add isolation and
completeness tests described by the proposal.

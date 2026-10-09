# Fault recording and deterministic replay proposal

Status: frontend replay foundation implemented with a bounded inline case bundle;
see [the actual workflow and capability limits](fault-replay.md).
Initial developer frontend recording and extraction are implemented for the
foundation's limited capabilities. The private SDK also implements a bounded
async model-boundary journal, an anchored embedded capture controller and a
constrained Runtime case runner; `bun run replay`
dispatches Runtime cases to that current private checkout. Desktop SDK arming and
general adapter cases, reload continuation and
configuration switches remain proposed.
The chat owner maintains the shared host-facing contract. SDK recording and
execution details must be designed and implemented in the private SDK repository.

## Goal and existing boundaries

Turn an observed incident into a small, repeatable regression case: capture the
inputs and external outcomes that caused it, replay them through current code,
and assert the intended behavior. A fix must pass the case; the affected revision
must fail the same behavioral assertion when available. Preserve the original
capture separately so minimization does not erase incident evidence.

Existing chat tests already model duplicated tool events, delayed terminal
events, hydration races, and interrupt handoffs. Native scenarios exercise
rendering and restoration. These are suitable first cases, but handwritten
fixtures and source-text checks do not supply a general incident replay format.
Existing diagnostic traces can locate an incident; metadata-only traces cannot
reconstruct missing request bodies, checkpoint snapshots, or event payloads.

Runtime events remain lossy projections, as specified in
[the product-host contract](product-host-contract.md). A recording is diagnostic
evidence, never a replacement checkpoint store or production recovery mechanism.
Record the durable responses the consumer actually received, rather than
rebuilding snapshots from parent links or querying a later database state.

## One case format, separate execution responsibilities

| Replay target          | Recorded boundary                                                                                        | Code exercised                                                               | Responsibility                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------- |
| `frontend`             | User actions, typed client requests/responses, delivered events, bootstrap and persisted frontend drafts | Existing page startup, chat handlers, queues, reconciliation and projections | Public host                                 |
| `runtime`              | Submitted inputs, initial durable fixture, model outcomes and supported external effects                 | Canonical SDK execution and persistence                                      | Private SDK                                 |
| `adapter` (later)      | Sanitized wire frames and connection outcomes                                                            | Actual transport/provider decoding                                           | Owning SDK transport or native host adapter |
| Native UI verification | A frontend case plus real interactions                                                                   | Actual rendered Svelte/Tauri surface                                         | Public host and tauri-pilot                 |

The envelope, case identity, scheduling vocabulary and report shape are shared.
Target-specific payload schemas and assertions stay with their owners. The
public host must not copy private model requests, provider projection logic,
runtime reducers, or private incident fixtures. Publish only the host-facing
contract and wholly synthetic public fixtures here. The SDK ships its matching
contract and private cases through its own delivery workflow.

Use a recording decorator on the shared typed client transport for requests,
responses and consumer-delivered events. It must preserve values, errors,
callback order, subscription lifecycle and cancellation behavior. Also capture
user intent at the existing action boundary and initial frontend draft state;
transport traffic alone cannot reproduce optimistic messages or reloads.
Transport observation precedes the normal consumer callback without awaiting
disk writes. Native/remote adapters retain their existing ownership.

SDK recording attaches to the canonical execution boundaries. The current
private SDK records model HTTP bodies/frames below its existing provider decoder
and compatibility layer, preserving their decoding semantics. Runtime replay
substitutes that recorded IO and supported
effect adapters while retaining the production execution path. A frontend replay
can demonstrate a display race without proving runtime correctness; reports
must name the target and cannot infer cross-layer coverage.

## Capture lifecycle and completeness

Two capture modes are proposed. `metadata` retains identifiers, kinds, timings
and completeness counters and is explicitly not replayable. `replay-local`
requires explicit session opt-in and captures the necessary private payloads.
No always-on content recording and no automatic upload are introduced. The
first milestone exposes developer tooling only; any product UI follows the
configuration and desktop owners.

Credential values, authentication headers/cookies, complete configuration files
and unrelated conversation content are excluded at ingestion in both modes.
Record only the allowlisted fields needed for the selected target. Raw capture
payloads may still contain user-sensitive text and therefore remain private.
This recorder is separate from existing diagnostic upload and model tracing;
neither pipeline may automatically export replay content.

Starting capture selects a workspace/window and conversation set, allocates a
session ID, and establishes a consistent anchor before recording replayable
traffic. Buffer ingress while the initial bootstrap/draft snapshot is read;
join the buffer to that anchor using request generations and durable revision
identities. If the sources cannot prove a consistent cut, mark the target
incomplete rather than guessing. For the first replayable capture, require an idle
conversation and begin before the triggering action. Mid-run capture is accepted
for diagnosis but is not eligible for runtime replay without an execution anchor.

Completeness is target-relative. Each anchor and consumer epoch records the
available source revision/watermark, subscription establishment acknowledgment
and writer committed watermark. Recorder sequence continuity proves continuity
only after observation. An upstream delivery gap is a recorded resync transition
or invalidates claims requiring the missing events. An undetectable upstream gap
precludes producer-completeness claims; a frontend case can still reproduce
exactly what its consumer observed. Anchor/subscription cutover evidence is a
required deliverable for the host and SDK owners before recording is qualified.

Use producer-local monotonic sequence numbers plus correlation IDs and causal
links. A writer's file order and wall-clock timestamps do not establish a global
order across processes. The frontend records its own observation order; SDK
records its own boundary order. Cross-process joins require explicit links;
clock proximity alone cannot manufacture them.

Capture subscription start/end, delivery errors, resync requests, operation
start/resolve/reject, action start, relevant draft writes, and reload boundaries.
On reload, retain the recording session and consumer epoch through the
developer recorder service. Capture the new bootstrap and draft reads; do not
silently reconnect to the real Runtime during replay.

The append-only journal uses a bounded asynchronous writer. Proposed initial
limits are 128 MiB per session and 16 MiB per referenced payload. Overflow,
serialization errors and writer failures increment loss counters and invalidate
the affected target. Process loss leaves the manifest unfinalized rather than
relying on a dead producer to increment a counter. Never block a model callback
waiting for storage, silently sample stream chunks, or truncate a payload and claim a full
recording. Finalization drains with a bounded deadline, verifies payload hashes,
and atomically writes the manifest. An interrupted journal can be salvaged for
diagnosis; it is replayable only if its anchor and declared test prefix are
complete. Prefix cases must make no claims about omitted terminal behavior.
Salvage verifies committed watermarks and hashes for an explicitly declared
prefix; a missing final manifest cannot be interpreted as a complete session.

## Artifact and case contract

Local captures live in a new diagnostic subtree under the selected application
root, proposed as `<OPENAGENT_HOME>/diagnostics/replay/<session-id>/`. The
configuration owner defines the actual persistence/configuration API. Debug
captures use the dev root or an explicit task fixture; replay never opens the
installed release store. Raw captures are private local user data and are
excluded from Git, console output, public CI and ordinary transcript UI.

```text
capture/
  manifest.json        # Versions, source revisions, target completeness, hashes
  records.jsonl        # Ordered boundary records and causal links
  payloads/            # Content addressed, bounded private payloads
case/
  case.json            # Identity, target, requirements, incident provenance
  initial.json         # Target-owned initial fixture
  schedule.jsonl       # Actions, external outcomes and explicit release gates
  payloads/            # Reviewed minimal synthetic or sanitized payloads
  assertions.json      # Independently authored behavioral expectations
```

Captures and cases carry `format_version: 1`, target payload schema versions,
host/frontend/SDK revisions, protocol version, OS, locale/theme and enabled
capabilities/package versions relevant to the case. Unsupported versions and
missing required capabilities fail validation. Source revisions identify the
incident environment; candidate replay uses the current checkout and records
its actual revisions. An adapter requiring an unavailable contract is reported
unsupported, never successful. Any future conversion is explicit and preserves
the source artifact rather than silently accepting incompatible shapes.

Private captures retain exact SDK revisions and incident provenance. Public
cases carry approved public contract identities and synthetic initial state;
their private revision/provenance mappings remain private. Local replay reports
record the actual exercised revisions, while public reports project only
approved compatibility identities. Required target versions are never omitted.

Each boundary record has `record_id`, `producer`, `epoch`, `seq`, `kind`,
`correlation`, `caused_by`, `monotonic_offset_us` and an optional `payload_ref`.
Payload references specify a relative contained path, byte length and SHA-256.
Validation bounds record count, aggregate bytes, nesting depth and individual
payload size before decoding. Reject traversal, external URLs, symlink escapes,
duplicate record IDs, cycles in causal/schedule links and invalid request pairs.
Correlation preserves conversation, branch, execution, logical turn, assistant,
tool, request, subscription and request-generation identities where supplied.
An absent, blank or duplicated identifier stays absent, blank or duplicated;
normalization must not repair the incident. ID namespaces remain distinct.

Record kinds include `action`, `request.begin`, `request.resolve`,
`request.reject`, `event.deliver`, `subscription.begin`, `subscription.end`,
`subscription.error`, `draft.read`, `draft.write`, `epoch.begin` and target-owned
model/effect records. The owning schema enumerates the exact operation/event
names and payloads; unknown kinds and dangling causal references are errors.

The schedule references records by ID and explicitly controls when pending
operations settle, events arrive, actions occur and reload epochs begin.
For example, this synthetic frontend case expresses a terminal hydration race:

```json
{"step":"s1","do":"action","record":"submit-A"}
{"step":"s2","do":"await-request","request":"hydrate-A"}
{"step":"s3","do":"action","record":"queue-user-B","after":["s2"]}
{"step":"s4","do":"resolve","request":"hydrate-A","payload":"durable-A","after":["s3"]}
{"step":"s5","do":"deliver","record":"cancelled-A","after":["s4"]}
{"step":"s6","do":"assert","assertion":"one-terminal-A-and-retained-user-B","after":["s5"]}
```

These are proposed runner operations, not commands available today. The runner
must observe `hydrate-A` from current code before releasing its response; it
must not directly assign the desired post-hydration state. Internal background
operations relevant to that target must also be present in its fixture.

## Deterministic runner and assertions

Load each case into an isolated in-memory frontend store or temporary SDK data
root. Disable scheduled external work unless it is explicitly part of the case.
Provide scoped deterministic IDs and a virtual clock at relevant dependency
boundaries; never patch process-global time for unrelated work. Preserve
production state transitions. Target-owned synchronization seams release
captured external outcomes at the recorded gates. A real-time deadline only
detects deadlocks; it never decides event order or whether an assertion passes.

Frontend replay binds a scripted transport to the normal SDK client facade,
drives existing action handlers, and exercises the existing startup/events/state
path. Match each issued request to a pending fixture by operation, payload,
generation and identity; unexpected, ambiguous or unmatched requests fail.
Events reach the actual subscription callback in recorded consumer order.
Reload destroys the old consumer, retains only recorded persisted state, creates
the new consumer and releases its recorded bootstrap. Avoid testing only a copy
of reducer logic or invoking handlers with a hand-built final state.

Runtime replay uses the normal SDK input route and its declared model IO boundary.
Supported tools/effects run with isolated state and deterministic dependencies;
recorded external outcomes replace only the relevant effect boundary. Retain
argument validation, approvals, cancellation and persistence. Every adapter
declares whether effects are executed locally or simulated. Unsupported effects
refuse the case; recorded arbitrary shell commands, plugins, HTML and network
requests must not execute. No fallback to a real provider, live workspace,
credentials or unscripted network access is permitted.

Enforce this through a deny-by-default replay capability boundary covering
provider/network access, process/plugin execution, filesystem access and
resource loading. Allow only declared fixture effects and contained temporary
state; unexpected access fails the run. Native rendering has the same external
resource restriction. Qualify each target with an attempted forbidden effect.
The target owner implements its synchronization and capability seams; neither
seam may encode the expected outcome or bypass product validation.

Before each assertion, drain the target's released work using explicit idle or
state observation gates. Match errors structurally while retaining categories
needed by the incident. Exact stream chunk boundaries are preserved; coalescing
can conceal rendering or tool-correlation failures. A supplied schedule makes
external order reproducible, but not every internal task interleaving. A case
requiring an uninstrumented race is reported unsupported until its owner adds a
scoped gate. Perturbed schedules are separate generated cases with fixed seeds;
the observed schedule remains immutable.

Assertions are reviewed separately from recorded outputs. A broken capture is
evidence of the trigger, not a golden expected result. Define observable
invariants such as unique terminal rows, preserved queued inputs, sibling
conversation isolation, bounded retry, clean restored history or complete
tool-use/result pairing. Assertions can run at intermediate steps and at the
end. Require all declared assertions, consumed external outcomes, no unexpected
requests/effects, and no unresolved work; a runner error cannot satisfy an
expected product-error assertion. Source-text tests remain contract guards and
do not count as replay coverage.

The no-unresolved-work requirement applies to full cases. Prefix cases declare
their observation boundary and exact allowed pending requests/executions.
Unexpected pending work fails. Declared pending work cannot support assertions
about terminal completion, durable completion or subsequent recovery.

Reports distinguish `passed`, `assertion_failed`, `invalid_case`,
`capture_incomplete`, `unsupported` and `runner_failed`. CI treats every status
except `passed` as unsuccessful. Reports contain case/step/assertion IDs, actual
source revisions, target, seed, coverage boundary and sanitized state differences.
Sensitive payloads remain in private artifacts, with stable diagnostic IDs.

## Capture-to-regression workflow

1. Arm local recording before the trigger and capture the affected scope.
2. Finalize and validate the capture; inspect its completeness and anchor.
3. Extract a case, minimize unrelated actions and convert payloads to synthetic
   equivalents or reviewed sanitized data. Keep a private provenance link and
   loss/transformation summary outside the public fixture.
4. Author the intended assertions from the bug's behavior contract.
5. Replay the observed schedule against the affected revision and the candidate
   fix in isolated checkouts; require the same behavioral assertion to fail
   before and pass after. A compile/schema/runner failure is not proof of the bug.
   Use the same case, schedule, assertions and compatible harness contract on
   both revisions, exercising each checkout's production code. A backported
   test seam requires review as behavior-preserving. If compatible execution
   cannot be established, classify the case as coverage-only.
6. Run the minimized case repeatedly (initial acceptance: 20 runs) without wall
   clock sleeps; reject inconsistent outcomes. If the affected revision is
   unavailable, record that limitation and label the case coverage-only rather
   than claiming confirmed reproduction.
7. Commit the reviewed case to its owner and register it in that owner's suite.
   Changed visible behavior also needs the existing native UI verification.

Sanitization replaces secrets and unrelated content before export, uses stable
per-case aliases for identifiers/paths, and preserves equality, order, relevant
length/Unicode structure and error distinctions. Length-dependent bugs require
synthetic payloads with the same triggering property. Attachments and binary
payloads need explicit reviewed replacements. Never hash raw secrets into public
fixtures. If sanitization removes a required property, keep the case private or
report it unsupported. Private source revisions/provenance stay private too.
Export validation includes containment, schema, secret/content review and a
successful replay of the sanitized case. A scanner alone is insufficient.

## Delivery milestones and acceptance

| Milestone                      | Deliverable                                                                                                     | Acceptance                                                                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1: frontend replay foundation  | Versioned validator, scripted transport/action harness, scheduler, assertions and report; synthetic cases first | Existing duplicate-tool, delayed-terminal and hydration-race cases execute through current handlers; unsupported input cannot pass      |
| 2: opt-in local recording      | Transport/action/draft recorder, anchor, bounded journal and reviewed export tooling                            | One newly recorded incident can be converted and replayed; overflow, reload and interrupted capture have explicit completeness results  |
| 3: SDK replay                  | Matching private contract, model/effect adapters and private fixtures                                           | Protocol failure/retry/cancellation cases execute the canonical Runtime and persist inspectable terminal state without external effects |
| 4: native and adapter coverage | Native scenarios consuming cases, then targeted wire/connection recording                                       | UI assertions run in real Tauri; wire cases test actual decoding; reports distinguish all targets                                       |

The initial backlog is: duplicate/conflicting tool result; terminal checkpoint
hydrated before cancellation event; old terminal event after queued next turn;
queued user insertion during hydration; approval resume before run release;
resync/bootstrap with stale response; invalid model tool identity with bounded
retry; cancellation during retry. Every case has an unaffected sibling scope
where isolation matters. Normal cases accompany failure/recovery cases.

The frontend provides `bun run replay validate|replay --case <path>`, the explicit
developer main-window `openagentFaultCapture.start/stop` API and
`bun run replay:extract`. The native writer/converter and normal-completion/
partial-response cancellation recording paths are implemented and qualified
through the real composer and Runtime. Offline coverage remains frontend
consumer projection. SDK execution has a qualified private subset; desktop SDK
arming, general effects and additional wire adapters remain proposed.
See [the workflow](fault-replay.md) for exact capability limits and qualification
commands. Do not add placeholder scripts or advertise proposed SDK verbs as
existing commands.
Frontend cases join Bun tests/preflight and existing frontend CI classification;
SDK cases join SDK tests. No recording or model call is needed in default CI.
Native runners retain the existing theme/locale and isolated-instance rules.

## Complex Runtime trajectories: implementation order and acceptance

Runtime work prioritizes automatically recorded tool outcomes, approval and retry
trajectories before desktop arming. Target version 3 implements the qualified
tool-outcome subset; approval/resume, retry clocks and general adapters remain
proposed. Model-only tests with manually supplied effect outcomes do not prove
automatic effect capture. Private recording seams and payload codecs belong to
the SDK conversation-runtime owner.

Treat a tool's externally observed outcome and Runtime's approval decision as
different records. Replay substitutes only the declared external effect. Current
code still validates arguments, decides approval, creates and resolves interrupts,
matches tool identities, projects history and persists checkpoints. A skipped or
denied call is never inferred to have executed. An execution error retains its
typed classification and model-visible content; rendered text is insufficient
to reconstruct typed text/JSON/image blocks or refusal semantics.

Each new capability receives a target-schema version and named qualification.
An adapter declares its recorded boundary, supported input/output/error shapes,
resource restrictions and causal release gates. Unknown adapters, missing
outcomes, undeclared metadata and unmatched calls fail qualification. An adapter
cannot claim filesystem, process, plugin or network replay merely because a
model received the recorded tool-result text.

| Delivery slice | Required observed trajectory | Independent behavior assertions |
| --- | --- | --- |
| Tool effect recording | Invalid call identity, protocol rewind, valid tool dispatch, follow-up completion | Invalid call executes zero effects; valid call executes once; a later retry never repeats a completed effect; results retain their own call IDs |
| Tool errors and argument recovery | Invalid arguments, typed execution error/refusal, corrected call | Invalid arguments enter neither approval nor execution; exact feedback is retained; failure/refusal/success stay distinct; the correction consumes only its own recorded outcome |
| Approval and resume | Approval required, allow/deny, persisted interrupt, canonical resume, batched decisions | Denial executes zero effects; allow executes once; duplicate/stale responses cannot consume another pending call; logical Turn identity and selected branch survive resume |
| Retry clock and cancellation | Failure, recovery checkpoint, delay entered, retry release or Stop | Retry budget resets per distinct request; exhausted retries restore clean provider history; Stop during delay issues zero further provider requests and persists one interruption |
| Combined isolation | Successful tool round, later failed request, approval/cancel, unaffected sibling | Earlier tool results survive rewind; sibling tip/history/interrupts remain unchanged; all released work drains and run locks are released |

For approval, include both an answer submitted before the previous run releases
and an answer after release. Gate on the observed interrupt and persisted state,
not a guessed delay. Multiple pending approvals need exact identities; a recorder
must preserve duplicates or blank IDs as evidence rather than repair them.

Retry delay is a scoped Runtime dependency with explicit enter/release/cancel
observations. Replay does not shorten a configured delay or patch global time.
Model-queue switches retain distinct request, attempt and binding identities.
Zero-delay tests remain qualified only for their existing subset until the clock
and queue capabilities have their own recordings and fixtures.

Every slice must record through canonical execution, finalize the original
private journal, and extract its external outcomes automatically. Tests cannot
fill the replay result from the expected answer. Acceptance requires twenty
replays with zero source-provider/effect calls, a deliberately wrong independent
assertion that fails, and an attempted undeclared effect that fails before access.
Where available, the affected revision must fail the same behavior assertion;
otherwise report coverage-only. Interrupted/unsupported captures remain evidence
and never become passing full cases. Desktop or UI qualification is additional
and is not inferred from these Runtime results.

Before milestone 2, the configuration owner must define retention/byte budgets,
local permissions and the opt-in lifecycle; the host and SDK owners must agree
on anchor/correlation contracts. Before milestone 3, each effect adapter must
declare replay semantics and coverage. Persisted settings or schemas require
their normal versioning/migration work. This proposal adds no production data
transition, Runtime operation, debug endpoint, or UI control.

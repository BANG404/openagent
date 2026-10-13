## Software error collection

`diagnostic_log_collection_enabled` defaults to `true` and is exposed in
General settings. It controls remote diagnostic upload immediately without an
application restart. Turning it off stops OTLP export while continuing to keep
rotating local logs so the user can inspect or deliberately share them during
support.

The supervised Runtime writes `openagent.<date>.jsonl`; the thin desktop host
writes `openagent-host.jsonl.<date>`, so the host and Runtime do not share a log
writer. Multiple desktop host processes may append to the same host file for a
given day. Each rolling log family retains at most 15 files. Host
component-update records use fixed component/stage values and bounded
version/error categories. Raw frontend errors, conversation IDs, and
conversation content do not enter those lifecycle records.

Remote diagnostics contain application version, operating system, architecture,
severity, an allowlisted event name, component, and error type. They exclude
conversation content, prompts, model output, tool arguments and results,
configuration values, credentials, file contents, raw frontend error messages,
and stack traces. Model-context spans remain isolated in the optional Langfuse
pipeline and are not application logs.

The release-qualified Runtime build receives the write-only ingestion credential
from the `OPENAGENT_LOGS_INGEST_TOKEN` repository secret before Cargo compilation.
A missing credential fails the Runtime artifact build; injecting it only while
packaging the desktop shell cannot enable a precompiled Runtime.
Frontend diagnostics use the shared authenticated Runtime operation, so filtering,
local JSONL recording and remote export share the same collection switch.
Component-update lifecycle records remain a desktop-host capability.
Local builds may set the same environment variable and may override the default
`https://openagentlogs.ibat.ac.cn/v1/logs` destination with
`OPENAGENT_LOGS_ENDPOINT`.

Verify frontend export in a native fixture with `tauri-pilot` and
`bun scripts/test-diagnostic-logs-blackbox.mjs`. Start the source development
instance with a temporary `OPENAGENT_HOME`, a dedicated `TAURI_PILOT_SOCKET`,
`OPENAGENT_LOGS_ENDPOINT=http://127.0.0.1:19418/v1/logs`, and
`OPENAGENT_LOGS_INGEST_TOKEN=diagnostic-blackbox-token` (a fixture-only value).
Use those same variables for the runner. It starts an authenticated loopback
collector and covers frontend errors, immediate upload disable/reenable without
restart, continued local recording,
native forwarding, and rejection of raw error values. Production reception can
then be checked with one deliberately triggered fixture diagnostic and the
server's archived `service.name=openagent` record; never upload user logs as a
connectivity test.

The model-service list and default-model provider selectors show the configured
service name together with the icon mapped from its provider type, independent
of the configured display name or base URL. Default-model selectors include the
icon in both the selected value and the option list. Every catalog provider type
must have a bundled icon; the exhaustive mapping makes a newly added type fail
type-checking until its asset is assigned. Artwork comes from Cherry Studio at
commit `16e2905fd30fbfe21d1c58651574dcc939b6fb30` where available, with missing
brands sourced from the provider's official site or project repository.
The service name is optional. When it is blank, configuration normalization uses
the hostname of the configured request URL, or the hostname of that service
type's default request URL when no custom URL is set. Services without a valid
request URL fall back to the catalog display name.

Default-model and retry-queue bindings treat the provider and model as one
selection. Changing a provider immediately replaces the model with that
provider's first available model, so a model name from the previous provider is
never displayed or persisted against the new provider. Model selection uses a
catalog menu with a separate, clearable search field; editing the search query
does not mutate the selected model.

User-facing settings and onboarding describe provider choices as model services;
they do not expose the runtime framework that implements those integrations.

Provider model catalogs are editable configuration rather than an authority on
account entitlements. In particular, the ChatGPT OAuth service exposes a
built-in catalog, which may lag the models available to an account. Its settings
and onboarding views therefore call out manual model entry; fetching that
catalog again replaces the configured model list, including manually added
names. Fetching a non-empty model catalog or successfully detecting a service
with a non-empty catalog also enables that model service and repairs unavailable
default-model bindings; an empty catalog leaves the service disabled. Model
configuration lets a user declare that a model supports reasoning effort.
For any declared non-ChatGPT model, the composer exposes Light, Medium, High,
Extra High, and Ultra and Rig receives `reasoning_effort = low | medium |
high | xhigh | max`. ChatGPT OAuth models always support the control and use
the Responses API form, `reasoning.effort`; chat retries, interrupt resumes,
and flash-agent work use the same model setting. A model without an explicit
selection keeps the provider's default (shown as Medium in the composer). A
service must support the documented field before users enable it for a model.
OpenAgent does not currently expose ChatGPT speed/service-tier controls, so
request scheduling uses the provider path's default.

OpenAgent validates `messages.db` before constructing the runtime. Schema v3 is
the current compatibility baseline. A database inside a future declared support
window must be upgraded through an explicit atomic migration with a consistent
pre-migration backup. A populated unversioned database, a database outside the
support window, or a structurally invalid current database instead enters the
interactive backup-and-fresh-store transition described above. The backup uses
SQLite itself so committed WAL data is included. The v1-to-v2 migration adds
durable follow-up suggestions keyed by the logical Turn response ID, allowing
reload, branch switching, and paired clients to restore the same suggestions.
The v2-to-v3 migration adds new-conversation suggestions keyed by workspace and
locale so they survive WebView resets and are shared through the SDK. Upgrading
directly from v1 applies both migrations atomically.
Keep the reported backup until
the upgraded application and conversation behavior have been verified.

The current compatibility window is explicit:

| Stored schema                       | Startup behavior                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| No database or empty SQLite file    | Create schema v3                                                                |
| Populated unversioned legacy schema | Ask; on consent back up consistently, then create a fresh schema v3 database    |
| Valid schema v1                     | Back up consistently, then atomically migrate to schema v3                      |
| Valid schema v2                     | Back up consistently, then atomically migrate to schema v3                      |
| Valid schema v3                     | Validate and open                                                               |
| Invalid schema v3 or higher schema  | Ask in desktop mode; back up and replace only on consent; non-interactive stops |

Configuration and database scopes are evaluated independently. For example, an
unversioned configuration paired with a valid schema v3 database resets only
settings; its conversation history remains active.

## Explicit Help problem reports

Help exposes Report a problem with a required description and an optional,
default-off current-conversation trace. The UI captures the conversation ID when
opened, explains the model/tool and message content included, and sends only
through the typed Runtime `submit_problem_report` operation. The confirmation
button uploads; failures retain the draft and never show a success receipt.
Explicit reports are independent of the automatic diagnostic-log preference.
Every confirmed report attaches bounded recent Runtime and desktop-host logs,
even when the optional conversation trace is off. The dialog explains that logs
may contain error details and local paths. Missing logs are allowed; a log read
failure preserves the description and prevents a success receipt. The private
attachment contract belongs in `sdk/docs/support-reports.md`.

Runtime exports the complete durable snapshot without truncation and keeps report
payloads out of telemetry. See `sdk/docs/support-reports.md` for the private
contract. The separate write-only receiver and its deployment/retention contract
live in `deploy/support-reports/README.md`; the automatic OTLP collector remains
bounded diagnostic metadata only. Verify actual Help interactions in the Tauri
window in Chinese/English and light/dark, including default-off trace consent,
description-only and full-trace receipts, plus a retry after network failure.
The native support scenario also asserts localized log disclosure, both log
families in reports while automatic collection is disabled, and no upload on a
log-read failure followed by successful retry without losing the description.

Run `bun scripts/test-problem-reports-blackbox.mjs` with the same temporary
`OPENAGENT_HOME` and pilot socket as the native fixture, plus
`OPENAGENT_SUPPORT_ENDPOINT=http://127.0.0.1:19419/v1/support/reports` and the
fixture-only diagnostic credential. The runner refuses non-temporary homes,
creates only synthetic conversation records, and checks a complete 205-request
trace, default-off consent, failure retry, and actual theme/locale changes after
reload. `SUPPORT_BLACKBOX_FORWARD_PRODUCTION=1` additionally forwards only the
synthetic fixture payloads to the configured production receiver using a
credential read in memory through SSH; do not run that mode with user data.
Verify the returned UUID archive on the server. Screenshots stay in the fixture
home, never in the repository or user report archives.

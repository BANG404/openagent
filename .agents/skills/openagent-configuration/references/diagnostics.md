## Software error collection

`diagnostic_log_collection_enabled` defaults to `true` and is exposed in
General settings. It controls remote diagnostic upload immediately without an
application restart. Turning it off stops OTLP export while continuing to keep
rotating local logs so the user can inspect or deliberately share them during
support.

Remote diagnostics contain application version, operating system, architecture,
severity, an allowlisted event name, component, and error type. They exclude
conversation content, prompts, model output, tool arguments and results,
configuration values, credentials, file contents, raw frontend error messages,
and stack traces. Model-context spans remain isolated in the optional Langfuse
pipeline and are not application logs.

Release builds receive the write-only ingestion credential from the
`OPENAGENT_LOGS_INGEST_TOKEN` repository secret. Local builds may set the same
environment variable and may override the default
`https://openagentlogs.odn.cc/v1/logs` destination with
`OPENAGENT_LOGS_ENDPOINT`.

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

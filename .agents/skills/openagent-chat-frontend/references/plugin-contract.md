# Shared Runtime Types

Plugin store filters and both marketplace/installed discovery badges use the
catalog's `discoveryCategory`, independently of the Runtime manifest `category`.
The controller owns the bound filter setter and resolves installed classification
from the complete fetched registry, not the filtered card list. Catalog failure
must not disable installed management or channel configuration. The plugin owner's
[registry contract](../../openagent-plugin-development/references/official-registry.md)
owns the taxonomy and native verification scenarios.

Chat styles consume the design system's semantic CSS tokens and matching
foreground pairs. Shared primary actions never fix their foreground to white.
Theme changes must repaint mounted charts and diagrams as well as DOM surfaces;
they do not change transcripts, streaming ownership or component identity.
The design-system semantic-themes reference owns token naming and composition.

PageRuntime is the single owner of appearance tokens and native-canvas class
selection. Its effective settings preview or saved config must drive both;
background edits must not leave the root transparent over a custom/plugin color.
Chat and composer continue to consume the existing shared surface tokens.
PageRuntime also owns selected theme FontFace registration through the shared
SDK asset reader. Cleanup retires pending loads on selection, lifecycle or
summary refresh; font decoding must not block chat restore or remount surfaces.
The plugin package contract owns declarations, limits and failure behavior.

Plugin summaries carry optional `local_source` for the Settings source-refresh
controls. Keep it out of conversation state; the plugin owner documents source
associations and task-safe activation. Refresh notifications reload package
summaries while preserving the operation status a user is reading.

The Integrations menu displays and handles the same primary-modifier shortcuts:
Shift+7 opens Plugins and Shift+8 opens Skills (Ctrl on Windows/Linux, Cmd on
macOS). Keep menu hints and global keyboard routing aligned.

The product page injects its shared SDK client and resource event listener into
`OnboardingFlow`. The embedded first-run welcome uses that same component with
native provisioning props and has no SDK transport. Inline onboarding completion
navigates the current main WebView to its ordinary product URL; utility setup
windows retain the existing event/hide handoff. Preserve the frontend-version
parameter, remove temporary setup appearance inputs, and leave chat restore and
event ownership in the ordinary page startup. The update-delivery owner documents
the resource preparation and same-window wizard contract.
The page also supplies the native resource-status reader to the product wizard.
Both product development and production put the application resource summary in Welcome;
Ready is only a settings summary. A configured app's unknown resource status must
not interrupt chat startup by revealing setup. The design owner documents the
welcome and public-asset boundary.
The development onboarding preview passes an incomplete configuration draft to
the wizard without modifying persisted completion. Its save callback accepts
only the local draft, and completion hides the preview without notifying the
main chat window. The desktop owner documents the Inspector entry point.

Child conversations keep their own saved role identity. After restoring the
active conversation or switching to it, load its children independently of
the sidebar's role filter and merge their metadata without replacing live
messages. Startup restoration must not depend on receiving a creation event.
The Chat Groups wake scenario checks both live join-only children and their
visibility after reload.

Plugin MCP descriptors carry additive `mcp_tool_mode` metadata. Installed
Settings cards resolve the optional user override separately from the package
default; the shared Select writes through the controller setter. Display names
use plugin i18n independently of stable package, command and MCP identities.

The shared `src/lib/types.ts` file also carries non-transcript Runtime
contracts such as Agent Plugin update summaries. Extending those contracts
must preserve the existing message, checkpoint, and streaming fields so chat
projection code continues to receive the same shapes.

Plugin summaries may also expose the additive `configuration` declaration,
reusing the pinned SDK type. The installed-settings controller owns its values,
secret-presence projection and OAuth actions through typed product operations;
never carry credential drafts or OAuth token bytes into transcript state.
Configuration and authorization invariants belong to the plugin development
owner's `configuration-authorization.md` reference.

`AgentMessageTag` reuses the pinned SDK's type rather than duplicating its union.
Keep checkpoint tags assignable across desktop and remote transports when the
Runtime gitlink advances; transcript visibility remains a separate projection rule.

The built-in `manage_chat_hooks` tool lists scheduled wakes and cancels exact
hook IDs through Runtime. Its tool cards use the shared localized tool label;
the frontend does not interpret management arguments or edit reminder storage.
The terminal-hooks black-box runner also exercises list/cancel through the
Agent tool registry, unknown-ID failure, localized cards and checkpoint reload
in all light/dark and English/Chinese combinations.

Generic condition hooks persist model-only `hook_wake` input. Hide that input
on checkpoint restoration while retaining the ordinary Agent reply, and keep
historical `terminal_wake` input hidden too. Live hook start events declare
`user_visible: false`; neither path may create an authored-user message or
change composer drafts. The terminal-hooks black-box runner exercises generic
tool registration and hidden input in live and reloaded transcripts.
On Windows, attach DesktopDriver to that fixture's verified native handle.
Run the wrapper in the interactive session with `BLACKBOX_NATIVE_WINDOW_HANDLE`
for PrintWindow captures, or `BLACKBOX_APPIUM_SESSION` plus
`BLACKBOX_APPIUM_URL` for Appium captures, before and after each light/dark,
English/Chinese scenario.

Those plugin update contracts now include the `AgentPluginUpdateReport`
envelope with its per-plugin error kinds and overall check status. They are additive: chat
projection still reads only the transcript, checkpoint, and streaming fields
it read before. `SettingsView.svelte` and
`PageRuntime.svelte` consume the envelope through
`src/lib/agentPluginUpdateCheck.ts`; a change to those types is owned by
`.agents/skills/openagent-plugin-development/`, not by chat behavior.

Published plugin sources are maintained in the public
[openagent-plugin-kit](https://github.com/BANG404/openagent-plugin-kit) and
the product package repositories:

- [Chat Groups](https://github.com/BANG404/openagent-chat-groups)
- [Goal](https://github.com/BANG404/openagent-goal)
- [Graph](https://github.com/BANG404/openagent-graph)

Portable automation messages with `user_visible: true` arrive as user-role
plugin records. `PluginMessage.svelte` is the common transcript renderer: it
does not expose edit controls or user-message indexing and labels the source
plugin from `plugin:<plugin-id>:<tag>` in `pluginTags`.

Chat Groups member wakes request the existing authenticated `hidden: true`
bridge option. Runtime tags their model-only prompt `plugin:chat-groups:control`;
the generic checkpoint projection hides it while retaining the Agent reply.
Keep ordinary group messages and explicit private sends visible. Do not infer
visibility from prompt text or change historical untagged user messages.
Run `test:blackbox:chat-groups-wake` in a fresh fixture with an explicit pilot
socket. Its local model verifies that wake input still reaches the provider;
native live/reloaded assertions preserve the ordinary user bubble and both
replies, and live wakes preserve the unsent composer draft, in English/Chinese
and light/dark.

Goal and Graph are package examples, not frontend-owned command implementations.
The composer and transcript consume the generic plugin command, event, and
checkpoint projections so another package can provide the same surfaces without
a new frontend branch. A package owns its state machine and continuation
scheduling; the frontend only renders the projection and routes the command.

Plugin command summaries admit `optional_text` alongside `none` and
`required_text`. Bare and parameterized commands use the same SDK submission
path; domain subcommands are interpreted by the package, never the composer.

Plugin command summaries optionally carry validated `plugin_i18n` presentation
metadata. Resolve labels and descriptions against the application locale in
both desktop and remote composers; keep the original command IDs and submission
path. MCP App frames initialize `hostContext.locale` from the application locale
and send `ui/notifications/host-context-changed` on live switching without
remounting the iframe or discarding its input. Browser language is not a host
locale source. Package language requirements belong to plugin development.

For plugin tools with MCP UI, show the existing tool-card approval controls
first. Do not mount the app iframe while approval is pending, or while an
approved tool is still executing. Mount the MCP UI only after the tool returns
a successful result. Denied, cancelled, unanswered and failed calls must never
execute their HTML. Verify approval-before-UI, approval awaiting a result,
successful completion and denial in English/Chinese and light/dark.
Run `bun scripts/test-mcp-app-approval-blackbox.mjs` with an isolated
`OPENAGENT_HOME` and explicit `TAURI_PILOT_SOCKET` for this sequence.

ConversationSurface also derives sidebar context from the resolved application
locale store, rather than the raw configuration preference (`system` or a stale
saved snapshot). Sidebar titles and first/live context must follow the same locale
while preserving the mounted iframe and its draft.

Plugin summary types carry optional manifest category metadata. Read those IDs and
validation rules in [package format](../../openagent-plugin-development/references/package-format.md#manifest-categories).
Marketplace discovery purposes follow the catalog contract linked above and keep
display labels localized.

Installed plugin summaries carry `plugin_type` and validated theme token maps.
The page applies the overlay from saved lifecycle state and resolved appearance
without moving credential drafts into chat state. The plugin owner documents
[theme and integration types](../../openagent-plugin-development/references/package-format.md#theme-and-integration-package-types).

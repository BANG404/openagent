# Official plugin registry

Official publication and catalog qualification must satisfy the
[plugin i18n standard](i18n-standard.md), including supported-language display
and coverage of the platform's complete language set.

OpenAgent keeps the official plugin source list in a small registry contract so
clients can discover package addresses without querying the GitHub API. The
bundled reference is `src/lib/officialPluginRegistry.json`; its parser and
marketplace projection live in `src/lib/officialPluginRegistry.ts`.

Each entry requires a lowercase plugin id, a display name, an HTTPS repository,
and an HTTPS `source_url`. The checked-in `version` is copied from that
repository's root `plugin.json` during catalog generation, so the store can
show package versions without a GitHub API credential. `source_url` may point to
a public Git repository or
an archive that the existing Runtime marketplace installer understands. Optional
`sha256` values use the `sha256:<64 hex characters>` form. Credentials,
fragments, duplicate ids, unsupported schema versions, and oversized catalogs
are rejected before a source is passed to the installer.

The registry only supplies discovery and source addresses. Manifest validation,
package containment, process policy, and installation remain Runtime-owned. A
hosted registry can therefore be served from a CDN or another public HTTPS
endpoint without exposing a GitHub token to the client. When archive digests are
published, the Runtime installer integration must verify them before activation;
the current projection preserves the field for that adapter.

The Settings Plugins surface projects the bundled registry into the official
plugin marketplace. Search and availability filters are pure client-side
projections. The marketplace starts with search and availability filters, followed
by plugin cards; omit the introductory heading, description, and catalog count.
Place the Marketplace/Installed switch at the right of the
Plugins page heading; let the heading row wrap on narrow surfaces while keeping
the switch aligned to the right. Installation crosses the typed
`install_official_agent_plugin` Runtime product command. The Runtime writes a
one-entry temporary marketplace under the supported personal marketplace root,
delegates to the normal marketplace installer, and removes the temporary
document after staging. This keeps source addresses visible in the store
without teaching the frontend how to copy, validate, or activate a package.

The published catalog packages use the generic plugin contract: Goal and Graph
expose portable commands, Chat Groups uses its package MCP server, and Cua Driver
declares a portable daemon. They require a Runtime implementing the generic Host
Bridge; do not offer them as replacements for an older Runtime that depends on
package implementation bindings or package flows. A contract migration must
increment the manifest version even when only an extension field is removed,
so installed packages receive a release update.

Plugin release metadata is read from GitHub's public release endpoint without a
user credential. The registry and marketplace installer likewise accept only
credential-free HTTPS URLs without a query or fragment.

Update the bundled catalog and this contract together when an official plugin is
published, renamed, withdrawn, or moved. Keep private provider credentials out
of the registry. Focused coverage lives in `tests/officialPluginRegistry.test.ts`.

Installation shows the Runtime's current phase with an indeterminate progress
indicator beside the corresponding official card's download button. Keep it
visible during connection even if the package already appears installed. If
search, filters, or the installed view hide its card, retain the running status
in the page summary; completion and failure remain visible there. Runtime
phases provide no byte counts or percentages. The plugin-install black-box
scenario asserts card-local progress and disabled duplicate actions during
concurrent installations. Register the progress subscription before sending the installation
request; release it on both success and failure. Track tasks by plugin ID rather
than a page-wide busy flag: distinct official and local-marketplace packages can
install concurrently, while a duplicate click on one running package is ignored.
Keep each task's phase and success/failure visible on both plugin tabs; finishing
or failing one task must neither clear another task nor prevent a failed task
from being retried. Local directory selection accepts multiple folders and
starts them together, keyed by source path. Until a local folder returns its
validated manifest ID, do not attach another package's progress events to it.
The window's task coordinator outlives the Settings dialog: closing and reopening
the plugin surface must preserve running tasks, results, and duplicate protection.
Package activation returns an
authoritative summary, so the card updates immediately even if a subsequent
marketplace discovery fails. Removal similarly clears the installed summary and
update badge after success. Read the installed directory and optional marketplaces
independently, and reject stale refresh responses after a newer mutation.

Installed cards share one version, component summary, diagnostics, sidebar and
repository/update/removal template, including Cua Driver. Cua adds its reserved
MCP probe and tool switches inside that shared card and retains its lifecycle
and explicit host-access controls.

Qualify published sources through `bun run test:blackbox:plugin-lifecycle` in an
isolated `OPENAGENT_HOME`. `BLACKBOX_PLUGIN_IDS` can select catalog entries.
Set `TAURI_PILOT_SOCKET` explicitly to that instance's socket; instance/home
variables do not override the CLI's newest-socket discovery. The runner requires
the explicit socket to avoid mutating another running development window.
The runner checks actual progress, MCP availability, enabled uninstall, preserved
plugin data, and the immediately restored Install action. Repeat with the native
window in light/dark and English/Chinese.

Use `bun run test:blackbox:plugin-installation` for installation and card
qualification independently of package MCP/daemon functionality. It verifies
failure isolation and retry, concurrent catalog installs, duplicate protection,
retained tasks after reopening, common installed-card structure, and removal
with preserved plugin data. This mode does not replace full lifecycle qualification.
It requires the Goal and Graph catalog entries for its failure/retry fixture.
On Windows, set `BLACKBOX_NATIVE_WINDOW_HANDLE` to the fixture's main HWND
(decimal or `0x` hex). The runner uses `scripts/capture-windows-window.py`
with Python and Pillow to capture that native window even when covered. Otherwise
use `BLACKBOX_APPIUM_SESSION` for native screenshots; the final fallback is a
WebView screenshot, which does not qualify native layout.

For Goal, Graph, and Chat Groups functional qualification, run
`bun run test:blackbox:plugin-functionality` against the same isolated window.
Resolve each checkout through the explicit `.env` index described in
[local development](local-development.md); worktrees set `OPENAGENT_PLUGIN_ENV_FILE`.
This exercises installed package commands and tools with
a deterministic local model, including Goal completion, Graph child execution,
group membership, message persistence, and private Agent submission. The runner
restores fixture settings and removes its installed packages. Record source
revisions alongside the generated report; local candidate success does not
qualify an older published repository or justify silently publishing commits.
Use `BLACKBOX_FUNCTIONAL_REPORT` to preserve separate source-version reports;
`BLACKBOX_KEEP_CONVERSATIONS=1` retains only the fixture conversations for the
SDK's checkpoint and renderability diagnostics before explicitly deleting them.

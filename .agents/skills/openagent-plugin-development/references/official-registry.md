# Official plugin registry

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
projections, while installation crosses the typed
`install_official_agent_plugin` Runtime product command. The Runtime writes a
one-entry temporary marketplace under the supported personal marketplace root,
delegates to the normal marketplace installer, and removes the temporary
document after staging. This keeps source addresses visible in the store
without teaching the frontend how to copy, validate, or activate a package.

Plugin release metadata is read from GitHub's public release endpoint without a
user credential. The registry and marketplace installer likewise accept only
credential-free HTTPS URLs without a query or fragment.

Update the bundled catalog and this contract together when an official plugin is
published, renamed, withdrawn, or moved. Keep private provider credentials out
of the registry. Focused coverage lives in `tests/officialPluginRegistry.test.ts`.

Installation shows the Runtime's current phase with an indeterminate progress
indicator. Register the progress subscription before sending the installation
request; release it on both success and failure. Package activation returns an
authoritative summary, so the card updates immediately even if a subsequent
marketplace discovery fails. Removal similarly clears the installed summary and
update badge after success. Read the installed directory and optional marketplaces
independently, and reject stale refresh responses after a newer mutation.

Qualify published sources through `bun run test:blackbox:plugin-lifecycle` in an
isolated `OPENAGENT_HOME`. `BLACKBOX_PLUGIN_IDS` can select catalog entries.
The runner checks actual progress, MCP availability, enabled uninstall, preserved
plugin data, and the immediately restored Install action. Repeat with the native
window in light/dark and English/Chinese, using Appium on Windows.

For Goal, Graph, and Chat Groups functional qualification, run
`OFFICIAL_PLUGIN_CHECKOUTS=<checkout-parent> bun run test:blackbox:plugin-functionality`
against the same isolated window. The checkout parent contains `openagent-<id>`
or `<id>` directories. This exercises installed package commands and tools with
a deterministic local model, including Goal completion, Graph child execution,
group membership, message persistence, and private Agent submission. The runner
restores fixture settings and removes its installed packages. Record source
revisions alongside the generated report; local candidate success does not
qualify an older published repository or justify silently publishing commits.
Use `BLACKBOX_FUNCTIONAL_REPORT` to preserve separate source-version reports;
`BLACKBOX_KEEP_CONVERSATIONS=1` retains only the fixture conversations for the
SDK's checkpoint and renderability diagnostics before explicitly deleting them.

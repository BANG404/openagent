# Official plugin registry

OpenAgent keeps the official plugin source list in a small registry contract so
clients can discover package addresses without querying the GitHub API. The
bundled reference is `src/lib/officialPluginRegistry.json`; its parser and
marketplace projection live in `src/lib/officialPluginRegistry.ts`.

Each entry requires a lowercase plugin id, a display name, an HTTPS repository,
and an HTTPS `source_url`. `source_url` may point to a public Git repository or
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
projections, while installation crosses the `install_official_agent_plugin`
Tauri boundary. The thin host adapter writes a one-entry temporary marketplace
under the supported personal marketplace root and delegates to the existing
Runtime marketplace installer; it removes the temporary document after staging.
It validates the plugin identifier and public HTTPS source before invoking the
Runtime. This keeps source addresses visible in the store without teaching the
frontend how to copy, validate, or activate a package.

The GitHub token remains an optional credential for the legacy GitHub release
metadata checker. It is not attached to official registry requests or official
marketplace installation requests. A registry source must therefore be a
credential-free HTTPS URL without a query or fragment when it reaches the host
adapter, matching the Runtime marketplace URL boundary.

Update the bundled catalog and this contract together when an official plugin is
published, renamed, withdrawn, or moved. Keep private provider credentials out
of the registry. Focused coverage lives in `tests/officialPluginRegistry.test.ts`.

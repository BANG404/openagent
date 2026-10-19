# Plugin versions and compatibility

Agents own version decisions while implementing package or contract changes.
Treat code, manifest declarations, behavior coverage and owner documentation as
one change. Release automation validates those decisions; it never calculates
plugin versions from commits or rewrites a packaged manifest.

## Independent identities

Keep the portable Agent Plugins schema, package SemVer, OpenAgent plugin protocol
and desktop SDK protocol independent. A package bug fix needs a new package
version without necessarily changing any protocol. OpenAgent owns only its
extension contract; do not change an upstream schema identity for local changes.

For published standard packages, set stable `MAJOR.MINOR.PATCH` in source
`plugin.json`: compatible fixes advance patch, compatible features advance minor,
and incompatible package APIs advance major. Include changes to bundled Skills,
translations and other archived files in that decision. Advance above all
existing `v*` and `plugin-v*` stable versions before publishing new source. Keep
other package version files aligned when the package's own instructions require
them. Source manifests and installed archives must carry the same version.

## Contract changes

Read the existing contract and classify the effect before editing:

| Change                                                                                                                               | Plugin protocol decision                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Documentation clarification, internal refactor or contract-preserving fix                                                            | Keep the current protocol                                                                                                                 |
| Optional capability that preserves old plugin behavior                                                                               | Keep the protocol only when the plugin can reliably detect support and handle its absence; otherwise establish a new protocol requirement |
| Removed fields, new required fields, changed types, defaults, lifecycle or externally visible semantics that break existing packages | Increment the SDK-owned plugin protocol and update affected packages in the same delivery                                                 |
| Package data format changes                                                                                                          | Use package-owned data versioning, migration and failure recovery independently of the plugin protocol                                    |

For a protocol transition, update the Runtime implementation and SDK-owned
contract documentation first; update host contract references and Plugin Kit
validator, documentation and templates wherever the actual contract changes.
Advance affected package versions and set
`extensions.openagent.compatibility.plugin_protocol` to the verified inclusive
range. Bounds are positive unsigned 32-bit integers. Do not expand a range to
unimplemented or untested protocols, or change the protocol for a release-only
automation edit.

The Runtime checks its single plugin protocol against that range and every
required feature against its implemented feature registry. `runtime.plugin_contract`
on the authenticated Host Bridge exposes `{ plugin_protocol, features }` for
optional feature discovery; older Runtimes may reject that operation. Admission,
release-history selection, cache reuse and final archive validation apply the
same requirements. Runtime SemVer identifies a release, not plugin compatibility.
This is admission control, not protocol negotiation or an old-protocol adapter.
A missing declaration means `{ "min": 1, "max": 1 }` permanently, even after a
Runtime upgrade. Packaging preserves that absence rather than injecting fields.

Optional required capabilities use `compatibility.features`: currently
`configuration-v1`, `plugin-oauth-v1`, `theme-v1`, `theme-fonts-v1`, `integration-v1`,
`conversation-observations-v1`, `context-sessions-v1` and `model-observations-v1` (the
[presentation types](package-format.md#theme-and-integration-package-types)). Runtime admission, Plugin Kit and the
host release validator accept these names and reject malformed or unknown
features. Packaging preserves the declaration. Protocol 1 alone does not imply
configuration support; older Runtimes reject these new packages explicitly.

Compatibility handling can be an explicit adapter, a package data migration or
rejection of an incompatible package while preserving its data and provenance.
Select the behavior required by the task; do not introduce historical adapters
by default. When an adapter is required, give it an explicit supported range
and retirement boundary. Document the unavailable capabilities and recovery
path. Never widen permissions or silently overwrite package data to upgrade.

Verify old packages against the new Runtime and new packages against the old
Runtime. Assert the declared compatible behavior or explicit rejection, and
preservation of data/provenance on incompatibility and update failure. Exercise
any changed state migration with failure recovery. Tests establish the range;
manifest edits alone do not.

## Release validation and reuse

Public `crates/openagent-app/src/plugin_updates.rs` owns startup synchronization
policy. The primary server holds its process lock before calling it, before
mounting plugin processes. The declared Runtime release version and plugin
protocol identify the successful check. Checks have a three-second deadline; updates
share an eight-second startup budget with at most five seconds per package.
Stale results and failures retain the previous marker so startup retries. The
engine implements the package-operation port and retains package leases,
permission enforcement and data preservation.

`scripts/plugin-release.mjs --verify` checks clean independent source snapshots
and immutable tag ownership. Host preflight does not compare moving package
versions with parent history. Version increases belong to each plugin repository
and its published tags. Source subscriptions require no private SDK, including fork CI.

`plugin-releases.yml` uses the exact qualified Runtime contract to stage and test
independent standard packages resolved once from subscribed branches. It uses
source versions verbatim, checks protocol
ranges, then publishes missing releases or reuses exact existing ones. New
automation tags remain `plugin-vX.Y.Z` to avoid triggering package-owned manual
tag workflows; matching manual `vX.Y.Z` tags are reusable as well. A tag without
a Release is completed with the same source version. Existing releases must be
stable, point to the accepted immutable source and expose an archive with a
GitHub SHA-256 digest; automation compatibility notes must match the source.
Pagination includes older releases rather than stopping at the newest 100.

Same-version tags for different source, conflicting tag aliases and new versions
below the published version boundary fail; no automatic patch bump repairs them.
An older Runtime may reuse an older exact version/source pair even when newer
releases exist. Existing automatically stamped releases remain immutable: if
their versions outrun the source manifest, advance the source manifest before
the next changed-source release. Never move tags or replace published assets.

`openagent-plugin-releases.json` retains the qualified Runtime source SHA and plugin protocol
and each package's source SHA, version, tag and supported range. A Runtime-only
change reuses unchanged packages; it does not create plugin versions. Packages
can also release independently through their own repository workflow; Runtime
publication uses the same checked-in identities. Source push and Release
publication still require the authorization in
[local development](local-development.md#developer-acceptance-before-publication).

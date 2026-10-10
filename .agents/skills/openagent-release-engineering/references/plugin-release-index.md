# Rolling plugin release index

`.github/workflows/plugin-release-index.yml` owns public plugin update metadata,
independently of Pages and application releases. Refresh at minutes 13 and 43 of
every UTC hour, relevant `main` pushes and manual dispatches. GitHub may delay
schedules; this is a freshness target, not a deadline. Do not cancel an active
publication halfway through replacement. PRs run deterministic tests with read-only
permissions and never collect authenticated metadata or publish.

`scripts/plugin-release-index.mjs` uses the job's `GITHUB_TOKEN` to collect the
latest 100 releases for every repository in `src/lib/officialPluginRegistry.json`.
It produces schema version 1, a Unix-seconds `generated_at`, and a repository map
keyed by lowercase `owner/repo`. Values contain stable releases, their protocol
metadata, release URLs and archive assets with GitHub SHA-256 digests. Empty
histories remain explicit covered entries. Never publish a branch manifest version
as a release or include a token in the artifact. Any upstream error stops collection
before publication and leaves the previous index asset intact.

`scripts/publish-plugin-release-index.mjs` publishes the complete, bounded snapshot
to the fixed `plugin-index` tag's `plugin-releases.json` asset. Use the direct URL
`https://github.com/BANG404/openagent/releases/download/plugin-index/plugin-releases.json`;
clients do not discover its asset ID through the REST API. Create the channel as a
draft, attach the file, then publish as a prerelease with `make_latest: false` so
application Stable/RC/Beta selection is unaffected. Do not use `/releases/latest`.
The channel must stay mutable; reject immutable channels before deleting an asset.
Versioned application release assets remain independent of this rolling metadata.

Replacing a Release asset is not atomic. Before deletion, download and retain the
previous bytes in the publication process; a replacement failure attempts to remove
any failed starter asset and restore those bytes, while keeping the workflow failed.
If restoration also fails, publication remains failed and requires an operator retry.
A download during the short replacement window can fail. Runtime retains its last
validated snapshot as stale, cannot install from stale metadata, and never fans out
to per-package API requests on index failure. Both checks and explicit updates use
the same fixed credential-free download and ten-minute derived cache; covered
repositories never use API discovery. Unlisted repositories retain their resolver.

Only the publication job receives `contents: write`. Use server credentials only
for authenticated upstream collection and Release management. No generated index
is committed, no private submodules or website dependencies are required, and Pages
builds neither collect nor publish this feed. Collector and publisher tests run in
the dedicated workflow and frontend/automation qualification, covering stable
projection, upstream failure, draft publication, safe replacement and restoration.

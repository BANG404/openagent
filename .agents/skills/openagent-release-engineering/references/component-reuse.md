# Independently qualified release resources

Formal releases compose embedding, Runtime (including sandbox helpers), frontend,
and native shell resources. `release-component-reuse.mjs` owns their input closure
and signed qualification receipts. Product version stamps are assembly metadata;
component build identities retain their original desktop commit, SDK commit and
version. A new product release can ship unchanged older frontend and shell bytes.

`component-plan` freezes the SDK release source from `sdk-plan`, reads only the
immutable published `previousTag`, verifies `openagent-components.json.sig`,
matches its source commit to the tag, and recomputes input fingerprints when the
fingerprint implementation and frozen parser dependencies are unchanged. Policy
changes verify the old signed receipt but select fresh qualification, so a new
parser never reinterprets old fingerprints as corrupt qualification. It
compares each fingerprint with current source and downloads matching component
archives, checking byte length and SHA-256 before extraction. Missing receipts
on an older release select fresh qualification. A draft baseline, invalid
existing signature, mismatched source or corrupt selected archive fails release.
Moving channels, fast PR statuses and mutable Actions caches cannot establish
component qualification.

Fingerprints include source modes and blob identities, dependencies, automation,
tests and workflows. Only generated product version fields, release markers and
changelogs are excluded; Cargo dependency versions remain inputs. Shell inputs
include transitive bootstrap imports, global Tailwind source candidates and
portable resource pins; frontend includes public contracts and client SDK source.
A product-only UI change that alters global CSS candidates also invalidates the
shell. Computed or unresolved bootstrap imports conservatively bind all source. Runtime includes its gitlink and frozen SDK release
source. Model pin/fetch changes conservatively invalidate every component.
Deletions participate; documentation edits do not invalidate binary qualification.
Extend `inputOwners` for new build inputs, preferring conservative invalidation.

On hits, static frontend/bootstrap assets, four compiled shells, embedding files
and Windows/Linux helpers are restored. Runtime binaries retain the independent
qualified SDK release path. Payload manifests verify original source identities,
inventories and digests after restoration. Full release CI skips only frontend,
native or embedding capabilities covered by receipts. Shared automation runs
every release. Nightly and manual CI retain full qualification without reuse.

Every invocation retains the previous-release data compatibility matrix, complete
signed distribution, source-bound installer candidates, platform packaging and
publication gates. Installers and updater metadata use the new product version.
Windows verifies the executable against its original shell component version.
Distributions record `shell_version` and `frontend_version` separately.

Both installer layouts contain the signed distribution manifest and signature
in `release-identity/`; full layouts also contain offline payloads. Before
setting Tauri's package version, the shell verifies that identity against its
compiled version. Updater comparisons and shell handoffs therefore use the
installed product version while component details retain the compiled version.
Startup compares admitted frontend resources with the signed distribution's
frontend version, which may precede its product version. Absent metadata retains
source-development and existing installer behavior; invalid metadata refuses
startup.

Only after qualification and candidate gates pass does publication sign a new
`openagent-components.json` with original build identities, fingerprints and
archive digests. Every immutable product release carries the complete archive
set, including reused resources, independently of Actions artifact expiration.
Never sign receipts before the tag gate or from partial/fast qualification.
Input-policy changes require fresh qualification for affected resources.

Verify release stamps, frontend-only edits, dependency/policy changes, deletions,
channel changes, identity retention, signatures and corrupt payloads. The native
shell-resource scenario owns installed startup, cached recovery and handoffs.
Hosted release verification must exercise initial misses and subsequent hits
on all four packaging targets before claiming measured CI savings.

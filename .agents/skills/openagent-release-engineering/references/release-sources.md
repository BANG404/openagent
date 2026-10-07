# Release sources and direct pushes

A Beta preparation run creates one generated release commit on the exact
current `master` head. The administrator credential pushes that commit directly
to `master`; a concurrent update rejects the push instead of releasing stale
source.

A promotion requires its selected prerelease tag to be published.
`release/rc/X.Y.Z` starts from its Beta tag and `release/stable/X.Y.Z` starts
from its RC tag; each contains one
automation-refresh commit that cannot touch product paths, and receives one
channel-specific metadata commit directly. A pre-existing promotion branch is
reusable only while the selected tag remains its ancestor and its product tree
still matches that tag; product drift stops preparation.

Ordinary Beta preparation adds one `chore: release vX.Y.Z-beta.N` commit that
changes only:

- `.github/release.json`
- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock`
- `CHANGELOG.md`

RC accepts a published Beta tag; Stable accepts a published RC tag. Neither
promotion silently selects the newest tag.
Because the target branch starts at that exact tag, the release commit changes
only the version, updater channel, manifest, and changelog. Verification compares
the resulting product source with the selected promotion tag and allows differences
only in generated release files.

Preparation uses a temporary local `prepare/v*` branch only because the release
script restricts where it may create generated commits. No preparation branch
or pull request is pushed. An existing immutable release tag stops preparation.
The `ADMIN_MERGE_TOKEN` secret is required and must identify an administrator
whose ruleset bypass mode is `always`, so the generated commit can update the
target branch directly.

The release metadata verifier checks that:

- all four product version fields match the requested tag;
- Beta/RC/Stable updater endpoints match the selected channel;
- JSON manifests contain no unrelated edits;
- Cargo files change only the OpenAgent package version;
- the release commit contains every expected file and no unexpected file;
- `sourceSha` identifies the direct Beta source parent or the selected immutable
  promotion tag, and a nonempty `previousTag` exists;
- an RC promotion declares a Beta source and a Stable promotion declares an RC
  source with the same `X.Y.Z` as the target; product source matches that selected
  tag outside generated release files.

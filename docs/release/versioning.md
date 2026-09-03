# Versioning and channels

Development commits and Beta release metadata land on `master`. Ordinary
pushes never create a version or tag by themselves. Start `Prepare Release` and
choose `beta`, `rc`, or `stable`. Beta is the default, uses the current `master` head,
and pushes its generated metadata commit directly back to `master`. The job
fetches `origin/master` again immediately before resolving that immutable base;
if `master` advances after resolution, the direct push fails instead of
publishing stale source.

If the current prerelease metadata has not produced its immutable tag yet and
later commits advance its source branch, another preparation run keeps that
unpublished version and refreshes its `sourceSha`. The refresh may broaden the
selected component set and regenerate that version's current changelog section
so newly included source is built and documented. Verification permits only a
descendant source, unchanged version/tag/channel/history, no component
contraction, and edits to `.github/release.json` plus the current changelog
section. New releases still have to update every generated release file
together.

RC requires an explicit published `vX.Y.Z-beta.N` tag and never silently
selects the latest Beta. The workflow creates `release/rc/X.Y.Z` from that
immutable Beta commit. Stable in turn requires an explicit published
`vX.Y.Z-rc.N` tag and creates `release/stable/X.Y.Z` from that immutable RC
commit. Each promotion adds one commit that refreshes only release automation
and its tests/docs, and pushes the Stable metadata commit directly to that
branch. Product source remains byte-for-byte aligned with the selected Beta
without restoring old application code into a newer `master`. The Stable branch
is also the durable source snapshot for that version.

For Beta preparation, `scripts/release.mjs` selects the highest immutable
SemVer tag across all release branches. It uses that tag's merge base with
`master` as the previous product source, then inspects release-relevant commits
to the selected `master` head and applies:

- `major`: any breaking commit, such as `feat!:` or a `BREAKING CHANGE:` footer
- `minor`: any `feat`
- `patch`: any `fix` or `perf`
- no release: docs, chore, refactor, style, test, and ci-only changes

An update to the pinned private `sdk` gitlink is release-relevant. Its
Conventional Commit subject therefore participates in the same bump rules as
application source changes.

The private SDK also has its own release train for headless and third-party
consumers. An immutable `sdk-vX.Y.Z` release publishes the thin
`@bang404/openagent-harness` package, platform `openagent-server` binaries, and
`openagent-sdk-manifest.json` with the compatible protocol range, size, and
SHA-256 for every target. SDK SemVer is calculated only from SDK Conventional
Commits after the newest ancestor SDK tag. The release tag points directly to
the immutable SDK commit; package versions are stamped only in release build
worktrees, so publishing never creates a different source SHA. A commit with no
release-worthy SDK change reuses its newest ancestor SDK release. That release
does not require a desktop installer update. Desktop Runtime changes are also
eligible for the signed Runtime component channel and do not require a Tauri
installer when the native shell is unchanged.

Host-triggered SDK publication is two-phase. The desktop workflow first stages
the exact SDK tag and machine-readable manifest as a short-lived private SDK
workflow artifact; this phase validates release metadata and the Harness package
without publishing npm or a GitHub Release. After every selected desktop
candidate has been attached to the desktop draft and the remaining publication
gates pass, the host explicitly publishes that same immutable SDK tag and only
then publishes the desktop draft. Independent SDK releases continue to publish
directly.

Nightly and explicit full SDK qualification additionally maintain a public
`runtime-dev` prerelease channel for external debugging. Publication happens
only after the complete SDK result succeeds and only while the qualified commit
is still the private SDK's current `main`. The channel contains four
release-built server binaries, signed Runtime and development manifests, a
behavior-free TypeScript SDK source snapshot, and the public Harness package.
Both manifests identify the immutable SDK commit; consumers reject a channel
whose SHA differs from the host's pinned SDK gitlink. Tag-triggered SDK
qualification never overwrites this moving development channel. A qualifying
refresh updates or creates the prerelease and replaces each same-named asset.
The workflow builds the release request JSON before submitting it, then parses
GitHub's templated upload URL from the response before composing asset queries.

Pull requests from forks never receive private SDK credentials. Trusted jobs
create a short-lived, read-only GitHub App installation token and check out the
private SDK over HTTPS. Frontend-only fork checks download the `runtime-dev`
TypeScript snapshot, verify its commit, byte size, and SHA-256, and materialize
only that public client boundary. Native or Rust checks remain unavailable to
untrusted fork code because compiling them would expose private SDK sources to
the runner; maintainers reproduce or qualify those changes after review.

Runtime-selected desktop releases build the pinned `openagent-server` for all
four desktop targets and upload only those release-qualified binaries with a detached
Minisign signature over their manifest. After the versioned release is public,
the same six files are atomically replaced on the fixed `runtime-beta`,
`runtime-rc`, or `runtime-stable` release channel. The runtime channel uses
the Tauri updater trust root, while each artifact's declared size and SHA-256
protect the selected bytes. Native-shell installers additionally package the
same pinned server as the immutable fallback used when no downloaded candidate
can be activated.

Frontend-selected releases build the static frontend once, archive it as
`openagent-frontend.tar.gz`, records its exact compressed and unpacked sizes,
file count, and SHA-256 in `openagent-frontend-manifest.json`, and signs that
manifest with the updater trust root. The manifest also binds the frontend to
the compatible host protocol range. The archive, manifest, and signature are
published through the fixed `frontend-beta`, `frontend-rc`, or
`frontend-stable` channel. Desktop activation remains independent from the
native installer: WebViews reload the verified resource and confirm startup,
while an unconfirmed activation rolls back to the previous resource or the
frontend embedded in the Tauri bundle.

Each generated `.github/release.json` records a `components` object with
`frontend`, `runtime`, and `nativeShell` booleans. Beta preparation classifies
the application diff and the actual paths changed between the old and new SDK
gitlinks. RC and Stable promotions inherit the selected source release's
component set. Manifests created before this field existed are treated
conservatively as selecting all three components. Frontend-only releases build
and publish only the signed frontend resource; Runtime-only releases build the
four signed server resources; only `nativeShell` releases build Tauri updater
artifacts, full first-install bundles, and eligible Microsoft Store packages.

The selected release channel controls the suffix and GitHub Release state. The
release-relevant Conventional Commits control the `X.Y.Z` base version:

- From a stable tag, `beta` calculates `X.Y.Z` from Conventional Commits and
  creates `vX.Y.Z-beta.1`.
- From a beta tag, `beta` applies a new Conventional Commit bump to `X.Y.Z`
  and resets the suffix to `beta.1`. If there is no new release-worthy bump,
  it keeps `X.Y.Z` and increments the Beta number.
- The next Beta number is calculated from matching immutable tags and the
  baseline version. Checked-in version files may lag during migration from the
  legacy divergent release lines; they are reconciled by the next Beta release.
- RC preparation requires an explicit `vX.Y.Z-beta.N` tag and creates the
  matching `vX.Y.Z-rc.N`; Stable preparation requires an explicit
  `vX.Y.Z-rc.N` tag and creates the matching immutable `vX.Y.Z`.

If legacy history contains both a stable tag and later beta tags with the same
`X.Y.Z`, the suffix cannot be removed safely. The script detects that collision
and recalculates from the existing stable tag instead of overwriting it.

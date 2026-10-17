# Windows Alpha previews

Prepare Release exposes `alpha` alongside Beta, RC and Stable. Alpha calls the
independent `alpha-release.yml` workflow and skips the formal release commit job.
It builds Windows x64 only and publishes a GitHub prerelease with
`make_latest: false`. It leaves checked-in versions, `.github/release.json`,
changelog, formal SDK releases, plugins, Pages, Store packages and formal update
channels unchanged.

## Source and version identity

Resolve trusted `main` once, record its immutable desktop SHA and SDK gitlink,
then build those exact revisions. Signing credentials must never reach a fork
or arbitrary submitted source. Alpha uses existing repository secrets:
`TAURI_SIGNING_PRIVATE_KEY` and the read-only SDK checkout App credentials.
No new GitHub Environment is required; using one requires explicit secret setup.

The Alpha core is one patch beyond the higher of the selected source version
and latest published formal release. Increment `alpha.N` using published/draft
Alpha releases and existing Alpha tags for that
core. Alpha tags stay excluded from formal baseline selection and promotion.
The formal baseline must be published; unavailable signed baseline bytes fail
the candidate. Stamp version files only in the disposable build checkout.

Resolve the independent SDK version through its existing source-history planner
and artifact stamping script without creating or publishing an SDK tag. Compile
the exact pinned source even when the planner could reuse an ancestor. The
Runtime manifest binds SDK SHA, independent SDK version, product `release_version`
and immutable `+desktop.<alpha-version>` installation identity.

## Build and reduced qualification

`scripts/build-alpha-windows.mjs` requires Windows x64, a clean disposable source
checkout, exact desktop/SDK SHAs, a published baseline and the production key or
`TAURI_SIGNING_PRIVATE_KEY_PATH`. It stamps its checkout and SDK; never run it
in the default debugging directory. Local callers need frozen Bun dependencies
and private SDK history. Use the pinned Bun. Reproduction in a build worktree:

```powershell
bun scripts/build-alpha-windows.mjs --version <alpha-version> `
  --source-sha <desktop-sha> --sdk-sha <sdk-sha> `
  --baseline-tag <published-formal-tag> --output <empty-output-directory>
```

The workflow owns version selection. A published or draft identity is reserved;
retry with a new Alpha identity rather than overwrite candidate bytes.

Compile Release Runtime and pinned Windows helpers once with private output
suppressed. Generate a Windows-only signed Runtime manifest. Build and archive
the product frontend as USTAR, sign its manifest, fetch the pinned embedding
model, and sign the distribution. Ordinary Release retains its full matrix.
Verify all signatures, digests, sizes, component identities and helpers before
staging `bootstrap-release/`.

Build lightweight NSIS plus its updater signature, then bundle the full offline
NSIS and a `-full-no-webview-setup.exe` variant from the same shell executable.
All include portable Node and terminal tools; both full variants add signed
Runtime, frontend, model and helpers. Only the original full package embeds
offline WebView2; the smaller variant reuses installed WebView2 and downloads
it when missing. Smoke-test startup and restart of both complete variants in
separate installation/data fixtures before publication.
Sign the Alpha candidate manifest binding every output. Publication reverifies
that manifest and every downloaded byte.

The fast tier runs focused release contracts, actual Windows Runtime data
compatibility against the published formal baseline, and complete installer
startup/restart checks. Skip full workspace/model tests, other platforms, formal
SDK release orchestration and Store qualification. Formal release gates remain
unchanged. Failed builds, migration, integrity, installed frontend confirmation
or restart prevent publication. Windows native checks require an interactive
session; Session 0 cannot substitute for WebView/native qualification.
Private compilation output and fixture data/logs never enter public artifacts
or caches.

## Publication and testing

After the workflow changes are available on GitHub `main`, open Actions →
Prepare Release → Run workflow and select `release_type: alpha`. Equivalently:

```powershell
gh workflow run prepare-release.yml --ref main -f release_type=alpha
```

The run uploads `windows-alpha-candidate`. Publish the versioned prerelease with
direct links to both complete installers, then refresh only `alpha`, `frontend-alpha` and
`runtime-alpha`. Rolling payload/manifest replacement is not atomic; signature
and digest checks reject incomplete snapshots and preserve active resources.
Never promote Alpha directly or update another channel.

Alpha installs as **OpenAgent Alpha**, identifier `com.iumm.openagent.alpha`,
and defaults to `~/.openagent-alpha`. The host passes that root to Runtime.
Production installation and single-instance identity stay separate. Debug uses
`~/.openagent-dev`; explicit `OPENAGENT_HOME` wins.

On a test computer, close production before copying its complete data root to
a fixture. Launch Alpha with `OPENAGENT_HOME` pointing at that copy to verify old
settings/conversations. Direct use of production data requires a backup and no
concurrent production process. Side-by-side installation proves data
compatibility; the production installer's overwrite path remains a formal
installer qualification responsibility.

# Release download mirror

`openagent-releases` is a Standard R2 bucket served at
`https://dl-openagent.ibat.ac.cn`. GitHub remains the public source of release
bytes and historical downloads. The mirror is a selective copy, not a build
artifact archive. Do not change the GitHub publication/qualification matrix to
match the mirror's smaller file set.

`scripts/sync-release-mirror.mjs` discovers published releases through the shared
GitHub CLI authentication. It retains two recent desktop releases per channel
and current shell/Runtime/frontend rolling channels. Drafts and development kits
are excluded. The first-install Windows root is exclusively
`_x64-full-no-webview-setup.exe`; full packages with offline WebView2 and other
platforms' full bundles are not mirror roots. Lightweight installers, macOS
updater archives and Linux update packages are included when update metadata
requires them. They are update payloads, not the default Windows download.

The dependency roots are `latest.json`, `openagent-distribution.json`,
`openagent-sdk-manifest.json`, `openagent-frontend-manifest.json` and the current
`openagent-compatibility-policy.json` from `compatibility-policy`. Follow their
actual file/URL references and detached signatures, including cross-release
payloads. Missing dependencies, missing signed-manifest signatures, unsupported
origins, drafts, invalid sizes or missing GitHub SHA-256 digests fail before
availability publication. Do not mirror component reuse receipts or shell-build
caches. Preserve original manifest and signature bytes; mirroring does not
change existing installed clients' GitHub update endpoints or bypass their
signature, hash, compatibility, activation or rollback checks.

Every upload is read back and checked against GitHub's SHA-256 and length;
compressed JSON HEAD responses can omit length and are not integrity evidence.
An interrupted initial sync reuses existing objects only after checking their
stored bytes against GitHub, even without a published index. An availability
index is written only after every planned object exists. Retire unreferenced
objects only after publishing that index and only under `releases/download/`.
Keep the previous index and live downloads on failure. Rolling channel payload
replacement is non-atomic, like GitHub's own rolling channels; clients must
continue to verify signatures and reject inconsistent snapshots.

`OPENAGENT_MIRROR_MAX_BYTES` defaults to 8,000,000,000. The upload guard includes
existing bucket objects, overlapping new uploads and a reserved index allowance;
it fails without deleting live resources when the peak would exceed budget.
`OPENAGENT_MIRROR_KEEP` defaults to two. Retention runs after synchronization and
daily in `.github/workflows/release-mirror.yml`; it does not expire the newest
release merely because no new version has shipped. GitHub retains old files.
The bucket budget is not an account billing cap: other buckets and API request
charges are separate. Abort unfinished multipart uploads after seven days;
never put an age-only expiry on current release dependencies.

Use Bun 1.3.14 and `bun scripts/sync-release-mirror.mjs --dry-run` to review
the file plan without writing R2. Actual sync requires the R2 endpoint repository
variable `OPENAGENT_R2_ENDPOINT` and repository secrets
`OPENAGENT_R2_ACCESS_KEY_ID`/`OPENAGENT_R2_SECRET_ACCESS_KEY`. Scope credentials to
object read/write for this bucket. Do not put OAuth refresh credentials in CI.
The workflow runs on trusted `main` after Release/Prepare Release completion,
manual dispatch, mirror automation changes and a daily schedule. It ignores
untrusted workflow artifacts and rebuilds Pages only after successful sync.

Cache immutable versioned payloads for one day at the edge. Bypass caching for
the availability index and rolling-channel metadata so retention and channel
changes do not leave a stale download inventory. Verify TLS, complete/range
downloads and digest equality against the published GitHub source. A mirror
does not promise mainland China network performance; measure it separately.

# Independent compatibility policy publication

`.github/compatibility-policy.json` is the independently versioned source of
online restrictions. Runtime behavior, fields, expiry and offline admission are
owned by [configuration policy](../../openagent-configuration/references/compatibility-policy.md).
Do not maintain a separate evaluator in release automation.

Change this document's positive revision, validity interval and rules on `main`,
then dispatch **Publish compatibility policy** (`compatibility-policy.yml`) on
`main`. No application version bump, Runtime build or installer release is
needed. The workflow checks out its exact dispatch SHA, validates using the public
App crate's `compatibility-policy` example, signs using the existing Tauri update
secret, and publishes through `scripts/publish-compatibility-policy.mjs`.

Use a currently valid Unix-second interval; renew before expiry even if there are
no restrictions. The initial document uses 90 days. To remove a restriction,
publish a higher revision containing the resulting ruleset. Never change the
bytes of an existing numbered revision or lower the revision to undo a mistake.
Policy zero is only the offline bundled baseline, never an online publication.

The dedicated `compatibility-policy` prerelease is excluded from latest desktop
releases. Its moving `openagent-compatibility-policy.json` and `.sig` assets are
the fixed client endpoint. Each revision first publishes immutable
`openagent-compatibility-policy-v<N>.json` and `.sig` assets. Only after those
uploads succeed does publication replace the moving pair. Clients reject a
temporarily mismatched pair and retain their trusted local fallback.

The publisher validates both candidate and previous signed archive with the same
Rust parser used by Runtime. It checks the highest archive revision even when a
prior moving-feed upload was interrupted, verifies existing immutable bytes, and
repairs only missing assets during a retry. Signature failures, reused revisions
with different bytes, rollback, missing archive integrity or API failure prevent
remote changes. A retry of an identical revision is allowed. Workflow concurrency
serializes publishers; ordinary product releases do not rewrite this feed.

Before publication, run repository preflight. Focused publisher tests assert that
verification failures cause no remote mutation, numbered assets precede moving
assets, and interrupted publication can resume. After a dispatch, inspect the
exact Actions run and verify the live document and signature with the public App
validator. A successful upload alone is not proof that installed clients enforce
the new revision: clients must first include the policy interpreter, and startup
refresh and offline fallback have the bounds described by the configuration owner.

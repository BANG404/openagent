# Online compatibility policy

`crates/openagent-app/src/compatibility_policy.rs` owns the declarative product
policy parser and evaluator. Its `source.rs` owns bounded signed delivery and
cache admission. Runtime supplies its own version, SDK protocol and read-only
storage inspection; the native host supplies its actual shell version and the
running source Runtime version for online replacement. Public App never opens
SQLite. Local configuration/protocol/storage checks remain mandatory after the
policy allows an operation. A policy cannot add migration support, run code,
delete data or bypass transition confirmation and backups.

## Document and matching

The online document has `schema_version: 1`, a positive monotonically increasing
`revision` (at most JavaScript's maximum safe integer), Unix-second `issued_at`
and `expires_at`, and at most 512 `rules`. Revision zero is the bundled baseline
under `crates/openagent-app/resources/compatibility-policy.json`. This baseline
contains no additional restrictions; local compatibility checks still apply.

Each rule requires a unique stable `id`, `conditions`, `action` and a nonempty
plain-text `reason`. Conditions are ANDed within a rule. Every matching rule
applies; rule order never overrides another restriction. Supported selectors:

| Selector | Meaning |
| --- | --- |
| `operation` | `startup` or `online_activation`; omit for both |
| `runtime` | Target Runtime SemVer requirement |
| `previous_runtime` | Running source Runtime SemVer requirement |
| `shell` | Actual native-shell SemVer requirement, independent of product headline |
| `platform` | OS and Rust architecture, for example `windows-x86_64`, `macos-aarch64` |
| `sdk_protocol` | Inclusive `{ "min": N, "max": N }` range |
| `config_version` | Inclusive persisted configuration-version range |
| `conversation_schema` | Inclusive persisted conversation-schema range |

Missing selectors match all values. An unavailable fact conservatively matches
its selector so omitting host metadata cannot bypass a restriction. Missing data
has explicit version zero; malformed data is unknown and remains subject to
local admission. Do not infer database format from application SemVer. Use
operation selectors to distinguish an upgrade restriction from disabling an
already installed version. SemVer uses the Rust `semver` crate's standard
prerelease rules: prereleases require an explicit matching prerelease comparator.

Actions are `block` and `require_restart`. A block returns an error before any
configuration migration or writable database open. A restart requirement produces
the existing `restart_required` inspection status for online activation; cold
startup already satisfies it. Policy admission never resets persisted data.
Unknown schemas, fields, actions, invalid ranges and duplicate IDs reject the
whole document. Rules are data, never downloaded scripts or SQL.

```json
{
  "id": "schema-10-runtime-pause",
  "conditions": {
    "operation": "online_activation",
    "runtime": ">=2.0.0, <2.0.2",
    "conversation_schema": { "min": 1, "max": 10 }
  },
  "action": "block",
  "reason": "Install Runtime 2.0.2 or later to preserve existing conversations"
}
```

## Delivery, expiry and offline behavior

The fixed production feed is the `compatibility-policy` GitHub Release's
`openagent-compatibility-policy.json` and `.sig` assets. The independent publisher
is documented in release engineering's
[policy publication](../../openagent-release-engineering/references/compatibility-policy.md).
Documents use the existing Minisign update trust root. Production cannot change
the source or signing key through environment variables. Only debug fixture
processes explicitly marked `OPENAGENT_BOOTSTRAP_TEST=1` accept a loopback test
URL and fixture public-key path.

Refresh has one three-second budget for both bounded responses (256 KiB document,
16 KiB signature). Startup reuses a currently valid verified cache for up to
15 minutes. Online activation always attempts refresh. Network, signature or
document rejection retains the last verified cache; an uncached offline install
uses its bundled baseline. Offline operation therefore cannot promise immediate
revocation of a newly discovered bad version. Corrupt local cache admission fails
explicitly without changing settings or conversations.

`<OPENAGENT_HOME>/resources/compatibility-policy/policy.json` atomically stores the
exact signed payload, signature and refresh timestamp in one envelope. Every read
re-verifies the signature. The source re-reads under a short, non-waiting writer
lease before committing; older revisions and different bytes reusing an accepted
revision cannot replace it. An expired cached policy keeps its restrictions and
revision floor. It blocks online activation until refresh succeeds; ordinary
startup remains subject to its cached rules and all local checks. Revoking an
incorrect rule requires a higher signed revision, including for an empty ruleset.

An individual resolution returns one fixed snapshot and decision revision. The
candidate is inspected before the active Runtime stops, and the public supervisor
independently repeats admission before replacement. A newly launched Runtime
checks startup policy again before product configuration or storage preparation.
Changed restrictions can abort replacement and trigger the existing rollback;
they never change a migration plan midway through a running process. Bootstrap
JSON includes `compatibility_policy` metadata; diagnostics record revision,
origin, matching IDs and outcome without recording user data.

## Verification

Public policy tests exercise matching, malformed/unknown contracts, combined
restrictions, signature tampering, offline fallback, expiry, monotonic cache
admission and actual loopback HTTP delivery. Server bootstrap integration tests
run the real executable against signed loopback fixtures, assert policy revision,
block/restart behavior, and verify unchanged configuration/database bytes.
Update the private Runtime's own documentation and pinned public crate revision
with its server integration; do not copy engine format knowledge into this owner.

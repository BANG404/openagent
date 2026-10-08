# Keep qualification aligned

- Keep the path classifier, reusable workflow inputs, result verifier, release
  gate, and their tests aligned whenever a module boundary changes.
- The private SDK boundary verifier checks Runtime-owned modules only. Goal,
  Graph, and Chat Groups source belongs to installed plugins and must not be
  required in an SDK checkout. Keep dependency overrides and the frozen Bun
  lockfile on patched releases so the JavaScript audit remains a release gate.
- Pull requests run diff-selected fast checks only for contributors without
  administrator permission. Administrator-authored PRs use the documented
  bypass after local preflight. Ordinary `master` pushes do not replace release
  qualification.
- Release, nightly, and manual full qualification force every frontend,
  automation, native, and embedding capability. Release candidate
  builds may run concurrently with qualification, but a failed qualification
  stops tagging and every publication side effect.
- Private SDK manual CI supports fast path classification against the requested
  commit's first parent when `full` is cleared. Keep fast and full commit-status
  contexts separate, retain a full default for older callers, and require
  host-driven release orchestration to pass `full=true`.
- Qualify an exact SDK revision before creating its immutable release tag. A
  failed candidate advances to a new commit and tag; never move the old tag or
  bypass its failed gate.
- Treat the private SDK gitlink as release-relevant input. Private SDK output
  must not leak into public logs or public caches, and do not configure a
  compiler cache. Compile Runtime servers, embedded diagnostics, and sandbox
  helpers cold under `sdk/target` with `cache-targets: false`. The ordinary
  Tauri graph must contain no private SDK crates, so only its separate
  `src-tauri/target` may use GitHub target caching. Release Runtime artifacts
  may leave public jobs only through the documented exact-run publication path.
- An unpublished prerelease refresh may advance only to a descendant source,
  broaden its component selection, and regenerate its current changelog
  section. Keep its version, tag, channel, older changelog history, and already
  selected components stable; unrelated generated-file changes must fail.
- Authenticate trusted private SDK checkouts with a short-lived, read-only
  GitHub App installation token over HTTPS. Do not make CI depend on outbound
  SSH port 22 or retain a long-lived deploy key for source checkout.
- Route trusted Linux, Windows, and macOS native, Public SDK, release
  preparation, and release jobs exclusively to standard GitHub-hosted runners.
  Fork pull-request code must not receive private SDK credentials. Keep Rust
  private SDK, Runtime, embedded-diagnostic, and sandbox-helper target output
  out of GitHub caches. Ordinary Tauri target caching is permitted only after
  the private-SDK boundary check; release candidates use cold target output.
- Keep embedded ShellCheck directives parser-compatible: put only supported
  directive syntax on the `# shellcheck` line and place any rationale in a
  separate comment. CI may use a newer `github-actionlint` and ShellCheck than
  the local dependency cache. Windows actionlint does not run the Linux
  ShellCheck integration, so validate changed workflow Bash with the repository's
  Linux actionlint container path before treating the local result as complete.
  Keep multiline JSON producers separate from quoted `curl` command
  substitutions; ShellCheck 0.11 can misparse a producer-to-request pipeline
  nested inside one assignment.
- Keep the JavaScript and Rust Tauri plugin minor versions aligned. The
  `check:tests` script must run `svelte-kit sync` before TypeScript so
  automation-only jobs have the generated `.svelte-kit/tsconfig.json` that the
  repository TypeScript configuration extends.
- The full native embedding-model exercise retries its Cargo test up to three
  times on the same runner, with 20-second and 40-second backoff delays. This
  covers transient package-host or DNS failures during `ort-sys` setup while
  preserving the final non-zero status for deterministic build or test errors.
  Each embedding platform runner installs the pinned Bun before invoking the
  embedded-Cargo launcher. Capture failures through a shell conditional so
  GitHub Actions' `bash -e` cannot bypass the retries and backoff.
- Embedded diagnostics seed their ignored `sdk/target/desktop-host/Cargo.lock`
  from the pinned SDK lockfile and let Cargo resolve additional public-host
  dependencies into one graph. Do not concatenate the independent host and SDK
  locks: compatible shared crates can have conflicting pinned patch versions,
  and CRLF checkouts can produce malformed package tables. Keep both source
  locks untouched, normalize the seed to LF, and retain Cargo's resolved lock
  across retries until the manifest or source locks change. A changed seeding
  policy must invalidate existing generated locks; recreate a missing lock even
  when its input fingerprint remains present.

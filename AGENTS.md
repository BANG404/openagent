# OpenAgent contributor guide

OpenAgent is a Tauri 2 desktop app. SvelteKit owns presentation and interaction
state; the private `sdk` submodule owns the application runtime and typed
transports; `src-tauri` is the thin desktop host. The project is in active
debugging, so do not add compatibility paths unless the task explicitly
requires them.

## Read the relevant project guide first

- Treat implementation and agent-facing documentation as one change. Before
  editing, identify the behavior, invariant, ownership boundary, or workflow
  that the change affects and read its source of truth. The
  `deliver-via-pr` workspace skill owns the documentation map and handoff
  checklist as well as repository delivery.
- For chat transcript UI, virtualization, streaming/final reconciliation,
  restore/bootstrap UI, attachment previews, or chat events, read the
  `openagent-chat-frontend` workspace skill.
- Before changing anything under `sdk/`, read `sdk/AGENTS.md` and every skill it
  requires for the affected SDK area. SDK implementation rules belong there,
  not in this public repository's guides.
- For every task that changes repository files, read and follow the
  `deliver-via-pr` workspace skill before editing. It owns prefix selection,
  default-branch commits, remote PR branches, worktrees, pull requests, CI,
  merge, and cleanup.

## Commands

Use Bun for JavaScript dependencies and scripts. Prefix shell commands with
`rtk` as required by the global instructions.

```bash
bun run dev                 # Vite, selects an available port
bun run build
bun run check               # Svelte + TypeScript
bun run preflight           # Fast checks selected from the diff against origin/master
bun run prepare:windows-sandbox:dev # Build pinned Codex helpers on Windows
bun tauri dev               # Selects an available port and passes it to Vite
bun run tauri:build
cd src-tauri && cargo check
cd src-tauri && cargo build
```

Debug Tauri runs default to `~/.openagent-dev`; set `OPENAGENT_HOME` explicitly
only when a task requires another fixture root. Do not point routine development
runs at the installed release's `~/.openagent` state.

Before committing in any delivery mode, inspect the complete diff and run
`bun run preflight`; it compares
the branch, index, and worktree plus untracked filenames with `origin/master`,
enforces the documentation and diff guardrails, and uses the CI path classifier
to run only fast checks for affected modules. Stage intended new files first so
the Git whitespace guard can inspect their contents. Use
`bun run preflight -- --dry-run` to inspect the plan or `--base <ref>` when the
target branch is not `master`.
Do not manually run additional lint, test, check, or build commands that
duplicate CI. Tool-specific validation required to create an artifact,
interactive checks needed to implement a change, and checks explicitly
requested by the user remain allowed. Contributor pull-request CI owns fast
checks for affected modules; administrator-authored PRs bypass it after local
preflight. Cross-platform builds, frontend production builds, bundle
budgets, embedding runtime tests, and Harness integration tests belong to
nightly or release qualification, not ordinary pull requests.

The `Required` pull-request check runs fast checks selected from the exact
base-to-head diff only for contributors without repository administrator
permission. Administrator-authored PRs are trusted local-delivery artifacts:
CI confirms that permission and immediately reports success without module
checks or review. The administrator bypass in the default-branch rulesets must
use `always` mode so the same trusted actors may also push directly.

Ordinary pushes to `master` do not run CI. Complete qualification belongs to
the Release workflow before tagging or building, and to nightly or explicit
manual CI runs. Release qualification forces every frontend, automation,
native, embedding, and Harness capability and never reuses fast PR coverage.
Keep the path classifier, result verifier, reusable workflow inputs, release
gate, and their tests aligned whenever a module boundary changes. A failed
release qualification must stop tagging, builds, and publication.

The private SDK uses focused direct pushes to `main` and does not run PR or
per-push CI. SDK release tags, nightly runs, and explicit manual dispatches send
the immutable SDK commit to `sdk-ci.yml` with complete qualification selected.
That workflow must keep private command output and build artifacts out of public
logs, artifacts, and target caches, and report `Public SDK full validation
passed` through the least-privileged reporter GitHub App. The SDK Release
workflow waits for that exact status before any build or publication. Keep
`cache-targets: false`; routing and job granularity, rather than publishing
private compiler output to a public cache, are the SDK CI optimization boundary.
Full public-host qualification must build the real pinned helper and export its
digest before checking the host.

## Browser-backed frontend workflow

Use the workspace `playwright` skill for every repository workflow that renders
or interacts with the frontend in a browser. Use its bundled wrapper, which
prefers an installed `playwright-cli`, then resolves it through Bun, with
Node/npm as an allowed fallback; do not substitute another browser control
surface. This includes, without limitation, verifying frontend changes,
reproducing browser-visible bugs, exercising preview routes and interactions,
checking responsive layouts, light/dark themes, and Chinese/English copy, and
capturing software screenshots, PDFs, videos, or traces.

Start the required development server, open the target through the skill,
snapshot before using element references, and re-snapshot after navigation or
material DOM changes. Prefer dedicated browser preview routes for state that
would otherwise require native Tauri setup. Keep automatic browser artifacts in
the system temporary directory through the skill wrapper. Do not create
repository-root output directories; copy only explicitly requested deliverables
to a deliberate tracked location.

## Public repository ownership

- `sdk/` is a pinned private Git submodule. Treat it as a separate repository:
  commit SDK changes there first, then commit only the resulting gitlink update
  here with any required host/frontend integration.
- `src-tauri/` is the host package boundary. It uses `openagent-app` only to
  apply OpenAgent product bootstrap and `openagent-runtime` for execution APIs.
  Keep Rust source there limited to thin binary entry points, Tauri
  Builder/command/event adapters, desktop capabilities, build configuration,
  and packaging metadata. The private SDK boundary check must validate backend
  sources under `sdk/rust/openagent-runtime/src` and require both SDK crates;
  keep that check aligned whenever crate ownership changes.
- `src/routes/+page.svelte` is the frontend composition root. Put new views in
  `src/lib/components/`; keep leaf components presentational.
- Put `invoke()` calls and cross-component state in feature containers or the
  page shell. Use Svelte 5 runes and one-way data flow.
- Render ordinary component children directly. Use an explicit Svelte
  `children` snippet only when the child contract requires snippet parameters.
- `src/lib/streamdown/` is the only extension point for streamed Markdown,
  code, Mermaid, ECharts, and AGUI rendering.
- Follow `docs/design.md` and prefer Bits UI primitives.

## Host and SDK integration

- Frontends submit ordinary chat and slash-command input through the shared SDK
  client; do not add flow selection or command parsing to the host/frontend.
- Tauri's synchronous `setup` callback does not run inside a Tokio worker.
  Enter `tauri::async_runtime` before calling SDK lifecycle functions that
  internally spawn Tokio tasks.
- Run persisted configuration/database compatibility inspection before runtime
  and WebView construction. Desktop startup may use a native confirmation
  dialog to let the user exit or approve the SDK-owned durable backup and fresh
  affected store; standalone startup must fail instead of assuming consent.
  Never duplicate version inspection, backup, or reset file operations in the
  host.
- The frontend communicates with native code through typed Tauri calls and
  events. An IPC change must update the SDK contract/adapter and all public
  frontend types and call sites together.
- Keep SDK internals, architecture notes, diagnostic scripts, and runtime
  invariants in the private SDK repository. Public documentation should cover
  product behavior and the minimum clone/build/integration contract only.
- Inspector and trace data may contain model context. Never expose it in the
  normal product UI.

## Data and configuration

| Scope | Location |
| --- | --- |
| Config and SQLite | `OPENAGENT_HOME`, defaulting to `~/.openagent/` on every platform |
| Global memory | `<OPENAGENT_HOME>/memory.md` |
| Global skills | `~/.agents/skills/<name>/SKILL.md` |
| Workspace state and skills | `<workspace>/.agents/` |
| Workspace design | `<workspace>/DESIGN.md` |

Never overwrite user-maintained memory sections. Change structured memory
through existing commands/tools. Skills require YAML frontmatter with `name`
and `description`; store category under `metadata`, while continuing to read
legacy top-level category values.

## Safe changes and verification

- When logic changes, update the relevant `AGENTS.md`, `docs/*.md`, README, or
  workspace `SKILL.md` in the same commit. Document the resulting behavior and
  durable constraints, not a chronological edit log. If the existing
  documentation remains correct, improve it with the newly confirmed invariant,
  boundary, failure mode, or verification procedure.
- Treat structured configuration and conversation-database changes as versioned
  compatibility boundaries. Every newly supported shape must ship with explicit
  compatibility handling for all versions inside its declared support window,
  including the required migration or normalization path and failure coverage;
  never make supported persisted settings or conversations unreadable through a
  shape-only change.
- Do not grow indefinite compatibility paths for releases older than the declared
  support window. Their default upgrade path is a freshly generated configuration.
  Before replacing configuration or clearing any related settings or conversation
  data, the product must warn the user that data may be removed and give them a
  concrete opportunity and instructions to save or back it up. Deliver that
  transition UX, version-boundary documentation, and destructive-path coverage in
  the same change that ends compatibility.
- Keep instructions close to their owner: repository-wide rules belong here;
  subsystem architecture belongs in `docs/`; repeatable agent procedures and
  fragile invariants belong in the triggering skill; SDK internals belong in
  the private SDK repository.
- During review, reject logic-only changes and stale instructions. Tests prove
  behavior; they do not replace agent-facing documentation.
- File/database-backed views need explicit loading state and layout-stable
  skeletons.
- Keep provider secrets out of source control.
- Automation JavaScript is checked through the repository TypeScript configuration;
  keep public and internal helper boundaries explicitly typed with JSDoc when
  inference cannot establish a safe type.
- Treat the private submodule revision as release-relevant source input.
- Native CI jobs that compile the Tauri host without building the frontend must
  materialize the configured `frontendDist` directory before Rust compilation;
  the frontend qualification job remains the owner of the production build.
  Keep direct native-dialog dependencies from enabling a Linux backend that
  conflicts with the backend selected by `tauri-plugin-dialog`.
- Build both Windows sandbox helper executables from the Codex revision pinned
  by the SDK, keep them out of source control, and bundle them under
  `codex-resources/`. The library, setup helper, and command runner must never
  come from different revisions. Helper preparation must diagnose an SDK
  checkout that differs from the parent gitlink before suggesting a submodule
  update; never reset or overwrite SDK work automatically. During development,
  pass the selected Vite URL as a Tauri CLI configuration layer before launch
  so the webview cannot fall back to stale `frontendDist` output. Stage rebuilt
  helper resources only when their bytes change so Tauri's watcher does not
  restart an otherwise unchanged development application.
- Build the Linux `codex-bwrap` sidecar from the same pinned Codex revision,
  strip it before hashing, embed the SHA-256 in release Rust compilation, and
  package those exact bytes through Tauri `externalBin`. Release builds must
  use `bun run tauri:build` so the digest reaches Cargo.
- For visible UI changes, verify light/dark themes and Chinese/English copy.
- Do not edit generated `build/`, `.svelte-kit/`, or `target/` output.


## Git workflow

Repository-changing tasks use the prefix-selected `deliver-via-pr` workflow.
Without a delivery prefix, modify the existing local `master` worktree directly,
run preflight, and create focused commits on `master`. Do not create a task
branch or worktree and do not push. Preserve unrelated staged and working changes
and commit only explicit intended paths. An uppercase standalone `OWT` prefix
selects the former isolated local workflow: create a temporary task branch and
sibling worktree from the committed local `master` `HEAD`, implement and commit
there, then fast-forward local `master` and clean up. If concurrent commits
advance `master`, merge that latest branch into the task branch, rerun preflight,
and retry the fast-forward. Stop for real conflicts, non-linear ancestry, or
working-tree overwrites. SDK changes retain their separate direct-push workflow.
An uppercase standalone `OPR` prefix creates or updates a ready pull request on
a dedicated task branch and stops without waiting for CI, merging, or cleanup.
New OPR tasks use an isolated worktree so the default worktree remains aligned
with its remote. A message containing only `OPR` publishes existing committed
work without creating another change: it first preserves the exact head on a
recovery branch, uses the skill's deterministic reconciler to rebuild only the
unpublished semantic tail on the remote default, confirms that task branch and
the PR remotely, and only then restores the clean default worktree to its
remote-tracking branch. Never merge a later squash result back into the
preserved pre-squash commits or resolve a real content conflict by silently
preferring the remote version. An uppercase
standalone `ORPR` prefix selects the full
isolated-worktree workflow: create the task worktree from the remote default
branch, commit and push, open a ready PR, use the administrator bypass to merge
the exact head without CI or review, and clean up. Match `ORPR` before `OPR`;
`OWT` is a separate prefix. Explicit user instructions that exclude or alter a
delivery stage take precedence.

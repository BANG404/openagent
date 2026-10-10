# Local plugin development and acceptance

## Resolve source locations from the project

Locate the current project's root and read its instructions and existing plugin
layout before choosing a source directory. Prefer a user-specified location;
otherwise use the project's established plugin directory. If no convention
exists, create `plugin/<plugin-name>/` relative to that project root. Here,
`/plugin` means a project-relative directory, not a filesystem-root path.
OpenAgent already uses `plugins/`, so its candidates belong at
`plugins/<plugin-name>/`; do not introduce a parallel `plugin/` tree.

Name a new source directory for the plugin's own identity, or use a directory
explicitly mapped by the project's plugin index. Read `plugin.json` and the
repository identity to establish ownership; an old checkout folder name is not
that authority. Do not reuse another plugin's name or assume that two unrelated
plugins are one package because a previous checkout path mentions both.

Documentation and reusable commands name project-relative paths or explicit
inputs such as `<project-root>` and `<plugin-directory>`. Resolve absolute paths
from those inputs when executing a tool or handing off an installation path;
never prescribe a drive letter, developer username, fixed checkout name, or an
unrelated sibling repository as the destination.

Independent Git ownership does not require a source checkout outside the
project. A plugin repository can live under the chosen project plugin directory;
use its existing repository and instructions, and follow the parent project's
tracking or submodule convention when integrating it. A template repository URL
selects input to copy, not the final source destination. Creating a plugin does
not imply extending a tooling repository such as Plugin Kit unless that is the
requested target.

OWT worktrees and fixture homes are temporary execution locations. Develop under
the same relative plugin path in the isolated checkout and deliver back to that
path in the default project checkout. Keep the accepted candidate available
there after cleanup; report the final project-relative path and derive the
concrete installation path from the checkout actually in use.

## Pinned source checkouts

Plugin source checkouts live under `plugins/`. Goal, Graph, Chat Groups, Cua
Driver, Message Board, and Plugin Developer (`openagent-plugin-kit`) are independent
Git submodules: `.gitmodules` records
their repositories and the parent gitlinks pin their exact commits. Initialize
them in every checkout or isolated worktree before using the development tools:

```bash
git submodule update --init --recursive -- plugins
bun run plugin:dev
```

The reviewed Claude external adaptations follow the same ownership: Asana,
Context7, Discord, Fakechat, Firebase, GitHub, GitLab, iMessage, Laravel Boost,
Linear, Playwright, Serena, Telegram and Terraform live at `plugins/<id>` and
publish independently as `BANG404/openagent-<id>`. Their immutable upstream
revision, source digest and bundled adapter hashes are recorded in each
`provenance.json`; retain upstream licenses. Plugin Kit's
`development_import_claude` creates these candidates through the ordinary
creation workflow. Its explicit host publication CLI requires accepted,
byte-bound validation/test/Runtime evidence and prior naming/visibility
authorization. Account-backed service operations and macOS access remain
separate qualification requirements; setup status alone does not prove them.

The tracked `plugins/dev-index.json` maps manifest plugin IDs to directories
relative to that file. Paths must remain inside its directory, including through
symlinks or junctions. The index is explicit: unrelated folders are never scanned
or enabled. Add a third-party source under `plugins/` and deliberately add its
ID/path to the index; do not add machine-specific paths or secrets.

`bun run plugin:dev` validates and lists indexed paths and manifest versions;
`bun run plugin:dev goal` selects one package, and
`bun run plugin:dev --path goal` prints only its installation path. The default
index is resolved beside the script, independently of the current directory.
`--index <file>` deliberately selects another index with the same containment
rules. Neither `.env` nor `OPENAGENT_PLUGIN_DIRS` / `OPENAGENT_PLUGIN_ENV_FILE`
participates in lookup. Old plugin path entries can be removed from local `.env`
without changing provider or tracing credentials. Missing mappings, empty or
uninitialized submodules, and manifest identity/version mismatches fail
explicitly; initialize the pinned sources rather than searching sibling folders.

Read each plugin repository's own instructions before changing it. Commit and
explicitly publish accepted plugin source changes in that repository before
advancing the parent's gitlink for reproducible remote clones. Do not treat a
local Git commit as published or silently replace an unpublished candidate with
an older upstream version. Preserve existing checkouts outside the project;
they may contain local commits or developer work. Moving them is a separate
explicit task, not an incidental part of choosing a new candidate's location.

Apply [plugin versioning](versioning.md) during implementation: update source
package versions and verified compatibility declarations before committing and
advancing a gitlink. Runtime publication validates these identities rather than
calculating versions or repairing missing bumps.

## Association, tests, and use

The index identifies source checkouts; it does not enable packages, modify
release configuration, or replace Runtime installation policy. Use the resolved
directory with the existing local-directory plugin installation action in an
isolated development instance. Installation stages a package copy: reinstall
the candidate after source changes; do not imply a live symlink or hot reload.
Do not overwrite a developer's already installed package without authorization.

`bun run test:blackbox:plugin-functionality` reads the same index and validates
all selected sources before touching fixture settings. Set `BLACKBOX_PLUGIN_IDS`
to select Goal, Graph, or Chat Groups. Every worktree uses its own initialized
plugin submodules and tracked index. Reports include the exact resolved
directories and manifest versions.
Run package-owned validation and the applicable native black-box scenario;
retain report paths and record tested Git revisions. Index validation alone
does not prove Runtime functionality or qualify a published release.

For Graph, select `BLACKBOX_PLUGIN_IDS=graph` with the functionality runner.
Start the isolated instance with its existing `<fixture>/workspace` directory
as the configured workspace. The runner temporarily enables networking for
the local model and plugin bridge, then restores the original settings.
Its deterministic child turns each take 16 seconds, exceeding the package's
15-second bridge request timeout. Graph must submit with `wait: false`, poll
the recorded child branch until terminal, and complete dependent nodes before
the runner checks restored parent/child projections in light/English and
dark/Chinese. Keep the delay: instant child turns conceal HTTP timeout failures.

Chat Groups creates role-bound participants through the generic conversation
bridge, linking them to its real owner conversation. Runtime task delegation
is separate: group sends require existing membership and cannot auto-enroll a
spawned task. The package publishes the shared child-conversation projection
for join-only participants before their first wake. Chat Groups owns group
membership and owner identity in its package. Follow its
bundled Skill for creation/start semantics and state upgrades. Run
`test:blackbox:chat-groups-sidebar` for unbound and role-bound owner labels,
language-stable owner mentions, reload and the four theme/language combinations;
run `test:blackbox:chat-groups-wake` for real hidden wakes and transcript recovery.
Chat Groups shows its sidebar Stop control only while a joined conversation is
running. The package projects live bridge state through its member listing;
the host does not infer activity from membership or the persisted stopped flag.
The sidebar runner checks idle visibility and the wake runner checks active
visibility, cancellation and return to idle in all theme/language combinations.
Chat Groups v3 resolves both Agent and user wake targets from published content
(`@role`, quoted names with spaces, `@owner` / `@群主`, and `@all`); its sending
tool has no separate `mentions` input. The wake runner covers Agent member
handoffs to a quoted role name and its owner, and user `@all` Stop plus `@owner`
recovery. Persisted resolved member IDs remain package data; the host does not
parse group mentions.
Both panel runners use task-owned package copies without conditional sidebar
activation, since their bridge calls are outside the model transcript. Also run
`test:blackbox:plugin-sidebar-activation` against the unmodified manifest to
qualify the branch activation contract.

## Developer acceptance before publication

The installable Plugin Kit development workflow uses `/openagent-plugin-kit:create`
with free text or a JSON specification naming Skills and an HTTPS template
repository. Its package-owned MCP tools scaffold/select workspace packages,
retain validation/test/Runtime evidence bound to exact bytes, and its Stop hook
continues unfinished successful turns with a bounded budget. Status turns never
continue; approval, cancellation, failure and qualified candidates stop.
Qualification waits for `:accept`; `:resume` and `:stop` control recovery.
Read the kit's `docs/development-workflow.md` for arguments and reports.
Resolve the final candidate directory before collecting gate evidence. If the
scaffolder stages a package elsewhere in the workspace, place it at the chosen
project plugin path without overwriting existing files and select that path with
`development_select`; collect validation, test and Runtime evidence there.
Its Runtime runner launches a selected shipped/source-built server against the
production desktop API with isolated data, authenticates using a fresh token,
copies the caller's permission profile, and retains binary/package digests and
logs. It never connects to installed release state or broadens grants. Exercise
commands/hooks with an Agent run as well as package gates; MCP acceptance needs
explicit tool-result assertions. Keep an unpublished candidate in the resolved
project plugin directory until the developer separately authorizes publication.

For mounting and localized-name changes, run
`bun run test:blackbox:plugin-mcp-modes` in the isolated
`plugin-mcp-modes-i18n` instance with its explicit `TAURI_PILOT_SOCKET`.
The runner installs sources from the development index; set
`BLACKBOX_PLUGIN_CANDIDATE_ROOT` to an independent directory containing the five
plugin ID subdirectories to qualify unpublished candidates. It checks all five
localized names, changes Direct/Relay/Follow through the shared Select,
verifies persistence after reopening and independent enablement/host access,
and switches the live locale in all light/dark and English/Chinese combinations.
Set `BLACKBOX_NATIVE_WINDOW_HANDLE` to that instance's main HWND for native
captures. It requires a fresh fixture and restores settings and installed state.

For installation-time computer access prompts, run
`bun run test:blackbox:plugin-host-access` against an isolated Tauri fixture with
`OPENAGENT_HOME` and `TAURI_PILOT_SOCKET` set to that instance. The committed
`plugin-host-access-defer.toml` and `plugin-host-access-grant.toml` scenarios
verify prompt copy, focus, no implicit grant, deferred installation with a
permission-required notice, persisted authorization, daemon readiness, MCP
tool discovery, revocation, and Settings reopening in light/English and
dark/Chinese. Use a fresh fixture without a pre-existing Cua package or grant;
the runner retains package data while uninstalling its own test package.

Finish implementation, package validation, related OpenAgent integration tests,
and the repository-owned local delivery workflow before handing back a candidate.
Provide plugin IDs, checkout paths, commit IDs, versions, a concise behavior
description, test evidence and any outstanding blockers. Give the developer
concrete installation paths and steps to exercise the changed behavior in the
development instance. Leave that candidate available for their acceptance.

After the developer accepts, ask which external action they want: push to the
existing repository, create a named repository and push, or publish a specific
version with an installable archive. Ask only for missing authorization: an
earlier explicit instruction to push or publish remains valid for its named
scope. Acceptance by itself does not authorize a push, repository creation,
tag, or release. Do not treat a successful agent test or end of agent execution
as developer acceptance. Resolve rejected behavior before publication.

Keep source push and release publication separate in reports. Before a release,
verify the version bump, packaged manifest, archive contents, checksums where
required, language coverage, and tested revision, following the package's release
instructions. Update the official catalog for published versions. If repository
creation is requested, confirm the owner/name and visibility before creating it.

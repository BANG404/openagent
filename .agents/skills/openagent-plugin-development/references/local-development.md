# Local plugin development and acceptance

## Pinned source checkouts

Plugin source checkouts live under `plugins/`. Goal, Graph, Chat Groups, Cua
Driver, and Message Board are independent Git submodules: `.gitmodules` records
their repositories and the parent gitlinks pin their exact commits. Initialize
them in every checkout or isolated worktree before using the development tools:

```bash
git submodule update --init --recursive -- plugins
bun run plugin:dev
```

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
an older upstream version. Preserve independent sibling checkouts during this
directory migration; they may contain local commits or developer work.

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

## Developer acceptance before publication

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

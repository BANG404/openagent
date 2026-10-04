# Local plugin development and acceptance

## Explicit directory index

Before plugin work, resolve the checkout through the OpenAgent checkout's local
`.env`. `OPENAGENT_PLUGIN_DIRS` is a JSON object whose keys are manifest plugin
names and whose values are absolute paths or paths relative to that `.env` file.
Use forward slashes for Windows paths. `.env.example` contains the standard
packages; arbitrary third-party IDs use the same mapping.

```dotenv
OPENAGENT_PLUGIN_DIRS='{"goal":"../openagent-goal","my-plugin":"D:/Work/my-plugin"}'
```

Run `bun run plugin:dev` to validate and list configured directories and manifest
versions, `bun run plugin:dev goal` for one plugin, or
`bun run plugin:dev --path goal` for only its installation path. The command
reads only the index field and does not print other `.env` values. Process
`OPENAGENT_PLUGIN_DIRS` overrides the file; do not dump the environment.
Missing mappings, nonexistent directories, and manifest name mismatches fail
explicitly. Ask the developer for the missing path instead of listing sibling
directories, scanning disks, or guessing from repository names.

An isolated worktree has no copy of the developer's ignored `.env`. Use
`bun run plugin:dev --env D:/Projects/openagent/.env` for lookup, or set
`OPENAGENT_PLUGIN_ENV_FILE` to that file for scripts. Relative paths still resolve
beside the selected file. Do not copy secrets or local paths into tracked files.
Read the resolved plugin repository's own instructions before changing it.

## Association, tests, and use

The index identifies source checkouts; it does not enable packages, modify
release configuration, or replace Runtime installation policy. Use the resolved
directory with the existing local-directory plugin installation action in an
isolated development instance. Installation stages a package copy: reinstall
the candidate after source changes; do not imply a live symlink or hot reload.
Do not overwrite a developer's already installed package without authorization.

`bun run test:blackbox:plugin-functionality` reads the same index and validates
all selected sources before touching fixture settings. Set `BLACKBOX_PLUGIN_IDS`
to select Goal, Graph, or Chat Groups, and use `OPENAGENT_PLUGIN_ENV_FILE` from
worktrees. Reports include the exact resolved directories and manifest versions.
`OFFICIAL_PLUGIN_CHECKOUTS` is no longer used; configure each directory explicitly.
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

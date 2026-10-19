---
title: Publish and update
description: Ship a stable GitHub release archive and verify OpenAgent's explicit update flow.
---

## Prepare a stable identity

Set `repository` in `plugin.json` to your HTTPS GitHub source repository. Keep `name` unchanged when publishing updates. Advance the source version for every changed package, including bundled Skills: patch for compatible fixes, minor for compatible additions, major for breaking package APIs. Published tags and archives are immutable.

OpenAgent discovers **stable** GitHub releases; prereleases are not update candidates. Publish the verified protocol/features in release notes so a host can select a compatible candidate when the latest release requires newer capabilities. For the basic Skill package:

```html
<!-- openagent-plugin {"plugin_protocol":{"min":1,"max":1},"features":[]} -->
```

Include actual required features, such as `configuration-v1`, when applicable. When the latest is incompatible, the updater considers the newest compatible stable candidate among the latest 100 releases. The archive's complete manifest is still validated; release notes cannot override its compatibility requirements.

## Validate and exercise the package

```sh
bun tools/openagent-plugin-kit/scripts/validate-plugin.mjs plugins/project-notes --require-i18n
```

Install the exact package you intend to publish and exercise all declared components. Check the installed copy, supported languages, theme changes where applicable, data persistence, and failure paths. Ship any code or resources required at runtime; a manifest alone does not bundle external dependencies.

## Create the release archive

In the standalone plugin repository, commit the validated package with `plugin.json` at the repository root. For example:

```sh
git archive --format=zip --output=../project-notes-1.0.0.zip HEAD
```

Attach that archive to a stable GitHub release for the same commit. The release asset must satisfy all of these conditions:

| Requirement | Value |
| --- | --- |
| Download | HTTPS GitHub release asset |
| Archive | `.zip`, `.tar.gz`, or `.tgz` |
| Digest | GitHub-provided `sha256:` digest matching the bytes |
| Size | At most 50 MiB compressed and 100 MiB extracted |
| Root | `plugin.json` directly at archive root |
| Identity | Manifest `name` matches the installed package |

Verify the digest through the GitHub release asset API. With GitHub CLI, inspect an uploaded release using:

```sh
gh api repos/you/project-notes/releases/tags/v1.0.0 --jq '.assets[] | {name, digest, browser_download_url}'
```

Replace the owner, repository, and tag. Download the actual asset and compare its SHA-256 with that digest. A checksum text file alone does not replace GitHub's asset digest. Exclude credentials and development-only state. Extraction rejects traversal and links. `git archive` contains tracked files only; commit required runtime build output before using this command, or build a clean distribution directory with `plugin.json` at its root and archive that directory instead.

## Verify an update from an older installation

Install the previous version in an isolated fixture and create representative plugin data. Check for updates in Settings. Checking does not download or execute package code. Select **Update** explicitly; OpenAgent downloads, verifies, validates in staging, then atomically replaces the package. Failed activation restores the previous package; `PLUGIN_DATA` is preserved.

Confirm the new version, commands and tools, retained data, and a useful error for an invalid archive or digest. A package data migration belongs to the plugin and needs its own recovery plan. Uninstall retains plugin data and private settings; do not promise that it erases all state. Developer-source refresh and GitHub release updates are different paths: qualify release replacement with an archive-installed fixture, without an active local source association.

Release Runtime-version changes can also synchronize compatible plugin subscriptions before processes mount. Offline or invalid candidates retain the installed package. Authors should qualify compatibility and data recovery independently of the user's explicit update action.

For the complete release rules, see [Plugin Kit publishing](https://github.com/BANG404/openagent-plugin-kit/blob/main/docs/publishing.md).

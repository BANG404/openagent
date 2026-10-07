---
title: Publish and update
description: Ship a stable GitHub release archive and verify OpenAgent's explicit update flow.
---

## Prepare a stable identity

Set `repository` in `plugin.json` to your HTTPS GitHub source repository. Keep `name` unchanged when publishing updates. Advance the source version for every changed package, including bundled Skills: patch for compatible fixes, minor for compatible additions, major for breaking package APIs. Published tags and archives are immutable.

OpenAgent discovers updates from the repository's latest **stable** GitHub release. A prerelease is not an update candidate. Plugin protocol compatibility remains separate from version ordering.

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

Verify the digest through the GitHub release asset API. A checksum text file alone does not replace GitHub's asset digest. Exclude credentials and development-only state. Extraction rejects traversal and links.

## Verify an update from an older installation

Install the previous version in an isolated fixture and create representative plugin data. Check for updates in Settings. Checking does not download or execute package code. Select **Update** explicitly; OpenAgent downloads, verifies, validates in staging, then atomically replaces the package. Failed activation restores the previous package; `PLUGIN_DATA` is preserved.

Confirm the new version, commands and tools, retained data, and a useful error for an invalid archive or digest. A package data migration belongs to the plugin and needs its own recovery plan. Uninstall retains plugin data; do not promise that it erases all state.

For the complete release rules, see [Plugin Kit publishing](https://github.com/BANG404/openagent-plugin-kit/blob/main/docs/publishing.md).

# Release process

OpenAgent uses Conventional Commits, SemVer, direct release commits, and
immutable release tags. Release behavior is split by concern so contributors
can load the relevant contract without reading the complete pipeline.

- [Commit conventions](release/conventions.md): commit message requirements and examples.
- [Versioning and channels](release/versioning.md): version calculation, Beta/RC/Stable promotion, component selection, and SDK releases.
- [Release sources](release/sources.md): authoritative branches, direct pushes, generated files, and metadata verification.
- [Development Runtime](release/development-runtime.md): Runtime sidecar rebuild and reload ordering during development.
- [Publishing](release/publishing.md): qualification, candidate artifacts, signing, Store packaging, and final publication.
- [Modular CI](release/ci.md): path selection, fast and full qualification, cross-repository status, and cache boundaries.
- [Local commands](release/local-commands.md): lint requirements and local release preparation commands.

Keep each rule in its owning page. Update this index only when ownership or the
set of release topics changes.

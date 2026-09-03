# Commit conventions

## Commit messages

Commit messages are validated by the versioned Git hook in
`.githooks/commit-msg`. Run `bun install` or
`node scripts/install-git-hooks.mjs` once to set `core.hooksPath`.

Valid examples:

```text
feat(chat): add streaming retry
fix: handle missing workspace
feat!: remove deprecated config field
```

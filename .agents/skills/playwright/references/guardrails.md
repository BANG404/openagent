# Guardrails

- Never run repository browser work in the implicit `default` session.
  Keep one collision-resistant named session for the complete task and
  close only that session during cleanup.
- Always snapshot before referencing element ids like `e12`.
- Re-snapshot when refs seem stale.
- Prefer explicit commands over `eval` and `run-code` unless needed.
- When you do not have a fresh snapshot, use placeholder refs like `eX`
  and say why; do not bypass refs with `run-code`.
- Use `--headed` when a visual check will help.
- Do not create `output/` or another repository-root artifact
  directory. Leave automatic artifacts in the wrapper's temporary
  directory, and copy only explicitly requested deliverables to a
  deliberate destination.
- Default to CLI commands and workflows, not Playwright test specs.

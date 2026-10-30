---
name: issue-worker
description: Maintain OpenAgent's single-dispatch GitHub Issue worker, shared LXD Codex containers, private credentials, lifecycle cleanup, and alpha delivery.
metadata:
  category: agent-infrastructure
---

# Issue worker

The worker follows the sandboxpi Issue automation model while using OpenAgent's repository and checks. Read [worker contract](references/worker-contract.md) before changing the controller, container helper, image bootstrap, installer, service, or worker tests.

- Each trusted Issue is dispatched once, serially, in one disposable unprivileged LXD system container. The container runs dependency installation, `codex exec`, repository preflight, commit, and push. It clones `origin/alpha` independently and never mounts the controller checkout or another task's Git metadata.
- Use the existing dedicated `sandboxpi-codex` LXD project, bridge, and storage. OpenAgent instances carry the `user.openagent.codex-worker` ownership marker and use an OpenAgent-specific image alias and contract. Cleanup removes only instances carrying the exact controller-root marker.
- Failed, interrupted, changed-input, or timed-out work retains private logs and staged work and never redispatches. Cleanup failure blocks later dispatch. Successful work is pushed to `origin/alpha`; no automatic promotion, deployment, force push, or draft PR is allowed.
- Copy only selected Codex model settings/authentication and the GitHub token into the container. Never mount host HOME, SSH, LXD/Docker sockets, production state, or unrelated project settings. Keep model output, credentials, and diagnostics private.
- Issue titles, descriptions, and progress/blocker/completion comments are Simplified Chinese. Repository content, code, skills, and Conventional Commit messages are English. Preserve technical identifiers and machine-readable JSON.
- Installation builds or verifies the pinned OpenAgent LXD image, runs credential-free isolation smoke tests, installs an idle-safe user service, and creates labels without replaying historical failures. Use `sg lxd` for stale user-manager group membership.

Run the focused controller tests while iterating:

```bash
python3 -B -m unittest discover -s scripts/codex-tests -p 'test_*.py'
```

LXD acceptance is separate and requires the existing host setup:

```bash
sg lxd -c 'python3 -B deploy/codex/build-image.py'
bun run test:codex-container
```

Report unavailable host LXD or provider acceptance separately; fixtures do not prove those environments. Keep this skill and [AGENTS.md](../../../AGENTS.md) synchronized when the delivery boundary changes.

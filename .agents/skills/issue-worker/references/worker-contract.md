# Worker contract

The controller stores state under `~/.local/share/openagent-codex`, uses a process lock, and persists dispatch before external work. Every record has one sequence and one container name. Startup removes only owned LXD instances; it never resets state to retry an Issue.

The container uses isolated UID/GID maps, 20 GiB root storage, four CPUs, 8 GiB RAM without swap, 512 processes, no nesting or devlxd, and no autostart. Workspace and artifacts are shifted mounts; the credential bundle is read-only. Task commands run as the mapped non-root user with `no_new_privs`.

`deliver.py` requires a clean reviewed snapshot, checks ancestry from `origin/alpha`, runs `bun run preflight --base <alpha>`, appends `CI-Followup: auto` unless explicitly selected, commits the unchanged tree, and pushes only `alpha` or the controller's issue branch. The controller then fast-forwards the verified commit to `alpha`, retrying one normal concurrent-alpha merge and full preflight inside the same Issue execution.

The controller follows source CI and Public checks for diagnosis but never waits for them inside an Issue. Failure fingerprints deduplicate incidents. `codex:skip`, `codex:self`, and `codex:needs-human` pause initial dispatch; removing labels does not reset a terminal attempt. New work requires a new Issue.

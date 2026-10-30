#!/usr/bin/env bash
set -euo pipefail
TASK_SOURCE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
export PATH="$HOME/.local/bin:$HOME/.bun/bin:/snap/bin:$PATH"
for tool in git gh lxc bun python3; do command -v "$tool" >/dev/null; done
test "$(bun --version)" = "1.3.14"
# Verify/build the dedicated local LXD agent image without changing host pools, networks or access.
python3 -B "$TASK_SOURCE/build-image.py"
# Refuse rollout before real lifecycle/isolation acceptance; this consumes no provider credentials.
python3 -B "$TASK_SOURCE/smoke-container.py"
# Test credential availability without printing any credential.
test -s "$HOME/.codex/credentials.env"
gh auth status >/dev/null 2>&1
TASK_STATE="$HOME/.local/share/openagent-codex"
mkdir -p "$TASK_STATE/controller" "$HOME/.config/systemd/user"
chmod 700 "$TASK_STATE" "$TASK_STATE/controller"
install -m 600 "$TASK_SOURCE/worker.py" "$TASK_STATE/controller/worker.py.next"
install -m 600 "$TASK_SOURCE/task_container.py" "$TASK_STATE/controller/task_container.py.next"
mv "$TASK_STATE/controller/task_container.py.next" "$TASK_STATE/controller/task_container.py"
mv "$TASK_STATE/controller/worker.py.next" "$TASK_STATE/controller/worker.py"
install -m 700 "$TASK_SOURCE/run-worker.sh" "$TASK_STATE/controller/run-worker.sh"
install -m 644 "$TASK_SOURCE/openagent-codex.service" "$HOME/.config/systemd/user/"
for label in ci-failure codex:running codex:failed codex:verifying codex:done codex:needs-human codex:self codex:skip; do
  gh label create "$label" --repo BANG404/openagent --color 5319e7 --force
done
# Initialize before starting so installation never replays historical CI failures.
python3 - "$TASK_STATE" <<'PY'
import fcntl, importlib.util, pathlib, sys
root = pathlib.Path(sys.argv[1])
lock = (root / 'worker.lock').open('w')
try:
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    # The running controller owns state. Never migrate/save over its active snapshot.
    sys.exit(0)
spec = importlib.util.spec_from_file_location('worker', root / 'controller/worker.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.Worker(root).prepare()
PY
systemctl --user daemon-reload
systemctl --user enable --now openagent-codex.service
systemctl --user is-active openagent-codex.service
# Version 2+ controllers detect the atomic source replacement and reload when idle.
# An older controller needs one idle restart; never interrupt its active repair.
# A persistent user manager is necessary for operation after logout and reboot.
loginctl enable-linger "$USER"
test "$(loginctl show-user "$USER" -p Linger --value)" = yes

#!/usr/bin/env python3
"""Real LXD descendant cleanup/isolation acceptance without provider/GitHub access."""
from pathlib import Path
import shutil
import subprocess
import tempfile
from unittest.mock import patch
import uuid

from task_container import TaskContainer, cleanup, owned_instances

if not shutil.which("lxc"):
    raise SystemExit("LXD client is unavailable. An administrator must run the sandboxpi LXD setup before instance acceptance.")


def fixture_credentials(destination, *_):
    (destination / "config.toml").write_text('model = "offline-fixture"\n')
    (destination / "environment.json").write_text("{}")


def execute(task, args):
    return subprocess.check_output(task.command(args), text=True, timeout=30)


with tempfile.TemporaryDirectory(prefix="openagent-lxd-smoke-") as directory:
    root = Path(directory)
    workspace, artifacts = root / "workspace", root / "artifacts"
    workspace.mkdir()
    artifacts.mkdir()
    with patch("task_container.credentials", side_effect=fixture_credentials):
        for mode in ("success", "timeout", "orphan"):
            name = f"openagent-smoke-{uuid.uuid4().hex[:12]}"
            task = TaskContainer(root, name, workspace, artifacts, "")
            try:
                with task:
                    program = "import subprocess; subprocess.Popen(['sleep','600'], start_new_session=True, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)"
                    execute(task, ["python3", "-c", program])
                    assert "sleep 600" in execute(task, ["ps", "-eo", "args"]), "Detached child did not start"
                    execute(task, ["sh", "-c", "test ! -e /var/run/docker.sock && test ! -e /dev/lxd && test ! -e /home/agent/.ssh && test ! -w /usr/local/bin"])
                    execute(task, ["sh", "-c", 'printf fixture > "$1/probe"', "sh", str(workspace)])
                    assert (workspace / "probe").read_text() == "fixture", "Shifted task workspace is not writable"
                    for tool in (["node", "--version"], ["bun", "--version"], ["cargo", "--version"], ["rustc", "--version"], ["codex", "--version"]):
                        execute(task, tool)
                    if mode == "timeout":
                        try:
                            subprocess.run(task.command(["sleep", "60"]), check=True, timeout=1)
                        except subprocess.TimeoutExpired:
                            raise
                        raise AssertionError("Fixture command did not time out")
                    if mode == "orphan":
                        cleanup(root)
            except subprocess.TimeoutExpired:
                if mode != "timeout":
                    raise
            assert not owned_instances(root, name), "Task instance survived cleanup"
            assert not list(root.glob("container-credentials-*")), "Credential files survived cleanup"
print("LXD tools, shifted mounts, isolation and success/timeout/orphan cleanup acceptance passed.")

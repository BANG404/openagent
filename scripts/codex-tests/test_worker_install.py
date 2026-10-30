import configparser
import fcntl
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class WorkerInstallTests(unittest.TestCase):
    def install(self, active):
        with tempfile.TemporaryDirectory(prefix="openagent-worker-install-") as directory:
            root = Path(directory)
            private_home = root / "home"
            binaries = private_home / ".local/bin"
            binaries.mkdir(parents=True)
            credentials = private_home / ".codex/credentials.env"
            credentials.parent.mkdir()
            credentials.write_text("export FIXTURE_KEY=private-fixture\n")
            state_root = private_home / ".local/share/openagent-codex"
            state_root.mkdir(parents=True)
            original = '{"since":"2026-01-01T00:00:00Z","issues":{"10":{"status":"running"}},"failures":{},"events":["old"]}\n'
            if active:
                (state_root / "state.json").write_text(original)
            trace = root / "commands"
            for command in ("bun", "codex", "go", "cc", "lxc"):
                path = binaries / command
                path.write_text("#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then printf \"1.3.14\\n\"; fi\nexit 0\n")
                path.chmod(0o755)
            (binaries / "python3").write_text('#!/bin/sh\ncase "$*" in *smoke-container.py*|*build-image.py*) printf "container-smoke\\n" >> "$FIXTURE_TRACE"; exit 0;; esac\nexec ' + shlex.quote(sys.executable) + ' "$@"\n')
            (binaries / "gh").write_text('#!/bin/sh\nprintf "%s\\n" "$*" >> "$FIXTURE_TRACE"\nif [ "$1 $2" = "repo clone" ]; then mkdir -p "$4/.git"; fi\n')
            (binaries / "git").write_text('#!/bin/sh\nif [ "$1 $2" = "config --get-regexp" ]; then printf user.name; fi\nexit 0\n')
            (binaries / "systemctl").write_text('#!/bin/sh\nprintf "%s\\n" "$*" >> "$FIXTURE_TRACE"\n')
            (binaries / "loginctl").write_text('#!/bin/sh\nif [ "$1" = show-user ]; then printf yes; fi\n')
            for path in binaries.iterdir():
                path.chmod(0o755)
            with (state_root / "worker.lock").open("w") as lock:
                if active:
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                completed = subprocess.run(["bash", str(ROOT / "deploy/codex/install.sh")],
                                           env={**os.environ, "HOME": str(private_home), "USER": "fixture", "FIXTURE_TRACE": str(trace),
                                                "PATH": str(binaries) + os.pathsep + os.environ["PATH"]},
                                           text=True, capture_output=True, timeout=20)
            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertNotIn("private-fixture", completed.stdout + completed.stderr)
            state = (state_root / "state.json").read_text()
            if active:
                self.assertEqual(state, original)
            else:
                self.assertEqual(json.loads(state)["version"], 4)
            self.assertEqual((state_root / "controller/worker.py").read_bytes(), (ROOT / "deploy/codex/worker.py").read_bytes())
            self.assertFalse((state_root / "controller/worker.py.next").exists())
            commands = trace.read_text()
            self.assertIn("label create codex:failed", commands)
            self.assertIn("container-smoke", commands)
            self.assertNotIn("label create codex:retry", commands)
            self.assertNotIn("label create codex:waiting", commands)
            self.assertIn("label create codex:verifying", commands)
            self.assertNotIn("restart", commands)

    def test_active_install_does_not_overwrite_worker_state_or_restart(self):
        self.install(True)

    def test_fresh_install_initializes_state_before_start(self):
        self.install(False)

    def test_service_activates_existing_lxd_membership_for_start_and_cleanup(self):
        unit = configparser.ConfigParser(interpolation=None, strict=False)
        unit.read(ROOT / "deploy/codex/openagent-codex.service")
        with tempfile.TemporaryDirectory(prefix="openagent-worker-groups-") as directory:
            home = Path(directory) / "home with spaces"
            controller = home / ".local/share/openagent-codex/controller"
            controller.mkdir(parents=True)
            trace = Path(directory) / "trace"
            group = Path(directory) / "sg"
            group.write_text('#!/bin/sh\nset -eu\ntest "$1" = lxd\ntest "$2" = -c\nexport FIXTURE_LXD_GROUP=active\nexec /bin/sh -c "$3"\n')
            group.chmod(0o755)
            (controller / "run-worker.sh").write_text('test "$FIXTURE_LXD_GROUP" = active\nprintf "start\\n" >> "$FIXTURE_TRACE"\n')
            (controller / "task_container.py").write_text('import os, pathlib, sys\nassert os.environ["FIXTURE_LXD_GROUP"] == "active"\nassert sys.argv[1:] == ["--root", str(pathlib.Path.home() / ".local/share/openagent-codex")]\nwith open(os.environ["FIXTURE_TRACE"], "a") as stream: stream.write("cleanup\\n")\n')
            for command in ("ExecStart", "ExecStopPost"):
                arguments = shlex.split(unit["Service"][command].replace("%h", str(home)))
                self.assertEqual(arguments[:3], ["/usr/bin/sg", "lxd", "-c"])
                subprocess.run([str(group), *arguments[1:]], check=True,
                               env={**os.environ, "HOME": str(home), "FIXTURE_TRACE": str(trace)},
                               capture_output=True, timeout=10)
            self.assertEqual(trace.read_text(), "start\ncleanup\n")


if __name__ == "__main__":
    unittest.main()

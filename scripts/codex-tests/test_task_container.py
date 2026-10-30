import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import tomllib
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("task_container", ROOT / "deploy/codex/task_container.py")
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)


class ContainerTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.home = self.root / "operator"
        (self.home / ".codex").mkdir(parents=True)
        (self.home / ".codex/config.toml").write_text('''
model = "fixture-model"
model_provider = "fixture"
[model_providers.fixture]
name = "Fixture"
base_url = "https://fixture.invalid/v1"
env_key = "FIXTURE_MODEL_KEY"
wire_api = "responses"
[model_providers.fixture.env_http_headers]
"X-Account" = "FIXTURE_ACCOUNT"
[mcp_servers.private]
command = "/host/private-tool"
[projects."/host/private"]
trust_level = "trusted"
''')
        (self.home / ".codex/auth.json").write_text('{"fixture": "auth-fixture"}')
        self.workspace, self.artifacts = self.root / "workspace", self.root / "artifacts"
        self.workspace.mkdir()
        self.artifacts.mkdir()
        self.commands = []
        self.instances = []
        self.failure = None
        self.snapshot = None
        self.image_contract = runtime.CONTRACT
        for target in (patch.object(runtime.Path, "home", return_value=self.home),
                       patch.object(runtime.os, "getuid", return_value=1000),
                       patch.object(runtime.os, "getgid", return_value=1000),
                       patch.object(runtime.pwd, "getpwuid", return_value=type("Passwd", (), {"pw_gid": 1000})()),
                       patch.dict(os.environ, {"FIXTURE_MODEL_KEY": "model-fixture", "FIXTURE_ACCOUNT": "account-fixture",
                                               "UNRELATED_PRIVATE_KEY": "must-not-copy"}),
                       patch.object(runtime, "lxd", side_effect=self.lxd)):
            target.start()
            self.addCleanup(target.stop)

    def lxd(self, args, **kwargs):
        self.commands.append(args)
        if args[:2] == ["image", "list"]:
            return json.dumps([{"fingerprint": "a" * 64, "aliases": [{"name": runtime.IMAGE}],
                                "properties": {"openagent.contract": self.image_contract}}])
        if args[0] == "init":
            config = dict(args[index + 1].split("=", 1) for index, arg in enumerate(args) if arg == "--config")
            self.instances.append({"name": args[2].removeprefix("local:"), "config": config})
            private = next(self.root.glob("container-credentials-*"))
            self.snapshot = {path.name: path.read_text() for path in private.iterdir()}
        if args[0] == self.failure:
            raise RuntimeError("Fixture LXD failure")
        if args[0] == "list":
            return json.dumps(self.instances)
        if args[0] == "delete":
            self.instances[:] = [instance for instance in self.instances if instance['name'] != args[1].removeprefix("local:")]
        return ""

    def container(self):
        return runtime.TaskContainer(self.root, "fixture-task", self.workspace, self.artifacts, "github-fixture")

    def test_success_removes_instance_and_private_credentials(self):
        with self.container() as task:
            self.assertTrue(self.instances)
            private = Path(task.private.name)
            self.assertEqual(private.stat().st_mode & 0o777, 0o700)
        self.assertFalse(self.instances)
        self.assertFalse(private.exists())

    def test_timeout_and_partial_init_or_start_failure_remove_owned_instance(self):
        for failure in (None, "init", "start"):
            self.failure = failure
            with self.assertRaises((RuntimeError, subprocess.TimeoutExpired)):
                with self.container():
                    raise subprocess.TimeoutExpired("fixture-agent", 1)
            self.assertFalse(self.instances)
            self.assertFalse(list(self.root.glob("container-credentials-*")))

    def test_removal_failure_is_reported_and_credentials_still_removed(self):
        self.failure = "delete"
        with self.assertRaises(RuntimeError):
            with self.container():
                pass
        self.assertTrue(self.instances)
        self.assertFalse(list(self.root.glob("container-credentials-*")))

    def test_task_has_no_inherited_profiles_or_host_control_mounts(self):
        with self.container():
            pass
        create = next(args for args in self.commands if args[0] == "init")
        self.assertIn("--no-profiles", create)
        self.assertIn("local:" + "a" * 64, create)
        for setting in ("security.privileged=false", "security.nesting=false", "security.devlxd=false",
                        "security.idmap.isolated=true", "boot.autostart=false", "limits.processes=512",
                        "limits.memory=8GiB", "limits.cpu=4", "limits.memory.swap=false"):
            self.assertIn(setting, create)
        mounts = [args for args in self.commands if args[:3] == ["config", "device", "add"]]
        self.assertEqual(len(mounts), 3)
        for mount in mounts[:2]:
            self.assertIn("shift=true", mount)
            self.assertFalse(any("docker.sock" in arg or "unix.socket" in arg or arg == f"source={self.home}" for arg in mount))
        self.assertIn("readonly=true", mounts[-1])
        self.assertIn(["config", "device", "set", "local:fixture-task", "root", "size", "20GiB"], self.commands)

    def test_only_selected_model_settings_and_credentials_enter_instance(self):
        with self.container():
            pass
        config = tomllib.loads(self.snapshot["config.toml"])
        self.assertEqual(config["model"], "fixture-model")
        self.assertNotIn("mcp_servers", config)
        self.assertNotIn("projects", config)
        environment = json.loads(self.snapshot["environment.json"])
        self.assertEqual(environment, {"GH_TOKEN": "github-fixture", "FIXTURE_MODEL_KEY": "model-fixture",
                                       "FIXTURE_ACCOUNT": "account-fixture"})
        self.assertNotIn("auth.json", self.snapshot)
        self.assertFalse(any("model-fixture" in arg or "github-fixture" in arg
                             for args in self.commands for arg in args))

    def test_scoped_cleanup_preserves_foreign_instances_and_removes_stale_credentials(self):
        self.instances.extend([{"name": "orphan", "config": {runtime.LABEL: runtime.owner(self.root)}},
                               {"name": "foreign", "config": {runtime.LABEL: runtime.owner(self.root / "other")}},
                               {"name": "unmarked", "config": {}}])
        stale = self.root / "container-credentials-old"
        stale.mkdir()
        (stale / "environment.json").write_text("old-private-fixture")
        runtime.cleanup(self.root)
        self.assertEqual([instance["name"] for instance in self.instances], ["foreign", "unmarked"])
        self.assertFalse(stale.exists())

    def test_multiline_credentials_are_rejected_before_creating_instance(self):
        with patch.dict(os.environ, {"FIXTURE_MODEL_KEY": "fixture\nINJECTED=value"}), self.assertRaises(ValueError):
            with self.container():
                pass
        self.assertFalse(any(args[0] == "init" for args in self.commands))

    def test_root_worker_and_unverified_image_fail_before_creating_instance(self):
        with patch.object(runtime.os, "getuid", return_value=0), self.assertRaises(RuntimeError):
            with self.container():
                pass
        self.image_contract = "foreign"
        with self.assertRaises(RuntimeError):
            with self.container():
                pass
        self.assertFalse(any(args[0] == "init" for args in self.commands))

    def test_builtin_provider_keeps_only_its_authentication(self):
        (self.home / ".codex/config.toml").write_text('model = "fixture-model"\n')
        with patch.dict(os.environ, {"OPENAI_API_KEY": "openai-fixture"}):
            with self.container():
                pass
        self.assertIn("auth.json", self.snapshot)
        environment = json.loads(self.snapshot["environment.json"])
        self.assertEqual(environment["OPENAI_API_KEY"], "openai-fixture")
        self.assertNotIn("FIXTURE_MODEL_KEY", environment)

    def test_commands_force_local_project_non_root_user_and_no_secret_arguments(self):
        command = self.container().command(["bun", "run", "verify"], env={"DELIVERY_BRANCH": "fixture"})
        self.assertEqual(command[:6], ["lxc", "--force-local", "--project", runtime.PROJECT, "exec", "local:fixture-task"])
        self.assertIn("1000", command)
        self.assertIn("DELIVERY_BRANCH=fixture", command)
        self.assertIn("/usr/local/bin/openagent-agent-exec", command)
        self.assertNotIn("github-fixture", command)


if __name__ == "__main__":
    unittest.main()

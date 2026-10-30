#!/usr/bin/env python3
"""Own one disposable unprivileged LXD instance per Issue in a dedicated local project."""
import argparse
import json
import os
import pwd
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import tomllib

PROJECT = "sandboxpi-codex"
POOL = "sandboxpi-codex"
NETWORK = "codexbr0"
IMAGE = "openagent-codex-agent-v1"
CONTRACT = "openagent-lxd-agent-v1"
LABEL = "user.openagent.codex-worker"


def owner(root):
    import hashlib
    return hashlib.sha256(str(Path(root).resolve()).encode()).hexdigest()[:24]


def lxd(args, timeout=120, log=None, **kwargs):
    completed = subprocess.run(["lxc", "--force-local", "--project", PROJECT, *args], text=True,
                               capture_output=True, timeout=timeout, **kwargs)
    if log:
        log.write(completed.stdout + completed.stderr)
        log.flush()
    if completed.returncode:
        # Guest/model diagnostics can contain credentials; only controller-private logs receive them.
        raise RuntimeError(f"LXD {args[0]} failed ({completed.returncode})")
    return completed.stdout.strip()


def owned_instances(root, name=None):
    return [instance for instance in json.loads(lxd(["list", "local:", "--format=json"]))
            if instance.get("config", {}).get(LABEL) == owner(root)
            and (name is None or instance["name"] == name)]


def remove(root, name=None):
    for instance in owned_instances(root, name):
        lxd(["delete", f"local:{instance['name']}", "--force"], timeout=180)


def cleanup(root):
    """Delete only instances carrying this controller's exact owner marker in its dedicated project."""
    remove(root)
    for path in Path(root).glob("container-credentials-*"):
        if path.is_dir() and not path.is_symlink():
            shutil.rmtree(path)


def initialize(root, name, image):
    args = ["init", f"local:{image}", f"local:{name}", "--no-profiles", "--storage", POOL, "--network", NETWORK]
    config = {LABEL: owner(root), "security.privileged": "false", "security.nesting": "false",
              "security.devlxd": "false", "security.idmap.isolated": "true", "boot.autostart": "false",
              "limits.processes": "512", "limits.memory": "8GiB", "limits.memory.swap": "false", "limits.cpu": "4"}
    for key, value in config.items():
        args.extend(["--config", f"{key}={value}"])
    lxd(args, timeout=300)
    lxd(["config", "device", "set", f"local:{name}", "root", "size", "20GiB"])


def toml_lines(values, prefix=()):
    lines = []
    if prefix:
        lines.append("[" + ".".join(json.dumps(part) for part in prefix) + "]")
    for key, value in values.items():
        if not isinstance(value, dict):
            lines.append(f"{json.dumps(key)} = {json.dumps(value)}")
    for key, value in values.items():
        if isinstance(value, dict):
            lines.extend(toml_lines(value, (*prefix, key)))
    return lines


def credentials(destination, home, environ, token):
    """Copy model settings/auth only, excluding MCP servers, host paths and unrelated environment."""
    config = tomllib.loads((home / ".codex/config.toml").read_text())
    selected = {key: config[key] for key in ("model", "model_provider", "model_reasoning_effort",
                "model_context_window", "model_auto_compact_token_limit", "service_tier") if key in config}
    provider = config.get("model_providers", {}).get(config.get("model_provider"), {})
    openai_auth = not provider or provider.get("requires_openai_auth", False)
    names = {"OPENAI_API_KEY"} if openai_auth else set()
    if provider:
        selected["model_providers"] = {config["model_provider"]: provider}
        names.update(provider.get("env_http_headers", {}).values())
        if provider.get("env_key"):
            names.add(provider["env_key"])
            if not environ.get(provider["env_key"]):
                raise RuntimeError("Configured model provider credential is missing")
    (destination / "config.toml").write_text("\n".join(toml_lines(selected)) + "\n")
    authentication = home / ".codex/auth.json"
    if openai_auth and authentication.exists():
        (destination / "auth.json").write_bytes(authentication.read_bytes())
    values = {name: environ[name] for name in names if name in environ}
    values["GH_TOKEN"] = token
    for name, value in values.items():
        if not re.fullmatch(r"[A-Za-z_][A-Za-z_0-9]*", name) or any(char in value for char in "\r\n\0"):
            raise ValueError("Container credentials must use valid single-line environment values")
    (destination / "environment.json").write_text(json.dumps(values))
    for path in destination.iterdir():
        path.chmod(0o600)


class TaskContainer:
    def __init__(self, root, name, workspace, artifacts, token):
        self.root, self.name = Path(root), name
        self.workspace, self.artifacts, self.token = Path(workspace), Path(artifacts), token
        self.private = None
        self.creation_attempted = False

    def __enter__(self):
        self.private = tempfile.TemporaryDirectory(prefix="container-credentials-", dir=self.root)
        private = Path(self.private.name)
        try:
            credentials(private, Path.home(), os.environ, self.token)
            uid = os.getuid()
            # `sg lxd` changes the controller's effective group; task files must
            # still be owned by the operator's primary host group.
            gid = pwd.getpwuid(uid).pw_gid
            if uid == 0:
                raise RuntimeError("Issue instances require a non-root worker account")
            images = json.loads(lxd(["image", "list", "local:", IMAGE, "--format=json"]))
            image = next((image for image in images if any(alias["name"] == IMAGE for alias in image.get("aliases", []))), {})
            if image.get("properties", {}).get("openagent.contract") != CONTRACT:
                raise RuntimeError("A verified LXD agent image is required")
            self.creation_attempted = True
            initialize(self.root, self.name, image["fingerprint"])
            lxd(["start", f"local:{self.name}"], timeout=180)
            for device, source, destination, readonly in (
                    ("workspace", self.workspace, self.workspace, False),
                    ("artifacts", self.artifacts, self.artifacts, False),
                    ("credentials", private, Path("/run/agent-credentials"), True)):
                shift = True
                lxd(["config", "device", "add", f"local:{self.name}", device, "disk",
                     f"source={source}", f"path={destination}", f"shift={str(shift).lower()}",
                     f"readonly={str(readonly).lower()}"])
            # Root here is mapped guest root, used only for controlled account/home preparation.
            lxd(["exec", f"local:{self.name}", "--mode=non-interactive", "--",
                 "/usr/local/bin/openagent-agent-prepare", str(uid), str(gid)], timeout=120)
            return self
        except BaseException:
            self.__exit__(None, None, None)
            raise

    def command(self, args, cwd=None, env=None):
        command = ["lxc", "--force-local", "--project", PROJECT, "exec", f"local:{self.name}", "--mode=non-interactive",
                   "--user", str(os.getuid()), "--group", str(pwd.getpwuid(os.getuid()).pw_gid),
                   "--cwd", str(cwd or self.workspace),
                   "--env", "HOME=/home/agent", "--env", "GIT_CONFIG_NOSYSTEM=1"]
        for key, value in (env or {}).items():
            command.extend(["--env", f"{key}={value}"])
        return [*command, "--", "/usr/local/bin/openagent-agent-exec", *args]

    def __exit__(self, *_):
        try:
            # LXD destroys the instance cgroup and root volume, including setsid descendants.
            if self.creation_attempted:
                remove(self.root, self.name)
        finally:
            if self.private:
                self.private.cleanup()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    cleanup(parser.parse_args().root)

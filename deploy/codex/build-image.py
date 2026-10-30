#!/usr/bin/env python3
"""Build a local credential-free LXD image without changing host infrastructure."""
import json
import platform
from pathlib import Path
import fcntl
import hashlib
import uuid

from task_container import CONTRACT, IMAGE, LABEL, NETWORK, POOL, PROJECT, cleanup, lxd, owner, remove


def build(root):
    cleanup(root)
    # Host setup is explicit and separate; fail instead of initializing arbitrary existing resources.
    projects = json.loads(lxd(["project", "list", "local:", "--format=json"]))
    project = next((project for project in projects if project["name"] == PROJECT), {})
    if project.get("config", {}).get("user.sandboxpi.codex") != "lxd-agent-v1":
        raise RuntimeError("Dedicated LXD project has not been initialized")
    images = json.loads(lxd(["image", "list", "local:", "--format=json"]))
    existing = next((image for image in images if any(alias["name"] == IMAGE for alias in image.get("aliases", []))), None)
    if existing:
        if existing.get("properties", {}).get("openagent.contract") != CONTRACT:
            raise RuntimeError("Preserve the existing image alias with unexpected provenance")
        print("Verified LXD agent image already exists.")
        return
    # Base alias is resolved to its immutable fingerprint before creating the builder.
    # Setup/import stages place the verified Ubuntu fingerprint in this project.
    # Never query the remote `ubuntu:` catalog during a task build; that can hang
    # behind host proxies and does not improve the already verified fingerprint.
    candidates = json.loads(lxd(["image", "list", "local:", "--format=json"], timeout=180))
    base = next(image for image in candidates if image.get("architecture") == platform.machine()
                and image.get("type") == "container"
                and image.get("properties", {}).get("os") == "ubuntu"
                and image.get("properties", {}).get("release") == "noble")
    fingerprint = base["fingerprint"]
    name = "openagent-image-" + uuid.uuid4().hex[:12]
    try:
        lxd(["init", "local:" + fingerprint, "local:" + name, "--no-profiles", "--storage", POOL,
             "--network", NETWORK, "--config", f"{LABEL}={owner(root)}", "--config", "security.privileged=false",
             "--config", "security.nesting=false", "--config", "security.devlxd=false",
             "--config", "security.idmap.isolated=true", "--config", "boot.autostart=false"], timeout=300)
        lxd(["start", "local:" + name], timeout=180)
        bootstrap = Path(__file__).with_name("image-bootstrap.py")
        lxd(["file", "push", str(bootstrap), f"local:{name}/root/image-bootstrap.py"])
        # Build output stays private; only generic failures escape this wrapper.
        with (root / "build.log").open("a") as log:
            (root / "build.log").chmod(0o600)
            lxd(["exec", "local:" + name, "--", "python3", "-B", "/root/image-bootstrap.py"], timeout=1800, log=log)
        lxd(["exec", "local:" + name, "--", "rm", "/root/image-bootstrap.py"])
        lxd(["stop", "local:" + name], timeout=180)
        lxd(["publish", "local:" + name, "local:", "--alias", IMAGE,
             f"openagent.contract={CONTRACT}", f"openagent.base={fingerprint}",
             "openagent.bootstrap=" + hashlib.sha256(bootstrap.read_bytes()).hexdigest()], timeout=600)
        print("Published local LXD agent image from verified upstream tool archives.")
    finally:
        remove(root, name)


if __name__ == "__main__":
    root = Path.home() / ".local/share/openagent-codex/image-builder"
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (root / "build.lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        build(root)

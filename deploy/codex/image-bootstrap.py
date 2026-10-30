#!/usr/bin/env python3
"""Provision a credential-free Ubuntu LXD image with pinned developer tools."""
import hashlib
import io
from pathlib import Path
import platform
import shutil
import socket
import subprocess
import tarfile
import tempfile
import time
import urllib.request
import zipfile

TOOLS = {
    "x86_64": (
        ("https://nodejs.org/dist/v24.12.0/node-v24.12.0-linux-x64.tar.xz", "bdebee276e58d0ef5448f3d5ac12c67daa963dd5e0a9bb621a53d1cefbc852fd"),
        ("https://github.com/oven-sh/bun/releases/download/bun-v1.3.14/bun-linux-x64.zip", "951ee2aee855f08595aeec6225226a298d3fea83a3dcd6465c09cbccdf7e848f"),
        ("https://go.dev/dl/go1.27.3.linux-amd64.tar.gz", "65efbc80fdc1fa2cd2631cad5b481777a68e8725f34e89f50fc6ac714e379b40"),
    ),
    "aarch64": (
        ("https://nodejs.org/dist/v24.12.0/node-v24.12.0-linux-arm64.tar.xz", "a06d42807fb500f7459e5f3fa6cb431447352826ee6f07e14adfeec58a1b3210"),
        ("https://github.com/oven-sh/bun/releases/download/bun-v1.3.14/bun-linux-aarch64.zip", "a27ffb63a8310375836e0d6f668ae17fa8d8d18b88c37c821c65331973a19a3b"),
        ("https://go.dev/dl/go1.27.3.linux-arm64.tar.gz", "a06e99309dbcbdca1a8ccd2282c3ee146e55930886e26b4f1193269587165f49"),
    ),
}

PREPARE = '''#!/usr/bin/env python3
import grp, os, pathlib, pwd, shutil, subprocess, sys
uid, gid = map(int, sys.argv[1:])
assert uid > 0 and gid >= 0
try:
    grp.getgrgid(gid)
except KeyError:
    subprocess.run(['groupadd', '--gid', str(gid), 'openagent-' + str(gid)], check=True)
try:
    pwd.getpwuid(uid)
except KeyError:
    subprocess.run(['useradd', '--uid', str(uid), '--gid', str(gid), '--home-dir', '/home/agent',
                    '--no-create-home', '--shell', '/bin/bash', 'openagent-' + str(uid)], check=True)
home = pathlib.Path('/home/agent')
config = home / '.codex'
config.mkdir(parents=True, exist_ok=True, mode=0o700)
for directory in (home, config):
    directory.chmod(0o700)
    os.chown(directory, uid, gid)
for source in pathlib.Path('/run/agent-credentials').iterdir():
    destination = config / source.name
    shutil.copyfile(source, destination)
    destination.chmod(0o600)
    os.chown(destination, uid, gid)
'''

EXEC = '''#!/usr/bin/env python3
import ctypes, json, os, pathlib, sys
config = pathlib.Path('/home/agent/.codex/environment.json')
os.environ.update(json.loads(config.read_text()))
os.environ['HOME'] = '/home/agent'
os.environ['PATH'] = '/usr/local/go/bin:/usr/local/bin:/usr/bin:/bin'
os.environ['GOTOOLCHAIN'] = 'local'
os.umask(0o077)
if ctypes.CDLL(None, use_errno=True).prctl(38, 1, 0, 0, 0) != 0:
    raise OSError(ctypes.get_errno(), 'Cannot disable privilege escalation')
os.execvp(sys.argv[1], sys.argv[1:])
'''


def verified_download(url, checksum):
    with urllib.request.urlopen(url, timeout=120) as response:
        data = response.read()
    if hashlib.sha256(data).hexdigest() != checksum:
        raise RuntimeError("Tool archive checksum mismatch")
    return data


def install_node(data, destination):
    with tempfile.TemporaryDirectory() as temporary:
        directory = Path(temporary)
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:xz") as archive:
            archive.extractall(directory, filter="data")
        node_root = next(directory.glob("node-v*"))
        shutil.copytree(node_root, destination, dirs_exist_ok=True, symlinks=True)


def provision():
    import os
    os.environ['DEBIAN_FRONTEND'] = 'noninteractive'
    # devlxd is disabled, so do not depend on cloud-init's host metadata/DHCP setup.
    Path("/etc/cloud/cloud-init.disabled").touch()
    network = Path("/etc/systemd/network/10-openagent-agent.network")
    network.parent.mkdir(parents=True, exist_ok=True)
    network.write_text("[Match]\nName=eth0\n[Network]\nDHCP=ipv4\n")
    # The first exec can race systemd startup in a fresh instance. Retry networkd
    # configuration while waiting for DHCP/DNS; never proceed with a partial network.
    network_ready = False
    for attempt in range(60):
        # Reconfigure sparingly: restarting DHCP on every poll can keep losing
        # the lease before the interface receives its address.
        if attempt == 0 or attempt % 10 == 0:
            subprocess.run(["networkctl", "reload"], capture_output=True)
            subprocess.run(["networkctl", "reconfigure", "eth0"], capture_output=True)
        address = subprocess.run(["ip", "-4", "addr", "show", "dev", "eth0"],
                                 capture_output=True, text=True)
        if "inet " in address.stdout:
            network_ready = True
            break
        time.sleep(2)
    if not network_ready:
        raise RuntimeError("The dedicated LXD bridge did not publish a DHCP address")
    # The instance resolver can race systemd-resolved startup. The LXD bridge
    # gateway is the verified DNS/DHCP endpoint, so use it during provisioning.
    resolv = Path("/etc/resolv.conf")
    if resolv.is_symlink():
        resolv.unlink()
    resolv.write_text("nameserver 10.231.88.1\n")
    required_hosts = ("archive.ubuntu.com", "security.ubuntu.com")
    for attempt in range(60):
        try:
            for host in required_hosts:
                socket.getaddrinfo(host, 80)
            break
        except socket.gaierror:
            if attempt == 59:
                raise RuntimeError("The dedicated LXD bridge has no working DNS")
            time.sleep(2)
    apt_options = ["-o", "Acquire::ForceIPv4=true", "-o", "Acquire::http::Timeout=30", "-o", "Acquire::Retries=2"]
    subprocess.run(["apt-get", *apt_options, "update"], check=True)
    subprocess.run(["apt-get", *apt_options, "-o", "DPkg::Lock::Timeout=300", "install", "-y", "--no-install-recommends", "ca-certificates", "git", "gh",
                    "build-essential", "python3", "procps", "util-linux", "cargo", "rustc"], check=True)
    node, bun, go = TOOLS[platform.machine()]
    install_node(verified_download(*node), "/usr/local")
    with tempfile.TemporaryDirectory() as temporary:
        with zipfile.ZipFile(io.BytesIO(verified_download(*bun))) as archive:
            binary = next(name for name in archive.namelist() if name.endswith("/bun"))
            destination = Path("/usr/local/bin/bun")
            destination.write_bytes(archive.read(binary))
            destination.chmod(0o755)
        with tarfile.open(fileobj=io.BytesIO(verified_download(*go)), mode="r:gz") as archive:
            archive.extractall("/usr/local", filter="data")
    for tool in ("go", "gofmt"):
        Path(f"/usr/local/bin/{tool}").symlink_to(f"/usr/local/go/bin/{tool}")
    subprocess.run(["npm", "install", "--global", "@openai/codex@0.165.0"], check=True)
    subprocess.run(["npm", "cache", "clean", "--force"], check=True)
    for name, content in (("openagent-agent-prepare", PREPARE), ("openagent-agent-exec", EXEC)):
        destination = Path("/usr/local/bin") / name
        destination.write_text(content)
        destination.chmod(0o755)
    for command in (["node", "--version"], ["bun", "--version"], ["go", "version"], ["cargo", "--version"], ["rustc", "--version"], ["codex", "--version"]):
        subprocess.run(command, check=True)
    # Published images contain no task, credentials, downloaded package caches or machine identity.
    subprocess.run(["apt-get", "clean"], check=True)
    for directory in (Path("/root/.cache"), Path("/root/.npm"), Path("/var/lib/cloud")):
        shutil.rmtree(directory, ignore_errors=True)
    Path("/etc/machine-id").write_text("")


if __name__ == "__main__":
    provision()

#!/usr/bin/env python3
"""Verify a reviewed snapshot and push it without staging or rewriting history."""
import os
from pathlib import Path
import re
import subprocess
import sys


def run(args, capture=True):
    result = subprocess.run(args, check=True, text=True,
                            stdout=subprocess.PIPE if capture else None)
    return (result.stdout or "").strip()


def git(*args):
    return run(["git", *args])


def snapshot():
    if git("diff", "--name-only") or git("ls-files", "--others", "--exclude-standard"):
        raise RuntimeError("Stage only reviewed task files; preserve unrelated work in another checkout")
    return git("rev-parse", "HEAD"), git("write-tree")


def deliver(message):
    branch = os.environ.get("DELIVERY_BRANCH", "alpha")
    if branch != "alpha" and not re.fullmatch(r"codex/issue-[1-9][0-9]*-attempt-1", branch):
        raise ValueError("Delivery targets alpha or a controller-owned issue branch only")
    if git("branch", "--show-current") != branch:
        raise RuntimeError("Checked-out branch must match DELIVERY_BRANCH")
    for marker in ("MERGE_HEAD", "CHERRY_PICK_HEAD", "rebase-merge", "rebase-apply"):
        if Path(git("rev-parse", "--git-path", marker)).exists():
            raise RuntimeError("Complete the existing Git operation before delivery")
    policy = os.environ.get("CODEX_CI_FOLLOWUP", "auto")
    if policy not in ("auto", "self"):
        raise ValueError("CODEX_CI_FOLLOWUP must be auto or self")
    trailers = run(["git", "interpret-trailers", "--parse"], capture=True) if False else subprocess.run(
        ["git", "interpret-trailers", "--parse"], input=message, text=True, capture_output=True, check=True).stdout
    selected = re.findall(r"(?im)^CI-Followup: (.+)$", trailers)
    if len(selected) > 1 or (selected and selected[0] not in ("auto", "self")):
        raise ValueError("Invalid CI-Followup trailer")
    if not selected:
        message = message.rstrip() + "\n\nCI-Followup: " + policy
    run(["git", "fetch", "origin", "alpha"], capture=False)
    # The issue branch may be new; alpha is always the acceptance baseline.
    base = os.environ.get("DELIVERY_BASE") or git("rev-parse", "origin/alpha")
    run(["git", "merge-base", "--is-ancestor", base, "HEAD"])
    run(["git", "merge-base", "--is-ancestor", "origin/alpha", "HEAD"])
    before = snapshot()
    run(["bun", "run", "preflight", "--base", base], capture=False)
    if snapshot() != before or git("branch", "--show-current") != branch:
        raise RuntimeError("Source changed during verification; inspect and verify again")
    if before[1] != git("rev-parse", "HEAD^{tree}"):
        run(["git", "commit", "-m", message], capture=False)
    if snapshot()[1] != before[1] or git("rev-parse", "HEAD^{tree}") != before[1]:
        raise RuntimeError("Commit hooks changed the verified snapshot")
    if git("status", "--porcelain"):
        raise RuntimeError("Delivery requires a clean checkout")
    run(["git", "push", "origin", f"HEAD:refs/heads/{branch}"], capture=False)


if __name__ == "__main__":
    arguments = sys.argv[1:]
    if arguments and arguments[0] == "--":
        arguments.pop(0)
    if len(arguments) != 1 or not arguments[0].strip():
        raise SystemExit('Usage: bun run deliver -- "type(scope): description"')
    deliver(arguments[0])

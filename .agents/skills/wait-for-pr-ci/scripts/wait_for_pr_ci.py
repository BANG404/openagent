#!/usr/bin/env python3
"""Block until OpenAgent's stable PR-head CI status reaches a final state."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from dataclasses import dataclass
from typing import Any


STATUS_CONTEXT = "Required PR Head"


class GhError(RuntimeError):
    pass


class CliArgumentError(ValueError):
    pass


class ArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise CliArgumentError(message)


def gh(*args: str) -> str:
    try:
        completed = subprocess.run(
            ["gh", *args],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
    except FileNotFoundError as error:
        raise GhError("gh is not installed or is not on PATH") from error
    except subprocess.CalledProcessError as error:
        message = error.stderr.strip() or error.stdout.strip() or f"gh exited {error.returncode}"
        raise GhError(message) from error
    return completed.stdout


def gh_json(*args: str) -> Any:
    output = gh(*args)
    try:
        return json.loads(output)
    except json.JSONDecodeError as error:
        raise GhError("gh returned invalid JSON") from error


@dataclass(frozen=True)
class PullRequest:
    number: int
    url: str
    state: str
    merged: bool
    head_sha: str


def resolve_repo(explicit: str | None) -> str:
    if explicit:
        return explicit
    data = gh_json("repo", "view", "--json", "nameWithOwner")
    return str(data["nameWithOwner"])


def resolve_pr_number(identifier: str | None, repo: str) -> int:
    args = ["pr", "view"]
    if identifier:
        args.append(identifier)
    args.extend(["--repo", repo, "--json", "number"])
    data = gh_json(*args)
    return int(data["number"])


def get_pr(repo: str, number: int) -> PullRequest:
    data = gh_json("api", f"repos/{repo}/pulls/{number}")
    return PullRequest(
        number=number,
        url=str(data["html_url"]),
        state=str(data["state"]).upper(),
        merged=bool(data.get("merged_at")),
        head_sha=str(data["head"]["sha"]),
    )


def get_required_status(repo: str, head_sha: str) -> tuple[str, str]:
    data = gh_json("api", f"repos/{repo}/commits/{head_sha}/status")
    statuses = [
        status for status in data.get("statuses", []) if status.get("context") == STATUS_CONTEXT
    ]
    if not statuses:
        return "pending", ""
    latest = max(statuses, key=lambda status: status.get("created_at", ""))
    return str(latest.get("state", "pending")), str(latest.get("target_url", ""))


def parse_args() -> argparse.Namespace:
    parser = ArgumentParser(description=__doc__)
    parser.add_argument(
        "pr", nargs="?", help="pull request number or URL; defaults to the current branch"
    )
    parser.add_argument("--repo", help="GitHub repository in OWNER/REPO form")
    parser.add_argument("--poll-seconds", type=float, default=15.0, help="poll interval (default: 15)")
    parser.add_argument(
        "--timeout-seconds",
        type=float,
        default=0.0,
        help="overall timeout; 0 waits indefinitely",
    )
    parser.add_argument(
        "--wait-for-merge",
        action="store_true",
        help="continue after CI success until the PR is merged",
    )
    args = parser.parse_args()
    if args.poll_seconds < 1:
        parser.error("--poll-seconds must be at least 1")
    if args.timeout_seconds < 0:
        parser.error("--timeout-seconds cannot be negative")
    return args


def main() -> int:
    try:
        args = parse_args()
        repo = resolve_repo(args.repo)
        number = resolve_pr_number(args.pr, repo)
        current = get_pr(repo, number)
    except (CliArgumentError, GhError, KeyError, TypeError, ValueError) as error:
        print(f"WAIT_FOR_PR_CI result=error message={json.dumps(str(error))}", file=sys.stderr)
        return 4

    print(f"Waiting for {current.url} ({STATUS_CONTEXT}); head={current.head_sha}", flush=True)
    started = time.monotonic()
    observed: tuple[str, str] | None = None

    while True:
        if args.timeout_seconds and time.monotonic() - started >= args.timeout_seconds:
            print(f"WAIT_FOR_PR_CI result=timeout pr={number} head={current.head_sha}", file=sys.stderr)
            return 3

        try:
            current = get_pr(repo, number)
            if current.merged:
                print(f"WAIT_FOR_PR_CI result=success pr={number} head={current.head_sha} merged=true")
                return 0
            if current.state == "CLOSED":
                print(f"WAIT_FOR_PR_CI result=closed pr={number} head={current.head_sha}", file=sys.stderr)
                return 2

            state, target_url = get_required_status(repo, current.head_sha)
        except (GhError, KeyError, TypeError, ValueError) as error:
            marker = ("api-error", str(error))
            if marker != observed:
                print(f"GitHub API unavailable; retrying: {error}", file=sys.stderr, flush=True)
                observed = marker
            time.sleep(args.poll_seconds)
            continue

        marker = (current.head_sha, state)
        if marker != observed:
            suffix = f" run={target_url}" if target_url else ""
            print(f"PR #{number} head={current.head_sha} status={state}{suffix}", flush=True)
            observed = marker

        if state == "success":
            if not args.wait_for_merge:
                print(f"WAIT_FOR_PR_CI result=success pr={number} head={current.head_sha} merged=false")
                return 0
        elif state in {"failure", "error"}:
            print(
                f"WAIT_FOR_PR_CI result=failure pr={number} head={current.head_sha} run={target_url}",
                file=sys.stderr,
            )
            return 1

        time.sleep(args.poll_seconds)


if __name__ == "__main__":
    raise SystemExit(main())

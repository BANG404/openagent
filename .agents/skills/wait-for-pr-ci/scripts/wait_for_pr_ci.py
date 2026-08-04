#!/usr/bin/env python3
"""Block until a pull request's required or selected GitHub Actions checks finish."""

from __future__ import annotations

import argparse
import fnmatch
import json
import subprocess
import sys
import time
from dataclasses import dataclass
from typing import Any


SUCCESS_STATES = {"success", "neutral", "skipped"}
FAILURE_STATES = {
    "action_required",
    "cancelled",
    "error",
    "failure",
    "stale",
    "startup_failure",
    "timed_out",
}


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


def optional_api(path: str) -> Any | None:
    try:
        return gh_json("api", path)
    except GhError as error:
        if "HTTP 404" in str(error) or "Not Found" in str(error):
            return None
        raise


@dataclass(frozen=True)
class PullRequest:
    number: int
    url: str
    state: str
    merged: bool
    head_sha: str
    base_ref: str
    mergeable_state: str


@dataclass(frozen=True)
class Check:
    name: str
    state: str
    target_url: str
    source: str


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
        base_ref=str(data["base"]["ref"]),
        mergeable_state=str(data.get("mergeable_state", "unknown")).lower(),
    )


def rule_pattern_matches(pattern: str, ref: str, default_branch: str) -> bool:
    if pattern == "~ALL":
        return True
    if pattern == "~DEFAULT_BRANCH":
        return ref == default_branch
    full_ref = f"refs/heads/{ref}"
    return fnmatch.fnmatchcase(ref, pattern) or fnmatch.fnmatchcase(full_ref, pattern)


def ruleset_applies(ruleset: dict[str, Any], ref: str, default_branch: str) -> bool:
    ref_condition = ruleset.get("conditions", {}).get("ref_name", {})
    includes = ref_condition.get("include", ["~ALL"])
    excludes = ref_condition.get("exclude", [])
    included = any(rule_pattern_matches(str(pattern), ref, default_branch) for pattern in includes)
    excluded = any(rule_pattern_matches(str(pattern), ref, default_branch) for pattern in excludes)
    return included and not excluded


def contexts_from_ruleset(ruleset: dict[str, Any]) -> set[str]:
    contexts: set[str] = set()
    for rule in ruleset.get("rules", []):
        if rule.get("type") != "required_status_checks":
            continue
        for required in rule.get("parameters", {}).get("required_status_checks", []):
            context = str(required.get("context", "")).strip()
            if context:
                contexts.add(context)
    return contexts


def discover_required_contexts(repo: str, base_ref: str) -> set[str]:
    contexts: set[str] = set()
    protection = optional_api(f"repos/{repo}/branches/{base_ref}/protection/required_status_checks")
    if protection:
        contexts.update(str(context) for context in protection.get("contexts", []) if context)
        contexts.update(
            str(check.get("context"))
            for check in protection.get("checks", [])
            if check.get("context")
        )

    repository = gh_json("api", f"repos/{repo}")
    default_branch = str(repository["default_branch"])
    summaries = optional_api(f"repos/{repo}/rulesets") or []
    for summary in summaries:
        if summary.get("enforcement") != "active" or summary.get("target") != "branch":
            continue
        details = optional_api(f"repos/{repo}/rulesets/{summary['id']}")
        if details and ruleset_applies(details, base_ref, default_branch):
            contexts.update(contexts_from_ruleset(details))
    return contexts


def normalize_check_state(status: str, conclusion: str | None) -> str:
    if status != "completed":
        return "pending"
    normalized = (conclusion or "").lower()
    if normalized in SUCCESS_STATES:
        return "success"
    if normalized in FAILURE_STATES:
        return "failure"
    return "pending"


def get_checks(repo: str, head_sha: str) -> list[Check]:
    combined = gh_json("api", f"repos/{repo}/commits/{head_sha}/status")
    checks: list[Check] = [
        Check(
            name=str(status.get("context", "")),
            state=str(status.get("state", "pending")).lower(),
            target_url=str(status.get("target_url", "")),
            source="status",
        )
        for status in combined.get("statuses", [])
        if status.get("context")
    ]

    check_pages = gh_json(
        "api",
        "--paginate",
        "--slurp",
        "-H",
        "X-GitHub-Api-Version: 2022-11-28",
        f"repos/{repo}/commits/{head_sha}/check-runs?per_page=100",
    )
    if isinstance(check_pages, dict):
        check_pages = [check_pages]
    checks.extend(
        Check(
            name=str(run.get("name", "")),
            state=normalize_check_state(str(run.get("status", "")), run.get("conclusion")),
            target_url=str(run.get("details_url", "")),
            source=str(run.get("app", {}).get("slug", "check-run")),
        )
        for page in check_pages
        for run in page.get("check_runs", [])
        if run.get("name")
    )
    return checks


def latest_checks_by_name(checks: list[Check]) -> dict[str, Check]:
    result: dict[str, Check] = {}
    # Both commit statuses and check runs are returned newest-first by GitHub.
    for check in checks:
        result.setdefault(check.name, check)
    return result


def selected_checks(checks: list[Check], contexts: set[str], all_actions: bool) -> list[Check]:
    latest = latest_checks_by_name(checks)
    if contexts:
        return [latest.get(name, Check(name, "pending", "", "missing")) for name in sorted(contexts)]
    if all_actions:
        return sorted(
            (
                check
                for check in latest.values()
                if check.source == "github-actions" or "/actions/runs/" in check.target_url
            ),
            key=lambda check: check.name,
        )
    return []


def selection_state(checks: list[Check]) -> str:
    if not checks or any(check.state == "pending" for check in checks):
        return "pending"
    if any(check.state in FAILURE_STATES or check.state == "failure" for check in checks):
        return "failure"
    return "success"


def selection_marker(head_sha: str, checks: list[Check]) -> tuple[str, tuple[tuple[str, str], ...]]:
    return head_sha, tuple((check.name, check.state) for check in checks)


def merge_wait_expired(started: float | None, now: float, limit: float) -> bool:
    return started is not None and limit > 0 and now - started >= limit


def merge_blocked_expired(started: float | None, now: float, poll_seconds: float) -> bool:
    return started is not None and now - started >= poll_seconds


def parse_args() -> argparse.Namespace:
    parser = ArgumentParser(description=__doc__)
    parser.add_argument(
        "pr", nargs="?", help="pull request number or URL; defaults to the current branch"
    )
    parser.add_argument("--repo", help="GitHub repository in OWNER/REPO form")
    parser.add_argument(
        "--check",
        action="append",
        default=[],
        help="wait for this status context or check-run name; repeat for multiple checks",
    )
    parser.add_argument(
        "--all-actions",
        action="store_true",
        help="wait for every GitHub Actions check/status observed on the current PR head",
    )
    parser.add_argument("--poll-seconds", type=float, default=15.0, help="poll interval (default: 15)")
    parser.add_argument(
        "--settle-seconds",
        type=float,
        default=30.0,
        help="quiet period before all-actions success (default: 30)",
    )
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
    parser.add_argument(
        "--merge-wait-seconds",
        type=float,
        default=120.0,
        help="time to allow trusted auto-merge after CI succeeds; 0 waits indefinitely (default: 120)",
    )
    args = parser.parse_args()
    if args.check and args.all_actions:
        parser.error("--check and --all-actions are mutually exclusive")
    if args.poll_seconds < 1:
        parser.error("--poll-seconds must be at least 1")
    if args.settle_seconds < 0:
        parser.error("--settle-seconds cannot be negative")
    if args.timeout_seconds < 0:
        parser.error("--timeout-seconds cannot be negative")
    if args.merge_wait_seconds < 0:
        parser.error("--merge-wait-seconds cannot be negative")
    return args


def main() -> int:
    try:
        args = parse_args()
        repo = resolve_repo(args.repo)
        number = resolve_pr_number(args.pr, repo)
        current = get_pr(repo, number)
        contexts = set(args.check)
        all_actions = args.all_actions
        if not contexts and not all_actions:
            contexts = discover_required_contexts(repo, current.base_ref)
            all_actions = not contexts
    except (CliArgumentError, GhError, KeyError, TypeError, ValueError) as error:
        print(f"WAIT_FOR_PR_CI result=error message={json.dumps(str(error))}", file=sys.stderr)
        return 4

    selection = ", ".join(sorted(contexts)) if contexts else "all GitHub Actions"
    print(f"Waiting for {current.url}; head={current.head_sha}; selection={selection}", flush=True)
    started = time.monotonic()
    observed: tuple[str, tuple[tuple[str, str], ...]] | tuple[str, str] | None = None
    success_since: float | None = None
    merge_wait_started: float | None = None
    merge_blocked_since: float | None = None

    while True:
        now = time.monotonic()
        if args.timeout_seconds and now - started >= args.timeout_seconds:
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

            checks = selected_checks(get_checks(repo, current.head_sha), contexts, all_actions)
        except (GhError, KeyError, TypeError, ValueError) as error:
            marker: tuple[str, str] = ("api-error", str(error))
            if marker != observed:
                print(f"GitHub API unavailable; retrying: {error}", file=sys.stderr, flush=True)
                observed = marker
            success_since = None
            time.sleep(args.poll_seconds)
            continue

        marker = selection_marker(current.head_sha, checks)
        if marker != observed:
            summary = ", ".join(f"{check.name}={check.state}" for check in checks) or "none observed"
            print(f"PR #{number} head={current.head_sha} checks=[{summary}]", flush=True)
            observed = marker
            success_since = None
            merge_wait_started = None
            merge_blocked_since = None

        state = selection_state(checks)
        if state == "failure":
            failed = [check for check in checks if check.state == "failure"]
            urls = ",".join(check.target_url for check in failed if check.target_url)
            print(
                f"WAIT_FOR_PR_CI result=failure pr={number} head={current.head_sha} runs={urls}",
                file=sys.stderr,
            )
            return 1
        if state == "success":
            success_since = success_since or now
            settled = bool(contexts) or now - success_since >= args.settle_seconds
            if settled:
                if not args.wait_for_merge:
                    print(
                        f"WAIT_FOR_PR_CI result=success pr={number} "
                        f"head={current.head_sha} merged=false"
                    )
                    return 0
                if merge_wait_started is None:
                    merge_wait_started = now
                    limit = (
                        "indefinitely"
                        if args.merge_wait_seconds == 0
                        else f"up to {args.merge_wait_seconds:g}s"
                    )
                    print(f"CI succeeded; waiting {limit} for PR #{number} to merge.", flush=True)
                if current.mergeable_state == "blocked":
                    merge_blocked_since = merge_blocked_since or now
                    if merge_blocked_expired(
                        merge_blocked_since, now, args.poll_seconds
                    ):
                        print(
                            f"WAIT_FOR_PR_CI result=merge-pending reason=blocked pr={number} "
                            f"head={current.head_sha} url={current.url}",
                            file=sys.stderr,
                        )
                        return 5
                else:
                    merge_blocked_since = None
                if merge_wait_expired(merge_wait_started, now, args.merge_wait_seconds):
                    print(
                        f"WAIT_FOR_PR_CI result=merge-pending pr={number} "
                        f"head={current.head_sha} url={current.url}",
                        file=sys.stderr,
                    )
                    return 5
        else:
            success_since = None
            merge_wait_started = None
            merge_blocked_since = None

        time.sleep(args.poll_seconds)


if __name__ == "__main__":
    raise SystemExit(main())

from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


SCRIPT = Path(__file__).with_name("wait_for_pr_ci.py")
SPEC = importlib.util.spec_from_file_location("wait_for_pr_ci", SCRIPT)
assert SPEC and SPEC.loader
wait_for_pr_ci = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = wait_for_pr_ci
SPEC.loader.exec_module(wait_for_pr_ci)


class WaitForPrCiTests(unittest.TestCase):
    def test_merge_wait_has_a_bounded_default_and_can_be_disabled(self) -> None:
        with patch.object(sys, "argv", ["wait_for_pr_ci.py", "67", "--wait-for-merge"]):
            args = wait_for_pr_ci.parse_args()
        self.assertEqual(args.merge_wait_seconds, 120.0)
        self.assertFalse(wait_for_pr_ci.merge_wait_expired(10.0, 129.9, args.merge_wait_seconds))
        self.assertTrue(wait_for_pr_ci.merge_wait_expired(10.0, 130.0, args.merge_wait_seconds))
        self.assertFalse(wait_for_pr_ci.merge_wait_expired(10.0, 1000.0, 0.0))

    def test_main_returns_merge_pending_after_successful_ci_stays_open(self) -> None:
        args = SimpleNamespace(
            repo="acme/app",
            pr="67",
            check=["Required PR Head"],
            all_actions=False,
            poll_seconds=1.0,
            settle_seconds=30.0,
            timeout_seconds=0.0,
            wait_for_merge=True,
            merge_wait_seconds=120.0,
        )
        pull_request = wait_for_pr_ci.PullRequest(
            number=67,
            url="https://github.com/acme/app/pull/67",
            state="OPEN",
            merged=False,
            head_sha="abc123",
            base_ref="main",
            mergeable_state="clean",
        )
        checks = [wait_for_pr_ci.Check("Required PR Head", "success", "", "status")]

        with patch.object(wait_for_pr_ci, "parse_args", return_value=args), patch.object(
            wait_for_pr_ci, "resolve_repo", return_value="acme/app"
        ), patch.object(wait_for_pr_ci, "resolve_pr_number", return_value=67), patch.object(
            wait_for_pr_ci, "get_pr", return_value=pull_request
        ), patch.object(wait_for_pr_ci, "get_checks", return_value=checks), patch.object(
            wait_for_pr_ci.time, "monotonic", side_effect=[100.0, 100.0, 220.0]
        ), patch.object(wait_for_pr_ci.time, "sleep"):
            self.assertEqual(wait_for_pr_ci.main(), 5)

    def test_main_returns_merge_pending_after_ci_is_blocked_for_one_poll(self) -> None:
        args = SimpleNamespace(
            repo="acme/app",
            pr="68",
            check=["Required PR Head"],
            all_actions=False,
            poll_seconds=15.0,
            settle_seconds=30.0,
            timeout_seconds=0.0,
            wait_for_merge=True,
            merge_wait_seconds=120.0,
        )
        pull_request = wait_for_pr_ci.PullRequest(
            number=68,
            url="https://github.com/acme/app/pull/68",
            state="OPEN",
            merged=False,
            head_sha="def456",
            base_ref="main",
            mergeable_state="blocked",
        )
        checks = [wait_for_pr_ci.Check("Required PR Head", "success", "", "status")]

        with patch.object(wait_for_pr_ci, "parse_args", return_value=args), patch.object(
            wait_for_pr_ci, "resolve_repo", return_value="acme/app"
        ), patch.object(wait_for_pr_ci, "resolve_pr_number", return_value=68), patch.object(
            wait_for_pr_ci, "get_pr", return_value=pull_request
        ), patch.object(wait_for_pr_ci, "get_checks", return_value=checks), patch.object(
            wait_for_pr_ci.time, "monotonic", side_effect=[100.0, 100.0, 115.0]
        ), patch.object(wait_for_pr_ci.time, "sleep"):
            self.assertEqual(wait_for_pr_ci.main(), 5)

    def test_ruleset_matches_default_branch_and_extracts_contexts(self) -> None:
        ruleset = {
            "conditions": {"ref_name": {"include": ["~DEFAULT_BRANCH"], "exclude": []}},
            "rules": [
                {
                    "type": "required_status_checks",
                    "parameters": {
                        "required_status_checks": [{"context": "Required PR Head"}]
                    },
                }
            ],
        }

        self.assertTrue(wait_for_pr_ci.ruleset_applies(ruleset, "master", "master"))
        self.assertFalse(wait_for_pr_ci.ruleset_applies(ruleset, "release", "master"))
        self.assertEqual(
            wait_for_pr_ci.contexts_from_ruleset(ruleset), {"Required PR Head"}
        )

    def test_discovers_legacy_and_ruleset_required_contexts(self) -> None:
        responses = {
            "repos/acme/app/branches/main/protection/required_status_checks": {
                "contexts": ["Public SDK CI"],
                "checks": [{"context": "Public SDK CI", "app_id": 1}],
            },
            "repos/acme/app": {"default_branch": "main"},
            "repos/acme/app/rulesets": [
                {"id": 42, "enforcement": "active", "target": "branch"}
            ],
            "repos/acme/app/rulesets/42": {
                "conditions": {"ref_name": {"include": ["~DEFAULT_BRANCH"], "exclude": []}},
                "rules": [
                    {
                        "type": "required_status_checks",
                        "parameters": {
                            "required_status_checks": [{"context": "Required PR Head"}]
                        },
                    }
                ],
            },
        }

        with patch.object(wait_for_pr_ci, "optional_api", side_effect=responses.get), patch.object(
            wait_for_pr_ci, "gh_json", return_value=responses["repos/acme/app"]
        ):
            self.assertEqual(
                wait_for_pr_ci.discover_required_contexts("acme/app", "main"),
                {"Public SDK CI", "Required PR Head"},
            )

    def test_explicit_missing_check_remains_pending(self) -> None:
        checks = [wait_for_pr_ci.Check("Build", "success", "https://example.test", "github-actions")]
        selected = wait_for_pr_ci.selected_checks(checks, {"Build", "E2E"}, False)

        self.assertEqual([(check.name, check.state) for check in selected], [
            ("Build", "success"),
            ("E2E", "pending"),
        ])
        self.assertEqual(wait_for_pr_ci.selection_state(selected), "pending")

    def test_all_actions_excludes_external_checks_and_propagates_failure(self) -> None:
        checks = [
            wait_for_pr_ci.Check("Build", "success", "https://github.com/acme/app/actions/runs/1", "github-actions"),
            wait_for_pr_ci.Check("Public SDK CI", "failure", "https://github.com/acme/host/actions/runs/2", "status"),
            wait_for_pr_ci.Check("External", "failure", "https://ci.example.test/3", "external-ci"),
        ]

        selected = wait_for_pr_ci.selected_checks(checks, set(), True)

        self.assertEqual([check.name for check in selected], ["Build", "Public SDK CI"])
        self.assertEqual(wait_for_pr_ci.selection_state(selected), "failure")

    def test_check_run_conclusions_normalize_to_terminal_states(self) -> None:
        self.assertEqual(wait_for_pr_ci.normalize_check_state("in_progress", None), "pending")
        self.assertEqual(wait_for_pr_ci.normalize_check_state("completed", "skipped"), "success")
        self.assertEqual(wait_for_pr_ci.normalize_check_state("completed", "timed_out"), "failure")


if __name__ == "__main__":
    unittest.main()

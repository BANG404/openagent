from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).with_name("wait_for_pr_ci.py")
SPEC = importlib.util.spec_from_file_location("wait_for_pr_ci", SCRIPT)
assert SPEC and SPEC.loader
wait_for_pr_ci = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = wait_for_pr_ci
SPEC.loader.exec_module(wait_for_pr_ci)


class WaitForPrCiTests(unittest.TestCase):
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

import importlib.util
import json
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import subprocess
import tempfile
import threading
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("worker", ROOT / "deploy/codex/worker.py")
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


def issue(number=11, labels=()):
    return {"number": number, "title": "Fix task", "body": "Task data", "labels": [{"name": label} for label in labels],
            "user": {"login": "BANG404"}}


def source(**changes):
    return {"kind": "actions", "workflow": 1, "branch": "alpha", "sha": "a" * 40, "id": 20, "attempt": 1,
            "created_at": "2026-01-02T00:00:00Z", "completed_at": "2026-01-02T00:05:00Z", "url": "https://example/run/20", **changes}


def result(status="ready", blocker=None):
    return {"status": status, "message": "fix(tasks): resolve the issue", "summary": "已完成修复",
            "next_action": "检查实际部署证据并改进修复。", "blocker": blocker}


class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.queue = worker.Worker(self.temporary.name)
        self.queue.heads["alpha"] = "a" * 40
        real_execute = worker.execute
        def offline_execute(args, **kwargs):
            if args[0] in ("gh", "codex", "bun"):
                raise AssertionError("Network, model and delivery commands must be mocked")
            return real_execute(args, **kwargs)
        fence = patch.object(worker, "execute", side_effect=offline_execute)
        fence.start()
        self.addCleanup(fence.stop)

    def test_owner_is_trusted_and_collaborators_need_write(self):
        with patch.object(worker, "execute") as execute:
            self.assertTrue(self.queue.trusted({"user": {"login": "BANG404"}}))
            execute.assert_not_called()
        for permission, allowed in [("write", True), ("admin", True), ("read", False)]:
            with patch.object(worker, "execute", return_value=json.dumps({"permission": permission})):
                self.assertEqual(self.queue.trusted({"user": {"login": "contributor"}}), allowed)

    def test_legacy_human_pause_is_preserved_without_losing_retained_work(self):
        state = {"since": "2026-01-01T00:00:00Z", "issues": {"10": {"status": "needs-human", "attempts": 200,
                 "worktree": "/private/retained", "sequence": 207}}, "failures": {}, "events": ["event"]}
        self.queue.state_file.write_text(json.dumps(state))
        restored = worker.Worker(self.temporary.name)
        record = restored.state["issues"]["10"]
        self.assertEqual(record["status"], "needs-human")
        self.assertNotIn("next_check", record)
        self.assertEqual(record["worktree"], "/private/retained")
        self.assertEqual(record["sequence"], 207)
        self.assertEqual(restored.state["since"], state["since"])
        self.assertEqual(restored.state["events"], ["event"])
        self.assertEqual(worker.Worker(self.temporary.name).state, restored.state)

    def record(self, key, event, incident=None, policy="auto"):
        calls = []
        def execute(args, **kwargs):
            calls.append(args)
            if args[1:3] == ["issue", "create"]:
                return "https://github.com/BANG404/openagent/issues/7"
            if args[1] == "api":
                return json.dumps({"state": "closed"})
            return ""
        with patch.object(worker, "execute", side_effect=execute), patch.object(self.queue, "api", return_value=[]):
            self.queue.record_failure(key, event, "Failed", "Details", policy, "a" * 40, incident)
        return calls

    def test_repeated_event_deduplicates_but_new_event_reopens_same_fault(self):
        self.record("job:alpha:signature", "event1", source())
        self.assertEqual(self.record("job:alpha:signature", "event1", source()), [])
        self.queue.state["issues"]["7"].update(status="done", sequence=400)
        calls = self.record("job:alpha:signature", "event2", source(id=21))
        self.assertTrue(any(args[1:3] == ["issue", "reopen"] for args in calls))
        self.assertEqual(self.queue.state["issues"]["7"]["status"], "failed")
        self.assertEqual(self.queue.state["issues"]["7"]["sequence"], 400)

    def test_new_fingerprint_does_not_inherit_old_human_blocker(self):
        self.queue.state["failures"]["actions:1:alpha:old"] = 10
        self.queue.state["issues"]["10"] = {"status": "waiting", "blocker": {"kind": "decision"}, "next_check": 10**15}
        self.record("actions:1:alpha:new", "new-event", source())
        self.assertNotIn("blocker", self.queue.state["issues"]["7"])
        self.assertEqual(self.queue.state["issues"]["7"]["status"], "queued")
        self.assertEqual(self.queue.state["issues"]["10"]["next_check"], 10**15)

    def test_crash_after_issue_creation_recovers_marker(self):
        existing = {"number": 9, "body": "<!-- codex-failure:job:alpha -->", "user": {"login": "BANG404"}}
        with patch.object(self.queue, "api", return_value=[existing]), patch.object(worker, "execute", return_value=json.dumps({"state": "open"})) as execute:
            self.queue.record_failure("job:alpha", "event", "Failure", "Body")
        self.assertFalse(any(call.args[0][1:3] == ["issue", "create"] for call in execute.call_args_list))
        self.assertEqual(self.queue.state["failures"]["job:alpha"], 9)

    def test_out_of_order_failure_does_not_replace_newer_source(self):
        self.record("job:alpha", "new", source(id=40))
        self.record("job:alpha", "old", source(id=20))
        self.assertEqual(self.queue.state["issues"]["7"]["incident"]["id"], 40)

    def test_self_followup_uses_separate_incident_and_reapplies_ownership(self):
        self.queue.state["failures"]["job:alpha"] = 10
        calls = self.record("job:alpha", "event", source(), policy="self")
        self.assertEqual(self.queue.state["failures"]["job:alpha"], 10)
        self.assertIn("job:alpha:self:" + "a" * 40, self.queue.state["failures"])
        self.assertTrue(any("codex:self" in args for args in calls))

    def test_followup_uses_git_trailers_and_unavailable_metadata_never_defaults(self):
        real_execute = worker.execute
        for index, (message, policy) in enumerate([
            ("fix: repair\n\nCI-Followup: self\n", "self"),
            ("fix: repair\n\nCI-Followup: self\n\nNot a trailer.\n", "auto"), ("fix: repair", "auto")]):
            def execute(args, **kwargs):
                return message if args[0] == "gh" else real_execute(args, **kwargs)
            with patch.object(worker, "execute", side_effect=execute):
                self.assertEqual(self.queue.followup_policy(str(index) * 40), policy)
        with patch.object(worker, "execute", side_effect=RuntimeError("Unavailable")), self.assertRaises(RuntimeError):
            self.queue.followup_policy("unavailable")
        self.assertNotIn("unavailable", self.queue.followup_cache)

    def test_fingerprint_distinguishes_errors_but_ignores_sha_paths_and_timestamps(self):
        jobs = [{"name": "deploy", "conclusion": "failure", "steps": [{"name": "SSH rollout", "conclusion": "failure"}]}]
        first = "deploy\tstep\t2026-01-01T10:00:00.123Z ValueError: Preserve the existing container owned by another project"
        second = "deploy\tstep\t2026-03-04T11:01:02Z ValueError: Missing channel configuration"
        self.assertNotEqual(worker.failure_fingerprint(jobs, first), worker.failure_fingerprint(jobs, second))
        for old, new in [("2026-01-01T10:00:00.123Z", "2026-03-04T11:01:02Z")]:
            self.assertEqual(worker.failure_fingerprint(jobs, first), worker.failure_fingerprint(jobs, first.replace(old, new)))
        self.assertEqual(worker.failure_fingerprint(jobs, "Error: missing /tmp/build-12/file abcdef1234567890"),
                         worker.failure_fingerprint(jobs, "Error: missing /tmp/build-34/file 1234567890abcdef"))
        self.assertEqual(worker.failure_fingerprint([], ""), "unknown")

    def run_task(self, outcome=None, fail_delivery=False, fail_alpha=False, labels=(), fail_cleanup=False):
        commands = []
        outcome = outcome or result()
        def execute(args, **kwargs):
            commands.append(args)
            if args[:2] == ["git", "clone"]:
                path = Path(args[-1])
                path.mkdir(parents=True, exist_ok=True)
                (path / ".git").write_text("worktree fixture")
            if args[:2] == ["codex", "exec"]:
                output = Path(args[args.index("--output-last-message") + 1])
                output.write_text(json.dumps(outcome))
            if args[:2] == ["git", "rev-parse"]:
                return "b" * 40 if args[-1] == "HEAD" else "a" * 40
            if args[:2] == ["git", "merge-base"]:
                return "a" * 40
            if args[:3] == ["bun", "run", "deliver"] and fail_delivery:
                raise RuntimeError("Quality check failed")
            if args == ["git", "push", "origin", "HEAD:refs/heads/alpha"] and fail_alpha:
                raise RuntimeError("Access failure")
            return ""
        class Container:
            def __init__(self, *args):
                pass
            def __enter__(self):
                return self
            def command(self, args, cwd=None, env=None):
                return args
            def __exit__(self, *_):
                commands.append(["container", "remove"])
                if fail_cleanup:
                    raise RuntimeError("LXD cleanup failed")
        with patch.object(worker, "TaskContainer", Container), patch.object(worker, "execute", side_effect=execute), patch.object(self.queue, "prepare"), patch.object(self.queue, "api", return_value=[]), patch.object(self.queue, "comment") as comment, patch.object(self.queue, "gh") as gh:
            self.queue.process(issue(labels=labels))
        return commands, gh.call_args_list, comment.call_args_list

    def test_delivery_precedes_alpha_and_ci_incident_waits_for_actual_success(self):
        self.queue.state["issues"]["11"] = {"status": "queued", "incident": source()}
        commands, gh, _ = self.run_task()
        verify = next(i for i, args in enumerate(commands) if args[:3] == ["bun", "run", "deliver"])
        push = commands.index(["git", "push", "origin", "HEAD:refs/heads/alpha"])
        self.assertLess(verify, push)
        self.assertEqual(self.queue.state["issues"]["11"]["status"], "verifying")
        self.assertFalse(any(call.args[:2] == ("issue", "close") for call in gh))

    def test_regular_task_closes_after_verified_delivery(self):
        commands, gh, _ = self.run_task()
        self.assertIn(["git", "push", "origin", "HEAD:refs/heads/alpha"], commands)
        self.assertEqual(self.queue.state["issues"]["11"]["status"], "done")
        self.assertTrue(any(call.args == ("issue", "close", "11") for call in gh))

    def test_legacy_attempted_issue_is_never_dispatched_again(self):
        for status in ("queued", "waiting", "failed", "done", "needs-human", "verifying"):
            self.queue.state["issues"]["11"] = {"status": status, "sequence": 400}
            commands, _, _ = self.run_task(labels=("codex:retry",))
            self.assertEqual(commands, [])
            self.assertEqual(self.queue.state["issues"]["11"]["sequence"], 400)

    def test_explicit_pause_ownership_and_untrusted_author_still_block_execution(self):
        for labels in [("codex:skip",), ("codex:self",), ("codex:needs-human",), ("codex:needs-human", "codex:retry")]:
            commands, _, _ = self.run_task(labels=labels)
            self.assertEqual(commands, [])
        with patch.object(self.queue, "trusted", return_value=False), patch.object(worker, "execute") as execute:
            self.queue.process(issue())
            execute.assert_not_called()

    def test_alpha_input_deadline_and_retry_label_never_redispatch(self):
        self.run_task(fail_delivery=True)
        self.queue.heads["alpha"] = "c" * 40
        self.queue.state["issues"]["11"]["next_check"] = 0
        with patch.object(self.queue, "collect_failures"), patch.object(self.queue, "reconcile"), patch.object(self.queue, "api", return_value=[{**issue(labels=("codex:retry",)), "body": "Changed input"}]), patch.object(self.queue, "process") as process, patch.object(worker, "cleanup_containers"):
            self.queue.tick()
        process.assert_not_called()
        self.assertEqual(self.queue.state["issues"]["11"]["sequence"], 1)

    def test_completion_follows_container_cleanup(self):
        commands, _, _ = self.run_task()
        self.assertEqual(commands[-1], ["container", "remove"])
        self.assertEqual(self.queue.state["issues"]["11"]["status"], "done")

    def test_cleanup_failure_prevents_completion_and_new_dispatch(self):
        self.run_task(fail_cleanup=True)
        self.assertEqual(self.queue.state["issues"]["11"]["status"], "failed")
        with patch.object(self.queue, "collect_failures"), patch.object(self.queue, "reconcile"), patch.object(self.queue, "api", return_value=[issue(12)]), patch.object(self.queue, "process") as process, patch.object(worker, "cleanup_containers", side_effect=RuntimeError("LXD unavailable")):
            with self.assertRaises(RuntimeError):
                self.queue.tick()
        process.assert_not_called()

    def test_noop_cannot_close_issue_if_container_cleanup_fails(self):
        _, gh, _ = self.run_task(outcome=result("noop"), fail_cleanup=True)
        self.assertEqual(self.queue.state["issues"]["11"]["status"], "failed")
        self.assertFalse(any(call.args == ("issue", "close", "11") for call in gh))

    def test_task_result_cannot_read_host_symlinks_or_block_on_fifo(self):
        private = self.queue.root / "private.json"
        private.write_text(json.dumps(result()))
        symlink = self.queue.root / "result-link.json"
        symlink.symlink_to(private)
        with self.assertRaises(OSError):
            worker.read_result(symlink)
        fifo = self.queue.root / "result-fifo"
        os.mkfifo(fifo)
        with self.assertRaises(ValueError):
            worker.read_result(fifo)

    def test_external_blocker_stays_paused_despite_deadline_alpha_and_retry(self):
        blocker = {"kind": "credential", "reason": "缺少所需凭据", "resume_when": "所需凭据已提供"}
        _, gh, comments = self.run_task(outcome=result("waiting", blocker))
        record = self.queue.state["issues"]["11"]
        self.assertEqual(record["status"], "needs-human")
        self.assertNotIn("next_check", record)
        self.assertTrue(any("codex:needs-human" in call.args for call in gh))
        self.assertTrue(any("不再自动重试或派发" in call.args[1] for call in comments))
        self.queue.heads["alpha"] = "c" * 40
        for labels in [("codex:needs-human",), ("codex:needs-human", "codex:retry")]:
            commands, gh, comments = self.run_task(labels=labels)
            self.assertEqual((commands, gh, comments), ([], [], []))
        self.assertEqual(record["sequence"], 1)

    def test_removing_human_label_does_not_resume_dispatch(self):
        self.queue.state["issues"]["11"] = {"status": "needs-human", "sequence": 1}
        commands, _, _ = self.run_task()
        self.assertEqual(commands, [])

    def test_legacy_waits_migrate_to_terminal_without_losing_evidence(self):
        self.queue.state.update(version=3)
        for number, status in ((13, "waiting"), (14, "retry"), (15, "queued")):
            self.queue.state["issues"][str(number)] = {"status": status, "sequence": 7, "next_check": 1,
                                                       "delay": 300, "worktree": "/private/retained"}
        self.queue.save()
        restored = worker.Worker(self.temporary.name)
        self.assertEqual(restored.state["version"], 4)
        for record in restored.state["issues"].values():
            self.assertEqual(record["status"], "failed")
            self.assertEqual(record["worktree"], "/private/retained")
            self.assertNotIn("next_check", record)
            self.assertNotIn("delay", record)

    def test_legacy_external_wait_preserves_blocker_and_becomes_human_terminal(self):
        blocker = {"kind": "access", "reason": "Existing private reason", "resume_when": "Operator checks"}
        self.queue.state.update(version=2)
        self.queue.state["issues"]["13"] = {"status": "waiting", "sequence": 7, "blocker": blocker}
        self.queue.save()
        restored = worker.Worker(self.temporary.name)
        self.assertEqual(restored.state["issues"]["13"]["status"], "needs-human")
        self.assertEqual(restored.state["issues"]["13"]["blocker"], blocker)

    def test_task_commands_use_lxd_exec_without_inheriting_host_environment(self):
        self.queue.container = worker.TaskContainer(self.queue.root, "fixture", self.queue.root, self.queue.root, "")
        with patch.object(worker, "execute", return_value="verified") as execute:
            self.assertEqual(self.queue.task_execute(["bun", "run", "deliver", "--", "fix(ci): fixture"],
                             env={"DELIVERY_BRANCH": "codex/issue-11-attempt-1"}), "verified")
        command = execute.call_args.args[0]
        self.assertEqual(command[:6], ["lxc", "--force-local", "--project", "sandboxpi-codex", "exec", "local:fixture"])
        self.assertIn("DELIVERY_BRANCH=codex/issue-11-attempt-1", command)
        self.assertNotIn("env", execute.call_args.kwargs)

    def test_paused_incident_still_collects_new_failures_without_resuming(self):
        self.queue.state["failures"]["job:alpha:fault"] = 7
        record = {"status": "needs-human", "incident": source()}
        self.queue.state["issues"]["7"] = record
        self.record("job:alpha:fault", "new-failure", source(id=21))
        self.assertEqual(record["status"], "needs-human")
        self.assertNotIn("next_check", record)
        self.assertEqual(record["incident"]["id"], 21)

    def test_paused_issue_is_not_closed_even_if_source_later_succeeds(self):
        self.queue.state["issues"]["11"] = {"status": "needs-human", "incident": source()}
        self.queue.observed = [source(id=21)]
        with patch.object(self.queue, "gh") as gh, patch.object(self.queue, "comment") as comment:
            self.queue.reconcile([issue(labels=("codex:needs-human",))])
        gh.assert_not_called()
        comment.assert_not_called()
        self.assertEqual(self.queue.state["issues"]["11"]["status"], "needs-human")

    def test_paused_issue_cannot_starve_a_new_fault_in_scheduler(self):
        self.queue.state["issues"]["10"] = {"status": "needs-human", "next_check": None}
        with ThreadPoolExecutor(max_workers=1) as executor, patch.object(self.queue, "collect_failures") as collect, patch.object(self.queue, "reconcile"), patch.object(self.queue, "api", return_value=[issue(10, ("codex:needs-human", "codex:retry")), issue(11)]), patch.object(self.queue, "process") as process:
            self.queue.tick(executor)
            self.queue.active.result(timeout=2)
        collect.assert_called_once()
        process.assert_called_once_with(issue(11))

    def test_terminal_state_survives_failed_label_publication(self):
        record = {"status": "running", "sequence": 1}
        self.queue.state["issues"]["11"] = record
        blocker = {"kind": "access", "reason": "Read access denied", "resume_when": "Operator checks access"}
        with patch.object(self.queue, "gh", side_effect=RuntimeError("API unavailable")), self.assertRaises(RuntimeError):
            self.queue.fail(11, record, blocker, "Inspect ownership")
        self.assertEqual(record["status"], "needs-human")
        self.assertTrue(record["terminal_pending"])
        with patch.object(self.queue, "gh") as gh, patch.object(self.queue, "comment"), patch.object(worker, "execute") as execute:
            self.queue.process(issue())
            self.queue.observed = []
            self.queue.reconcile([issue()])
        execute.assert_not_called()
        self.assertTrue(any("codex:needs-human" in call.args for call in gh.call_args_list))
        self.assertFalse(record["terminal_pending"])

    def test_quality_failure_runs_once_without_pushing_alpha(self):
        commands, gh, _ = self.run_task(fail_delivery=True)
        self.assertNotIn(["git", "push", "origin", "HEAD:refs/heads/alpha"], commands)
        self.assertEqual(self.queue.state["issues"]["11"]["status"], "failed")
        self.assertTrue(any("codex:failed" in call.args for call in gh))
        for _ in range(4):
            commands, _, _ = self.run_task()
            self.assertEqual(commands, [])
        self.assertEqual(self.queue.state["issues"]["11"]["sequence"], 1)

    def test_ci_noop_does_not_claim_recovery(self):
        self.queue.state["issues"]["11"] = {"status": "queued", "incident": source()}
        _, gh, _ = self.run_task(outcome=result("noop"))
        self.assertEqual(self.queue.state["issues"]["11"]["status"], "verifying")
        self.assertFalse(any(call.args[:2] == ("issue", "close") for call in gh))

    def test_ambiguous_push_is_terminal_and_never_reruns_delivery(self):
        self.run_task(fail_alpha=True)
        record = self.queue.state["issues"]["11"]
        self.assertEqual(record["status"], "failed")
        self.assertEqual(record["candidate_sha"], "b" * 40)
        commands, _, _ = self.run_task()
        self.assertEqual(commands, [])

    def test_restart_preserves_work_but_never_restarts_agent(self):
        self.queue.state["issues"]["5"] = {"status": "running", "phase": "agent", "sequence": 8,
                                            "branch": "codex/issue-5-attempt-8", "worktree": "/private/retained"}
        with patch.object(self.queue, "gh"), patch.object(self.queue, "comment"), patch.object(worker, "execute") as execute:
            self.queue.recover()
        execute.assert_not_called()
        record = self.queue.state["issues"]["5"]
        self.assertEqual(record["status"], "failed")
        self.assertEqual(record["worktree"], "/private/retained")

    def test_success_is_workflow_branch_and_source_specific(self):
        failure = source()
        for success in [source(id=19), source(workflow=2, id=21), source(branch="beta", id=21), source(id=20)]:
            self.assertFalse(self.queue.newer_success(success, failure))
        self.assertTrue(self.queue.newer_success(source(id=21), failure))
        self.assertTrue(self.queue.newer_success(source(attempt=2), failure))
        self.queue.state["issues"]["11"] = {"status": "verifying", "incident": failure}
        self.queue.observed = [source(id=21)]
        with patch.object(self.queue, "gh") as gh, patch.object(self.queue, "comment"):
            self.queue.reconcile([issue()])
        self.assertEqual(self.queue.state["issues"]["11"]["status"], "done")
        self.assertTrue(any(call.args == ("issue", "close", "11") for call in gh.call_args_list))

    def test_failed_issue_closure_is_replayed_without_repair(self):
        record = {"status": "verifying", "incident": source()}
        self.queue.state["issues"]["11"] = record
        with patch.object(self.queue, "comment"), patch.object(self.queue, "gh", side_effect=RuntimeError("API unavailable")), self.assertRaises(RuntimeError):
            self.queue.finish(11, record, "Success evidence")
        self.assertEqual(record["status"], "closing")
        with patch.object(self.queue, "comment") as comment, patch.object(self.queue, "gh"), patch.object(worker, "execute") as execute:
            self.queue.observed = []
            self.queue.reconcile([issue()])
        self.assertEqual(record["status"], "done")
        comment.assert_not_called()
        execute.assert_not_called()

    def test_collector_keeps_running_while_repair_thread_is_busy(self):
        started, release = threading.Event(), threading.Event()
        def repair(task):
            started.set()
            release.wait(5)
        try:
            with ThreadPoolExecutor(max_workers=1) as executor, patch.object(self.queue, "collect_failures") as collect, patch.object(self.queue, "reconcile"), patch.object(self.queue, "api", return_value=[issue()]), patch.object(self.queue, "process", side_effect=repair):
                self.queue.tick(executor)
                self.assertTrue(started.wait(2))
                self.queue.tick(executor)
                self.assertEqual(collect.call_count, 2)
                self.assertFalse(self.queue.active.done())
                release.set()
        finally:
            release.set()

    def test_waiting_older_issue_does_not_starve_new_work(self):
        self.queue.state["issues"]["10"] = {"status": "waiting", "conditions": {}, "next_check": 10**15}
        with ThreadPoolExecutor(max_workers=1) as executor, patch.object(self.queue, "collect_failures"), patch.object(self.queue, "reconcile"), patch.object(self.queue, "api", return_value=[issue(10), issue(11)]), patch.object(self.queue, "process") as process:
            self.queue.tick(executor)
            self.queue.active.result(timeout=2)
        process.assert_called_once_with(issue(11))

    def collect(self, runs, checks=(), annotations=()):
        self.queue.state["since"] = "2026-01-01T00:00:00Z"
        def api(path, field=None):
            if path.startswith("actions/"):
                return runs
            if "/annotations" in path:
                return list(annotations)
            return list(checks)
        with patch.object(self.queue, "api", side_effect=api), patch.object(worker, "execute", return_value=json.dumps({"object": {"sha": "a" * 40}})), patch.object(self.queue, "action_identity", return_value="signature"), patch.object(self.queue, "followup_policy", return_value="auto") as policy, patch.object(self.queue, "record_failure", return_value=7) as record:
            self.queue.collect_failures()
        return record, policy

    def test_actions_and_public_checks_use_exact_source_and_channel(self):
        run = {"head_branch": "alpha", "event": "push", "head_sha": "b" * 40, "conclusion": "failure",
               "updated_at": "2026-01-02T00:05:00Z", "created_at": "2026-01-02T00:00:00Z",
               "workflow_id": 1, "id": 2, "run_attempt": 1, "name": "CI", "html_url": "https://example/run"}
        check = {"id": 3, "name": "Public quality checks", "conclusion": "failure", "started_at": "2026-01-02T00:00:00Z",
                 "completed_at": "2026-01-02T00:05:00Z", "external_id": "openagent:beta", "html_url": "https://example/check"}
        record, policy = self.collect([run], [check])
        self.assertEqual(record.call_count, 2)
        self.assertEqual(record.call_args_list[0].args[5], "b" * 40)
        self.assertIn(":beta:", record.call_args_list[1].args[0])
        self.assertEqual([call.args[0] for call in policy.call_args_list], ["b" * 40, "a" * 40])
        for call in record.call_args_list:
            self.assertIn("执行失败", call.args[2])
            self.assertIn("分支：", call.args[3])
            self.assertIn("源提交：", call.args[3])
            self.assertIn("不得", call.args[3])

    def test_chinese_issue_creation_preserves_marker_and_followup_policy(self):
        with patch.object(self.queue, "api", return_value=[]), patch.object(worker, "execute", return_value="https://github.com/BANG404/openagent/issues/7") as execute:
            self.queue.record_failure("job:alpha:fault", "event", "[CI/CD] CI 执行失败", "分支：`alpha`", policy="self", source="a" * 40)
        creation = next(call for call in execute.call_args_list if call.args[0][1:3] == ["issue", "create"])
        self.assertIn("[CI/CD] CI 执行失败", creation.args[0])
        self.assertIn("<!-- codex-failure:job:alpha:fault:self:" + "a" * 40 + " -->", creation.kwargs["input"])
        self.assertIn("CI 后续处理策略：`self`。", creation.kwargs["input"])
        self.assertIn("codex:self", creation.args[0])

    def test_agent_language_contract_keeps_commit_in_english(self):
        prompt = self.queue.prompt(issue(), {}, [])
        self.assertIn("Conventional Commit message must be English", prompt)
        self.assertIn("summary, next_action, blocker.reason and blocker.resume_when in Simplified Chinese", prompt)

    def test_chinese_notifications_cover_failure_delivery_and_recovery(self):
        _, _, comments = self.run_task(fail_delivery=True)
        self.assertTrue(any("本次 Issue 执行已停止：" in call.args[1] and "不再自动重试或派发" in call.args[1] for call in comments))
        record = {"incident": source()}
        with patch.object(self.queue, "gh"), patch.object(self.queue, "comment") as comment:
            self.queue.delivered(11, record)
            self.assertIn("修复已交付至 alpha", comment.call_args.args[1])
            self.queue.state["issues"]["11"] = record
            self.queue.observed = [source(id=21)]
            self.queue.reconcile([issue()])
            self.assertIn("实际工作流或检查已成功恢复", comment.call_args.args[1])
            self.assertIn(source(id=21)["url"], comment.call_args.args[1])
        self.queue = worker.Worker(self.queue.root / "second-task")
        _, _, comments = self.run_task()
        self.assertTrue(any("已完成修复" in call.args[1] and "已在 alpha 完成交付" in call.args[1] for call in comments))

    def test_seen_legacy_failure_never_creates_another_repair_issue(self):
        self.queue.state["events"] = ["run:2:1"]
        self.queue.state["failures"]["actions:1:alpha"] = 10
        self.queue.state["issues"]["10"] = {"status": "failed", "sequence": 1}
        self.assertIsNone(self.queue.failure_event("actions:1:alpha", "run:2:1", (1,), (1,)))

    def test_legacy_public_failure_is_reclassified_without_replaying_older_checks(self):
        self.queue.state["events"] = ["check:30:2026-01-02T00:05:00Z", "check:20:2026-01-01T00:05:00Z"]
        self.queue.state["failures"]["check:Public CD publish:main"] = 7
        self.queue.state["issues"]["7"] = {"status": "waiting"}
        current = {"id": 30, "name": "Public CD publish", "conclusion": "failure", "started_at": "2026-01-02T00:00:00Z",
                   "completed_at": "2026-01-02T00:05:00Z", "external_id": "openagent:main", "html_url": "https://example/check"}
        older = {**current, "id": 20, "started_at": "2026-01-01T00:00:00Z", "completed_at": "2026-01-01T00:05:00Z"}
        record, _ = self.collect([], [older, current])
        record.assert_not_called()

    def test_unavailable_source_policy_does_not_block_other_failure_collection(self):
        first = {"head_branch": "alpha", "event": "push", "head_sha": "b" * 40, "conclusion": "failure",
                 "updated_at": "2026-01-02T00:05:00Z", "created_at": "2026-01-02T00:00:00Z",
                 "workflow_id": 1, "id": 2, "run_attempt": 1, "name": "CI", "html_url": "https://example/run"}
        second = {**first, "id": 3, "head_sha": "c" * 40}
        self.queue.state["since"] = "2026-01-01T00:00:00Z"
        with patch.object(self.queue, "api", side_effect=lambda path, field=None: [first, second] if path.startswith("actions/") else []), patch.object(worker, "execute", return_value=json.dumps({"object": {"sha": "a" * 40}})), patch.object(self.queue, "followup_policy", side_effect=[RuntimeError("Unavailable"), "auto"]), patch.object(self.queue, "action_identity", return_value="signature"), patch.object(self.queue, "record_failure") as record, patch.object(self.queue, "poll_error"):
            self.queue.collect_failures()
        record.assert_called_once()
        self.assertEqual(record.call_args.args[5], "c" * 40)
        self.assertNotIn("run:2:1", self.queue.state["events"])

    def test_missing_verification_never_resumes_agent_diagnosis(self):
        record = {"status": "verifying", "incident": source(), "next_check": 0, "sequence": 1}
        self.queue.state["issues"]["11"] = record
        self.queue.observed = []
        with patch.object(self.queue, "gh"), patch.object(self.queue, "comment"):
            self.queue.reconcile([issue()])
        self.assertEqual(record["status"], "verifying")
        self.assertNotIn("blocker", record)

    def test_failed_future_does_not_stick_the_entire_scheduler(self):
        from concurrent.futures import Future
        completed = Future()
        completed.set_exception(RuntimeError("API unavailable"))
        self.queue.active = completed
        with patch.object(self.queue, "collect_failures"), patch.object(self.queue, "reconcile"), patch.object(self.queue, "api", return_value=[issue()]), patch.object(self.queue, "process") as process, patch.object(self.queue, "poll_error"):
            self.queue.tick()
        process.assert_called_once_with(issue())
        self.assertIsNone(self.queue.active)

    def test_completion_api_failure_retries_closure_not_implementation(self):
        with patch.object(self.queue, "finish", side_effect=lambda number, record, evidence: self.queue.update(record, status="closing", completion=evidence)):
            self.run_task()
        record = self.queue.state["issues"]["11"]
        self.assertEqual(record["status"], "closing")
        with patch.object(self.queue, "gh"), patch.object(self.queue, "comment"), patch.object(worker, "execute") as execute:
            self.queue.observed = []
            self.queue.reconcile([issue()])
        self.assertEqual(record["status"], "done")
        execute.assert_not_called()

    def test_obsolete_retry_label_cannot_wake_verification(self):
        self.queue.state["issues"]["11"] = {"status": "verifying", "incident": source(), "sequence": 1}
        commands, _, _ = self.run_task(labels=("codex:retry",))
        self.assertEqual(commands, [])

    def test_real_git_recovery_recognizes_delivered_ancestor(self):
        repository = self.queue.repository
        repository.mkdir()
        def git(*args):
            return subprocess.check_output(["git", *args], cwd=repository, text=True, stderr=subprocess.DEVNULL).strip()
        git("init", "-b", "alpha")
        git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "--allow-empty", "-m", "fix(ci): first repair")
        candidate = git("rev-parse", "HEAD")
        git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "--allow-empty", "-m", "docs: later change")
        git("update-ref", "refs/remotes/origin/alpha", "HEAD")
        record = {"status": "running", "candidate_sha": candidate, "incident": source(), "result": result()}
        self.queue.state["issues"]["11"] = record
        with patch.object(self.queue, "prepare"), patch.object(self.queue, "comment"), patch.object(self.queue, "gh"):
            self.queue.recover()
        self.assertEqual(record["status"], "verifying")

    def test_concurrent_alpha_merge_is_reverified_and_conflict_is_aborted(self):
        for conflict in (False, True):
            commands = []
            def execute(args, **kwargs):
                commands.append(args)
                if args == ["git", "push", "origin", "HEAD:refs/heads/alpha"] and commands.count(args) == 1:
                    raise RuntimeError("Non-fast-forward")
                if args[:3] == ["git", "merge", "-m"] and conflict:
                    raise RuntimeError("Conflict")
                if args[:2] == ["git", "rev-parse"]:
                    return "new-alpha"
                if args[:2] == ["git", "merge-base"]:
                    return "old-alpha"
                return ""
            with patch.object(self.queue, "task_execute", side_effect=execute):
                if conflict:
                    with self.assertRaises(RuntimeError):
                        self.queue.update_alpha("codex/issue-11-attempt-1", self.queue.root, "fix(ci): repair", None)
                    self.assertEqual(commands[-1], ["git", "merge", "--abort"])
                else:
                    self.queue.update_alpha("codex/issue-11-attempt-1", self.queue.root, "fix(ci): repair", None)
                    verify = next(i for i, args in enumerate(commands) if args[:3] == ["bun", "run", "deliver"])
                    self.assertLess(verify, len(commands) - 1)
                    self.assertEqual(commands[-1], ["git", "push", "origin", "HEAD:refs/heads/alpha"])


if __name__ == "__main__":
    unittest.main()

"""Security and archive behavior using synthetic, temporary data only."""
import base64
import gzip
import json
import os
import subprocess
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from server import Handler, Server
from store import Store

REPORT_ID = "00000000-0000-4000-8000-000000000001"


class QueryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.logs = self.root / "archive"
        self.reports = self.root / "reports"
        self.logs.mkdir()
        self.reports.mkdir()
        self.store = Store(self.root / "index.sqlite", self.logs, self.reports)
        self.report = {"schemaVersion": 2, "description": "synthetic 100%_problem",
                       "runtimeVersion": "test", "os": "fixture", "arch": "x86_64",
                       "conversationTrace": {"conversation": {"id": "synthetic"},
                                             "task_traces": [{"id": index} for index in range(7)]},
                       "logs": [{"truncated": False, "content": "abcdef\n你好", "fileName": "openagent.2026-10-15.jsonl"}]}
        self.wrapper = {"reportId": REPORT_ID, "receivedAt": "2026-10-15T00:00:00Z", "report": self.report}
        self.path = self.reports / (REPORT_ID + ".json.gz")
        with gzip.open(self.path, "wt", encoding="utf-8") as file:
            json.dump(self.wrapper, file)
        self.envelope = {"resourceLogs": [{"resource": {"attributes": [
            {"key": "service.name", "value": {"stringValue": "openagent"}},
            {"key": "service.version", "value": {"stringValue": "test"}}]},
            "scopeLogs": [{"logRecords": [{"timeUnixNano": "1792022400000000000", "severityText": "ERROR",
                                           "body": {"stringValue": "synthetic_event"}}]}]}]}
        (self.logs / "logs.json").write_text(json.dumps(self.envelope) + "\n")
        self.assertEqual(self.store.refresh(), 0)
        Handler.store = self.store
        Handler.token = "t" * 48
        Handler.username, Handler.password = "viewer", "p" * 48
        self.server = Server(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.temp.cleanup()

    def request(self, path, auth=True, method="GET", header=None):
        headers = {"Authorization": header or ("Bearer " + Handler.token)} if auth else {}
        request = Request(self.base + path, headers=headers, method=method)
        try:
            with urlopen(request, timeout=5) as response:
                return response.status, response.read(), dict(response.headers)
        except HTTPError as error:
            return error.code, error.read(), dict(error.headers)

    def query(self, path):
        status, body, _ = self.request("/observe/api/" + path)
        self.assertEqual(status, 200, body)
        return json.loads(body)

    def test_authentication_and_all_mutations_denied(self):
        for path in ("/observe", "/observe/app.js", "/observe/api", "/observe/api/status", "/observe/api/reports/" + REPORT_ID + "/archive"):
            self.assertEqual(self.request(path, auth=False)[0], 401)
        for method in ("POST", "PUT", "PATCH", "DELETE"):
            self.assertEqual(self.request("/observe/api/reports", method=method)[0], 405)
            self.assertEqual(self.request("/observe/api/reports", auth=False, method=method)[0], 401)
        self.assertEqual(self.request("/observe", header="Bearer wrong")[0], 401)
        basic = base64.b64encode(b"viewer:" + Handler.password.encode()).decode()
        status, _, headers = self.request("/observe", header="Basic " + basic)
        self.assertEqual(status, 200)
        self.assertEqual(headers["Cache-Control"], "no-store, no-transform")
        self.assertIn("frame-ancestors 'none'", headers["Content-Security-Policy"])

    def test_log_index_append_rotation_and_incomplete_tail(self):
        self.assertEqual(self.query("logs?service=openagent&version=test&severity=ERROR")["items"][0]["body"], "synthetic_event")
        path = self.logs / "logs.json"
        line = json.dumps(self.envelope)
        with path.open("a") as file:
            file.write(line[:20])
        self.assertEqual(self.store.refresh(), 0)
        with path.open("a") as file:
            file.write(line[20:] + "\n")
        path.rename(self.logs / "logs-rotation.json")
        path.write_text(line + "\n")
        self.assertEqual(self.store.refresh(), 0)
        self.assertEqual(self.query("status")["logs"], 1)
        self.assertEqual(self.query("logs?q=missing")["items"], [])
        self.assertEqual(self.query("logs?start=2099-01-01T00:00:00Z")["items"], [])

    def test_metadata_is_separate_and_literal_search(self):
        item = self.query("reports?q=100%25_problem")["items"][0]
        self.assertNotIn("conversationTrace", item)
        self.assertNotIn("content", item["logs"][0])
        self.assertFalse(item["logs"][0]["truncated"])
        self.assertEqual(self.query("reports?q=%27%20OR%201%3D1--")["items"], [])
        self.assertTrue(item["hasTrace"])
        self.assertEqual(self.query("reports?q=" + REPORT_ID)["items"][0]["reportId"], REPORT_ID)

    def test_trace_log_pagination_and_archive_preservation(self):
        root = "reports/" + REPORT_ID
        first = self.query(root + "/trace?section=task_traces&limit=3")
        self.assertEqual(first, {"items": [{"id": 0}, {"id": 1}, {"id": 2}], "nextOffset": 3})
        last = self.query(root + "/trace?section=task_traces&limit=3&offset=6")
        self.assertIsNone(last["nextOffset"])
        self.assertEqual(self.query(root + "/trace?section=conversation")["items"], [{"id": "synthetic"}])
        log = self.query(root + "/logs?name=openagent.2026-10-15.jsonl&limit=4&offset=4")
        self.assertEqual(log["content"], "ef\n你")
        self.assertEqual(log["nextOffset"], 8)
        status, archive, _ = self.request("/observe/api/" + root + "/archive")
        self.assertEqual(status, 200)
        self.assertEqual(archive, self.path.read_bytes())

    def test_legacy_flat_reports_and_oversized_items(self):
        self.path.unlink()
        self.report["conversationTrace"]["task_traces"] = [{"large": "x" * 300000}]
        flat = {**self.report, "reportId": REPORT_ID, "receivedAt": self.wrapper["receivedAt"]}
        (self.reports / (REPORT_ID + ".json")).write_text(json.dumps(flat))
        self.assertEqual(self.store.refresh(), 0)
        item = self.query("reports/" + REPORT_ID + "/trace?section=task_traces")["items"][0]
        self.assertTrue(item["oversized"])
        self.assertEqual(self.query("status")["reports"], 1)

    def test_large_map_section_stops_building_and_next_page_is_complete(self):
        self.report["conversationTrace"]["attachment_blobs"] = {str(i): "x" * 10000 for i in range(40)}
        self.report["conversationTrace"]["task_traces"] = [{"large": "x" * 300000}, {"id": "small"}]
        with gzip.open(self.path, "wt", encoding="utf-8") as file:
            json.dump(self.wrapper, file)
        self.store.refresh()
        root = "reports/" + REPORT_ID + "/trace?section="
        self.assertTrue(self.query(root + "attachment_blobs")["items"][0]["oversized"])
        self.assertTrue(self.query(root + "task_traces&limit=1")["items"][0]["oversized"])
        self.assertEqual(self.query(root + "task_traces&offset=1&limit=1")["items"], [{"id": "small"}])

    def test_invalid_queries_and_traversal(self):
        for path in ("logs?limit=101", "logs?limit=-1", "logs?start=bad", "logs?start=2026-01-01", "reports?offset=-1"):
            self.assertEqual(self.request("/observe/api/" + path)[0], 400)
        for path in ("reports/../../secrets", "reports/" + REPORT_ID + "/../../secret"):
            self.assertEqual(self.request("/observe/api/" + path)[0], 404)
        self.assertEqual(self.request("/observe/api/reports/" + REPORT_ID + "/trace?section=secrets")[0], 400)

    def test_damaged_archive_and_operator_removal(self):
        (self.reports / "damaged.json.gz").write_bytes(b"bad")
        self.assertEqual(self.store.refresh(), 1)
        self.path.unlink()
        self.store.refresh()
        self.assertEqual(self.query("status")["reports"], 0)

    def test_agent_cli_utf8_credentials_and_errors(self):
        token = self.root / "token"
        token.write_text(Handler.token)
        env = {**os.environ, "OPENAGENT_OBSERVE_URL": self.base + "/observe",
               "OPENAGENT_OBSERVE_TOKEN": "", "OPENAGENT_OBSERVE_TOKEN_FILE": str(token),
               "PYTHONIOENCODING": "gbk"}
        command = [sys.executable, str(Path(__file__).with_name("agent.py"))]
        result = subprocess.run(command + ["report-logs", "--report-id", REPORT_ID,
                                "--name", "openagent.2026-10-15.jsonl"], env=env, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["content"], "abcdef\n你好")
        token.write_text("incorrect")
        result = subprocess.run(command + ["status"], env=env, capture_output=True)
        self.assertEqual(result.returncode, 1)
        self.assertNotIn(Handler.token.encode(), result.stderr)


if __name__ == "__main__":
    unittest.main()

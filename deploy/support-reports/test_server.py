import json
import gzip
import io
import http.client
import threading
import tempfile
import unittest
from unittest.mock import patch
from http.server import ThreadingHTTPServer
from pathlib import Path
from server import archive_stream, Handler


def archive(payload, directory):
    raw = json.dumps(payload).encode()
    return archive_stream(io.BytesIO(raw), len(raw), "identity", directory)


def read_report(directory, report_id):
    with gzip.open(directory / f"{report_id}.json.gz", "rt", encoding="utf-8") as file:
        return json.load(file)["report"]


class ArchiveTests(unittest.TestCase):
    def payload(self):
        return dict(schemaVersion=1, description="问题复现步骤", runtimeVersion="test",
                    os="test", arch="test", conversationTrace=None)

    def test_description_only_and_complete_trace(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            payload = self.payload()
            first = archive(payload, directory)
            payload["conversationTrace"] = {"checkpoints": ["fixture-tool-result"], "branches": [1, 2]}
            second = archive(payload, directory)
            records = [read_report(directory, key) for key in (first, second)]
            self.assertIsNone(records[0]["conversationTrace"])
            self.assertEqual(records[1]["conversationTrace"], payload["conversationTrace"])
            self.assertEqual(len(list(directory.glob("*.json.gz"))), 2)

    def test_invalid_payload_never_creates_receipt(self):
        with tempfile.TemporaryDirectory() as temp:
            for invalid in ([], {}, dict(self.payload(), description=" "),
                            dict(self.payload(), conversationTrace="invalid")):
                with self.assertRaises(ValueError):
                    archive(invalid, Path(temp))
            self.assertEqual(list(Path(temp).iterdir()), [])


class StreamingTests(unittest.TestCase):
    def payload(self):
        return dict(schemaVersion=2, description="synthetic streaming fixture", runtimeVersion="test",
                    os="test", arch="test", conversationTrace={"records": ["内容" * 1000] * 80},
                    logs=[dict(fileName="openagent.2026-10-14.jsonl", content="fixture\n", truncated=False)])

    def submit(self, body, encoding="gzip"):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        handler = type("FixtureHandler", (Handler,), dict(token="fixture", directory=self.directory))
        server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        connection = http.client.HTTPConnection(*server.server_address, timeout=10)
        self.addCleanup(connection.close)
        connection.request("POST", "/v1/support/reports", body,
                           {"Authorization": "Bearer fixture", "Content-Type": "application/json",
                            "Content-Encoding": encoding})
        response = connection.getresponse()
        return response.status, json.loads(response.read())

    def test_gzip_and_identity_are_durable_lossless_compressed_archives(self):
        payload = self.payload()
        raw = json.dumps(payload, ensure_ascii=False).encode()
        for encoding, body in (("gzip", gzip.compress(raw)), ("identity", raw)):
            with self.subTest(encoding=encoding):
                status, receipt = self.submit(body, encoding)
                self.assertEqual(status, 201)
                archive_path = self.directory / f"{receipt['reportId']}.json.gz"
                with gzip.open(archive_path, "rt", encoding="utf-8") as file:
                    record = json.load(file)
                self.assertEqual(record["report"], payload)
                self.assertEqual(record["reportId"], receipt["reportId"])
                self.assertLess(archive_path.stat().st_size, len(raw) // 10)
                self.assertEqual(list(self.directory.glob(".pending-*")), [])

    def test_corrupt_truncated_and_unsupported_uploads_have_no_receipt(self):
        raw = json.dumps(self.payload()).encode()
        for encoding, body, expected in (("gzip", b"invalid gzip", 400),
                                         ("gzip", gzip.compress(raw)[:-8], 400),
                                         ("gzip", gzip.compress(b"{}junk"), 400),
                                         ("br", raw, 415)):
            with self.subTest(encoding=encoding, expected=expected):
                status, receipt = self.submit(body, encoding)
                self.assertEqual(status, expected)
                self.assertNotIn("reportId", receipt)
                self.assertEqual(list(self.directory.iterdir()), [])

    def test_compressed_expanded_and_single_string_budgets(self):
        body = gzip.compress(json.dumps(self.payload()).encode())
        for budget, limit in (("MAX_BYTES", 32), ("MAX_EXPANDED_BYTES", 4096), ("MAX_STRING_BYTES", 100)):
            with patch(f"server.{budget}", limit):
                status, receipt = self.submit(body)
                self.assertEqual(status, 413)
                self.assertNotIn("reportId", receipt)
                self.assertEqual(list(self.directory.iterdir()), [])

    def test_streaming_envelope_checks_reject_duplicate_fields_and_unbounded_logs(self):
        payload = self.payload()
        raw = json.dumps(payload).encode()
        invalid = [b'{"schemaVersion":2,' + raw[1:],
                   json.dumps(dict(payload, logs=[payload["logs"][0]] * 5)).encode(),
                   json.dumps(dict(payload, logs=[["x"]])).encode(),
                   json.dumps(dict(payload, conversationTrace=[])).encode(),
                   json.dumps(dict(payload, description={})).encode()]
        for document in invalid:
            with self.subTest(length=len(document)):
                status, receipt = self.submit(gzip.compress(document))
                self.assertEqual(status, 400)
                self.assertNotIn("reportId", receipt)
                self.assertEqual(list(self.directory.iterdir()), [])

    def test_incomplete_request_and_storage_failure_cleanup(self):
        body = gzip.compress(json.dumps(self.payload()).encode())
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            with self.assertRaises(ValueError):
                archive_stream(io.BytesIO(body[:-5]), len(body), "gzip", directory)
            self.assertEqual(list(directory.iterdir()), [])
            with patch("server.os.fsync", side_effect=OSError("fixture disk failure")):
                with self.assertRaises(OSError):
                    archive_stream(io.BytesIO(body), len(body), "gzip", directory)
            self.assertEqual(list(directory.iterdir()), [])

    def test_receiver_reads_bounded_chunks(self):
        class ChunkReader(io.BytesIO):
            def read(self, size=-1):
                if size < 0 or size > 64 * 1024:
                    raise AssertionError("Unbounded read")
                return super().read(size)
        raw = json.dumps(self.payload()).encode()
        with tempfile.TemporaryDirectory() as temp:
            report_id = archive_stream(ChunkReader(raw), len(raw), "identity", Path(temp))
            self.assertTrue((Path(temp) / f"{report_id}.json.gz").is_file())

    def test_deep_nesting_and_huge_number_are_rejected(self):
        for document in (b'{"conversationTrace":' + b'[' * 130 + b'0' + b']' * 130 + b'}',
                         b'{"schemaVersion":' + b'1' * 2000 + b'}'):
            status, receipt = self.submit(gzip.compress(document))
            self.assertEqual(status, 400)
            self.assertNotIn("reportId", receipt)
            self.assertEqual(list(self.directory.iterdir()), [])

    def test_logs_survive_archive_without_trace(self):
        with tempfile.TemporaryDirectory() as temp:
            logs = [dict(fileName="openagent.2026-10-14.jsonl", content="fixture error\n", truncated=True),
                    dict(fileName="openagent-host.jsonl.2026-10-14", content="fixture host\n", truncated=False)]
            payload = dict(ArchiveTests.payload(self), schemaVersion=2, logs=logs)
            report_id = archive(payload, Path(temp))
            record = read_report(Path(temp), report_id)
            self.assertEqual(record["logs"], logs)
            self.assertIsNone(record["conversationTrace"])
            empty_id = archive(dict(payload, logs=[]), Path(temp))
            self.assertEqual(read_report(Path(temp), empty_id)["logs"], [])

    def test_invalid_logs_never_create_receipt(self):
        log = dict(fileName="openagent.2026-10-14.jsonl", content="fixture\n", truncated=False)
        invalid_logs = [None, "invalid", [dict(log, fileName="../config.toml")],
                        [dict(log, fileName="openagent.2026-99-99.jsonl")],
                        [dict(log, content="x" * (1024 * 1024 + 1))],
                        [dict(log, content=1)], [dict(log, truncated="false")],
                        [log, log], [log] * 5,
                        [dict(log, fileName=f"openagent.2026-10-{day}.jsonl") for day in (12, 13, 14)]]
        with tempfile.TemporaryDirectory() as temp:
            for logs in invalid_logs:
                with self.subTest(logs_type=type(logs).__name__):
                    with self.assertRaises(ValueError):
                        archive(dict(self.payload(), schemaVersion=2, logs=logs), Path(temp))
            self.assertEqual(list(Path(temp).iterdir()), [])


if __name__ == "__main__":
    unittest.main()

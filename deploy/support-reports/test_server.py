import json
import tempfile
import unittest
from pathlib import Path
from server import archive


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
            records = [json.loads((directory / f"{key}.json").read_text(encoding="utf-8"))
                       for key in (first, second)]
            self.assertIsNone(records[0]["conversationTrace"])
            self.assertEqual(records[1]["conversationTrace"], payload["conversationTrace"])
            self.assertEqual(len(list(directory.glob("*.json"))), 2)

    def test_invalid_payload_never_creates_receipt(self):
        with tempfile.TemporaryDirectory() as temp:
            for invalid in ([], {}, dict(self.payload(), description=" "),
                            dict(self.payload(), conversationTrace="invalid")):
                with self.assertRaises(ValueError):
                    archive(invalid, Path(temp))
            self.assertEqual(list(Path(temp).iterdir()), [])

    def test_logs_survive_archive_without_trace(self):
        with tempfile.TemporaryDirectory() as temp:
            logs = [dict(fileName="openagent.2026-10-14.jsonl", content="fixture error\n", truncated=True),
                    dict(fileName="openagent-host.jsonl.2026-10-14", content="fixture host\n", truncated=False)]
            payload = dict(self.payload(), schemaVersion=2, logs=logs)
            report_id = archive(payload, Path(temp))
            record = json.loads((Path(temp) / f"{report_id}.json").read_text(encoding="utf-8"))
            self.assertEqual(record["logs"], logs)
            self.assertIsNone(record["conversationTrace"])
            empty_id = archive(dict(payload, logs=[]), Path(temp))
            self.assertEqual(json.loads((Path(temp) / f"{empty_id}.json").read_text())["logs"], [])

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

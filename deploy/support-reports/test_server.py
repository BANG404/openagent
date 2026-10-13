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


if __name__ == "__main__":
    unittest.main()

"""Authenticated, write-only support report archive; no payload access logs."""
import hmac
import json
import os
import tempfile
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

MAX_BYTES = 64 * 1024 * 1024


def archive(payload, directory):
    if not isinstance(payload, dict) or payload.get("schemaVersion") != 1:
        raise ValueError("Invalid report schema")
    description = payload.get("description")
    if not isinstance(description, str) or not description.strip() or len(description) > 20_000:
        raise ValueError("Invalid description")
    trace = payload.get("conversationTrace")
    if trace is not None and not isinstance(trace, dict):
        raise ValueError("Invalid trace")
    for key in ("runtimeVersion", "os", "arch"):
        if not isinstance(payload.get(key), str) or len(payload[key]) > 128:
            raise ValueError("Invalid metadata")
    report_id = str(uuid.uuid4())
    record = {key: payload[key] for key in
              ("schemaVersion", "description", "runtimeVersion", "os", "arch")}
    record.update(conversationTrace=trace, reportId=report_id,
                  receivedAt=datetime.now(timezone.utc).isoformat())
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=directory,
                                         prefix=".pending-", delete=False) as file:
            temporary = Path(file.name)
            json.dump(record, file, ensure_ascii=False)
            file.flush()
            os.fsync(file.fileno())
        os.replace(temporary, directory / f"{report_id}.json")
        temporary = None
        descriptor = os.open(directory, os.O_RDONLY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    return report_id


class Handler(BaseHTTPRequestHandler):
    token = ""
    directory = Path("/data")

    def log_message(self, *_args):
        pass

    def reply(self, status, payload=None):
        body = json.dumps(payload or {}).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self.reply(200 if self.path == "/health" else 404)

    def do_POST(self):
        self.connection.settimeout(120)
        if self.path != "/v1/support/reports":
            self.reply(404)
            return
        if not hmac.compare_digest(self.headers.get("Authorization", "").encode(),
                                   f"Bearer {self.token}".encode()):
            self.reply(401)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= MAX_BYTES:
                self.reply(413)
                return
            if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
                self.reply(415)
                return
            body = self.rfile.read(length)
            if len(body) != length:
                raise ValueError("Incomplete request")
            report_id = archive(json.loads(body), self.directory)
        except (ValueError, UnicodeError):
            self.reply(400)
            return
        except OSError:
            self.reply(503)
            return
        self.reply(201, {"reportId": report_id})


if __name__ == "__main__":
    Handler.token = Path(os.environ.get("TOKEN_FILE", "/run/secrets/ingest-token")).read_text().strip()
    if not Handler.token:
        raise SystemExit("Support ingestion credential is required")
    Handler.directory = Path(os.environ.get("REPORT_DIRECTORY", "/data"))
    ThreadingHTTPServer(("127.0.0.1", 19419), Handler).serve_forever()

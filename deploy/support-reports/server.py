"""Authenticated, write-only support report archive; no payload access logs."""
import hmac
import gzip
import io
import json
import os
import tempfile
import uuid
import threading
import ijson
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

MAX_BYTES = 64 * 1024 * 1024
MAX_LOG_BYTES = 1024 * 1024
MAX_EXPANDED_BYTES = 256 * 1024 * 1024
MAX_STRING_BYTES = 16 * 1024 * 1024
CHUNK_BYTES = 64 * 1024
UPLOAD_SLOTS = threading.BoundedSemaphore(2)


class ReportTooLarge(ValueError):
    pass


class LimitedInput(io.RawIOBase):
    """Read exactly a framed request without buffering it or reading the next one."""
    def __init__(self, source, length):
        self.source, self.remaining = source, length

    def readable(self):
        return True

    def readinto(self, buffer):
        if not self.remaining:
            return 0
        data = self.source.read(min(len(buffer), self.remaining))
        if not data:
            raise ValueError("Incomplete request")
        self.remaining -= len(data)
        buffer[:len(data)] = data
        return len(data)


class ArchiveInput:
    """Tee decompressed chunks to disk; bound size and JSON tokens before parsing."""
    def __init__(self, source, destination):
        self.source, self.destination = source, destination
        self.total = self.string_bytes = 0
        self.token_bytes = 0
        self.quoted = self.escaped = False

    def read(self, size):
        data = self.source.read(min(size, CHUNK_BYTES))
        self.total += len(data)
        if self.total > MAX_EXPANDED_BYTES:
            raise ReportTooLarge("Expanded report too large")
        # A single enormous string must not make the incremental parser allocate
        # the entire size budget. Count its encoded bytes across chunk boundaries.
        for byte in data:
            if self.quoted:
                self.string_bytes += 1
                if self.string_bytes > MAX_STRING_BYTES:
                    raise ReportTooLarge("JSON string too large")
                if self.escaped:
                    self.escaped = False
                elif byte == 92:
                    self.escaped = True
                elif byte == 34:
                    self.quoted = False
            elif byte == 34:
                self.quoted, self.string_bytes = True, 0
                self.token_bytes = 0
            elif byte in b" \t\r\n{}[]:,":
                self.token_bytes = 0
            else:
                self.token_bytes += 1
                if self.token_bytes > 1024:
                    raise ValueError("Invalid oversized JSON token")
        self.destination.write(data)
        return data


def validate_stream(source):
    """Validate the envelope and bounded logs without constructing the trace."""
    depth = 0
    key = None
    seen = set()
    metadata = {}
    logs_builder = None
    logs_depth = None
    log_count = 0
    log_keys = set()
    for event, value in ijson.basic_parse(source):
        if depth == 0 and event != "start_map":
            raise ValueError("Report must be an object")
        if depth == 1 and event == "map_key":
            key = value
            if key in seen or key not in {"schemaVersion", "description", "runtimeVersion",
                                         "os", "arch", "conversationTrace", "logs"}:
                raise ValueError("Invalid report field")
            seen.add(key)
        elif depth == 1 and event != "end_map":
            if key == "conversationTrace":
                if event not in ("null", "start_map"):
                    raise ValueError("Invalid trace")
            elif key == "logs":
                if event != "start_array":
                    raise ValueError("Invalid logs")
                logs_builder = ijson.ObjectBuilder()
                logs_depth = depth
            elif event not in ("string", "number"):
                raise ValueError("Invalid metadata")
            else:
                metadata[key] = value
        if logs_builder is not None:
            if depth == 2 and event != "end_array":
                if event != "start_map":
                    raise ValueError("Invalid log")
                log_count += 1
                log_keys = set()
                if log_count > 4:
                    raise ValueError("Too many logs")
            elif depth == 3:
                if event == "map_key":
                    if value in log_keys or value not in {"fileName", "content", "truncated"}:
                        raise ValueError("Invalid log field")
                    log_keys.add(value)
                elif event not in ("end_map", "string", "boolean"):
                    raise ValueError("Invalid log field")
            if event == "string" and len(value.encode("utf-8")) > MAX_LOG_BYTES:
                raise ValueError("Invalid log content")
            logs_builder.event(event, value)
            if event == "end_array" and depth == logs_depth + 1:
                validate_logs(logs_builder.value)
                logs_builder = None
        if event in ("start_map", "start_array"):
            depth += 1
            if depth > 128:
                raise ValueError("Excessive JSON nesting")
        elif event in ("end_map", "end_array"):
            depth -= 1
    if depth or metadata.get("schemaVersion") not in (1, 2):
        raise ValueError("Invalid report schema")
    if type(metadata.get("schemaVersion")) is not int:
        raise ValueError("Invalid report schema")
    if metadata["schemaVersion"] == 2 and "logs" not in seen:
        raise ValueError("Missing logs")
    description = metadata.get("description")
    if not isinstance(description, str) or not description.strip() or len(description) > 20_000:
        raise ValueError("Invalid description")
    for field in ("runtimeVersion", "os", "arch"):
        if not isinstance(metadata.get(field), str) or len(metadata[field]) > 128:
            raise ValueError("Invalid metadata")


def archive_stream(source, length, encoding, directory):
    """No receipt until a validated compressed archive has been durably committed."""
    framed = LimitedInput(source, length)
    reader = io.BufferedReader(framed, CHUNK_BYTES)
    decoded = gzip.GzipFile(fileobj=reader) if encoding == "gzip" else reader
    report_id = str(uuid.uuid4())
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = None
    final = directory / f"{report_id}.json.gz"
    try:
        with tempfile.NamedTemporaryFile(dir=directory, prefix=".pending-", delete=False) as file:
            temporary = Path(file.name)
            with gzip.GzipFile(fileobj=file, mode="wb", filename="", mtime=0) as compressed:
                prefix = json.dumps(dict(reportId=report_id,
                                         receivedAt=datetime.now(timezone.utc).isoformat()))
                compressed.write((prefix[:-1] + ', "report":').encode())
                validate_stream(ArchiveInput(decoded, compressed))
                if framed.remaining:
                    raise ValueError("Incomplete request")
                compressed.write(b"}")
            file.flush()
            os.fsync(file.fileno())
        os.replace(temporary, final)
        temporary = None
        descriptor = os.open(directory, os.O_RDONLY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
    except BaseException:
        final.unlink(missing_ok=True)
        raise
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    return report_id


def validate_logs(logs):
    if not isinstance(logs, list) or len(logs) > 4:
        raise ValueError("Invalid logs")
    names = set()
    families = [0, 0]
    for log in logs:
        if not isinstance(log, dict) or set(log) != {"fileName", "content", "truncated"}:
            raise ValueError("Invalid log")
        name = log["fileName"]
        if not isinstance(name, str) or name in names:
            raise ValueError("Invalid log name")
        if name.startswith("openagent.") and name.endswith(".jsonl"):
            family, date = 0, name[len("openagent."):-len(".jsonl")]
        elif name.startswith("openagent-host.jsonl."):
            family, date = 1, name[len("openagent-host.jsonl."):]
        else:
            raise ValueError("Invalid log name")
        parsed = datetime.strptime(date, "%Y-%m-%d")
        if parsed.strftime("%Y-%m-%d") != date:
            raise ValueError("Invalid log date")
        families[family] += 1
        if families[family] > 2:
            raise ValueError("Too many logs")
        names.add(name)
        if (not isinstance(log["content"], str)
                or len(log["content"].encode("utf-8")) > MAX_LOG_BYTES
                or not isinstance(log["truncated"], bool)):
            raise ValueError("Invalid log content")
    return logs


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
        self.close_connection = True
        if self.path != "/v1/support/reports":
            self.reply(404)
            return
        if not hmac.compare_digest(self.headers.get("Authorization", "").encode(),
                                   f"Bearer {self.token}".encode()):
            self.reply(401)
            return
        if not UPLOAD_SLOTS.acquire(blocking=False):
            self.reply(503)
            return
        try:
            if self.headers.get("Transfer-Encoding"):
                self.reply(400)
                return
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= MAX_BYTES:
                self.reply(413)
                return
            if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
                self.reply(415)
                return
            encoding = self.headers.get("Content-Encoding", "identity").lower()
            if encoding not in ("identity", "gzip"):
                self.reply(415)
                return
            report_id = archive_stream(self.rfile, length, encoding, self.directory)
        except ReportTooLarge:
            self.reply(413)
            return
        except (ValueError, UnicodeError, EOFError, gzip.BadGzipFile, ijson.JSONError):
            self.reply(400)
            return
        except OSError:
            self.reply(503)
            return
        finally:
            UPLOAD_SLOTS.release()
        self.reply(201, {"reportId": report_id})


if __name__ == "__main__":
    Handler.token = Path(os.environ.get("TOKEN_FILE", "/run/secrets/ingest-token")).read_text().strip()
    if not Handler.token:
        raise SystemExit("Support ingestion credential is required")
    Handler.directory = Path(os.environ.get("REPORT_DIRECTORY", "/data"))
    ThreadingHTTPServer(("127.0.0.1", 19419), Handler).serve_forever()

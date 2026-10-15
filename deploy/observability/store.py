"""Bounded archive indexing; source archives are never modified."""
import gzip
import hashlib
import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

import ijson

MAX_ITEM = 256 * 1024


def encoded(value):
    return json.dumps(value, ensure_ascii=False, default=str)


def opened(path):
    return gzip.open(path, "rb") if path.name.endswith(".gz") else path.open("rb")


def attributes(items):
    def value(item):
        for key in ("stringValue", "intValue", "doubleValue", "boolValue"):
            if key in item:
                return item[key]
        return item
    return {item["key"]: value(item.get("value", {})) for item in items if "key" in item}


def bounded_items(source, target):
    """Stop building an oversized object while continuing to skip its events."""
    active, depth, size, builder = False, 0, 0, None
    for prefix, event, value in ijson.parse(source):
        if not active:
            if prefix != target or event in ("end_map", "end_array", "map_key"):
                continue
            active, depth, size = True, 0, 0
            builder = ijson.ObjectBuilder()
        if event in ("string", "map_key"):
            size += len(value.encode("utf-8")) + 3
        else:
            size += 16
        if size > MAX_ITEM:
            builder = None
        if builder is not None:
            builder.event(event, value)
        if event in ("start_map", "start_array"):
            depth += 1
        elif event in ("end_map", "end_array"):
            depth -= 1
        if depth == 0:
            item = builder.value if builder is not None else None
            if builder is None or len(encoded(item).encode()) > MAX_ITEM:
                item = {"oversized": True, "message": "Download the archive for the complete item"}
            yield item
            active = False


class Store:
    def __init__(self, database, archive, reports):
        self.database, self.archive, self.reports = Path(database), Path(archive), Path(reports)
        self.database.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with self.connect() as db:
            db.executescript("""
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS sources
                    (path TEXT PRIMARY KEY, stamp TEXT, offset INTEGER);
                CREATE TABLE IF NOT EXISTS logs
                    (id TEXT PRIMARY KEY, time TEXT, service TEXT, version TEXT,
                     severity TEXT, body TEXT, record TEXT);
                CREATE INDEX IF NOT EXISTS logs_time ON logs(time);
                CREATE TABLE IF NOT EXISTS reports
                    (id TEXT PRIMARY KEY, path TEXT, stamp TEXT, received TEXT,
                     description TEXT, version TEXT, os TEXT, arch TEXT,
                     trace INTEGER, sections TEXT, logs TEXT);
                CREATE INDEX IF NOT EXISTS reports_received ON reports(received);
            """)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.database, timeout=15)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def refresh(self):
        failures = 0
        for path in sorted(self.archive.glob("logs*.json*")):
            if path.is_file() and not path.is_symlink():
                try:
                    self.index_logs(path)
                except (OSError, ValueError, EOFError, ijson.JSONError):
                    failures += 1
        for path in sorted(self.reports.glob("*.json*")):
            if path.is_file() and not path.is_symlink():
                try:
                    self.index_report(path)
                except (OSError, ValueError, EOFError, ijson.JSONError):
                    failures += 1
        # An explicit operator removal must disappear from the read index too.
        with self.connect() as db:
            for row in db.execute("SELECT id,path FROM reports").fetchall():
                if not Path(row["path"]).is_file():
                    db.execute("DELETE FROM reports WHERE id=?", (row["id"],))
        return failures

    def index_logs(self, path):
        stat = path.stat()
        stamp = f"{stat.st_dev}:{stat.st_ino}:{stat.st_mtime_ns}:{stat.st_size}"
        with self.connect() as db:
            previous = db.execute("SELECT stamp,offset FROM sources WHERE path=?", (str(path),)).fetchone()
            if previous and previous["stamp"] == stamp:
                return
            offset = 0
            identity = f"{stat.st_dev}:{stat.st_ino}:"
            if (previous and previous["stamp"].startswith(identity)
                    and previous["offset"] <= stat.st_size and not path.name.endswith(".gz")):
                offset = previous["offset"]
            with opened(path) as source:
                source.seek(offset)
                while True:
                    # Collector segments are 25 MiB; an unfinished final line is retried.
                    line = source.readline(32 * 1024 * 1024 + 1)
                    if not line:
                        break
                    if len(line) > 32 * 1024 * 1024:
                        raise ValueError("Oversized collector record")
                    if not line.endswith(b"\n"):
                        break
                    envelope = json.loads(line)
                    for resource in envelope.get("resourceLogs", []):
                        attrs = attributes(resource.get("resource", {}).get("attributes", []))
                        for scope in resource.get("scopeLogs", []):
                            for record in scope.get("logRecords", []):
                                nanos = int(record.get("timeUnixNano") or record.get("observedTimeUnixNano") or 0)
                                time = datetime.fromtimestamp(nanos / 1e9, timezone.utc).isoformat()
                                body = record.get("body", {})
                                body = body.get("stringValue", encoded(body))
                                detail = {"resource": attrs, "scope": scope.get("scope", {}), **record}
                                text = encoded(detail)
                                key = hashlib.sha256(text.encode()).hexdigest()
                                # Metadata-only diagnostics are small; expose large records via preview.
                                if len(text.encode()) > MAX_ITEM:
                                    text = encoded({"preview": text[:16000], "truncated": True})
                                db.execute("INSERT OR IGNORE INTO logs VALUES(?,?,?,?,?,?,?)", (
                                    key, time, str(attrs.get("service.name", "")),
                                    str(attrs.get("service.version", "")),
                                    record.get("severityText", ""), str(body)[:16000], text))
                    offset = source.tell()
            db.execute("INSERT OR REPLACE INTO sources VALUES(?,?,?)", (str(path), stamp, offset))

    def index_report(self, path):
        stat = path.stat()
        stamp = f"{stat.st_mtime_ns}:{stat.st_size}"
        report_id = path.name.removesuffix(".gz").removesuffix(".json")
        with self.connect() as db:
            previous = db.execute("SELECT stamp FROM reports WHERE id=?", (report_id,)).fetchone()
            if previous and previous["stamp"] == stamp:
                return
            meta, sections, logs = {}, [], []
            # Both historical flat and current wrapped archives are deployed.
            with opened(path) as source:
                for prefix, event, value in ijson.parse(source):
                    key = prefix.removeprefix("report.")
                    if event in ("string", "number") and key in (
                            "reportId", "receivedAt", "description", "runtimeVersion", "os", "arch"):
                        meta[key] = str(value)
                    if key.startswith("conversationTrace.") and key.count(".") == 1:
                        if event in ("start_array", "start_map", "string", "number", "boolean", "null"):
                            section = key.split(".")[1]
                            if section not in sections:
                                sections.append(section)
                    if key == "logs.item" and event == "start_map":
                        logs.append({})
                    if key in ("logs.item.fileName", "logs.item.truncated"):
                        if key.endswith("fileName") and event == "string":
                            logs[-1]["fileName"] = value
                        elif key.endswith("truncated") and event == "boolean" and logs:
                            logs[-1]["truncated"] = value
            if meta.get("reportId", report_id) != report_id:
                raise ValueError("Mismatched report ID")
            received = meta.get("receivedAt", "")
            if received:
                received = datetime.fromisoformat(received.replace("Z", "+00:00")).astimezone(timezone.utc).isoformat()
            db.execute("INSERT OR REPLACE INTO reports VALUES(?,?,?,?,?,?,?,?,?,?,?)", (
                report_id, str(path), stamp, received,
                meta.get("description", ""), meta.get("runtimeVersion", ""),
                meta.get("os", ""), meta.get("arch", ""), bool(sections), encoded(sections), encoded(logs)))

    def report(self, report_id):
        with self.connect() as db:
            row = db.execute("SELECT * FROM reports WHERE id=?", (report_id,)).fetchone()
        if row is None:
            raise FileNotFoundError()
        return dict(row)

    def report_path(self, row):
        path = Path(row["path"])
        if path.is_symlink() or path.resolve().parent != self.reports.resolve():
            raise FileNotFoundError()
        return path

    def report_prefix(self, path):
        with opened(path) as source:
            for prefix, event, _ in ijson.parse(source):
                if prefix == "report" and event == "start_map":
                    return "report."
                if prefix == "schemaVersion":
                    return ""
        raise ValueError("Invalid archive")

    def trace_page(self, row, section, offset, limit):
        path = self.report_path(row)
        prefix = self.report_prefix(path) + "conversationTrace." + section
        is_array = False
        with opened(path) as source:
            for key, event, _ in ijson.parse(source):
                if key == prefix:
                    is_array = event == "start_array"
                    break
        items, more = [], False
        with opened(path) as source:
            for index, item in enumerate(bounded_items(source, prefix + (".item" if is_array else ""))):
                if index < offset:
                    continue
                if len(items) == limit:
                    more = True
                    break
                items.append(item)
        return {"items": items, "nextOffset": offset + len(items) if more else None}

    def log_page(self, row, name, offset, limit):
        path = self.report_path(row)
        prefix = self.report_prefix(path)
        # Receiver bounds attachments to four 1 MiB strings.
        with opened(path) as source:
            for item in ijson.items(source, prefix + "logs.item"):
                if item.get("fileName") == name:
                    content = item.get("content", "")
                    end = min(len(content), offset + limit)
                    return {"fileName": name, "content": content[offset:end],
                            "truncated": bool(item.get("truncated")),
                            "nextOffset": end if end < len(content) else None}
        raise FileNotFoundError()

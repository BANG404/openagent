"""Authenticated read-only diagnostics API and browser console."""
import base64
import hmac
import json
import os
import re
import shutil
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

from store import Store, encoded

ROOT = Path(__file__).parent
SLOTS = threading.BoundedSemaphore(4)
PREFIX = "/observe"
UUID = re.compile(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\Z")


def page(args, maximum=100, maximum_offset=1000000):
    offset = int(args.get("offset", "0"))
    limit = int(args.get("limit", "50"))
    if not 0 <= offset <= maximum_offset or not 1 <= limit <= maximum:
        raise ValueError("Invalid pagination")
    return offset, limit


def summary(row):
    return {"reportId": row["id"], "receivedAt": row["received"],
            "description": row["description"], "runtimeVersion": row["version"],
            "os": row["os"], "arch": row["arch"], "hasTrace": bool(row["trace"]),
            "traceSections": json.loads(row["sections"]), "logs": json.loads(row["logs"])}


class Handler(BaseHTTPRequestHandler):
    store = None
    token = ""
    username = "viewer"
    password = ""
    index_status = {"lastIndexedAt": None, "archiveErrors": 0, "indexError": False}

    def log_message(self, *_args):
        # Report content, credentials and query text must not enter operational logs.
        pass

    def headers_for(self, status, kind, length):
        self.send_response(status)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(length))
        self.send_header("Cache-Control", "no-store, no-transform")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'")
        self.send_header("X-Frame-Options", "DENY")

    def reply(self, status, value):
        body = encoded(value).encode()
        self.headers_for(status, "application/json; charset=utf-8", len(body))
        if status == 401:
            self.send_header("WWW-Authenticate", 'Basic realm="OpenAgent diagnostics", charset="UTF-8"')
        self.end_headers()
        self.wfile.write(body)

    def authorized(self):
        authorization = self.headers.get("Authorization", "")
        if authorization.startswith("Bearer "):
            return hmac.compare_digest(authorization[7:].encode(), self.token.encode())
        if authorization.startswith("Basic "):
            try:
                raw = base64.b64decode(authorization[6:], validate=True)
                return hmac.compare_digest(raw, f"{self.username}:{self.password}".encode())
            except ValueError:
                return False
        return False

    def do_GET(self):
        self.connection.settimeout(30)
        if self.path == "/health":
            self.reply(200, {"status": "ok"})
            return
        if not self.authorized():
            self.reply(401, {"error": "Authentication required"})
            return
        if not SLOTS.acquire(blocking=False):
            self.reply(503, {"error": "Busy; retry shortly"})
            return
        try:
            self.get_route()
        except (ValueError, OverflowError):
            self.reply(400, {"error": "Invalid query parameters"})
        except FileNotFoundError:
            self.reply(404, {"error": "Not found"})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            self.reply(503, {"error": "Archive temporarily unavailable"})
        finally:
            SLOTS.release()

    def get_route(self):
        url = urlsplit(self.path)
        path = unquote(url.path)
        args = {k: v[-1] for k, v in parse_qs(url.query).items()}
        if path == PREFIX + "/favicon.ico":
            self.headers_for(204, "image/x-icon", 0)
            self.end_headers()
            return
        static = {PREFIX: "index.html", PREFIX + "/": "index.html",
                  PREFIX + "/app.js": "app.js", PREFIX + "/style.css": "style.css",
                  PREFIX + "/agent.py": "agent.py", PREFIX + "/api": "api.json"}
        if path in static:
            name = static[path]
            body = (ROOT / name).read_bytes()
            kind = {"html": "text/html", "js": "text/javascript", "css": "text/css",
                    "py": "text/plain", "json": "application/json"}[name.split(".")[-1]]
            self.headers_for(200, kind + "; charset=utf-8", len(body))
            self.end_headers()
            self.wfile.write(body)
        elif path == PREFIX + "/api/status":
            with self.store.connect() as db:
                counts = {name: db.execute(f"SELECT count(*) FROM {name}").fetchone()[0]
                          for name in ("logs", "reports")}
            self.reply(200, {**counts, **self.index_status})
        elif path in (PREFIX + "/api/logs", PREFIX + "/api/reports"):
            self.list_route(path.endswith("/reports"), args)
        elif path.startswith(PREFIX + "/api/reports/"):
            self.report_route(path[len(PREFIX + "/api/reports/"):].split("/"), args)
        else:
            raise FileNotFoundError()

    def list_route(self, reports, args):
        offset, limit = page(args)
        where, values = [], []
        table, time_field = ("reports", "received") if reports else ("logs", "time")
        filters = {"version": "version"} if reports else {"version": "version", "service": "service", "severity": "severity"}
        for key, field in filters.items():
            if args.get(key):
                where.append(f"{field}=?")
                values.append(args[key][:256])
        for key, operator in (("start", ">="), ("end", "<=")):
            if args.get(key):
                parsed = datetime.fromisoformat(args[key].replace("Z", "+00:00"))
                if parsed.tzinfo is None:
                    raise ValueError("Timezone required")
                where.append(f"{time_field}{operator}?")
                values.append(parsed.astimezone(timezone.utc).isoformat())
        if args.get("q"):
            if len(args["q"]) > 500:
                raise ValueError("Query too long")
            pattern = "%" + args["q"].replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
            if reports:
                where.append("(description LIKE ? ESCAPE '\\' OR id=?)")
                values.extend((pattern, args["q"]))
            else:
                where.append("record LIKE ? ESCAPE '\\'")
                values.append(pattern)
        sql = f"SELECT * FROM {table}" + (" WHERE " + " AND ".join(where) if where else "")
        with self.store.connect() as db:
            deadline = time.monotonic() + 5
            db.set_progress_handler(lambda: int(time.monotonic() > deadline), 10000)
            rows = db.execute(sql + f" ORDER BY {time_field} DESC,id DESC LIMIT ? OFFSET ?", values + [limit + 1, offset]).fetchall()
        items = [summary(row) if reports else {"id": row["id"], "time": row["time"],
                 "service": row["service"], "version": row["version"], "severity": row["severity"],
                 "body": row["body"], "record": json.loads(row["record"])} for row in rows[:limit]]
        self.reply(200, {"items": items, "nextOffset": offset + limit if len(rows) > limit else None})

    def report_route(self, parts, args):
        if not UUID.fullmatch(parts[0]):
            raise FileNotFoundError()
        row = self.store.report(parts[0])
        if len(parts) == 1:
            self.reply(200, summary(row))
        elif parts[1:] == ["logs"]:
            offset, limit = page({**args, "limit": args.get("limit", "16000")}, 64000, 1048576)
            self.reply(200, self.store.log_page(row, args.get("name", ""), offset, limit))
        elif parts[1:] == ["trace"]:
            section = args.get("section", "")
            if section not in json.loads(row["sections"]):
                raise ValueError("Unknown trace section")
            offset, limit = page({**args, "limit": args.get("limit", "5")}, 20)
            self.reply(200, self.store.trace_page(row, section, offset, limit))
        elif parts[1:] == ["archive"]:
            path = self.store.report_path(row)
            with path.open("rb") as source:
                self.headers_for(200, "application/gzip" if path.suffix == ".gz" else "application/json", path.stat().st_size)
                self.send_header("Content-Disposition", f'attachment; filename="{path.name}"')
                self.end_headers()
                shutil.copyfileobj(source, self.wfile, 65536)
        else:
            raise FileNotFoundError()

    def reject_write(self):
        self.close_connection = True
        self.reply(405 if self.authorized() else 401, {"error": "Read-only API"})

    do_POST = do_PUT = do_PATCH = do_DELETE = do_OPTIONS = reject_write


class Server(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 16


def index_loop(store, stop):
    while not stop.is_set():
        try:
            failures = store.refresh()
            Handler.index_status = {"lastIndexedAt": datetime.now(timezone.utc).isoformat(),
                                    "archiveErrors": failures, "indexError": False}
        except Exception:
            Handler.index_status = {**Handler.index_status, "indexError": True}
        stop.wait(10)


def main():
    config = json.loads(Path(os.environ["OBSERVE_CREDENTIAL_FILE"]).read_text())
    Handler.token, Handler.username, Handler.password = config["token"], config["username"], config["password"]
    if min(len(Handler.token), len(Handler.password)) < 32:
        raise ValueError("Independent strong credentials required")
    Handler.store = Store(os.environ["OBSERVE_DATABASE"], os.environ["OBSERVE_LOG_DIRECTORY"], os.environ["OBSERVE_REPORT_DIRECTORY"])
    threading.Thread(target=index_loop, args=(Handler.store, threading.Event()), daemon=True).start()
    Server(("127.0.0.1", int(os.environ.get("OBSERVE_PORT", "19420"))), Handler).serve_forever()


if __name__ == "__main__":
    main()

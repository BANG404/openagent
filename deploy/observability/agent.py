"""Standard-library CLI. Credentials stay in environment variables or private files."""
import argparse
import json
import os
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Read OpenAgent diagnostics and support archives")
    parser.add_argument("command", choices=("status", "logs", "reports", "report", "report-logs", "trace"))
    parser.add_argument("--report-id")
    parser.add_argument("--section")
    parser.add_argument("--name")
    parser.add_argument("--query", dest="q")
    parser.add_argument("--service")
    parser.add_argument("--version")
    parser.add_argument("--severity")
    parser.add_argument("--start", help="ISO 8601 timestamp including timezone")
    parser.add_argument("--end")
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()
    base = os.environ.get("OPENAGENT_OBSERVE_URL", "https://openagentlogs.ibat.ac.cn/observe").rstrip("/")
    url = urlsplit(base)
    if url.scheme != "https" and not (url.scheme == "http" and url.hostname in ("127.0.0.1", "localhost")):
        parser.error("Use HTTPS, or HTTP on an SSH-forwarded loopback address")
    token = os.environ.get("OPENAGENT_OBSERVE_TOKEN", "")
    token_file = Path(os.environ.get("OPENAGENT_OBSERVE_TOKEN_FILE", str(Path.home() / ".config/openagent-observe/token")))
    if not token and token_file.is_file():
        token = token_file.read_text().strip()
    if not token:
        parser.error("Set OPENAGENT_OBSERVE_TOKEN or OPENAGENT_OBSERVE_TOKEN_FILE")
    path = {"report": "reports", "report-logs": "reports", "trace": "reports"}.get(args.command, args.command)
    if args.command in ("report", "report-logs", "trace"):
        if not args.report_id:
            parser.error("--report-id is required")
        import re
        if not re.fullmatch(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}", args.report_id):
            parser.error("Invalid report UUID")
        path += "/" + args.report_id
        if args.command == "report-logs":
            if not args.name:
                parser.error("--name is required")
            path += "/logs"
        elif args.command == "trace":
            if not args.section:
                parser.error("--section is required")
            path += "/trace"
    query = {k: v for k, v in vars(args).items() if v is not None and k not in ("command", "report_id")}
    # The existing public tunnel rejects Python's default User-Agent.
    request = Request(base + "/api/" + path + "?" + urlencode(query), headers={"Authorization": "Bearer " + token, "User-Agent": ""})
    try:
        with urlopen(request, timeout=30) as response:
            print(json.dumps(json.load(response), ensure_ascii=False, indent=2))
    except HTTPError as error:
        print(f"Query failed: HTTP {error.code}", file=sys.stderr)
        sys.exit(1)
    except URLError:
        print("Query endpoint unavailable", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

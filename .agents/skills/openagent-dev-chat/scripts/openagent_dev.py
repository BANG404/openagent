#!/usr/bin/env python3
"""Drive a running OpenAgent debug instance without dumping its full prompt context."""

import argparse, json, os, sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")
    sys.stderr.reconfigure(encoding="utf-8", errors="backslashreplace")
except AttributeError:
    pass


def manifest_path():
    if os.environ.get("OPENAGENT_CONFIG_DIR"):
        return Path(os.environ["OPENAGENT_CONFIG_DIR"]) / "dev-api.json"
    if os.name == "nt": root = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
    elif sys.platform == "darwin": root = Path.home() / "Library" / "Application Support"
    else: root = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
    return root / "openagent" / "dev-api.json"


class ApiFailure(Exception):
    def __init__(self, payload): self.payload = payload


def call(manifest, method, path, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    headers = {"Authorization": f"Bearer {manifest['token']}"}
    if data: headers["Content-Type"] = "application/json"
    try:
        with urlopen(Request(manifest["base_url"] + path, data=data, headers=headers, method=method), timeout=600) as response:
            return json.load(response)
    except HTTPError as error:
        try: detail = json.loads(error.read())
        except json.JSONDecodeError: detail = {"error": "http_error", "message": f"HTTP {error.code}"}
        raise ApiFailure(detail) from error
    except URLError as error:
        raise ApiFailure({"error": "unavailable", "message": "Cannot reach the OpenAgent dev API.", "next_action": "Start `bun tauri dev` and retry."}) from error


def parser():
    common = argparse.ArgumentParser(add_help=False)
    output = common.add_mutually_exclusive_group()
    output.add_argument("--compact", action="store_true", help="one-line JSON (default)")
    output.add_argument("--json", action="store_true", help="pretty JSON for machine parsing")
    output.add_argument("--text", action="store_true", help="human-readable summary")
    common.add_argument("--full", action="store_true", help="include raw checkpoint and trace payloads")
    root = argparse.ArgumentParser(description=__doc__, parents=[common])
    sub = root.add_subparsers(dest="command", required=True)
    sub.add_parser("health", parents=[common])
    sub.add_parser("commands", parents=[common])
    resolve = sub.add_parser("resolve", parents=[common]); resolve.add_argument("input")
    sub.add_parser("context-compaction", parents=[common])
    for name in ("chat", "goal"):
        item = sub.add_parser(name, parents=[common]); item.add_argument("text"); item.add_argument("--conv-id"); item.add_argument("--parent-checkpoint-id"); item.add_argument("--include-traces", action="store_true"); item.add_argument("--include-messages", action="store_true"); item.add_argument("--include-prompt", action="store_true"); item.add_argument("--include-tools", action="store_true")
    for name in ("conversation", "interrupts", "traces", "checkpoints", "diagnose", "renderability"):
        item = sub.add_parser(name, parents=[common]); item.add_argument("conv_id")
        if name in ("traces", "checkpoints"): item.add_argument("--summary", action="store_true", help="return the compact conversation state (default)")
    for name in ("approve", "deny"):
        item = sub.add_parser(name, parents=[common]); item.add_argument("conv_id"); item.add_argument("interrupt_id")
    answer = sub.add_parser("answer"); answer.add_argument("conv_id"); answer.add_argument("interrupt_id"); answer.add_argument("--json", dest="response", required=True)
    resume = sub.add_parser("resume"); resume.add_argument("conv_id"); resume.add_argument("interrupt_id"); resume.add_argument("--json", dest="response", required=True)
    replace = sub.add_parser("replace-checkpoint", parents=[common])
    replace.add_argument("conv_id"); replace.add_argument("checkpoint_id")
    data = replace.add_mutually_exclusive_group(required=True)
    data.add_argument("--data", help="complete CheckpointData JSON object")
    data.add_argument("--data-file", help="UTF-8 file containing complete CheckpointData JSON")
    replace.add_argument("--confirm-checkpoint", required=True, help="must repeat checkpoint_id to permit replacement")
    return root


def render(result, args):
    if getattr(args, "text", False):
        if isinstance(result, dict):
            print(f"conversation: {result.get('conv_id', '-')}; phase: {result.get('phase', result.get('status', '-'))}")
            if result.get("assistant_text"): print(result["assistant_text"])
            if result.get("interrupt"): print("interrupt:", result["interrupt"]["id"], result["interrupt"]["kind"])
            for warning in result.get("warnings", []): print("warning:", warning)
        else: print(json.dumps(result, ensure_ascii=False, indent=2))
    elif getattr(args, "json", False): print(json.dumps(result, ensure_ascii=False, indent=2))
    else: print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))


def main():
    args = parser().parse_args()
    try: manifest = json.loads(manifest_path().read_text(encoding="utf-8"))
    except OSError as error: raise SystemExit(f"OpenAgent dev API is unavailable: {error}")
    try:
        if args.command == "health": result = call(manifest, "GET", "/v1/health")
        elif args.command == "commands": result = call(manifest, "GET", "/v1/commands")
        elif args.command == "resolve": result = call(manifest, "POST", "/v1/input/resolve", {"text": args.input})
        elif args.command == "context-compaction": result = call(manifest, "POST", "/v1/diagnostics/context-compaction")
        elif args.command in ("chat", "goal"):
            payload = {"text" if args.command == "chat" else "objective": args.text}
            if args.conv_id: payload["conv_id"] = args.conv_id
            if args.parent_checkpoint_id: payload["parent_checkpoint_id"] = args.parent_checkpoint_id
            result = call(manifest, "POST", "/v1/chat" if args.command == "chat" else "/v1/goals", payload)
        elif args.command in ("conversation", "interrupts", "diagnose", "renderability"):
            suffix = "state" if args.command == "conversation" else args.command
            result = call(manifest, "GET", f"/v1/conversations/{args.conv_id}/{suffix}")
        elif args.command in ("traces", "checkpoints"):
            result = call(manifest, "GET", f"/v1/{args.command}/{args.conv_id}") if args.full else call(manifest, "GET", f"/v1/conversations/{args.conv_id}/state")
        elif args.command in ("approve", "deny"):
            result = call(manifest, "POST", f"/v1/conversations/{args.conv_id}/interrupts/{args.interrupt_id}/{args.command}")
        elif args.command == "replace-checkpoint":
            raw_data = args.data if args.data is not None else Path(args.data_file).read_text(encoding="utf-8")
            data = json.loads(raw_data)
            result = call(manifest, "PUT", f"/v1/conversations/{args.conv_id}/checkpoints/{args.checkpoint_id}", {
                "data": data, "confirm_checkpoint_id": args.confirm_checkpoint,
            })
        else:
            json.loads(args.response)
            result = call(manifest, "POST", "/v1/interrupts", {"conv_id": args.conv_id, "interrupt_id": args.interrupt_id, "response": args.response})
        if args.command in ("chat", "goal") and (args.full or args.include_traces or args.include_prompt or args.include_tools):
            result["traces"] = call(manifest, "GET", f"/v1/traces/{result['conv_id']}")
        if args.command in ("chat", "goal") and (args.full or args.include_messages):
            result["checkpoints"] = call(manifest, "GET", f"/v1/checkpoints/{result['conv_id']}")
    except ApiFailure as error:
        render(error.payload, args); raise SystemExit(1)
    except json.JSONDecodeError as error:
        render({"error": "invalid_json", "message": str(error), "next_action": "Pass a JSON object to --json."}, args); raise SystemExit(2)
    render(result, args)


if __name__ == "__main__": main()

#!/usr/bin/env bash
set -euo pipefail
# Existing provider credentials are shell-format; never use set -x or echo them.
set -a
source "$HOME/.codex/credentials.env"
set +a
exec /usr/bin/python3 "$HOME/.local/share/openagent-codex/controller/worker.py"

#!/usr/bin/env bash
set -euo pipefail

readonly PLAYWRIGHT_CLI_PACKAGE="@playwright/cli@0.1.19"
readonly PLAYWRIGHT_BROWSER_PACKAGE="playwright@1.63.0-alpha-2026-08-31"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../../../.." && pwd)"

if [[ -z "${PLAYWRIGHT_BROWSERS_PATH:-}" ]]; then
  export PLAYWRIGHT_BROWSERS_PATH="${XDG_DATA_HOME:-${HOME}/.local/share}/openagent/playwright"
fi

if [[ -z "${PLAYWRIGHT_MCP_OUTPUT_DIR:-}" ]]; then
  export PLAYWRIGHT_MCP_OUTPUT_DIR="${TMPDIR:-/tmp}/codex-playwright"
fi
mkdir -p "${PLAYWRIGHT_MCP_OUTPUT_DIR}"

has_session_flag="false"
has_config_flag="false"
for arg in "$@"; do
  case "$arg" in
    --session|--session=*)
      has_session_flag="true"
      ;;
    --config|--config=*)
      has_config_flag="true"
      ;;
  esac
done

if [[ "${1:-}" == "install-browser" ]]; then
  mkdir -p "${PLAYWRIGHT_BROWSERS_PATH}"
  if command -v bunx >/dev/null 2>&1; then
    exec bunx --package "${PLAYWRIGHT_BROWSER_PACKAGE}" playwright install chromium
  elif command -v npx >/dev/null 2>&1; then
    exec npx --yes --package "${PLAYWRIGHT_BROWSER_PACKAGE}" playwright install chromium
  fi
  echo "Error: Bun/Bunx or Node/npx is required to install Chromium." >&2
  exit 1
fi

if command -v playwright-cli >/dev/null 2>&1; then
  cmd=(playwright-cli)
elif command -v bunx >/dev/null 2>&1; then
  cmd=(bunx --package "${PLAYWRIGHT_CLI_PACKAGE}" playwright-cli)
elif command -v npx >/dev/null 2>&1; then
  cmd=(npx --yes --package "${PLAYWRIGHT_CLI_PACKAGE}" playwright-cli)
else
  echo "Error: playwright-cli, Bun/Bunx, or Node/npx is required." >&2
  exit 1
fi
if [[ "${has_session_flag}" != "true" && -n "${PLAYWRIGHT_CLI_SESSION:-}" ]]; then
  cmd+=(--session "${PLAYWRIGHT_CLI_SESSION}")
fi
cmd+=("$@")
if [[ "${has_config_flag}" != "true" && ("${1:-}" == "open" || "${1:-}" == "attach") ]]; then
  cmd+=(--config "${repo_root}/.playwright/cli.config.json")
fi

exec "${cmd[@]}"

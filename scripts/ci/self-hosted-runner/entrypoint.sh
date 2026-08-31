#!/usr/bin/env bash
set -euo pipefail

runner_root=/runner

materialize_runner() {
  if [[ ! -x "$runner_root/run.sh" ]]; then
    mkdir -p "$runner_root"
    cp -a /opt/actions-runner/. "$runner_root/"
  fi
}

configure_runner() {
  : "${RUNNER_REPOSITORY:?RUNNER_REPOSITORY is required}"
  : "${RUNNER_TOKEN:?RUNNER_TOKEN is required for configuration}"
  : "${RUNNER_NAME:?RUNNER_NAME is required}"
  : "${RUNNER_LABELS:?RUNNER_LABELS is required}"

  if [[ -f "$runner_root/.runner" ]]; then
    echo "Runner is already configured."
    return
  fi

  "$runner_root/config.sh" \
    --url "$RUNNER_REPOSITORY" \
    --token "$RUNNER_TOKEN" \
    --name "$RUNNER_NAME" \
    --labels "$RUNNER_LABELS" \
    --work _work \
    --unattended \
    --replace
}

materialize_runner
cd "$runner_root"

case "${1:-run}" in
  configure)
    configure_runner
    ;;
  run)
    if [[ ! -f .runner ]]; then
      echo "Runner is not configured. Run the one-shot configure command first." >&2
      exit 1
    fi
    exec ./run.sh
    ;;
  *)
    exec "$@"
    ;;
esac

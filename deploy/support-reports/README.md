# Support report receiver

This write-only service stores explicitly submitted Help reports separately from
OTLP diagnostic logs. It accepts 64 MiB and returns a UUID receipt only after
atomic replacement and file/directory fsync. Payloads and credentials are never
logged. There is no public list/read endpoint; report files have mode 0600.

## Current server deployment

Deploy this directory beneath `~/Document/opentelemetry/`, create `data/` owned by
UID 1000 with mode 0700, and run `python3 -m unittest test_server.py` on Linux.
The current server uses installed Python 3.12 and the included systemd user units;
its Docker registry mirror is unavailable. Copy both `.service` files into
`~/.config/systemd/user/`, enable user lingering (`loginctl enable-linger`), and
run `systemctl --user daemon-reload`. The receiver uses the existing ingestion
token file; never copy it into source, an image or command arguments.

The existing public tunnel targets loopback 4318 directly. Before starting the
ingress unit, back up the collector's `compose.yaml` and change only its HTTP
mapping from `127.0.0.1:4318:4318` to `127.0.0.1:14318:4318`. Recreate only
`collector` with `docker compose up -d --pull never collector`, wait for its
health endpoint, then enable/start `openagent-support-reports` and
`openagent-telemetry-ingress` with `systemctl --user enable --now`.

`ingress.Caddyfile` binds loopback 4318 for all Host headers (tunnels may rewrite
Host), routes `/v1/support/reports` to 19419, and forwards every other path to
collector 14318. It has no access logging or admin endpoint. Do not modify system
Caddy sites or TLS settings. Startup may briefly interrupt HTTP ingestion;
existing OTLP retry handles this. Port 4317 and exporter/archive configuration
stay unchanged. Both units restart on failure and survive SSH logout and reboot.

## Verification and operations

Check local `/health`, unauthorized POST (401), malformed JSON (400), oversized
requests (413), and authenticated synthetic description-only/trace reports (201)
through the public HTTPS hostname. Verify each returned UUID file under `data/`
and verify OTLP still authenticates and archives synthetic logs. Storage failures
return 503; no partial write receives a success receipt.

Reports contain descriptions, optional complete traces, environment fields and
server receipt timestamps. Operators own backups and retention; complete reports
are retained without automatic deletion. Investigate by UUID with authorized
server access. Never paste full user traces into ordinary issues or logs.

Rollback: disable/stop both user units, restore the backed-up collector mapping,
and recreate only `collector`. Preserve `data/`. Configuration backups live
alongside this deployment and should be kept until rollback is no longer needed.

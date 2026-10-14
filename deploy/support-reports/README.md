# Support report receiver

This write-only service stores explicitly submitted Help reports separately from
OTLP diagnostic logs. It accepts gzip JSON attachments (and identity JSON from
existing clients), streams decompression and envelope validation without building
the trace object, and writes gzip archives. Requests are limited to 64 MiB on the
wire, 256 MiB expanded, 16 MiB per encoded JSON string and 128 nesting levels.
At most two uploads are processed concurrently; excess requests receive 503 for
retry. A UUID receipt is returned only after atomic replacement and file/directory
fsync. Failed, oversized or truncated uploads leave no partial archive. Payloads
and credentials are never logged. There is no public list/read endpoint;
report files have mode 0600.

## Current server deployment

Deploy this directory beneath `~/Document/opentelemetry/`, create `data/` owned by
UID 1000 with mode 0700. Create `.venv` with `python3 -m venv .venv`, install the
pinned `requirements.txt` using `.venv/bin/pip install -r requirements.txt`, and
run `.venv/bin/python -m unittest test_server.py` on Linux. If PyPI is unavailable,
download the matching Linux/Python wheel elsewhere, transfer it to a staging
directory, and use `pip install --no-index --find-links <staging> -r requirements.txt`.
The current server uses installed Python 3.12 and the included systemd user units;
its Docker registry mirror is unavailable. The support unit uses the private
virtual environment. Back up the current source and service unit before upgrades,
validate staged source first, then copy both `.service` files into
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

New reports are archived as `<UUID>.json.gz`, containing `reportId`, `receivedAt`
and a `report` object holding the original submitted JSON. Read them through gzip;
the archive wrapper is not the client request format. Existing `<UUID>.json`
archives remain untouched. Requests must declare an exact `Content-Length`;
chunked framing and unsupported content encodings are rejected. Gzip integrity,
complete JSON, unique envelope/log fields and log bounds are validated before a
receipt. Reports contain descriptions, optional complete traces and environment
fields. Version-2 reports also contain a `logs` array with up
to two Runtime and two desktop-host dated log basenames, UTF-8 content of at most
1 MiB each, and boolean truncation flags. The receiver validates this envelope
before writing and preserves logs in the same UUID record, never in access logs.
Version-1 reports from existing clients remain accepted without log attachments.
Deploy the gzip-capable receiver before distributing a compressed client; an
older receiver rejects compressed reports, so the client retains the draft for retry.
Operators own backups and retention; complete reports
are retained without automatic deletion. Investigate by UUID with authorized
server access. Never paste full user traces into ordinary issues or logs.

Rollback: disable/stop both user units, restore the backed-up collector mapping,
and recreate only `collector`. Preserve `data/`. Configuration backups live
alongside this deployment and should be kept until rollback is no longer needed.

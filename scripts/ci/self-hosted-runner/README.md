# OpenAgent private CI host

This directory deploys the repository-scoped private SDK runner, its persistent
local compiler cache, a private S3-compatible cache service, and independent
PassNat clients. Run it only on a dedicated trusted Linux host.

The runner initiates its GitHub connection over outbound HTTPS. PassNat is not
part of job delivery; it provides the SSH maintenance endpoint and the optional
HTTPS route used by public SDK jobs to reach the private compiler cache.

## Bootstrap

1. Copy `.env.example` to `.env`, generate independent random MinIO root and
   scoped sccache credentials, and set `FRPC_BIN` to the absolute path of the
   trusted PassNat `frpc` binary. If the host requires Clash or another HTTP
   proxy to reach GitHub, set `RUNNER_HTTP_PROXY` to the proxy exposed on the
   host, for example `http://host.docker.internal:7890`. Keep local services in
   `RUNNER_NO_PROXY`.
2. Put the account-generated tunnel files at
   `secrets/passnat-ssh.toml` and, when enabled,
   `secrets/passnat-cache.toml`.
3. Build the pinned runner image and start storage plus the SSH tunnel:

   ```bash
   docker compose build runner
   docker compose up -d sccache-storage passnat-ssh
   ```

   If the host cannot reach GitHub release assets, download the two archives on
   a trusted machine, verify them against the SHA-256 values in `Dockerfile`,
   and serve them temporarily from the runner host. Build with host networking
   and override `RUNNER_ARCHIVE_URL` and `SCCACHE_ARCHIVE_URL`; the image still
   rejects any archive that does not match the pinned digest.

4. Request a short-lived repository registration token, then configure the
   runner exactly once without storing that token in `.env` or the long-lived
   container configuration:

   ```bash
   RUNNER_TOKEN=... docker compose run --rm -e RUNNER_TOKEN runner configure
   docker compose up -d runner
   ```

5. Create the bucket and least-privilege cache principal:

   ```bash
   ./configure-storage.sh
   ```

6. Configure the public HTTPS tunnel, mount the certificate tree at
   `secrets/letsencrypt`, then start it with
   `docker compose --profile cache-tunnel up -d passnat-cache`.

   For an HTTPS-to-HTTP tunnel, set `hostHeaderRewrite` in the downloaded frpc
   configuration to the exact public cache hostname. S3 SigV4 signs the `Host`
   header, so rewriting it to `127.0.0.1` causes every authenticated request to
   fail with `SignatureDoesNotMatch`.

7. Configure the public host repository with these names:

   - Secrets: `OPENAGENT_SCCACHE_ACCESS_KEY` and
     `OPENAGENT_SCCACHE_SECRET_KEY`.
   - Variables: `OPENAGENT_SCCACHE_BUCKET` and the full HTTPS
     `OPENAGENT_SCCACHE_ENDPOINT`.

The host binds MinIO only to `127.0.0.1`. Never expose its native HTTP port
directly. The public endpoint must terminate HTTPS and require the scoped
credentials stored as GitHub Actions secrets. The cache is derived from private
SDK source and must not be copied into public Actions caches or artifacts.

PassNat's manual DNS validation produces certificates that cannot renew without
another validation record. Renew before expiry, keep the replacement under the
same `secrets/letsencrypt` mount, and recreate `passnat-cache` after renewal.

## Maintenance

- Keep the repository-scoped runner restricted to trusted tag and manual jobs.
- Update runner and sccache versions together with their SHA-256 values.
- Retain `state/runner`, `state/runner-home`, `state/sccache`, `state/minio`, and
  `secrets/letsencrypt` across container recreation.
- Stop accepting new jobs before host maintenance, then verify the runner is
  idle in the private repository before restarting containers.

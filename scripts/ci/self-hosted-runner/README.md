# OpenAgent private CI host

This directory deploys the repository-scoped private SDK runner, its persistent
local compiler cache, and a PassNat SSH maintenance client. Run it only on a
dedicated trusted Linux host.

The runner initiates its GitHub connection over outbound HTTPS. PassNat is not
part of job delivery; it provides only the SSH maintenance endpoint. The local
compiler cache never leaves this trusted host and is not used by public jobs.

## Bootstrap

1. Copy `.env.example` to `.env` and set `FRPC_BIN` to the absolute path of the
   trusted PassNat `frpc` binary. If the host requires Clash or another HTTP
   proxy to reach GitHub, set `RUNNER_HTTP_PROXY` to the proxy exposed on the
   host, for example `http://host.docker.internal:7890`. Keep local services in
   `RUNNER_NO_PROXY`. The runner enables Node.js environment-proxy support so
   JavaScript actions use the same route as Git and curl.
2. Put the account-generated tunnel file at `secrets/passnat-ssh.toml`.
3. Build the pinned runner image and start the SSH tunnel:

   ```bash
   docker compose build runner
   docker compose up -d passnat-ssh
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

## Maintenance

- Keep the repository-scoped runner restricted to trusted tag and manual jobs.
- Update runner and sccache versions together with their SHA-256 values.
- Retain `state/runner`, `state/runner-home`, and `state/sccache` across
  container recreation.
- Stop accepting new jobs before host maintenance, then verify the runner is
  idle in the private repository before restarting containers.

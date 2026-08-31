FROM node:24-bookworm

ARG RUNNER_VERSION=2.337.0
ARG RUNNER_SHA256=70920811a4f8ad4328818682bca5c6469c1c942fab52448868071d0063816613
ARG RUNNER_ARCHIVE_URL=https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz
ARG SCCACHE_VERSION=0.17.0
ARG SCCACHE_SHA256=67c4a96dd237c1f518f6b36083f270f9976d516f1e57fce891755ea782e50006
ARG SCCACHE_ARCHIVE_URL=https://github.com/mozilla/sccache/releases/download/v${SCCACHE_VERSION}/sccache-v${SCCACHE_VERSION}-x86_64-unknown-linux-musl.tar.gz

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      binutils \
      bubblewrap \
      build-essential \
      ca-certificates \
      curl \
      gh \
      git \
      git-lfs \
      jq \
      libcap-dev \
      pkg-config \
      sudo \
      unzip \
      xz-utils \
      zip \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/actions-runner \
    && curl --fail --location --show-error --silent \
      "${RUNNER_ARCHIVE_URL}" \
      --output /tmp/actions-runner.tar.gz \
    && echo "${RUNNER_SHA256}  /tmp/actions-runner.tar.gz" | sha256sum --check --strict \
    && tar -xzf /tmp/actions-runner.tar.gz -C /opt/actions-runner \
    && rm /tmp/actions-runner.tar.gz \
    && /opt/actions-runner/bin/installdependencies.sh

RUN curl --fail --location --show-error --silent \
      "${SCCACHE_ARCHIVE_URL}" \
      --output /tmp/sccache.tar.gz \
    && echo "${SCCACHE_SHA256}  /tmp/sccache.tar.gz" | sha256sum --check --strict \
    && tar -xzf /tmp/sccache.tar.gz -C /tmp \
    && install -m 0755 \
      "/tmp/sccache-v${SCCACHE_VERSION}-x86_64-unknown-linux-musl/sccache" \
      /usr/local/bin/sccache \
    && rm -rf /tmp/sccache.tar.gz "/tmp/sccache-v${SCCACHE_VERSION}-x86_64-unknown-linux-musl"

COPY entrypoint.sh /usr/local/bin/openagent-runner-entrypoint
RUN chmod 0755 /usr/local/bin/openagent-runner-entrypoint

ENV RUNNER_ALLOW_RUNASROOT=1 \
    HOME=/runner-home \
    CARGO_HOME=/runner-home/.cargo \
    RUSTUP_HOME=/runner-home/.rustup \
    CARGO_INCREMENTAL=0 \
    CARGO_BUILD_JOBS=2 \
    RUSTC_WRAPPER=sccache \
    SCCACHE_DIR=/var/cache/openagent-sccache \
    SCCACHE_CACHE_SIZE=80G

ENTRYPOINT ["/usr/local/bin/openagent-runner-entrypoint"]
CMD ["run"]

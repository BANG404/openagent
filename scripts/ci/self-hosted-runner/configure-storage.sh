#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$root_dir"

set -a
# shellcheck disable=SC1091
source .env
set +a

: "${SCCACHE_BUCKET:?SCCACHE_BUCKET is required}"
: "${SCCACHE_ACCESS_KEY:?SCCACHE_ACCESS_KEY is required}"
: "${SCCACHE_SECRET_KEY:?SCCACHE_SECRET_KEY is required}"

policy_file="$(mktemp)"
trap 'rm -f "$policy_file"' EXIT

jq -n --arg bucket "$SCCACHE_BUCKET" '{
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Action: ["s3:GetBucketLocation", "s3:ListBucket"],
      Resource: ["arn:aws:s3:::" + $bucket]
    },
    {
      Effect: "Allow",
      Action: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      Resource: ["arn:aws:s3:::" + $bucket + "/*"]
    }
  ]
}' > "$policy_file"

docker exec \
  -e SCCACHE_BUCKET="$SCCACHE_BUCKET" \
  openagent-sccache-storage sh -eu -c '
    mc alias set local http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
    mc mb --ignore-existing "local/$SCCACHE_BUCKET" >/dev/null
    mc anonymous set none "local/$SCCACHE_BUCKET" >/dev/null
'

docker cp "$policy_file" openagent-sccache-storage:/tmp/openagent-sccache-policy.json
docker exec \
  -e SCCACHE_BUCKET="$SCCACHE_BUCKET" \
  -e SCCACHE_ACCESS_KEY="$SCCACHE_ACCESS_KEY" \
  -e SCCACHE_SECRET_KEY="$SCCACHE_SECRET_KEY" \
  openagent-sccache-storage sh -eu -c '
    mc admin user add local "$SCCACHE_ACCESS_KEY" "$SCCACHE_SECRET_KEY" >/dev/null 2>&1 || true
    mc admin policy create local openagent-sccache-policy /tmp/openagent-sccache-policy.json >/dev/null 2>&1 || true
    mc admin policy attach local openagent-sccache-policy --user "$SCCACHE_ACCESS_KEY" >/dev/null
    rm -f /tmp/openagent-sccache-policy.json
  '

echo "Configured private sccache bucket and scoped principal."

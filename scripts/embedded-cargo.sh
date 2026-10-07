#!/bin/sh
exec bun "$(dirname "$0")/embedded-cargo.mjs" "$@"

#!/bin/sh
set -eu

if [ -n "${DOPPLER_TOKEN:-}" ]; then
  exec doppler run -- node dist/src/main
else
  exec node dist/src/main
fi

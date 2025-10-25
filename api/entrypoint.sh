#!/bin/sh
set -e

DATA_DIR="${DATA_DIR:-/app/data}"
CSV_TARGET="${A4E_AGE_CSV:-$DATA_DIR/a4e_first_seen_monotone.csv}"
CSV_SOURCE="/app/seed/a4e_first_seen_monotone.csv"

# Ensure data dir exists
mkdir -p "$DATA_DIR"

# If the CSV isn't in the mounted volume yet, seed it from the image
if [ ! -f "$CSV_TARGET" ] && [ -f "$CSV_SOURCE" ]; then
  echo "[entrypoint] Seeding CSV -> $CSV_TARGET"
  cp -f "$CSV_SOURCE" "$CSV_TARGET"
fi

exec node /app/server.js

#!/bin/sh
set -e

# Litestream-enabled entrypoint
# If LITESTREAM_BUCKET is set, enable replication

if [ -n "$LITESTREAM_BUCKET" ]; then
  echo "Litestream replication enabled"

  # Restore database from replica if it doesn't exist locally
  if [ ! -f /app/data/companion.db ]; then
    echo "Restoring database from replica..."
    litestream restore -if-replica-exists -config /app/litestream.yml /app/data/companion.db || true
  fi

  # Start with litestream wrapping supervisord
  exec litestream replicate -exec "supervisord -c /etc/supervisord.conf" -config /app/litestream.yml
else
  echo "Running without Litestream replication"
  exec supervisord -c /etc/supervisord.conf
fi

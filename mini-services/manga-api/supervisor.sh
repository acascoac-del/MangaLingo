#!/bin/bash
# Supervisor: keeps the manga-api Python service running.
# Restarts on crash with a 1s backoff.

set -u
cd "$(dirname "$0")"
PY=/home/z/.venv/bin/python3

while true; do
    echo "[$(date '+%F %T')] Starting manga-api..."
    setsid $PY main.py > /tmp/manga-api.log 2>&1 < /dev/null &
    PID=$!
    disown $PID 2>/dev/null || true
    wait $PID 2>/dev/null
    EC=$?
    echo "[$(date '+%F %T')] manga-api exited (code=$EC). Restarting in 1s..."
    sleep 1
done

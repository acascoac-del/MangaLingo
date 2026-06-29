#!/bin/bash
# Watchdog: periodically checks manga-api health, restarts if dead.
# Logs to /tmp/manga-watchdog.log

LOG=/tmp/manga-watchdog.log
SUP=/home/z/my-project/mini-services/manga-api/supervisor.js

while true; do
  if ! curl -s --max-time 5 http://localhost:8000/health > /dev/null 2>&1; then
    echo "[$(date '+%F %T')] manga-api down — restarting supervisor" >> "$LOG"
    pkill -9 -f "supervisor.js" 2>/dev/null
    pkill -9 -f "manga-api/main.py" 2>/dev/null
    sleep 2
    fuser -k 8000/tcp 2>/dev/null
    sleep 1
    cd /home/z/my-project/mini-services/manga-api
    setsid nohup bun run supervisor.js > /tmp/manga-sup.log 2>&1 < /dev/null &
    disown
    # Wait up to 60s for it to come up
    for i in $(seq 1 60); do
      sleep 1
      if curl -s --max-time 3 http://localhost:8000/health > /dev/null 2>&1; then
        echo "[$(date '+%F %T')] manga-api back up after ${i}s" >> "$LOG"
        break
      fi
    done
  fi
  sleep 15
done

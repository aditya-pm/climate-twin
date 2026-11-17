#!/usr/bin/env bash
# Runs fetch_data.py, restarting it whenever the log is silent for STALL seconds.
# Finished sources and bands are cached in data/raw/, so each restart resumes where it stopped.
cd "$(dirname "$0")"
LOG=data/raw/fetch.log; STALL=${STALL:-360}; mkdir -p data/raw
for attempt in 1 2 3 4 5 6 7 8; do
  echo "[supervisor] attempt $attempt" >> "$LOG"
  .venv/bin/python -u fetch_data.py 2>&1 | grep --line-buffered -v -iE "warning|_reproject" >> "$LOG" &
  while pgrep -f "python -u fetch_data.py" >/dev/null; do
    sleep 15
    age=$(( $(date +%s) - $(stat -f %m "$LOG") ))
    if [ "$age" -gt "$STALL" ]; then echo "[supervisor] stalled ${age}s, restarting" >> "$LOG"; pkill -f "python -u fetch_data.py"; sleep 3; fi
  done
  grep -q "── spot checks ──" "$LOG" && { echo "[supervisor] finished" >> "$LOG"; exit 0; }
  echo "[supervisor] attempt $attempt ended without finishing; retrying in 20s" >> "$LOG"; sleep 20
done
exit 1

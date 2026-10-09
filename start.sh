#!/bin/zsh
# Launched by the com.gyndok.sportsboard LaunchAgent at login (and on crash).
# Updates from GitHub when safe (see update.sh), then runs the server on the home network.
cd "$(dirname "$0")"
# Check GitHub at most once an hour (a crash loop must not hammer it), and only
# keep an update whose tests pass; otherwise stay on the version already here.
if [ ! -f .last-update-check ] || [ $(( $(date +%s) - $(stat -f %m .last-update-check) )) -gt 3600 ]; then
  touch .last-update-check
  echo "$(date '+%F %T') $(./update.sh)"
fi
export PORT="${PORT:-8788}" HOST="${HOST:-0.0.0.0}"
# Port 8788 belongs to Sportsboard: stop a copy started by hand so the service can take over.
PIDS=$(lsof -ti tcp:$PORT -sTCP:LISTEN 2>/dev/null)
if [ -n "$PIDS" ]; then echo "$(date '+%F %T') freeing port $PORT from pid $PIDS"; kill $PIDS; sleep 2; fi
exec "${SPORTSBOARD_NODE:-node}" server.mjs

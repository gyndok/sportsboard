#!/bin/zsh
# Launched by the com.gyndok.sportsboard LaunchAgent at login (and on crash).
# Pulls the latest code from GitHub, then runs the server on the home network.
cd "$(dirname "$0")"
GIT_TERMINAL_PROMPT=0 git pull --ff-only -q 2>/dev/null || echo "$(date '+%F %T') git pull skipped (offline or not signed in)"
export PORT="${PORT:-8788}" HOST="${HOST:-0.0.0.0}"
# Port 8788 belongs to Sportsboard: stop a copy started by hand so the service can take over.
PIDS=$(lsof -ti tcp:$PORT -sTCP:LISTEN 2>/dev/null)
if [ -n "$PIDS" ]; then echo "$(date '+%F %T') freeing port $PORT from pid $PIDS"; kill $PIDS; sleep 2; fi
exec "${SPORTSBOARD_NODE:-node}" server.mjs

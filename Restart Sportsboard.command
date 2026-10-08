#!/bin/zsh
# Restarts Sportsboard (with TV Wall) on port 8788, reachable from phones on the home network.
cd "$(dirname "$0")"
PORT=8788
PIDS=$(lsof -ti tcp:$PORT -sTCP:LISTEN)
if [ -n "$PIDS" ]; then echo "Stopping old server ($PIDS)…"; kill $PIDS; fi
sleep 3
if lsof -ti tcp:$PORT -sTCP:LISTEN >/dev/null; then
  echo "Sportsboard was restarted automatically by its launcher."
else
  NODE=$(command -v node || ls /opt/homebrew/bin/node /usr/local/bin/node 2>/dev/null | head -1)
  PORT=$PORT HOST=0.0.0.0 nohup "$NODE" server.mjs >> log.txt 2>&1 &
  sleep 2
fi
lsof -nP -iTCP:$PORT -sTCP:LISTEN
echo
echo "Board:  http://localhost:$PORT"
echo "Remote: http://$(ipconfig getifaddr en0 || ipconfig getifaddr en1):$PORT/remote"
open "http://localhost:$PORT/remote"

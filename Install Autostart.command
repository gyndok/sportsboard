#!/bin/zsh
# One-time setup: start Sportsboard automatically at login and keep it running.
# Run again any time to reinstall. To remove: ./"Install Autostart.command" --remove
cd "$(dirname "$0")"
DIR="$PWD"
LABEL=com.gyndok.sportsboard
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"

launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null
if [ "$1" = "--remove" ]; then rm -f "$PLIST"; echo "Autostart removed."; exit 0; fi

NODE=$(command -v node || ls /opt/homebrew/bin/node /usr/local/bin/node 2>/dev/null | head -1)
if [ -z "$NODE" ]; then echo "Couldn't find Node.js. Install it, then run this again."; exit 1; fi
chmod +x start.sh

mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/zsh</string><string>$DIR/start.sh</string></array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>EnvironmentVariables</key><dict>
    <key>SPORTSBOARD_NODE</key><string>$NODE</string>
    <key>PORT</key><string>8788</string>
    <key>HOST</key><string>0.0.0.0</string>
    <key>PATH</key><string>$(dirname "$NODE"):/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$DIR/log.txt</string>
  <key>StandardErrorPath</key><string>$DIR/log.txt</string>
</dict></plist>
PLIST

# Stop a server started by hand so the service can take over port 8788.
PIDS=$(lsof -ti tcp:8788 -sTCP:LISTEN)
[ -n "$PIDS" ] && kill $PIDS && sleep 2

launchctl bootstrap "$DOMAIN" "$PLIST" || { echo "Couldn't start the service."; exit 1; }
sleep 4
if lsof -ti tcp:8788 -sTCP:LISTEN >/dev/null; then
  echo "✅ Sportsboard now starts automatically at login and restarts itself if it stops."
  echo "Remote: http://$(ipconfig getifaddr en0 || ipconfig getifaddr en1):8788/remote"
else
  echo "Service installed but the server isn't answering yet. Last log lines:"; tail -5 log.txt
fi

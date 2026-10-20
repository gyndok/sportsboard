# Sportsboard: notes for Claude

Sportsboard is a local Node server that turns a Mac connected to a TV into a sports wall: a sportsbook-style scoreboard, up to four live games in Chrome windows (Game day), relaxing scenery (Calm), and a phone remote that controls it all. Plain Node 20+, ES modules, **no npm dependencies and no build step**. The user-facing guide is [USER_MANUAL.md](USER_MANUAL.md); the technical one is [README.md](README.md).

The people asking are usually not developers. Talk in plain words, do the Terminal work yourself, and walk them through the clicks you can't do, one at a time.

## "Install Sportsboard on my Mac"

The goal is the autostart service running from `~/sportsboard` on port 8788, the one-time Chrome and macOS setup done, and the phone remote open. Before starting, ask: is this the Mac that's connected to the TV? (If not, the scoreboard alone works anywhere: see the end of this section.) Optionally ask for their city or ZIP code, for Calm's sunrise and sunset.

### What you can do yourself

1. **Check the Mac:** `sw_vers -productVersion`, `node -v` (needs v20 or newer), `git --version`, and `ls -d "/Applications/Google Chrome.app"`.
   - No Node: if `brew` exists, `brew install node`. Otherwise ask them to install the **LTS** `.pkg` from https://nodejs.org (it needs their password; never run `sudo` yourself), then check `node -v` again.
   - No git: `xcode-select --install` opens a macOS dialog they click through. Wait for it, then retry.
   - No Chrome: ask them to install it from https://www.google.com/chrome. The games play in Chrome windows.
2. **Get the code into `~/sportsboard`:** `git clone https://github.com/gyndok/sportsboard.git ~/sportsboard`. The manual, the scripts' messages and the Sound helper steps all assume that path, so use it even if you're running in a clone somewhere else. If it already exists, `git -C ~/sportsboard pull --ff-only`.
3. **Test it:** `cd ~/sportsboard && npm test`. Everything must pass; stop and investigate if not.
4. **Start it automatically:** `zsh "./Install Autostart.command"`. This installs the LaunchAgent `com.gyndok.sportsboard` (starts at login, restarts if it stops, and each time it starts, at most once an hour, updates from GitHub, keeping an update only if its tests pass) and prints the remote's address. Check it answers: `curl -s localhost:8788/api/wall | head -c 120`.
5. **Set their city for Calm** (optional; without it Calm uses the main city of the Mac's time zone): `curl -s -X POST localhost:8788/api/wall/sun -H 'Content-Type: application/json' -d '{"place":"77027"}'`. A city name, a ZIP code, or `"29.76, -95.37"` all work. Read back the `name` it found and check it's right.
6. **The phone remote's address:** `echo "http://$(ipconfig getifaddr en0 || ipconfig getifaddr en1):8788/remote"`. The phone must be on the same Wi-Fi. On an iPhone, Share › Add to Home Screen makes it open like an app.

### What they have to do (walk them through it)

Do these in order, and confirm each one before moving on. They match section 4 of the manual.

1. **Sound helper:** in Chrome, type `chrome://extensions` in the address bar, turn on **Developer mode** (top right), click **Load unpacked**, and choose the `sportsboard/chrome-extension` folder in their home folder. It makes only the chosen game play sound, and it powers the remote's Reset zoom button.
2. **Chrome menu bar: View › Developer › Allow JavaScript from Apple Events.** Sound switching, playback controls, captions and the odds chart need it.
3. **Permission pop-ups:** the first time they use the remote, macOS asks whether node, osascript or Terminal may control Google Chrome and System Events. They click **Allow**. Missed one: System Settings › Privacy & Security › Automation.
4. **Chrome Settings › Appearance › Mode › Dark** (dark window title bars).
5. **System Settings › Control Center › Automatically hide and show the menu bar › Always.**
6. **Sign in once to each streaming service in Chrome** (YouTube TV, Peacock, Prime Video…). Sportsboard uses their own subscriptions.
7. **Keep the Mac awake:** System Settings › Energy › Prevent automatic sleeping when the display is off; Lock Screen › Turn display off when inactive › Never (or a long time). A sleeping Mac looks like "no signal" to the TV.
8. **Optional, for Calm:** System Settings › Wallpaper, pick a few Aerial videos and let them download.
9. **More than one screen** (a TV plus a monitor): on the remote, pick the TV under **TV screen**.

Then have them open the remote on their phone and tap **Game day**. Point them to the manual's sections 5 to 8 for using it.

### Not the Mac on the TV, or not a Mac at all

The scoreboard alone runs anywhere Node does: `cd ~/sportsboard && npm start`, then open http://localhost:8787. Game day, Calm and window control need macOS and Chrome.

Don't use `macos/build.sh` (the old standalone Mac app) to install. It predates the TV wall, doesn't bundle `wall.mjs` or `poly.mjs`, and would fight the service for port 8788.

## Updating, restarting and logs

- Update and restart: the remote's **Fix-its › Update & restart**, or `~/sportsboard/Restart Sportsboard.command`, or by hand: `./update.sh && launchctl kickstart -k gui/$(id -u)/com.gyndok.sportsboard`.
- After an update that changed `chrome-extension/`, they must click **⟳** on the Sportsboard Sound card in `chrome://extensions`.
- Logs: `log.txt` (server), `.update-test.log` (tests of the last update), `.update-rejected` (a commit that failed its tests and is skipped).
- Remove autostart: `zsh "./Install Autostart.command" --remove`.

## Their settings

`wall-config.json` (channels, scenes, Calm rotation, odds chart, city) and `wall-state.json` (what's on the TV) live in the folder, each with a `.last-good` backup. They're gitignored: never commit them. Prefer changing settings through the remote's API (`/api/wall*` in `wall.mjs`) over editing the files, since the running server rewrites them.

## Working on the code

| Path | What it is |
|---|---|
| `server.mjs` | HTTP server, ESPN scores (`/api/scores`), game details, Polymarket prices (`/api/market`), static files |
| `wall.mjs` | The TV wall: Chrome windows over `osascript` (JXA), the remote's API, Calm (scenes, sunrise and sunset), the odds chart drawn into game pages, playback, the Sound helper's plan, update and restart |
| `poly.mjs` | Matching games to Polymarket markets |
| `public/` | Board (`index.html`, `app.js`, `style.css`, `details.js`), remote (`remote.html`, `remote.js`, `wall.css`), Calm, scores panel, shared `feed.js`, `watch.js` |
| `chrome-extension/` | The Sportsboard Sound helper (MV3): tab muting and zoom reset |
| `start.sh`, `update.sh`, `*.command` | Service start, self-update with test gate and rollback, install and restart |
| `test/` | `node --test` suites |

- **Tests:** `npm test`. Every Mac runs them before keeping an update, so a failing or flaky test blocks updates everywhere: keep tests offline, deterministic and independent of the time zone and the clock. Under tests (`NODE_TEST_CONTEXT` is set) `wall.mjs` uses temporary config files and skips everything that needs macOS or the network.
- **Preview:** `PORT=8799 node server.mjs`, then http://localhost:8799 and http://localhost:8799/remote. Outside tests it reads and writes `wall-config.json` in the folder, and window control only works on macOS.
- **Keep it dependency-free:** Node built-ins only, plain browser scripts, no frameworks or bundlers.
- **The board's look is settled.** Don't restyle the scoreboard unless asked.
- **Changes from the network:** every POST must pass the private-IP and same-origin check in `handleWall`; keep new routes behind it.
- **Sound helper changes:** bump `chrome-extension/manifest.json`'s version and say in the docs that people must click ⟳.
- **Docs:** user-facing changes go in `USER_MANUAL.md` (plain language, what to tap) and `README.md` (how it works).

# Sportsboard

A local sportsbook-style scoreboard for NFL, MLB, NCAA Division I football (FBS/FCS), NHL, and NBA. Requires Node.js 20 or newer and an internet connection. No packages or API keys required.

The compact black board uses teal and white scores with red status labels. Click the star beside a team to pin its games in a Favorites section above the leagues. Favorites persist in browser local storage and follow the selected date, league, and game-status filters.

## Mac app

On macOS with Xcode command-line tools and Node installed, run `bash macos/build.sh`. Unzip `dist/Sportsboard.zip` and move Sportsboard.app into Applications. The build bundles your installed Node binary; use a Node distribution whose dependencies are available on the destination Mac. The app starts its own server on port 8788 and opens Safari. The SB menu-bar icon reopens the scoreboard or quits the server. No separate Node installation is needed to run the bundled app on the build machine.

The app is locally signed, not notarized for public distribution. Favorites are stored separately for each browser and origin, so the app's port 8788 and development server's port 8787 have separate saved selections.

## Start

Open a terminal in this directory and run `npm start`, then open http://localhost:8787. Stop with Control-C. Set `PORT` to change the port. The server listens on your home network (set `HOST=127.0.0.1` to keep it on this computer only) so the TV Wall remote works from a phone.

Choose a league, filter live/upcoming/final games, or select a date to view future schedules. Scores refresh every 30 seconds. Times use the browser's local timezone. Game clocks are the latest reported values, not simulated countdowns.

Data comes from ESPN's public scoreboard endpoints. This is an unofficial feed with no availability or latency guarantee; access may change. It is not suitable for time-critical betting. Failed refreshes visibly retain the last successful scores where available. No fabricated or demo games are shown. League offseasons and dates without published schedules display an empty state. Upcoming shows scheduled games on the selected date; choose a future date for later games.

## Game details

Click a game row (or tab to its status button and press Enter) to open its detail window. Football includes quarter scoring, passing/rushing/receiving box scores and scoring plays; baseball includes innings, batting and pitching; basketball includes quarter scoring and player box scores; hockey includes period scoring and skater/goalie statistics. Team comparisons, venue, and broadcasts appear when supplied by the feed. Pregame games show available preview information. Details refresh every 30 seconds, clearly mark stale data, and close with Escape or the Close button. Team stars still toggle favorites without opening details.

Run `npm test` for rendering and endpoint validation tests.

## TV Wall (Mac mini on a TV)

Turns a Mac mini connected to a TV into a multi-game wall, a full-screen scoreboard, or a calm ambient screen, all controlled from a phone.

Double-click `Install Autostart.command` once: it installs a LaunchAgent (`com.gyndok.sportsboard`) that starts the server on port 8788 at login, pulls the latest code from GitHub first, and restarts it if it stops. `Restart Sportsboard.command` pulls updates and restarts it on demand. Remove autostart with `./"Install Autostart.command" --remove`. Open `http://<mini-ip>:8788/remote` on your phone; the Terminal window and the remote footer print the address. Sportsboard's header also has a **TV WALL** button.

Modes:

- **Game day**: tiles 1–4 Chrome app windows (single, 2 side by side, 3, 2 × 2, 1 big + 2, 1 big + 3). Each screen picks a service (YouTube TV / Sunday Ticket, Peacock, Paramount+, Prime Video, Apple TV, Sportsboard) or a pasted game link. 🔊 picks the one screen with sound, ⤢ fills the screen with one game, and ⬆ promotes a game to the big screen. Layout and sidebar changes move windows without reloading streams.
- **Scores sidebar**: an optional right-hand column with a clock and live, upcoming and final scores (starred teams first). It scrolls slowly when long.
- **Channel presets**: put a YouTube TV channel on a screen and tap 💾 on that screen to save it as a button under **My channels** (name it the way the scoreboard shows the network, e.g. `FS1`; add other spellings after commas). Tap a saved channel to send it to any screen.
- **Watch buttons**: every live or upcoming game on the scoreboard, and in the remote's **Games today** list, shows its network (📺 FS1). Tap it and pick a screen; the game's network is matched to your saved channels (Peacock, Prime, Apple TV and Paramount+ games open that app). The chosen screen gets the sound.
- **Scoreboard**: Sportsboard full screen.
- **Calm**: Apple Aerials stored on the Mini (ocean, landscapes, Earth, cities) plus YouTube scenes, rotating by time of day. Pin a scene, toggle the clock or sound, and add YouTube live-cam links from the remote.
- **Clean screen**: auto-hides the Dock and menu bar, tucks window title bars out of view, blanks window titles and parks the pointer. Turning it off or choosing **Off** restores your Dock and menu bar settings.

One-time setup on the Mini:

1. Allow Terminal to control Google Chrome and System Events when macOS asks.
2. In Chrome, turn on View › Developer › Allow JavaScript from Apple Events (used for audio switching and blank titles).
3. Chrome › Settings › Appearance › Mode › Dark (dark title bars).
4. System Settings › Control Center › Automatically hide and show the menu bar › Always.
5. Sign in to each streaming service once in Chrome.
6. Optional: download a few Aerials in System Settings › Wallpaper for Calm mode.

Window control uses `osascript` (JavaScript for Automation) and works only on macOS. Wall changes are accepted only from private-network addresses with a same-origin request. Runtime files `wall-state.json`, `wall-config.json` (your added scenes and schedule) and `log.txt` are not committed. Streaming services limit simultaneous streams per account, so several games from one service at once can hit that limit.

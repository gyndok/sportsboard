# Sportsboard

**New here? The [User's Manual](USER_MANUAL.md) walks through installing it, setting up the TV and using the phone remote.** Or open [Claude Code](https://claude.com/claude-code) on the Mac and say *"Install Sportsboard from github.com/gyndok/sportsboard on this Mac"*: [CLAUDE.md](CLAUDE.md) tells it how.

A local sportsbook-style scoreboard for NFL, MLB, NCAA Division I football (FBS/FCS), NHL, and NBA. Requires Node.js 20 or newer and an internet connection. No packages or API keys required.

The board is laid out like a Las Vegas sportsbook board: a black board with ruled columns, bold condensed caps (Roboto Condensed, bundled in `public/fonts` under the SIL Open Font License), and games alternating LED green and white. Each league gets a column, continuing into more columns with its header repeated, and each game is two rows: **ID · TEAM · SCR · PS/TOT · ML · TV**. Status lines sit above the games: start times for upcoming games, the running clock in amber for live games ("1ST 4:12"), and FINAL. PS/TOT shows the spread on the favorite's row and the total on the underdog's (PK for a pick'em), and ML shows each side's moneyline. Lines come from the first odds provider in ESPN's feed (when it has one) and are blank otherwise. ID numbers are house rotation numbers (away odd, home even, in start-time order), not a sportsbook's.

Hover a team and click its star to pin its games in a Favorites column at the front of the board. Favorites persist in browser local storage and follow the selected date, league, and game-status filters. Click a game for details, or its network for the TV wall's watch menu.

**TV mode** (`/?tv=1`, used by the TV wall, or the Full screen button) hides the controls and sizes the text to fill the window. A slate too big for one screen pages through its columns every 15 seconds (PAGE 1 / 2 in the corner).

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

## Win chances (Polymarket)

`poly.mjs` reads Polymarket US's public market listings (no key) and matches each game to ESPN's by team names and start time. `/api/market?league=NFL&date=YYYYMMDD` returns each matched game's chance to win per side (bid/ask midpoint), plus a trend line for games in progress; the board's **WIN%** column and the TV scores panel use it. It's a separate request from `/api/scores`, so scores never wait on or fail with the market feed. On the TV wall, each game window gets a live win-chance chart drawn into the page over Apple Events: Sportsboard reads the stream's media title (falling back to the game picked with 📺), finds the market, and shows prices delayed by a configurable number of seconds (default 20, plus however far the stream is behind live) so the chart moves with the broadcast. Chart on/off, delay, size (S/M/L: 18/25/32% of the window's width, whatever Chrome's page zoom) and each screen's corner (↖ ↗ ↙ ↘, or ✕ to hide it on that screen) are on the remote and saved in `wall-config.json` under `odds`.

## TV Wall (Mac mini on a TV)

Turns a Mac mini connected to a TV into a multi-game wall, a full-screen scoreboard, or a calm ambient screen, all controlled from a phone.

Double-click `Install Autostart.command` once: it installs a LaunchAgent (`com.gyndok.sportsboard`) that starts the server on port 8788 at login and restarts it if it stops. At most once an hour on start it runs `update.sh`, which pulls from GitHub and keeps the new version only if `node --test` passes on the Mini; otherwise it rolls back to the running version and skips that commit (`.update-test.log` has the details). `Restart Sportsboard.command` pulls updates and restarts it on demand; so does **⟳ Update & restart** under **Fix-its** on the remote (`POST /api/wall/restart`, which runs `update.sh` and then exits so launchd starts the new version; it's refused unless the server runs as that LaunchAgent). Remove autostart with `./"Install Autostart.command" --remove`. Open `http://<mini-ip>:8788/remote` on your phone; the Terminal window and the remote footer print the address. Sportsboard's header also has a **TV WALL** button.

Modes:

- **Game day**: tiles 1–4 Chrome app windows (single, 2 side by side, 3, 2 × 2, 1 big + 2, 1 big + 3). Each screen picks a service (YouTube TV / Sunday Ticket, Peacock, Paramount+, Prime Video, Apple TV, Sportsboard) or a pasted game link. 🔊 picks the one screen with sound, ⤢ fills the screen with one game, and ⬆ promotes a game to the big screen. Layout and sidebar changes move windows without reloading streams. A regular YouTube video or live stream on a screen shows only the video (no search bar, title or live chat); press Escape in that window to get the full YouTube page back for browsing.
- **Scores panel**: in the board's look, a clock plus in-progress, upcoming (with the line) and final scores (starred teams first) placed in the space the games leave over (bottom band, corner or side column depending on the layout). It switches to a multi-column layout when wide and scrolls slowly when long.
- **16:9 tiles**: every game window is sized to exactly 16:9 so video fills it; without the scores panel the games are centered.
- **Channel presets**: put a YouTube TV channel on a screen and tap 💾 on that screen to save it as a button under **My channels** (name it the way the scoreboard shows the network, e.g. `FS1`; add other spellings after commas). Tap a saved channel to send it to any screen.
- **Playback**: the remote's Playback row controls the screen you're listening to: back 30/10 s, pause/play, forward 10/30 s, **Go to live**, and **CC on / off**, with a status line ("0:45 behind live", "Captions on"). Seeking, pausing and live work on any service's video, and use YouTube's own player when it's there. Captions switch with the CC button on YouTube and YouTube TV (or YouTube TV's "c" shortcut), or with the video's caption tracks elsewhere. Services that keep captions in a menu (e.g. Prime Video) say so instead of opening a menu on the TV. Needs Chrome's "Allow JavaScript from Apple Events", like sound switching.
- **Watch buttons**: every live or upcoming game on the scoreboard, and in the remote's **Games today** list, shows its network (📺 FS1). Tap it and pick a screen; the game's network is matched to your saved channels (Peacock, Prime, Apple TV and Paramount+ games open that app). The chosen screen gets the sound.
- **Scoreboard**: the sportsbook-style board full screen, in TV mode (sized to fill the TV, paging on big slates).
- **Calm**: Apple Aerials stored on the Mini plus YouTube scenes (captions off), grouped by category and rotating by time of day. Pin one scene or a whole category (⟳ Rotate all …), toggle the clock, sound or scene names, and add YouTube links from the remote (Edit reveals ✕ to remove scenes). A scene that can't be embedded is skipped automatically: the Calm page reports the YouTube player's error code (`POST /api/wall/calm/broken`), the server skips it for two hours (a pinned scene falls back to the time-of-day rotation), and the remote shows which scene and why. Adding a scene first asks YouTube's oEmbed endpoint, which refuses videos whose owner blocks embedding (401) or that are private or gone (404); a scene added as Pin only while Calm is on plays right away. Scenes and the schedule live in `wall-config.json` (`scenes[].category`, `schedule[].from/sun/scenes`). With `calmSun` on (the default), a block marked `sun: "sunrise"` or `"sunset"` (morning and evening) starts at that day's sunrise or sunset instead of its clock time, kept at least 30 minutes clear of its neighbors. Sunrise and sunset are computed locally (the standard solar-position approximation, within about 3 minutes) for `place`, set on the remote by city, ZIP or `lat, lon` through Open-Meteo's free geocoder (`POST /api/wall/sun`); without one, the main city of the Mac's time zone from the tz database's `zone.tab`. Location data from the geocoder is based on [GeoNames](https://www.geonames.org).
- **TV screen**: on a Mac with more than one display, the remote's **TV screen** row picks which one gets the wall (remembered across restarts; the main display if that screen is unplugged). With the wall on a second screen, Clean screen leaves the Dock, menu bar and pointer alone and the wall never brings Chrome forward, so you can keep working on the main display.
- **Clean screen**: auto-hides the Dock and menu bar, tucks window title bars out of view, blanks window titles and parks the pointer. Turning it off or choosing **Off** restores your Dock and menu bar settings.

One-time setup on the Mini:

0. **Sportsboard Sound helper** (exclusive sound): in Chrome open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick `~/sportsboard/chrome-extension`. It uses Chrome's tab mute, which streaming players can't override, so only the screen chosen under **Sound from** on the remote plays; the other wall screens are muted and your own Chrome windows are never touched. Without it, the wall falls back to muting video elements inside each page, which some players undo. The helper also does the remote's **⌘0 Reset zoom** (`POST /api/wall/zoom`): it resets Chrome's zoom on the wall windows with `chrome.tabs.setZoom`. That needs helper 1.2 or later; after updating, click ⟳ on its card.

1. Allow Terminal to control Google Chrome and System Events when macOS asks.
2. In Chrome, turn on View › Developer › Allow JavaScript from Apple Events (used for audio switching and blank titles).
3. Chrome › Settings › Appearance › Mode › Dark (dark title bars).
4. System Settings › Control Center › Automatically hide and show the menu bar › Always.
5. Sign in to each streaming service once in Chrome.
6. Optional: download a few Aerials in System Settings › Wallpaper for Calm mode.

Window control uses `osascript` (JavaScript for Automation) and works only on macOS. Wall changes are accepted only from private-network addresses with a same-origin request. Runtime files `wall-state.json`, `wall-config.json` (your added scenes and schedule) and `log.txt` are not committed. Streaming services limit simultaneous streams per account, so several games from one service at once can hit that limit.

## Reliability notes

- **Bad requests can't stop the server.** Every request runs inside one error boundary. Malformed JSON, a `null` or invalid Origin, oversized bodies and unsupported methods get 400/403/405/413 answers instead of crashing it.
- **Changes are all-or-nothing.** A change request is validated in full (known fields, layouts, unique screen ids, at most 4 screens, real scene ids) before anything changes. Changes run one at a time.
- **Settings are saved safely.** They are written to a temporary file and then swapped in. `wall-config.json.last-good` is refreshed on every successful start, and a corrupt file is kept as `.corrupt` while the last good copy is used.
- **Restart recovery.** After a server, Chrome or Mac restart, the wall forgets windows that no longer show its pages and rebuilds Scoreboard or Calm. It rebuilds Game day only if it was set within the last 6 hours. If an earlier run left the Dock or menu bar hidden, the original settings come back.
- **Dock and menu bar.** Their original settings are captured before the first change and only those captured values are restored. If they can't be read, they're left alone.
- **Scores are honest.** The scores panel and the remote say when leagues are unavailable, keep each league's last good data, and show when the server last received scores ("Scores as of …"). The scoreboard follows today across midnight unless you pick another date.
- **Sound helper detection.** The helper counts as connected only when the extension itself checks in. After updating, click ⟳ on the Sportsboard Sound card in `chrome://extensions`.

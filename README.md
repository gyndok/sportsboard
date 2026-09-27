# Sportsboard

A local sportsbook-style scoreboard for NFL, MLB, NCAA Division I football (FBS/FCS), NHL, and NBA. Requires Node.js 20 or newer and an internet connection. No packages or API keys required.

The compact black board uses teal and white scores with red status labels. Click the star beside a team to pin its games in a Favorites section above the leagues. Favorites persist in browser local storage and follow the selected date, league, and game-status filters.

## Mac app

On macOS with Xcode command-line tools and Node installed, run `bash macos/build.sh`. Unzip `dist/Sportsboard.zip` and move Sportsboard.app into Applications. The build bundles your installed Node binary; use a Node distribution whose dependencies are available on the destination Mac. The app starts its own server on port 8788 and opens Safari. The SB menu-bar icon reopens the scoreboard or quits the server. No separate Node installation is needed to run the bundled app on the build machine.

The app is locally signed, not notarized for public distribution. Favorites are stored separately for each browser and origin, so the app's port 8788 and development server's port 8787 have separate saved selections.

## Start

Open a terminal in this directory and run `npm start`, then open http://localhost:8787. Stop with Control-C. Set `PORT` to change the port. The server listens only on your own computer.

Choose a league, filter live/upcoming/final games, or select a date to view future schedules. Scores refresh every 30 seconds. Times use the browser's local timezone. Game clocks are the latest reported values, not simulated countdowns.

Data comes from ESPN's public scoreboard endpoints. This is an unofficial feed with no availability or latency guarantee; access may change. It is not suitable for time-critical betting. Failed refreshes visibly retain the last successful scores where available. No fabricated or demo games are shown. League offseasons and dates without published schedules display an empty state. Upcoming shows scheduled games on the selected date; choose a future date for later games.

## Game details

Click a game row (or tab to its status button and press Enter) to open its detail window. Football includes quarter scoring, passing/rushing/receiving box scores and scoring plays; baseball includes innings, batting and pitching; basketball includes quarter scoring and player box scores; hockey includes period scoring and skater/goalie statistics. Team comparisons, venue, and broadcasts appear when supplied by the feed. Pregame games show available preview information. Details refresh every 30 seconds, clearly mark stale data, and close with Escape or the Close button. Team stars still toggle favorites without opening details.

Run `npm test` for rendering and endpoint validation tests.

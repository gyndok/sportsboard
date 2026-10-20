# Sportsboard User's Manual

Sportsboard turns a Mac connected to a TV into a sports wall you control from your phone:

- **Game day:** up to four live games at once (YouTube TV, Peacock, Paramount+, Prime Video, Apple TV or any link), with sound from the one you pick.
- **Scoreboard:** every game today on a Las Vegas sportsbook-style board, with scores, spreads, totals and moneylines.
- **Calm:** Apple's aerial screensaver videos, a fireplace or any YouTube scene, rotating through the day.

Everything runs on your own Mac. There are no accounts or sign-ups, and nothing to pay for beyond the streaming services you already have.

**Contents**

1. [What you need](#1-what-you-need)
2. [Quick start](#2-quick-start)
3. [Install, step by step](#3-install-step-by-step)
4. [One-time Mac setup for the TV](#4-one-time-mac-setup-for-the-tv)
5. [The phone remote](#5-the-phone-remote)
6. [Game day](#6-game-day)
7. [Reading the scoreboard](#7-reading-the-scoreboard)
8. [Calm](#8-calm)
9. [Updates](#9-updates)
10. [Troubleshooting](#10-troubleshooting)
11. [Uninstalling](#11-uninstalling)

---

## 1. What you need

| | |
|---|---|
| **A Mac** | Needed for the TV wall: Game day, Calm and the phone remote. A Mac mini on the TV is ideal; a MacBook plugged into a TV works too. On Windows or Linux you can still run the scoreboard in a browser ([section 3.3](#33-try-it)). |
| **Google Chrome** | The games play in Chrome windows. |
| **Node.js 20 or newer** | The small program that runs Sportsboard. Free, from [nodejs.org](https://nodejs.org). |
| **A TV** | Connected to the Mac with HDMI. |
| **A phone** | On the **same Wi-Fi** as the Mac. This is your remote. |
| **Your streaming logins** | YouTube TV, Peacock, etc. Sportsboard uses your own subscriptions. Most services limit how many streams play at once, so four games from one account may hit that limit. |

---

## 2. Quick start

**Easiest: let Claude do it.** If you have [Claude Code](https://claude.com/claude-code), open it on the Mac that's connected to the TV and say:

> Install Sportsboard from github.com/gyndok/sportsboard on this Mac. I live in Houston.

It checks for Node.js, downloads Sportsboard, starts it, sets your city for Calm, and walks you through the few clicks it can't do for you (the Chrome settings and the Sound helper). The repo's `CLAUDE.md` tells it how. Swap in your own city.

**Or in Terminal:** if you're comfortable with Terminal, this is the whole install. Details for each step follow in sections 3 and 4.

```sh
# 1. Install Node.js from https://nodejs.org (the LTS installer), then:
git clone https://github.com/gyndok/sportsboard.git ~/sportsboard
cd ~/sportsboard
zsh "./Install Autostart.command"
```

The last command prints your remote's address, for example `http://192.168.1.50:8788/remote`. Open that on your phone. Then do the [one-time Mac setup](#4-one-time-mac-setup-for-the-tv).

---

## 3. Install, step by step

### 3.1 Install Node.js

1. Go to [nodejs.org](https://nodejs.org) and download the **LTS** installer for macOS.
2. Open the downloaded `.pkg` and click through the installer.
3. Check it worked: open **Terminal** (Applications › Utilities) and type:

   ```sh
   node -v
   ```

   You should see `v20` or higher.

### 3.2 Get Sportsboard

**Option A: with git (recommended, because it updates itself)**

In Terminal:

```sh
git clone https://github.com/gyndok/sportsboard.git ~/sportsboard
```

The first time you run `git`, macOS may offer to install the **Command Line Developer Tools**. Click **Install**, wait for it to finish, and run the command again.

This puts Sportsboard in a folder called `sportsboard` in your home folder. Keep it there: the setup steps below assume `~/sportsboard`.

**Option B: download a ZIP (no automatic updates)**

1. Open [github.com/gyndok/sportsboard](https://github.com/gyndok/sportsboard) and click **Code › Download ZIP**.
2. Unzip it, rename the folder from `sportsboard-main` to `sportsboard`, and move it into your home folder.

### 3.3 Try it

In Terminal:

```sh
cd ~/sportsboard
npm start
```

Open [http://localhost:8787](http://localhost:8787) in a browser to see the scoreboard. Press **Control-C** in Terminal to stop it.

This is all you need for the scoreboard on its own, on any computer. For the TV wall on a Mac, continue below.

### 3.4 Start it automatically

Double-click **`Install Autostart.command`** in the `sportsboard` folder.

If macOS says it "can't be opened because it is from an unidentified developer" (common with the ZIP download), run it from Terminal instead:

```sh
cd ~/sportsboard
zsh "./Install Autostart.command"
```

It sets Sportsboard to start every time you log in, and to restart itself if it ever stops. When it finishes, it prints:

```
✅ Sportsboard now starts automatically at login and restarts itself if it stops.
Remote: http://192.168.1.50:8788/remote
```

That **Remote** address is what you open on your phone.

> The autostart version runs on port **8788**. The `npm start` version from step 3.3 uses **8787**. They're the same app, but favorites you star are saved separately for each.

---

## 4. One-time Mac setup for the TV

Do these once on the Mac that's connected to the TV.

1. **Install the Sound helper in Chrome.** It makes sure only the screen you pick plays sound.
   1. In Chrome, go to `chrome://extensions`.
   2. Turn on **Developer mode** (top right).
   3. Click **Load unpacked** and choose the folder `sportsboard/chrome-extension` in your home folder.
   4. "Sportsboard Sound" appears in the list. Leave it on.
2. **Let Sportsboard control Chrome.** In Chrome's menu bar, turn on **View › Developer › Allow JavaScript from Apple Events**. This powers sound switching, playback controls and captions.
3. **Answer the macOS permission pop-ups.** The first time you use the remote, macOS asks whether `node`, `osascript` or Terminal may control **Google Chrome** and **System Events**. Click **Allow** each time. If you clicked Don't Allow by mistake, fix it in **System Settings › Privacy & Security › Automation**.
4. **Dark title bars.** In Chrome, go to **Settings › Appearance › Mode** and choose **Dark**.
5. **Hide the menu bar.** Go to **System Settings › Control Center › Automatically hide and show the menu bar** and choose **Always**.
6. **Sign in to your streaming services in Chrome**: YouTube TV, Peacock, Prime, etc. Use a normal Chrome window and sign in once each.
7. **More than one screen?** If the Mac has a TV plus a monitor you work on (or a MacBook's own screen), pick the TV under **TV screen** on the remote ([section 5](#5-the-phone-remote)). Until you do, the wall uses the main display, the one with the menu bar.
8. **Keep the Mac awake.** If the Mac sleeps, many TVs think the input turned off. In **System Settings › Energy** (on a laptop, **Battery › Options**), turn on **Prevent automatic sleeping when the display is off**. In **Lock Screen**, set **Turn display off when inactive** to a long time or **Never**.
9. **Optional, for Calm:** in **System Settings › Wallpaper**, pick a few **Aerial** landscapes and let them download. Calm plays the ones on your Mac.

---

## 5. The phone remote

Open the **Remote** address on your phone, for example `http://192.168.1.50:8788/remote`.

- **iPhone:** tap **Share › Add to Home Screen** so it opens like an app.
- **Lost the address?** On the Mac, open `http://localhost:8788/remote`. The address for your phone is shown at the bottom of the page.

At the top of the remote:

| Control | What it does |
|---|---|
| **Game day** | Shows up to four games on the TV. |
| **Scoreboard** | Shows the sportsbook board full screen. |
| **Calm** | Shows relaxing scenery. |
| **Off** | Closes the TV windows and gives you your normal desktop back. |
| **Clean screen** | Hides the Dock, menu bar and window title bars, and moves the mouse pointer to the edge of the screen. Turning it off, or choosing **Off**, puts your Dock and menu bar back the way they were. |
| **TV screen** | Only shown when the Mac has more than one screen. Tap the one that should show the wall. When the wall is on a second screen, you can keep working on the main one: Clean screen leaves your Dock, menu bar and mouse alone there, and the wall doesn't pull Chrome in front of what you're doing. |

The **← Board** link opens the scoreboard on your phone. It's handy for checking scores without changing the TV.

At the bottom of the remote, **Fix-its** has two buttons:

| Button | What it does |
|---|---|
| **⌘0 Reset zoom on the games** | Puts every game back to normal size, the same as clicking a game window on the Mac and pressing ⌘0. Use it when a game looks blown up or the odds chart is huge. Needs the Sound helper ([section 4](#4-one-time-mac-setup-for-the-tv), step 1). |
| **⟳ Update & restart** | Does what double-clicking `Restart Sportsboard.command` does: gets the latest version (kept only if its tests pass), then restarts Sportsboard. The games on the TV stay up, and the remote reloads itself when Sportsboard is back, usually within a minute. Only shown when Sportsboard starts automatically ([section 3.4](#34-start-it-automatically)). |

---

## 6. Game day

### Picking games

Under **Screens**, each numbered screen has:

- **A menu** to choose the service: YouTube TV / Sunday Ticket, Peacock, Paramount+, Prime Video, Apple TV, Sportsboard scores, or Custom link.
- **A link box:** paste a link to a specific game or channel and tap **Go**. Tap **✕** to clear it.
- **🔊** to play sound from this screen.
- **⤢** to fill the whole TV with this screen. Tap again to go back.
- **⬆** to make this the big screen.
- **💾** (YouTube TV only) to save the channel showing on this screen as a preset button. See [Channel presets](#channel-presets).

The first time each service opens, you may need to click into its window with the Mac's mouse to choose a channel or game.

### Sound

**Sound from** shows one button per screen. Tap one and only that screen plays sound; the others are muted. **🔇 Mute all** silences everything.

### Playback: rewind, pause, live and captions

**Playback** controls the screen that has the sound (shown as "Screen 2 · YouTube TV").

| Button | Does |
|---|---|
| **« 30** / **‹ 10** | Back 30 or 10 seconds |
| **⏯** | Pause / play |
| **10 ›** / **30 »** | Forward 10 or 30 seconds |
| **● Go to live** | Jump back to live after rewinding |
| **CC on / off** | Captions on or off |

A status line underneath shows where you are, such as "Playing · 0:45 behind live" or "Captions on". Captions switch directly on YouTube TV and YouTube. Some services keep captions in a menu; the remote tells you when that's the case, and you set them with the Mac's mouse instead.

### Odds on screen

Each game on the wall can show a live **win-chance chart** in a corner of its screen: both teams' chances over the game, in team colors, with the current percentages at the end of the lines. The numbers come from Polymarket's prediction markets (public prices, no account needed).

- **Which game:** YouTube TV tells Chrome the channel ("FOX 26", "NFL ST - CBS"), not the game, so Sportsboard looks for the matchup ("Jets at Patriots") on the page, then the game you picked with a **📺** button, then the channel's network when only one game is live on it. To choose yourself, use the **Chart:** menu under each screen in **Odds on screen** on the remote: pick any of today's games and that screen shows its chart, whatever the stream says, until you set it back to **Chart: automatic** or change the screen's channel from the remote. A game that runs past its time slot keeps its chart (YouTube TV's page has moved on to the next program by then) until it ends or you change the channel.
- **Delay:** market prices move about 10–20 seconds before the TV shows the play, so the chart runs behind live. Set the delay with **−5 / −1 / +1 / +5** under **Odds on screen** (default 20 s). Wait for a big play: if the chart moves before you see it, add delay; if after, take some away. Pausing or rewinding a game adds to the delay automatically.
- **Move it:** if the chart covers the score or anything else you want to see, tap **↖ ↗ ↙ ↘** under that screen in **Odds on screen** to put it in another corner. **✕** hides the chart on that screen only. Each screen keeps its own corner.
- **Size:** **Small**, **Medium** or **Large** sets the size on every screen. Medium is a quarter of the game's width.
- **Off:** untick **Win-chance chart on each game**.

Only games with a Polymarket market get a chart. Most NFL, college football, NBA, NHL and MLB games have one; smaller games may not.

### Layouts and swapping

**Layout** offers:

- **Single**
- **2 side by side**
- **3 (2 + 1)**
- **2 × 2**
- **1 big + 2**
- **1 big + 3**

With a "1 big" layout, **Swap to big** lets you tap any small screen to move it into the big spot. Its sound comes with it.

Every game window is exactly 16:9, so the video fills it with no black bars.

### Scores panel

Turn on **Scores panel** to fill the space around the games with live scores, upcoming games with their betting lines, and finals. It shows your starred teams first.

### Channel presets

Save the YouTube TV channels you watch most as one-tap buttons:

1. Put **YouTube TV** on a screen, and use the Mac's mouse to tune that window to the channel, such as ESPN.
2. On the remote, tap **💾** on that screen.
3. Name it the way the scoreboard shows the network, for example `ESPN`, `FS1` or `FOX`. To make other spellings match too, add them after commas: `FOX, FOX 26`.

The channel now appears under **My channels**. Tap it to send that channel to any screen.

### Watch buttons 📺

Every live or upcoming game shows its network, in the remote's **Games today** list and in the TV column of the scoreboard. Tap it, then pick a screen:

- **A network you saved as a preset** (ESPN, say) plays on that screen.
- **Peacock, Prime, Apple TV or Paramount+** opens that app on the screen.

The chosen screen also gets the sound.

### YouTube videos

A regular YouTube video or live stream on a screen shows **only the video**, with no search bar, comments or chat. To browse YouTube in that window, click it with the Mac's mouse and press **Escape**. Press Escape again to go back to video-only.

---

## 7. Reading the scoreboard

The board works like a casino sportsbook board. Each league gets a column; a busy league continues into the next column with its header repeated. Every game takes two rows, **away team on top, home team below**, and games alternate green and white so you can tell them apart.

| Column | Meaning |
|---|---|
| **ID** | A game number for this board (away odd, home even). These are house numbers, not a real sportsbook's. |
| **TEAM** | Team name. A small number in front is its national ranking. |
| **SCR** | Score (blank before the game starts). |
| **PS/TOT** | The **point spread** on the favorite's row (e.g. `-3½`) and the **total** (over/under) on the other team's row (e.g. `47½`). `PK` means a pick'em, no favorite. In baseball and hockey the spread is the run line or puck line (`-1½`). |
| **ML** | **Moneyline** for each team: `-150` is the favorite, `+130` the underdog, `EV` even money. |
| **WIN%** | Each team's **chance to win** from Polymarket's prediction market, when there is one. During a game a small line shows how it has moved since kickoff, and **▲ / ▼** marks a jump of 5 points or more in the last few minutes. |
| **TV** | The network. Click it to put the game on a TV screen. |

The lines over each group tell you a game's status:

- **Upcoming:** its start time, e.g. `7:00 PM`.
- **Live:** the clock in amber, e.g. `● 3RD 8:12`.
- **Finished:** `FINAL`, or `FINAL/OT` for overtime.

Betting lines come from ESPN's feed when it has them; otherwise those spots are blank. The WIN% column appears when Polymarket has prices for any game on the board; the scores panel on the TV shows the same percentages.

**On a computer**, at `http://localhost:8788`:

- **Stars:** hover over a team and click its **☆** to pin its games in a **★ Favorites** column at the front. Click **★** to unpin.
- **Game details:** click a game for scoring by quarter or period, box scores and scoring plays.
- **Filters:** use the buttons at the top for one league, Live / Upcoming / Final, or another date. Scores refresh every 30 seconds.
- **Full screen:** shows the board TV-style. Press Escape to leave.

**On the TV** (the **Scoreboard** mode), the board fills the screen with the largest text that fits. On days with too many games for one screen, it flips between pages every 15 seconds, with `PAGE 1 / 2` shown in the corner.

---

## 8. Calm

Calm plays scenery when you're not watching games:

- **Apple Aerials** in four groups: Ocean & underwater, Landscapes, Earth from space and Cityscapes, plus **All Aerials**.
- **Fireplace**, plus any YouTube scenes you add.

| On the remote | Does |
|---|---|
| **⟳ Auto by time of day** | Rotates by time of day, changing scene every 20 minutes. The default rotation is ocean and landscapes in the morning, landscapes and Earth in the afternoon, cities and fireplace in the evening, and fireplace at night. |
| **Follow the sun** | On by default. Morning starts at sunrise and evening at sunset, so the city lights and fireplace come on when it actually gets dark, all year round. Afternoon still starts at noon and night at 9 PM. Turn it off for fixed times (6 AM, noon, 6 PM, 9 PM). The remote shows today's times underneath. |
| **Your city or ZIP code** | Where sunrise and sunset are worked out for. Until you set it, Sportsboard uses the main city of your Mac's time zone (Chicago for Central time), which can be off by most of an hour. Type your city or ZIP code and tap **Set city**. |
| **⟳ Rotate all …** | Rotates through one group. |
| A scene's name | Pins that one scene. |
| **Show clock / Show scene names / Sound** | Switches the clock, the scene's name in the corner, and the sound of YouTube scenes. |
| **Add a scene** | Paste any YouTube video or live link (a live beach cam, an aquarium, a fireplace). Give it a name, and choose whether it joins the morning, afternoon, evening or night rotation, or is only played when you pin it. |
| **Edit** | Shows **✕** next to scenes you added, so you can remove them. |

If a YouTube scene can't be played, Calm skips it and moves on.

---

## 9. Updates

- **Installed with git (Option A):** each time Sportsboard starts, it checks GitHub for a new version, at most once an hour. It installs the update only if the update's built-in tests pass on your Mac; otherwise it stays on the version you have.
- **To update right now:** tap **⟳ Update & restart** under **Fix-its** on the remote, or double-click **`Restart Sportsboard.command`** on the Mac. Both update and restart Sportsboard.
- **After an update:** if the Sound helper misbehaves, go to `chrome://extensions` and click **⟳** on the Sportsboard Sound card.
- **Installed from a ZIP (Option B):** download a new ZIP and replace the folder's files. Keep your `wall-config.json`, which holds your channel presets and scenes. Then double-click `Restart Sportsboard.command`.

Your settings live in `wall-config.json` (channels, scenes, schedule) and `wall-state.json` (what's on the TV). Updates never touch them.

---

## 10. Troubleshooting

| Problem | Fix |
|---|---|
| The remote won't load on my phone | Make sure the phone is on the same Wi-Fi as the Mac and the Mac is awake. Double-click `Restart Sportsboard.command`, which prints the current address; the Mac's address can change after a router restart. |
| More than one screen plays sound, or the remote says sound is in "basic mode" | Install the Sound helper ([section 4](#4-one-time-mac-setup-for-the-tv), step 1), or click **⟳** on its card in `chrome://extensions`. |
| Playback, CC or sound buttons say to allow JavaScript | In Chrome: **View › Developer › Allow JavaScript from Apple Events**. |
| Windows don't move, or nothing happens on the TV | Check **System Settings › Privacy & Security › Automation**: node, osascript or Terminal must be allowed to control Google Chrome and System Events. |
| The menu bar still shows | Set **System Settings › Control Center › Automatically hide and show the menu bar** to **Always**. |
| Window title bars are white | Chrome **Settings › Appearance › Mode › Dark**. |
| A game says too many devices or streams | That service limits simultaneous streams on your account. Use a different service on one of the screens. |
| Calm says no Aerials are downloaded | Download some in **System Settings › Wallpaper** (Aerial section). |
| No WIN% column, or no odds chart on a game | Polymarket has no market for those games, or its prices are briefly unavailable (they come back on their own). On the remote, **Odds on screen** says what each screen matched. A screen showing a channel rather than one game (RedZone, a studio show) gets no chart. |
| Scores are missing or say a feed is unavailable | ESPN's feed is down or slow. Sportsboard keeps the last scores and retries every 30 seconds. |
| The TV goes to "no signal" | The Mac went to sleep. See [section 4](#4-one-time-mac-setup-for-the-tv), step 8. |
| The games are on the wrong screen | Pick the right one under **TV screen** on the remote. If the remote says the screen you picked isn't connected, plug it in (or pick another); meanwhile the wall uses the main screen. |
| A game looks zoomed in, or its odds chart is huge | Tap **⌘0 Reset zoom on the games** under **Fix-its**. If the remote says to update the Sound helper, click **⟳** on its card in `chrome://extensions` first. |
| The odds chart covers the score | Move it to another corner with **↖ ↗ ↙ ↘** under that screen in **Odds on screen**, or tap **✕** to hide it there. |
| Something else | Look at `log.txt` in the `sportsboard` folder for error messages, then double-click `Restart Sportsboard.command`. |

---

## 11. Uninstalling

1. On the remote, choose **Off**. This closes the TV windows and restores your Dock and menu bar.
2. Turn off autostart. In Terminal:

   ```sh
   cd ~/sportsboard
   zsh "./Install Autostart.command" --remove
   ```

3. In `chrome://extensions`, remove **Sportsboard Sound**.
4. Delete the `sportsboard` folder.

---

*Sportsboard uses ESPN's public score feed, which is unofficial and can change or go down without notice, so treat the scores and lines as information, not as a betting service. The phone remote only accepts commands from devices on your home network.*

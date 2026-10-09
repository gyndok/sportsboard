// Sportsboard Sound: enforce "one screen has sound" on the TV Wall using
// Chrome's tab mute, which streaming players cannot undo.
// The Sportsboard server says which wall windows exist (by their on-screen
// bounds) and which one should be heard; this matches them to Chrome windows.
const BASE = 'http://127.0.0.1:8788';
let plan = null, version = -1, running = false;
const mutedByUs = new Set();

const distance = (win, r) => Math.abs(win.left - r.x) + Math.abs(win.top - r.y) + Math.abs(win.width - r.width) + Math.abs(win.height - r.height);

async function enforce() {
  if (!plan) return;
  const wins = await chrome.windows.getAll({populate: true, windowTypes: ['normal', 'popup', 'app']});
  if (!plan.active) { // not in Game day: give back any sound we took away
    for (const id of mutedByUs) await chrome.tabs.update(id, {muted: false}).catch(() => {});
    mutedByUs.clear();
    return;
  }
  // Match each wall screen to the Chrome window sitting where the server put it.
  const role = new Map(); // windowId -> should be heard
  for (const screen of plan.wall) {
    let best = null, bestD = Infinity;
    for (const win of wins) { const d = distance(win, screen.rect); if (d < bestD) { bestD = d; best = win; } }
    if (best && bestD < 240) role.set(best.id, (role.get(best.id) || false) || screen.audio);
  }
  for (const win of wins) {
    if (!role.has(win.id)) continue; // never touch the user's own windows
    const mute = !role.get(win.id);
    for (const tab of win.tabs || []) {
      if (tab.mutedInfo?.muted !== mute) await chrome.tabs.update(tab.id, {muted: mute}).catch(() => {});
      mute ? mutedByUs.add(tab.id) : mutedByUs.delete(tab.id);
    }
  }
}

async function loop() {
  if (running) return;
  running = true;
  while (true) {
    try {
      const res = await fetch(`${BASE}/api/wall/audio?wait=1&v=${version}`, {cache: 'no-store'});
      plan = await res.json();
      version = plan.version;
      await enforce();
    } catch {
      await new Promise(r => setTimeout(r, 5000)); // server restarting or offline
    }
  }
}

// Re-check whenever a tab starts making sound or a page finishes loading.
chrome.tabs.onUpdated.addListener((id, info) => { if ('audible' in info || info.status === 'complete') enforce(); });
chrome.windows.onBoundsChanged?.addListener(() => enforce());
chrome.alarms.create('keepalive', {periodInMinutes: 1});
chrome.alarms.onAlarm.addListener(() => loop());
chrome.runtime.onStartup.addListener(loop);
chrome.runtime.onInstalled.addListener(loop);
loop();

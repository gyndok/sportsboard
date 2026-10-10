// TV Wall: drives Chrome windows on the Mac mini to tile live streams, show
// Sportsboard, a scores sidebar, or a calm ambient scene. Controlled from
// /remote on any phone or laptop on the home network.
import {execFile} from 'node:child_process';
import {readFile, writeFile, stat, rename, copyFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {fileURLToPath} from 'node:url';
import os from 'node:os';
import path from 'node:path';

// Under `npm test` keep state in a temp dir and never touch real windows.
const TESTING = !!process.env.NODE_TEST_CONTEXT;
const DATA_DIR = TESTING ? os.tmpdir() : fileURLToPath(new URL('.', import.meta.url));
const CONFIG_FILE = path.join(DATA_DIR, TESTING ? `wall-config-test-${process.pid}.json` : 'wall-config.json');
const STATE_FILE = path.join(DATA_DIR, TESTING ? `wall-state-test-${process.pid}.json` : 'wall-state.json');
const aerialRoot = () => process.env.WALL_AERIAL_ROOT || '/Library/Application Support/com.apple.idleassetsd/Customer';
const BROWSER = process.env.WALL_BROWSER || 'Google Chrome';

export const defaultConfig = {
  services: [
    {id: 'youtubetv', name: 'YouTube TV / Sunday Ticket', url: 'https://tv.youtube.com/live'},
    {id: 'peacock', name: 'Peacock', url: 'https://www.peacocktv.com/watch/home'},
    {id: 'paramount', name: 'Paramount+', url: 'https://www.paramountplus.com/live-tv/'},
    {id: 'prime', name: 'Prime Video', url: 'https://www.amazon.com/gp/video/storefront'},
    {id: 'appletv', name: 'Apple TV', url: 'https://tv.apple.com/'},
    {id: 'sportsboard', name: 'Sportsboard scores', url: 'local:/'},
    {id: 'custom', name: 'Custom link', url: 'about:blank'}
  ],
  channels: [], // saved live channels: {id, name, aliases:[...], url} — added from the remote
  sidebarWidth: 0.2,
  titlebar: 28, // points of window title bar tucked out of sight in clean mode
  rotateMinutes: 20,
  scenes: [
    {id: 'aerial-ocean', name: 'Ocean & underwater', type: 'aerial', filter: 'underwater|ocean|sea'},
    {id: 'aerial-landscape', name: 'Landscapes', type: 'aerial', filter: 'landscape'},
    {id: 'aerial-earth', name: 'Earth from space', type: 'aerial', filter: 'earth|space'},
    {id: 'aerial-city', name: 'Cityscapes', type: 'aerial', filter: 'city'},
    {id: 'aerial-all', name: 'All Aerials', type: 'aerial', filter: ''},
    {id: 'fireplace', name: 'Fireplace', type: 'youtube', video: 'L_LUpnjgPso', category: 'Fireplace'}
  ],
  // Time-of-day rotation (24h, local time). Each block runs until the next one.
  schedule: [
    {from: '06:00', scenes: ['aerial-ocean', 'aerial-landscape']},
    {from: '12:00', scenes: ['aerial-landscape', 'aerial-earth']},
    {from: '18:00', scenes: ['aerial-city', 'fireplace']},
    {from: '21:00', scenes: ['fireplace']}
  ]
};

// Networks the score feed reports that live in a streaming app rather than on YouTube TV.
const STREAMING_NETWORKS = [
  [/peacock/i, 'peacock'], [/prime|amazon/i, 'prime'], [/apple|mls season pass|friday night baseball/i, 'appletv'],
  [/paramount/i, 'paramount']
];
const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9+]/g, '');
const fitLayout = n => n <= 1 ? 'single' : n === 2 ? 'side' : n === 3 ? 'main2' : 'grid';

// Turn a feed broadcast string like "FS1 / Peacock" into something playable.
function resolveBroadcast(broadcast) {
  const names = String(broadcast || '').split(/\s*[\/,|]\s*/).filter(Boolean);
  for (const name of names) {
    const ch = config.channels.find(c => [c.name, ...(c.aliases || [])].some(a => norm(a) === norm(name)));
    if (ch) return {service: 'youtubetv', link: ch.url, label: ch.name};
  }
  for (const name of names) {
    const hit = STREAMING_NETWORKS.find(([re]) => re.test(name));
    if (hit) { const svc = config.services.find(x => x.id === hit[1]); if (svc) return {service: svc.id, link: '', label: svc.name}; }
  }
  return null;
}

export const LAYOUTS = {
  single: {name: 'Single', slots: 1},
  side: {name: '2 side by side', slots: 2},
  three: {name: '3 (2 + 1)', slots: 3},
  grid: {name: '2 × 2', slots: 4},
  main2: {name: '1 big + 2', slots: 3},
  main3: {name: '1 big + 3', slots: 4}
};

// Every game tile is exactly 16:9 so the video fills it edge to edge. Layouts are
// laid out on the largest 16:9 canvas that fits the screen; on a 16:9 canvas a
// tile whose width and height fractions are equal is itself 16:9. The scores
// panel takes the space the games leave over; without it the games are centered.
export function layoutPlan(layout, area, scores = false) {
  const cw = Math.min(area.width, area.height * 16 / 9), ch = cw * 9 / 16;
  const a = {x: area.x + (area.width - cw) / 2, y: area.y + (area.height - ch) / 2, width: cw, height: ch};
  const R = (fx, fy, fw, fh) => ({x: Math.round(a.x + a.width * fx), y: Math.round(a.y + a.height * fy), width: Math.round(a.width * fw), height: Math.round(a.height * fh)});
  const t = 1 / 3, plans = {
    single: () => scores ? {tiles: [R(0, .1, .8, .8)], scores: R(.8, 0, .2, 1)} : {tiles: [R(0, 0, 1, 1)]},
    side: () => ({tiles: [R(0, scores ? 0 : .25, .5, .5), R(.5, scores ? 0 : .25, .5, .5)], scores: scores ? R(0, .5, 1, .5) : null}),
    three: () => ({tiles: [R(0, 0, .5, .5), R(.5, 0, .5, .5), R(scores ? 0 : .25, .5, .5, .5)], scores: scores ? R(.5, .5, .5, .5) : null}),
    grid: () => scores
      ? {tiles: [R(0, .1, .4, .4), R(.4, .1, .4, .4), R(0, .5, .4, .4), R(.4, .5, .4, .4)], scores: R(.8, 0, .2, 1)}
      : {tiles: [R(0, 0, .5, .5), R(.5, 0, .5, .5), R(0, .5, .5, .5), R(.5, .5, .5, .5)]},
    main2: () => { const y = scores ? 0 : 1 / 6; return {tiles: [R(0, y, 2 * t, 2 * t), R(2 * t, y, t, t), R(2 * t, y + t, t, t)], scores: scores ? R(0, 2 * t, 1, t) : null}; },
    main3: () => ({tiles: [R(0, scores ? 0 : 1 / 6, 2 * t, 2 * t), R(2 * t, 0, t, t), R(2 * t, t, t, t), R(2 * t, 2 * t, t, t)], scores: scores ? R(0, 2 * t, 2 * t, t) : null})
  };
  const plan = (plans[layout] || plans.single)();
  return {tiles: plan.tiles, scores: plan.scores || null, canvas: R(0, 0, 1, 1)};
}

const uid = () => Math.random().toString(36).slice(2, 9);
const defaultState = () => ({
  mode: 'off',
  layout: 'side',
  slots: [
    {uid: uid(), service: 'youtubetv', link: ''},
    {uid: uid(), service: 'youtubetv', link: ''},
    {uid: uid(), service: 'peacock', link: ''},
    {uid: uid(), service: 'sportsboard', link: ''}
  ],
  sidebar: false,
  clean: true,
  cleanPrev: null,
  audio: null,
  solo: null,
  calm: {pinned: null, clock: true, sound: false, names: false},
  windows: {},
  windowUrls: {},
  warnings: [],
  updated: null
});

let config = structuredClone(defaultConfig);
let state = defaultState();
let base = 'http://127.0.0.1:8787';
let lock = Promise.resolve();
let muteTimer = null;

// ---------- sound helper (Chrome extension in ./chrome-extension) ----------
// The extension long-polls /api/wall/audio and uses Chrome's tab mute, which web
// players can't override. Page-level muting is only the fallback without it.
let audioVersion = 0, helperSeen = 0;
const audioWaiters = new Set();
const helperActive = () => Date.now() - helperSeen < 90000;
function bumpAudio() { audioVersion++; for (const w of audioWaiters) w(); audioWaiters.clear(); }
function audioPlan() {
  if (state.mode !== 'grid') return {version: audioVersion, active: false, wall: []};
  const rectOf = key => state.actual?.[key] || null;
  const wall = visibleSlots().map(s => ({key: `slot:${s.uid}`, audio: s.uid === state.audio, rect: rectOf(`slot:${s.uid}`)}))
    .concat(state.sidebar ? [{key: 'sidebar', audio: false, rect: rectOf('sidebar')}] : [])
    .filter(w => w.rect);
  return {version: audioVersion, active: true, audio: state.audio, wall};
}

// ---------- persistence: atomic, serialized writes with a last-good copy ----------
const writeChains = new Map();
function writeJsonAtomic(file, data) {
  const run = (writeChains.get(file) || Promise.resolve()).then(async () => {
    const tmp = `${file}.tmp-${process.pid}`;
    await writeFile(tmp, JSON.stringify(data, null, 2));
    await rename(tmp, file); // replaces the old file in one step, so a crash mid-save can't truncate it
  });
  writeChains.set(file, run.catch(() => {}));
  return run;
}
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
async function loadJson(file) {
  for (const f of [file, `${file}.last-good`]) {
    let text;
    try { text = await readFile(f, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') console.error(`Couldn't read ${f}: ${e.message}`); continue; }
    try {
      const v = JSON.parse(text);
      if (!isObj(v)) throw Error('not an object');
      if (f !== file) console.error(`${path.basename(file)} was unreadable; recovered settings from ${path.basename(f)}`);
      return {value: v, fromBackup: f !== file};
    } catch (e) {
      console.error(`${f} is not valid JSON (${e.message}); keeping a copy as .corrupt`);
      await copyFile(f, `${f}.corrupt`).catch(() => {});
    }
  }
  return null;
}
async function saveConfig() { await writeJsonAtomic(CONFIG_FILE, config); }
async function saveState() {
  state.updated = new Date().toISOString();
  try { await writeJsonAtomic(STATE_FILE, state); } catch (e) { console.error(`Couldn't save wall state: ${e.message}`); }
}

// Keep only well-formed entries from a saved config; fall back to defaults otherwise.
function sanitizeConfig(saved) {
  const c = {...structuredClone(defaultConfig), ...saved};
  const keep = (list, ok, what) => { if (!Array.isArray(list)) return null; const good = list.filter(ok); if (good.length !== list.length) console.error(`Dropped ${list.length - good.length} invalid ${what} from wall-config.json`); return good; };
  c.services = keep(c.services, x => isObj(x) && typeof x.id === 'string' && typeof x.name === 'string' && typeof x.url === 'string', 'services') || structuredClone(defaultConfig.services);
  c.channels = keep(c.channels, x => isObj(x) && typeof x.id === 'string' && typeof x.name === 'string' && validUrl(x.url), 'channels') || [];
  c.scenes = keep(c.scenes, x => isObj(x) && typeof x.id === 'string' && typeof x.name === 'string' && (x.type === 'aerial' || (x.type === 'youtube' && /^[\w-]{11}$/.test(x.video || ''))), 'scenes') || structuredClone(defaultConfig.scenes);
  c.schedule = keep(c.schedule, x => isObj(x) && /^\d{2}:\d{2}$/.test(x.from || '') && Array.isArray(x.scenes), 'schedule blocks') || structuredClone(defaultConfig.schedule);
  if (!(c.rotateMinutes >= 1 && c.rotateMinutes <= 1440)) c.rotateMinutes = defaultConfig.rotateMinutes;
  if (!(c.titlebar >= 0 && c.titlebar <= 80)) c.titlebar = defaultConfig.titlebar;
  return c;
}

export async function initWall({port}) {
  base = `http://127.0.0.1:${port}`;
  const loadedConfig = await loadJson(CONFIG_FILE);
  if (loadedConfig) {
    config = sanitizeConfig(loadedConfig.value);
    // Refresh the backup only from a main file that loaded; after recovering from the
    // backup, rewrite the main file instead (never copy a corrupt file over the backup).
    if (loadedConfig.fromBackup) await saveConfig().catch(e => console.error(`Couldn't rewrite wall-config.json: ${e.message}`));
    else await copyFile(CONFIG_FILE, `${CONFIG_FILE}.last-good`).catch(() => {});
  } else await saveConfig().catch(e => console.error(`Couldn't write wall-config.json: ${e.message}`));
  const loaded = await loadJson(STATE_FILE);
  if (loaded) {
    const saved = loaded.value;
    // Restore field by field: one stale value (say, a pinned scene that was since
    // deleted) is dropped on its own instead of throwing away the whole wall.
    let next = defaultState();
    for (const key of ['mode', 'layout', 'sidebar', 'clean', 'slots', 'audio', 'solo']) {
      if (saved[key] === undefined) continue;
      try { next = buildCandidate({[key]: saved[key]}, next); } catch (e) { console.error(`Ignoring saved ${key}: ${e.message}`); }
    }
    if (isObj(saved.calm)) for (const key of ['pinned', 'clock', 'sound', 'names']) {
      if (saved.calm[key] === undefined) continue;
      try { next = buildCandidate({calm: {[key]: saved.calm[key]}}, next); } catch (e) { console.error(`Ignoring saved calm ${key}: ${e.message}`); }
    }
    state = next;
    if (isObj(saved.windows)) state.windows = saved.windows;
    if (isObj(saved.windowUrls)) state.windowUrls = saved.windowUrls;
    if (isObj(saved.windowOrigins)) state.windowOrigins = saved.windowOrigins;
    if (isObj(saved.cleanPrev) && typeof saved.cleanPrev.dock === 'boolean') state.cleanPrev = saved.cleanPrev;
    state.updated = saved.updated || null;
    state.gridSince = saved.gridSince || null;
  }
  // Nothing to recover when the wall is off with no windows and no hidden Dock to restore;
  // don't launch or focus Chrome at every login for no reason.
  const needsRecovery = state.mode !== 'off' || Object.keys(state.windows).length || state.cleanPrev;
  if (needsRecovery && !TESTING && process.platform === 'darwin') setTimeout(() => exclusive(recoverWall).catch(e => console.error(`Startup recovery failed: ${e.message}`)), 4000);
}

// After a server, Chrome or Mac restart: forget windows that are no longer ours,
// put back Dock/menu-bar settings if a previous run left them hidden, and rebuild
// the wall.
async function recoverWall() {
  const entries = Object.entries(state.windows);
  if (entries.length) {
    const info = await osa(`if(!chrome.running())return '[]';return JSON.stringify(arg.map(id=>{try{return {id,url:chrome.windows.byId(id).activeTab.url()}}catch(e){return {id,url:null}}}))`, entries.map(([, id]) => id)).catch(() => []);
    const urlById = Object.fromEntries((Array.isArray(info) ? info : []).map(i => [i.id, i.url]));
    // Compare with the site each window actually landed on last time (pages redirect,
    // e.g. youtu.be → www.youtube.com), falling back to the site we asked for.
    const site = u => { try { return new URL(u).hostname.replace(/^www\./, '').split('.').slice(-2).join('.'); } catch { return null; } };
    for (const [key, id] of entries) {
      const now = site(urlById[id]);
      const expected = [state.windowOrigins?.[key], state.windowUrls[key]].map(site).filter(Boolean);
      if (!now || !expected.includes(now)) { delete state.windows[key]; delete state.windowUrls[key]; delete state.windowOrigins?.[key]; }
    }
  }
  // Game day windows still open (only the server restarted): keep watching. If they're
  // gone (Mac or Chrome restarted), reopen streams only if Game day was set recently.
  const gamesStillOpen = Object.keys(state.windows).some(k => k.startsWith('slot:'));
  const age = Date.now() - Date.parse(state.gridSince || 0);
  if (state.mode === 'grid' && !gamesStillOpen && !(age < 6 * 3600e3)) state.mode = 'off';
  await applyNow();
}

// ---------- macOS automation (JavaScript for Automation via osascript) ----------
function osa(body, arg, {chrome = true} = {}) {
  const head = chrome ? `const chrome=Application(${JSON.stringify(BROWSER)});` : '';
  const script = `function run(argv){const arg=JSON.parse(argv[0]);${head}${body}}`;
  return new Promise((resolve, reject) => execFile('osascript', ['-l', 'JavaScript', '-e', script, JSON.stringify(arg ?? null)], {timeout: 20000}, (err, stdout, stderr) => {
    if (err) return reject(Error((stderr || err.message).trim()));
    const out = stdout.trim();
    try { resolve(out ? JSON.parse(out) : null); } catch { resolve(out); }
  }));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function screenArea() {
  return osa(`ObjC.import('AppKit');const s=$.NSScreen.mainScreen,f=s.frame,v=s.visibleFrame;
    return JSON.stringify({x:v.origin.x,y:f.size.height-(v.origin.y+v.size.height),width:v.size.width,height:v.size.height});`, null, {chrome: false});
}
async function windowIds() {
  return osa(`if(!chrome.running())return '[]';return JSON.stringify(chrome.windows.id());`) || [];
}
async function openWindow(url) {
  const before = new Set(await windowIds());
  await new Promise((resolve, reject) => execFile('open', ['-na', BROWSER, '--args', `--app=${url}`], err => err ? reject(err) : resolve()));
  for (let i = 0; i < 40; i++) {
    await sleep(300);
    const fresh = (await windowIds()).find(id => !before.has(id) && !Object.values(state.windows).includes(id));
    if (fresh) return fresh;
  }
  // Fallback: a normal browser window if the app-window id could not be found.
  return osa(`const w=chrome.Window().make();w.activeTab.url=arg;return JSON.stringify(w.id());`, url);
}
const setBounds = (id, r) => osa(`const w=chrome.windows.byId(arg.id);w.bounds={x:arg.r.x,y:arg.r.y,width:arg.r.width,height:arg.r.height};return 'true';`, {id, r});
const setUrl = (id, url) => osa(`chrome.windows.byId(arg.id).activeTab.url=arg.url;return 'true';`, {id, url});
const closeWindow = id => osa(`chrome.windows.byId(arg).close();return 'true';`, id);
const raise = ids => ids.length ? osa(`for(const id of arg){try{chrome.windows.byId(id).index=1;}catch(e){}}chrome.activate();return 'true';`, ids) : Promise.resolve();
// Re-stack only if something is out of order: the first id (the backdrop) must be
// behind every other wall window. Returns true when it had to fix the order.
const fixStacking = ids => osa(`const idx=id=>{try{return chrome.windows.byId(id).index()}catch(e){return null}};
  const back=idx(arg[0]);if(back===null)return 'false';
  const bad=arg.slice(1).some(id=>{const i=idx(id);return i!==null&&i>back});
  if(!bad)return 'false';
  for(const id of arg){try{chrome.windows.byId(id).index=1;}catch(e){}}chrome.activate();return 'true';`, ids);
let stackOrder = [];

// Regular YouTube pages (not YouTube TV) on a wall screen show only the video: the
// page's own player is pinned over the whole window, so the search bar, title, live
// chat and comments stay out of sight while YouTube Premium, sign-in and live streams
// keep working. Escape in that window toggles the normal page back for browsing.
// Ancestors of the player are neutralised so nothing traps or covers the fixed player.
const YT_CSS = [
  'html.wall-yt,html.wall-yt body{overflow:hidden!important;background:#000!important}',
  'html.wall-yt #masthead-container,html.wall-yt ytd-masthead{display:none!important}',
  'html.wall-yt .wall-yt-anc{transform:none!important;filter:none!important;backdrop-filter:none!important;perspective:none!important;contain:none!important;container-type:normal!important;will-change:auto!important;z-index:auto!important;isolation:auto!important;opacity:1!important}',
  'html.wall-yt .wall-yt-player{position:fixed!important;left:0!important;top:0!important;right:auto!important;bottom:auto!important;width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;min-width:0!important;min-height:0!important;margin:0!important;border-radius:0!important;z-index:2100!important;background:#000!important}',
  'html.wall-yt .wall-yt-player video.html5-main-video{left:0!important;top:0!important;width:100vw!important;height:100vh!important;object-fit:contain!important}',
  'html.wall-yt tp-yt-paper-dialog,html.wall-yt tp-yt-iron-overlay-backdrop,html.wall-yt tp-yt-iron-dropdown{z-index:2147483000!important}'
].join('');
export const YT_JS = `if(/(^|\\.)youtube\\.com$/.test(location.hostname)&&location.hostname!=='tv.youtube.com'){
if(!window.__wallYT){const css=document.createElement('style');css.textContent=${JSON.stringify(YT_CSS)};document.documentElement.appendChild(css);
const w=window.__wallYT={off:false,sync(){const d=document.documentElement,path=location.pathname,watch=path==='/watch'||path.startsWith('/live/');
const p=watch&&!w.off?(document.querySelector('ytd-watch-flexy #movie_player,ytd-watch-grid #movie_player,#player #movie_player')||document.querySelector('#movie_player')):null;
document.querySelectorAll('.wall-yt-player,.wall-yt-anc').forEach(x=>{if(x!==p&&!(p&&x.contains(p)))x.classList.remove('wall-yt-player','wall-yt-anc')});
if(p){p.classList.add('wall-yt-player');for(let a=p.parentElement;a&&a!==d;a=a.parentElement)a.classList.add('wall-yt-anc');}
if(d.classList.contains('wall-yt')!==!!p){d.classList.toggle('wall-yt',!!p);dispatchEvent(new Event('resize'));setTimeout(()=>dispatchEvent(new Event('resize')),600);}}};
document.addEventListener('yt-navigate-finish',()=>setTimeout(()=>w.sync(),300));
addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.fullscreenElement){w.off=!w.off;w.sync();}},true);}
window.__wallYT.sync();}`;

// Runs inside each stream page: mute/unmute its video and paint the window frame black
// (Chrome tints an app window's title bar with the page's theme-color).
export const PAGE_JS = `(()=>{const mute=__MUTED__;if(mute!==null)document.querySelectorAll('video,audio').forEach(m=>{m.muted=mute});
if(__CLEAN__&&!window.__wallTitle){window.__wallTitle=1;const B='\\u2800';const blank=()=>{if(document.title!==B)document.title=B;};blank();
new MutationObserver(blank).observe(document.head,{childList:true,subtree:true,characterData:true});}
let t=document.querySelector('meta[name=theme-color][data-wall]');
document.querySelectorAll('meta[name=theme-color]:not([data-wall])').forEach(m=>m.remove());
if(!t){t=document.createElement('meta');t.name='theme-color';t.dataset.wall='1';document.head.appendChild(t);}
t.content='#000000';
${YT_JS}
return 'ok';})()`;
async function setMutes(list) {
  if (!list.length) return [];
  return osa(`const errs=[];for(const it of arg.list){try{chrome.windows.byId(it.id).activeTab.execute({javascript:arg.js.replace('__MUTED__',String(it.muted)).replace('__CLEAN__',String(arg.clean))});}catch(e){errs.push(String(e))}}return JSON.stringify(errs);`, {list, js: PAGE_JS, clean: state.clean && state.mode !== 'off'});
}

// ---------- clean screen: hide Dock + menu bar, park the pointer ----------
// Remember the user's own Dock/menu-bar settings before the first change and only
// ever restore exactly what was captured. If they can't be read, leave them alone.
const setDock = want => osa(`const d=Application('System Events').dockPreferences;const errs=[];if(arg.dock!==null){try{d.autohide=arg.dock}catch(e){errs.push(String(e))}}if(arg.menu!==null){try{d.autohideMenuBar=arg.menu}catch(e){errs.push(String(e))}}return JSON.stringify(errs);`, want, {chrome: false}).then(r => r || []);
async function setClean(on) {
  if (on) {
    if (!state.cleanPrev) {
      const prev = await osa(`const d=Application('System Events').dockPreferences;let menu=null;try{menu=d.autohideMenuBar()}catch(e){}return JSON.stringify({dock:d.autohide(),menu});`, null, {chrome: false}).catch(() => null);
      if (!isObj(prev) || typeof prev.dock !== 'boolean') return ['Could not read your Dock settings, so they were left alone. Allow control of System Events when macOS asks.'];
      state.cleanPrev = prev;
      await saveState(); // saved first, so a crash can still restore them on the next start
    }
    return setDock({dock: true, menu: state.cleanPrev.menu === null ? null : true});
  }
  if (!state.cleanPrev) return []; // nothing was changed, so nothing to restore
  const errs = await setDock(state.cleanPrev);
  if (!errs.length) state.cleanPrev = null;
  return errs;
}
const parkPointer = area => osa(`ObjC.import('CoreGraphics');$.CGWarpMouseCursorPosition({x:arg.x,y:arg.y});return 'true';`, {x: area.x + area.width - 2, y: Math.round(area.y + area.height / 2)}, {chrome: false});
let cleanApplied = null;

// ---------- applying state to the screen ----------
const resolveUrl = u => u.startsWith('local:') ? base + u.slice(6) : u;
const serviceUrl = s => s.link || config.services.find(x => x.id === s.service)?.url || 'about:blank';
const visibleSlots = () => state.slots.slice(0, LAYOUTS[state.layout]?.slots || 1);

function desiredWindows(area) {
  const want = [];
  if (state.mode === 'grid') {
    const plan = layoutPlan(state.layout, area, state.sidebar);
    // A black window behind the games hides the desktop and other apps in any spare space.
    want.push({key: 'backdrop', url: `${base}/backdrop`, rect: area});
    if (plan.scores) want.push({key: 'sidebar', url: `${base}/sidebar`, rect: plan.scores});
    visibleSlots().forEach((s, i) => want.push({key: `slot:${s.uid}`, slot: s, url: resolveUrl(serviceUrl(s)), rect: state.solo === s.uid ? plan.canvas : plan.tiles[i]}));
  } else if (state.mode === 'sportsboard') {
    want.push({key: 'main', url: `${base}/`, rect: area});
  } else if (state.mode === 'calm') {
    want.push({key: 'calm', url: `${base}/calm`, rect: area});
  }
  return want;
}

async function applyNow() {
  const warnings = [];
  if (process.platform !== 'darwin' || TESTING) { state.warnings = ['Window control only works on the Mac mini.']; await saveState(); return; }
  const clean = state.clean && state.mode !== 'off';
  if (clean !== cleanApplied) {
    let errs;
    try { errs = await setClean(clean); } catch (e) { errs = [e.message]; }
    if (errs.length) {
      warnings.push(errs.find(e => e.startsWith('Could not read')) || `Couldn't ${clean ? 'hide' : 'restore'} the Dock/menu bar: ${errs[0]}`);
      cleanApplied = null; // not applied: try again on the next change
    } else {
      cleanApplied = clean;
      await sleep(1200); // let macOS finish sliding the Dock/menu bar
    }
  }
  const area = await screenArea();
  const live = new Set(await windowIds());
  // In clean mode the top row's title bars sit in a thin strip at the top of the
  // screen (macOS won't place windows above it), so lay the games out below that
  // strip; lower rows tuck their title bars under the window above.
  const tb = config.titlebar ?? 28;
  const want = desiredWindows(clean ? {...area, y: area.y + tb, height: area.height - tb} : area);
  if (clean) {
    for (const w of want) w.rect = {...w.rect, y: w.rect.y - tb, height: w.rect.height + tb};
    want.sort((a, b) => (a.key === 'backdrop' ? -1 : b.key === 'backdrop' ? 1 : b.rect.y - a.rect.y));
  }
  const wantKeys = new Set(want.map(w => w.key));
  for (const [key, id] of Object.entries(state.windows)) {
    if (!wantKeys.has(key) || !live.has(id)) {
      if (live.has(id)) await closeWindow(id).catch(() => {});
      delete state.windows[key]; delete state.windowUrls[key];
    }
  }
  for (const w of want) {
    try {
      let id = state.windows[w.key];
      if (id && state.windowUrls[w.key] !== w.url) { await setUrl(id, w.url); state.windowUrls[w.key] = w.url; }
      if (!id) { id = await openWindow(w.url); state.windows[w.key] = id; state.windowUrls[w.key] = w.url; }
      await setBounds(id, w.rect);
    } catch (e) { warnings.push(`Couldn't place ${w.key.replace('slot:', 'slot ')}: ${e.message}`); }
  }
  const order = want.map(w => state.windows[w.key]).filter(Boolean);
  const solo = state.solo && state.windows[`slot:${state.solo}`];
  stackOrder = solo ? [...order.filter(id => id !== solo), solo] : order;
  await raise(stackOrder).catch(() => {});
  // Streams that finish loading late can pop their window forward, and need the page
  // script (mutes, black frame, video-only YouTube); run both again shortly.
  for (const ms of [3000, 8000]) setTimeout(() => { lock = lock.then(applyAudio).then(keepStacking).catch(() => {}); }, ms);
  if (clean) await parkPointer(area).catch(() => {});
  state.debug = {area, want: want.map(w => ({key: w.key, id: state.windows[w.key], rect: w.rect})),
    got: await osa(`return JSON.stringify(arg.map(id=>{try{const w=chrome.windows.byId(id);return {id,index:w.index(),b:w.bounds(),title:w.name(),url:w.activeTab.url()}}catch(e){return {id,err:String(e)}}}))`, order).catch(e => String(e))};
  // Where each wall window actually ended up (macOS may clamp what we asked for).
  const gotById = Object.fromEntries((Array.isArray(state.debug.got) ? state.debug.got : []).filter(g => g.b).map(g => [g.id, g.b]));
  state.actual = Object.fromEntries(want.map(w => [w.key, gotById[state.windows[w.key]] || w.rect]));
  const urlById = Object.fromEntries((Array.isArray(state.debug.got) ? state.debug.got : []).filter(g => g.url).map(g => [g.id, g.url]));
  state.windowOrigins = Object.fromEntries(want.filter(w => urlById[state.windows[w.key]]).map(w => [w.key, urlById[state.windows[w.key]]]));
  warnings.push(...await applyAudio());
  state.warnings = warnings;
  await saveState();
  scheduleMuteRefresh();
}

async function applyAudio() {
  bumpAudio(); // wakes the sound helper so it re-applies tab mutes right away
  if (state.mode === 'off') return [];
  const visible = state.mode === 'grid' ? visibleSlots().filter(s => s.service !== 'sportsboard') : [];
  if (state.mode === 'grid' && state.audio !== 'none' && !visible.some(s => s.uid === state.audio)) state.audio = visible[0]?.uid || null;
  // With the helper, keep every page's own video unmuted and let Chrome's tab mute decide.
  const helper = helperActive();
  const list = Object.entries(state.windows).map(([key, id]) => {
    const slot = visible.find(s => `slot:${s.uid}` === key);
    return {id, muted: slot ? (helper ? false : slot.uid !== state.audio) : null};
  }).filter(x => x.id);
  try {
    const errs = await setMutes(list);
    if (errs?.some(e => /JavaScript|Apple ?Events|not allowed/i.test(e))) return ['To switch audio between games, turn on Chrome › View › Developer › Allow JavaScript from Apple Events (one time).'];
  } catch (e) { return [`Audio switching unavailable: ${e.message}`]; }
  return [];
}

// Streams sometimes recreate their video element, so re-apply mutes periodically.
async function keepStacking() {
  if (state.mode !== 'grid' || !state.windows.backdrop || stackOrder[0] !== state.windows.backdrop) return;
  await fixStacking(stackOrder).catch(() => {});
}

function scheduleMuteRefresh() {
  clearInterval(muteTimer);
  let tick = 0; // every 5s: check stacking; every 15s: also re-apply page mutes/titles
  if (state.mode !== 'off') muteTimer = setInterval(() => { lock = lock.then(() => (++tick % 3 ? null : applyAudio())).then(keepStacking).catch(() => {}); }, 5000);
}

// Every change to the wall (validate → commit → put it on screen → save) runs one at
// a time, so two phones can't interleave half-applied commands.
function exclusive(fn) {
  const run = lock.then(fn, fn);
  lock = run.catch(() => {});
  return run;
}
const apply = () => exclusive(applyNow);

// ---------- calm scenes ----------
export const sceneCategory = s => s.category || (s.type === 'aerial' ? 'Apple Aerials' : 'My scenes');

// Pick the scene to show now: a pinned scene, a pinned category ("cat:<name>"),
// or the time-of-day schedule. Scenes the TV reported as unplayable are skipped.
function sceneNow(now = new Date(), skip = new Set()) {
  const scenes = config.scenes;
  const pin = state.calm.pinned;
  let pool;
  if (pin?.startsWith('cat:')) pool = scenes.filter(s => sceneCategory(s) === pin.slice(4)).map(s => s.id);
  else if (pin && scenes.some(s => s.id === pin)) pool = [pin];
  else {
    const mins = now.getHours() * 60 + now.getMinutes();
    const toMin = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
    const sorted = [...(config.schedule || [])].sort((a, b) => toMin(a.from) - toMin(b.from));
    const block = sorted.filter(b => toMin(b.from) <= mins).pop() || sorted[sorted.length - 1];
    pool = (block?.scenes || []).filter(id => scenes.some(s => s.id === id));
  }
  const playable = pool.filter(id => !skip.has(id));
  if (!playable.length) return scenes.find(s => s.type === 'aerial' && !s.filter) || scenes.find(s => !skip.has(s.id)) || null;
  const slot = Math.floor(now.getTime() / 60000 / (config.rotateMinutes || 20));
  return scenes.find(s => s.id === playable[slot % playable.length]);
}

let aerialCache = null;
async function aerials() {
  const AERIAL_ROOT = aerialRoot();
  if (aerialCache && aerialCache.root === AERIAL_ROOT && Date.now() - aerialCache.at < 300000) return aerialCache.list;
  let entries = {};
  try { entries = JSON.parse(await readFile(path.join(AERIAL_ROOT, 'entries.json'), 'utf8')); } catch {}
  const catNames = {};
  const walk = cats => (cats || []).forEach(c => { catNames[c.id] = [c.localizedNameKey, c.name, c.localizedDescriptionKey].filter(Boolean).join(' '); walk(c.subcategories); });
  walk(entries.categories);
  const list = [];
  for (const a of entries.assets || []) {
    for (const dir of ['4KSDR240FPS', '4KSDR', '4KHDR', '2KSDR240FPS']) {
      const file = path.join(AERIAL_ROOT, dir, `${a.id}.mov`);
      try { await stat(file); } catch { continue; }
      const tags = [a.accessibilityLabel, a.localizedNameKey, ...(a.categories || []).map(c => catNames[c] || ''), ...(a.subcategories || []).map(c => catNames[c] || '')].join(' ');
      list.push({id: a.id, label: a.accessibilityLabel || a.localizedNameKey || 'Aerial', tags, file});
      break;
    }
  }
  aerialCache = {at: Date.now(), root: AERIAL_ROOT, list};
  return list;
}

function youtubeId(input) {
  const s = String(input || '').trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1, 12);
    if (/youtube\.com$/.test(u.hostname)) return u.searchParams.get('v') || u.pathname.match(/\/(?:live|embed|shorts)\/([\w-]{11})/)?.[1] || null;
  } catch {}
  return null;
}

// ---------- HTTP ----------
function lanAddresses(port) {
  try { return Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => `http://${i.address}:${port}/remote`); }
  catch { return []; } // only used to suggest a phone URL; never worth failing the request
}
class BadRequest extends Error { constructor(m, status = 400) { super(m); this.status = status; } }
const bad = (m, status) => { throw new BadRequest(m, status); };
const MAX_SLOTS = 4;
const privateIp = ip => /^(::1|127\.|::ffff:127\.|10\.|::ffff:10\.|192\.168\.|::ffff:192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::ffff:172\.(1[6-9]|2\d|3[01])\.|fe80:|fc|fd|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/i.test(ip || '');
const publicState = () => { const {windows, windowUrls, windowOrigins, cleanPrev, ...rest} = state; return rest; };
function send(res, code, body) { res.writeHead(code, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}); res.end(JSON.stringify(body)); }
async function readBody(req) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > 20000) bad('Request too large', 413); chunks.push(c); }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { bad('Invalid JSON'); }
  if (!isObj(body)) bad('Expected a JSON object');
  return body;
}
const validUrl = u => { try { const x = new URL(u); return ['http:', 'https:'].includes(x.protocol); } catch { return false; } };

// Build the complete next state from a change request without touching the live
// state. Anything invalid throws, so a rejected request changes nothing.
const PATCH_KEYS = new Set(['mode', 'layout', 'sidebar', 'clean', 'slots', 'audio', 'solo', 'calm']);
const MODES = ['off', 'grid', 'sportsboard', 'calm'];
function buildCandidate(p, from = state) {
  if (!isObj(p)) bad('Expected a JSON object');
  for (const k of Object.keys(p)) if (!PATCH_KEYS.has(k)) bad(`Unknown setting: ${k}`);
  const next = {...from, calm: {...from.calm}, slots: from.slots.map(s => ({...s}))};
  if (p.mode !== undefined) {
    if (!MODES.includes(p.mode)) bad('Bad mode');
    if (p.mode === 'grid' && from.mode !== 'grid') next.gridSince = new Date().toISOString();
    next.mode = p.mode;
  }
  if (p.layout !== undefined) { if (typeof p.layout !== 'string' || !Object.hasOwn(LAYOUTS, p.layout)) bad('Bad layout'); next.layout = p.layout; }
  for (const k of ['sidebar', 'clean']) if (p[k] !== undefined) { if (typeof p[k] !== 'boolean') bad(`${k} must be true or false`); next[k] = p[k]; }
  if (p.slots !== undefined) {
    if (!Array.isArray(p.slots) || p.slots.length > MAX_SLOTS) bad(`Use up to ${MAX_SLOTS} screens`);
    const given = new Set(p.slots.map(s => s?.uid).filter(Boolean)), seen = new Set();
    next.slots = p.slots.map(s => {
      if (!isObj(s)) bad('Bad screen');
      if (typeof s.service !== 'string' || !config.services.some(x => x.id === s.service)) bad('Unknown service');
      if (s.link != null && typeof s.link !== 'string') bad('Bad link');
      const link = (s.link || '').trim();
      if (link && !validUrl(link)) bad('Links must start with http:// or https://');
      let id = s.uid;
      if (id == null || id === '') { do id = uid(); while (given.has(id) || seen.has(id)); }
      else if (typeof id !== 'string' || !/^[a-z0-9]{1,12}$/.test(id)) bad('Bad screen id');
      if (seen.has(id)) bad('Two screens have the same id');
      seen.add(id);
      return {uid: id, service: s.service, link};
    });
  }
  const uids = new Set(next.slots.map(s => s.uid));
  if (p.audio !== undefined) { if (p.audio === null || p.audio === 'none' || uids.has(p.audio)) next.audio = p.audio; else bad('Unknown screen for sound'); }
  if (p.solo !== undefined) { if (p.solo === null || uids.has(p.solo)) next.solo = p.solo; else bad('Unknown screen'); }
  const visible = new Set(next.slots.slice(0, LAYOUTS[next.layout].slots).map(s => s.uid));
  if (next.solo && !visible.has(next.solo)) next.solo = null;
  if (next.audio && next.audio !== 'none' && !uids.has(next.audio)) next.audio = null;
  if (p.calm !== undefined) {
    if (!isObj(p.calm)) bad('Bad calm settings');
    for (const k of Object.keys(p.calm)) if (!['pinned', 'clock', 'sound', 'names'].includes(k)) bad(`Unknown calm setting: ${k}`);
    if (p.calm.pinned !== undefined) {
      const pin = p.calm.pinned;
      if (pin === null || pin === '') next.calm.pinned = null;
      else if (typeof pin !== 'string') bad('Bad scene');
      else {
        const ok = pin.startsWith('cat:') ? config.scenes.some(sc => sceneCategory(sc) === pin.slice(4)) : config.scenes.some(sc => sc.id === pin);
        if (!ok) bad('Unknown scene');
        next.calm.pinned = pin;
      }
    }
    for (const k of ['clock', 'sound', 'names']) if (p.calm[k] !== undefined) { if (typeof p.calm[k] !== 'boolean') bad(`${k} must be true or false`); next.calm[k] = p.calm[k]; }
  }
  return next;
}

export async function handleWall(req, res, url, port) {
  const p = url.pathname;
  if (!(p.startsWith('/api/wall') || p.startsWith('/aerial/'))) return false;
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const getOnly = p === '/api/wall/audio' || p === '/api/wall/calm' || p.startsWith('/aerial/');
    const allowed = p === '/api/wall' ? ['GET', 'POST'] : getOnly ? ['GET', 'HEAD'] : ['POST'];
    if (!allowed.includes(req.method)) { res.setHeader('Allow', allowed.join(', ')); send(res, 405, {error: 'Method not allowed'}); return true; }
    if (req.method === 'POST') {
      // Changes only from the home network, and only from pages served by this server.
      const origin = req.headers.origin;
      let sameOrigin = !origin;
      if (origin) { try { sameOrigin = new URL(origin).host === req.headers.host; } catch { sameOrigin = false; } }
      if (!privateIp(req.socket.remoteAddress) || !sameOrigin) { send(res, 403, {error: 'Forbidden'}); return true; }
    }
    if (p === '/api/wall' && req.method === 'GET') {
      send(res, 200, {state: publicState(), soundHelper: helperActive(), services: config.services, channels: config.channels, scenes: config.scenes, layouts: LAYOUTS, scene: sceneNow(), remoteUrls: lanAddresses(port), aerialCount: (await aerials()).length});
    } else if (p === '/api/wall/audio') {
      // Only the Sportsboard Sound extension counts as "the helper is running".
      if (req.headers['x-sportsboard-helper'] === '1' || /^chrome-extension:\/\//.test(req.headers.origin || '')) helperSeen = Date.now();
      const since = Number(url.searchParams.get('v'));
      if (url.searchParams.has('wait') && since === audioVersion && audioWaiters.size < 16) {
        await new Promise(resolve => { const done = () => { clearTimeout(t); audioWaiters.delete(done); resolve(); }; const t = setTimeout(done, 25000); audioWaiters.add(done); req.on('close', done); });
      }
      if (!res.writableEnded && !res.destroyed) send(res, 200, audioPlan());
    } else if (p === '/api/wall' && req.method === 'POST') {
      const body = await readBody(req);
      await exclusive(async () => {
        const next = buildCandidate(body); // throws (and changes nothing) if invalid
        state = next;
        const calmOnly = state.mode === 'calm' && state.windows.calm && (state.clean && state.mode !== 'off') === cleanApplied;
        if (calmOnly) await saveState();
        else await applyNow().catch(async e => { state.warnings = [`The TV couldn't be updated: ${e.message}`]; await saveState(); });
      });
      send(res, 200, {state: publicState(), scene: sceneNow()});
    } else if (p === '/api/wall/channel' && req.method === 'POST') {
      const b = await readBody(req);
      if (b.remove) {
        config.channels = config.channels.filter(c => c.id !== b.remove);
      } else {
        const name = String(b.name || '').trim().slice(0, 30);
        if (!name) return send(res, 400, {error: 'Give the channel a name, e.g. FS1.'}), true;
        let link = String(b.url || '').trim();
        if (!link && b.slot) {
          const id = state.windows[`slot:${b.slot}`];
          if (!id) return send(res, 400, {error: 'That screen isn\'t open on the TV right now.'}), true;
          link = await osa(`return JSON.stringify(chrome.windows.byId(arg).activeTab.url())`, id);
        }
        if (!validUrl(link)) return send(res, 400, {error: 'Couldn\'t read a channel link from that screen.'}), true;
        const aliases = String(b.aliases || '').split(',').map(a => a.trim()).filter(Boolean).slice(0, 8);
        const id = norm(name).toLowerCase().slice(0, 20) || uid();
        config.channels = config.channels.filter(c => c.id !== id).concat({id, name, aliases, url: link});
      }
      await saveConfig();
      send(res, 200, {channels: config.channels});
    } else if (p === '/api/wall/watch' && req.method === 'POST') {
      const b = await readBody(req);
      const slotIndex = Number(b.slot);
      if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 3) return send(res, 400, {error: 'Pick screen 1–4.'}), true;
      let target = null;
      if (b.channel) { const ch = config.channels.find(c => c.id === b.channel); if (ch) target = {service: 'youtubetv', link: ch.url, label: ch.name}; }
      else if (b.broadcast) target = resolveBroadcast(b.broadcast);
      if (!target) return send(res, 404, {error: `No saved channel for ${String(b.broadcast || 'that').slice(0, 40)}. Tune a screen to it in YouTube TV, then tap 💾 on that screen in the remote.`}), true;
      await exclusive(async () => {
        const slots = state.slots.map(s => ({...s}));
        while (slots.length <= slotIndex) slots.push({service: 'youtubetv', link: ''});
        slots[slotIndex] = {...slots[slotIndex], service: target.service, link: target.link};
        const layout = LAYOUTS[state.layout].slots <= slotIndex ? fitLayout(slotIndex + 1) : state.layout;
        const next = buildCandidate({slots, layout, mode: 'grid'});
        const picked = next.slots[slotIndex].uid;
        next.audio = picked;
        if (next.solo && next.solo !== picked) next.solo = null;
        state = next;
        await applyNow().catch(async e => { state.warnings = [`The TV couldn't be updated: ${e.message}`]; await saveState(); });
      });
      send(res, 200, {state: publicState(), label: target.label, screen: slotIndex + 1});
    } else if (p === '/api/wall/scene' && req.method === 'POST') {
      const b = await readBody(req);
      if (b.remove) {
        config.scenes = config.scenes.filter(s => s.id !== b.remove || s.type === 'aerial');
        const pin = state.calm.pinned;
        if (pin && (pin.startsWith('cat:') ? !config.scenes.some(sc => sceneCategory(sc) === pin.slice(4)) : !config.scenes.some(sc => sc.id === pin))) {
          state = {...state, calm: {...state.calm, pinned: null}};
          await saveState();
        }
      } else {
        const video = youtubeId(b.url);
        if (!video) return send(res, 400, {error: 'Paste a YouTube video or live-stream link.'}), true;
        const name = String(b.name || 'My scene').slice(0, 40);
        const id = `yt-${video}`;
        config.scenes = config.scenes.filter(s => s.id !== id).concat({id, name, type: 'youtube', video, category: 'My scenes'});
        if (b.when && config.schedule) {
          const block = config.schedule.find(x => x.from === b.when);
          if (block && !block.scenes.includes(id)) block.scenes.push(id);
        }
      }
      await saveConfig();
      send(res, 200, {scenes: config.scenes});
    } else if (p === '/api/wall/calm') {
      const skip = new Set(String(url.searchParams.get('skip') || '').split(',').filter(Boolean).slice(0, 300));
      const scene = sceneNow(new Date(), skip);
      const out = {scene, clock: state.calm.clock, sound: state.calm.sound, names: state.calm.names, mode: state.mode};
      if (scene?.type === 'aerial' || url.searchParams.has('aerials')) {
        const re = scene?.type === 'aerial' && scene.filter ? new RegExp(scene.filter, 'i') : null;
        const all = await aerials();
        const picked = re ? all.filter(a => re.test(a.tags)) : all;
        out.aerials = (picked.length ? picked : all).map(({id, label}) => ({id, label}));
      }
      send(res, 200, out);
    } else if (p.startsWith('/aerial/')) {
      const id = p.slice(8).replace(/\.mov$/, '');
      const item = /^[A-F0-9-]{36}$/i.test(id) && (await aerials()).find(a => a.id === id);
      let size;
      try { if (item) ({size} = await stat(item.file)); } catch {}
      if (!item || size === undefined) { send(res, 404, {error: 'Not found'}); return true; }
      const headers = {'Content-Type': 'video/quicktime', 'Accept-Ranges': 'bytes'};
      let start = 0, end = size - 1, status = 200;
      const header = req.headers.range;
      if (header) {
        const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
        if (m && (m[1] || m[2])) {
          if (!m[1]) start = Math.max(0, size - Number(m[2]));        // last N bytes
          else { start = Number(m[1]); if (m[2]) end = Math.min(Number(m[2]), size - 1); }
          if (start >= size || start > end || (!m[1] && Number(m[2]) === 0)) {
            res.writeHead(416, {...headers, 'Content-Range': `bytes */${size}`}); res.end(); return true;
          }
          status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
        } // anything else (e.g. multiple ranges) is ignored and the whole file is sent
      }
      res.writeHead(status, {...headers, 'Content-Length': end - start + 1});
      if (req.method === 'HEAD' || size === 0) { res.end(); return true; }
      const stream = createReadStream(item.file, {start, end});
      stream.on('error', () => res.destroy());
      res.on('close', () => stream.destroy());
      stream.pipe(res);
    } else send(res, 404, {error: 'Not found'});
  } catch (e) {
    if (!(e instanceof BadRequest)) console.error(new Date().toISOString(), 'wall request failed', req.method, p, e?.stack || e);
    if (!res.headersSent) send(res, e instanceof BadRequest ? e.status : 500, {error: e instanceof BadRequest ? e.message : 'Something went wrong on the Mini'});
    else res.destroy();
  }
  return true;
}

// TV Wall: drives Chrome windows on the Mac mini to tile live streams, show
// Sportsboard, a scores sidebar, or a calm ambient scene. Controlled from
// /remote on any phone or laptop on the home network.
import {execFile} from 'node:child_process';
import {readFile, writeFile, stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {fileURLToPath} from 'node:url';
import os from 'node:os';
import path from 'node:path';

// Under `npm test` keep state in a temp dir and never touch real windows.
const TESTING = !!process.env.NODE_TEST_CONTEXT;
const DATA_DIR = TESTING ? os.tmpdir() : fileURLToPath(new URL('.', import.meta.url));
const CONFIG_FILE = path.join(DATA_DIR, TESTING ? `wall-config-test-${process.pid}.json` : 'wall-config.json');
const STATE_FILE = path.join(DATA_DIR, TESTING ? `wall-state-test-${process.pid}.json` : 'wall-state.json');
const AERIAL_ROOT = '/Library/Application Support/com.apple.idleassetsd/Customer';
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
  calm: {pinned: null, clock: true, sound: false},
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

async function loadJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}
async function saveConfig() { await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2)); }
async function saveState() { state.updated = new Date().toISOString(); await writeFile(STATE_FILE, JSON.stringify(state, null, 2)).catch(() => {}); }

export async function initWall({port}) {
  base = `http://127.0.0.1:${port}`;
  const savedConfig = await loadJson(CONFIG_FILE, null);
  if (savedConfig) config = {...structuredClone(defaultConfig), ...savedConfig};
  else await saveConfig().catch(() => {});
  const saved = await loadJson(STATE_FILE, null);
  if (saved) state = {...defaultState(), ...saved, calm: {...defaultState().calm, ...saved.calm}};
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
const raise = ids => osa(`for(const id of arg){try{chrome.windows.byId(id).index=1;}catch(e){}}chrome.activate();return 'true';`, ids);

// Runs inside each stream page: mute/unmute its video and paint the window frame black
// (Chrome tints an app window's title bar with the page's theme-color).
const PAGE_JS = `(()=>{const mute=__MUTED__;if(mute!==null)document.querySelectorAll('video,audio').forEach(m=>{m.muted=mute});
if(__CLEAN__&&!window.__wallTitle){window.__wallTitle=1;const B='\\u2800';const blank=()=>{if(document.title!==B)document.title=B;};blank();
new MutationObserver(blank).observe(document.head,{childList:true,subtree:true,characterData:true});}
let t=document.querySelector('meta[name=theme-color][data-wall]');
document.querySelectorAll('meta[name=theme-color]:not([data-wall])').forEach(m=>m.remove());
if(!t){t=document.createElement('meta');t.name='theme-color';t.dataset.wall='1';document.head.appendChild(t);}
t.content='#000000';return 'ok';})()`;
async function setMutes(list) {
  if (!list.length) return [];
  return osa(`const errs=[];for(const it of arg.list){try{chrome.windows.byId(it.id).activeTab.execute({javascript:arg.js.replace('__MUTED__',String(it.muted)).replace('__CLEAN__',String(arg.clean))});}catch(e){errs.push(String(e))}}return JSON.stringify(errs);`, {list, js: PAGE_JS, clean: state.clean && state.mode !== 'off'});
}

// ---------- clean screen: hide Dock + menu bar, park the pointer ----------
async function setClean(on) {
  if (on && !state.cleanPrev) {
    state.cleanPrev = await osa(`const d=Application('System Events').dockPreferences;let dock=false,menu=false;try{dock=d.autohide()}catch(e){}try{menu=d.autohideMenuBar()}catch(e){}return JSON.stringify({dock,menu});`, null, {chrome: false}).catch(() => ({dock: false, menu: false}));
  }
  const want = on ? {dock: true, menu: true} : (state.cleanPrev || {dock: false, menu: false});
  const res = await osa(`const d=Application('System Events').dockPreferences;const errs=[];try{d.autohide=arg.dock}catch(e){errs.push(String(e))}try{d.autohideMenuBar=arg.menu}catch(e){errs.push(String(e))}return JSON.stringify(errs);`, want, {chrome: false});
  if (!on) state.cleanPrev = null;
  return res || [];
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
    try { const errs = await setClean(clean); if (errs.length) warnings.push('Could not auto-hide the Dock/menu bar — allow Terminal to control System Events when macOS asks.'); }
    catch (e) { warnings.push(`Clean screen unavailable: ${e.message}`); }
    cleanApplied = clean;
    await sleep(1200); // let macOS finish sliding the Dock/menu bar away
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
  await raise(solo ? [...order.filter(id => id !== solo), solo] : order).catch(() => {});
  if (clean) await parkPointer(area).catch(() => {});
  state.debug = {area, want: want.map(w => ({key: w.key, id: state.windows[w.key], rect: w.rect})),
    got: await osa(`return JSON.stringify(arg.map(id=>{try{const w=chrome.windows.byId(id);return {id,index:w.index(),b:w.bounds(),title:w.name()}}catch(e){return {id,err:String(e)}}}))`, order).catch(e => String(e))};
  // Where each wall window actually ended up (macOS may clamp what we asked for).
  const gotById = Object.fromEntries((Array.isArray(state.debug.got) ? state.debug.got : []).filter(g => g.b).map(g => [g.id, g.b]));
  state.actual = Object.fromEntries(want.map(w => [w.key, gotById[state.windows[w.key]] || w.rect]));
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
function scheduleMuteRefresh() {
  clearInterval(muteTimer);
  if (state.mode !== 'off') muteTimer = setInterval(() => { lock = lock.then(applyAudio).catch(() => {}); }, 15000);
}

function apply() {
  const run = lock.then(applyNow, applyNow);
  lock = run.catch(() => {});
  return run;
}

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
  if (aerialCache && Date.now() - aerialCache.at < 300000) return aerialCache.list;
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
  aerialCache = {at: Date.now(), list};
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
  return Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => `http://${i.address}:${port}/remote`);
}
const privateIp = ip => /^(::1|127\.|::ffff:127\.|10\.|::ffff:10\.|192\.168\.|::ffff:192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::ffff:172\.(1[6-9]|2\d|3[01])\.|fe80:|fc|fd|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/i.test(ip || '');
const publicState = () => { const {windows, windowUrls, cleanPrev, ...rest} = state; return rest; };
function send(res, code, body) { res.writeHead(code, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}); res.end(JSON.stringify(body)); }
async function readBody(req) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > 20000) throw Error('Too large'); chunks.push(c); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}
const validUrl = u => { try { const x = new URL(u); return ['http:', 'https:'].includes(x.protocol); } catch { return false; } };

function mergePatch(p) {
  if (p.mode !== undefined) { if (!['off', 'grid', 'sportsboard', 'calm'].includes(p.mode)) throw Error('Bad mode'); state.mode = p.mode; }
  if (p.layout !== undefined) { if (!LAYOUTS[p.layout]) throw Error('Bad layout'); state.layout = p.layout; }
  if (p.sidebar !== undefined) state.sidebar = !!p.sidebar;
  if (p.clean !== undefined) state.clean = !!p.clean;
  if (Array.isArray(p.slots)) {
    if (p.slots.length > 6) throw Error('Too many slots');
    state.slots = p.slots.map(s => {
      if (!config.services.some(x => x.id === s.service)) throw Error('Unknown service');
      const link = String(s.link || '').trim();
      if (link && !validUrl(link)) throw Error('Links must start with http:// or https://');
      return {uid: /^[a-z0-9]{1,12}$/.test(s.uid || '') ? s.uid : uid(), service: s.service, link};
    });
  }
  const uids = new Set(state.slots.map(s => s.uid));
  if (p.audio !== undefined) state.audio = p.audio === 'none' ? 'none' : uids.has(p.audio) ? p.audio : null;
  if (p.solo !== undefined) state.solo = uids.has(p.solo) ? p.solo : null;
  if (!uids.has(state.solo)) state.solo = null;
  if (p.calm) {
    if (p.calm.pinned !== undefined) {
      const pin = p.calm.pinned;
      const ok = pin?.startsWith?.('cat:') ? config.scenes.some(s => sceneCategory(s) === pin.slice(4)) : config.scenes.some(s => s.id === pin);
      state.calm.pinned = ok ? pin : null;
    }
    if (p.calm.clock !== undefined) state.calm.clock = !!p.calm.clock;
    if (p.calm.sound !== undefined) state.calm.sound = !!p.calm.sound;
  }
}

export async function handleWall(req, res, url, port) {
  const p = url.pathname;
  if (!(p.startsWith('/api/wall') || p.startsWith('/aerial/'))) return false;
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'POST') {
    const origin = req.headers.origin;
    if (!privateIp(req.socket.remoteAddress) || (origin && new URL(origin).host !== req.headers.host)) { send(res, 403, {error: 'Forbidden'}); return true; }
  }
  try {
    if (p === '/api/wall' && req.method === 'GET') {
      send(res, 200, {state: publicState(), soundHelper: helperActive(), services: config.services, channels: config.channels, scenes: config.scenes, layouts: LAYOUTS, scene: sceneNow(), remoteUrls: lanAddresses(port), aerialCount: (await aerials()).length});
    } else if (p === '/api/wall/audio') {
      helperSeen = Date.now();
      const since = Number(url.searchParams.get('v'));
      if (url.searchParams.has('wait') && since === audioVersion) {
        await new Promise(resolve => { const done = () => { clearTimeout(t); audioWaiters.delete(done); resolve(); }; const t = setTimeout(done, 25000); audioWaiters.add(done); req.on('close', done); });
      }
      if (!res.writableEnded && !res.destroyed) send(res, 200, audioPlan());
    } else if (p === '/api/wall' && req.method === 'POST') {
      mergePatch(await readBody(req));
      const calmOnly = state.mode === 'calm' && state.windows.calm && (state.clean && state.mode !== 'off') === cleanApplied;
      if (!calmOnly) await apply(); else await saveState();
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
      while (state.slots.length <= slotIndex) state.slots.push({uid: uid(), service: 'youtubetv', link: ''});
      if ((LAYOUTS[state.layout]?.slots || 1) <= slotIndex) state.layout = fitLayout(slotIndex + 1);
      const slot = state.slots[slotIndex];
      slot.service = target.service; slot.link = target.link;
      state.mode = 'grid'; state.audio = slot.uid;
      if (state.solo && state.solo !== slot.uid) state.solo = null;
      await apply();
      send(res, 200, {state: publicState(), label: target.label, screen: slotIndex + 1});
    } else if (p === '/api/wall/scene' && req.method === 'POST') {
      const b = await readBody(req);
      if (b.remove) {
        config.scenes = config.scenes.filter(s => s.id !== b.remove || s.type === 'aerial');
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
      const out = {scene, clock: state.calm.clock, sound: state.calm.sound, mode: state.mode};
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
      if (!item) { send(res, 404, {error: 'Not found'}); return true; }
      const {size} = await stat(item.file);
      const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
      if (range) {
        const start = range[1] ? Number(range[1]) : size - Number(range[2]);
        const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
        res.writeHead(206, {'Content-Type': 'video/quicktime', 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1});
        createReadStream(item.file, {start, end}).pipe(res);
      } else {
        res.writeHead(200, {'Content-Type': 'video/quicktime', 'Accept-Ranges': 'bytes', 'Content-Length': size});
        createReadStream(item.file).pipe(res);
      }
    } else send(res, 404, {error: 'Not found'});
  } catch (e) {
    if (!res.headersSent) send(res, 400, {error: e.message || 'Request failed'});
  }
  return true;
}

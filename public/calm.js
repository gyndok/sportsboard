// Calm mode on the TV: Apple Aerials stored on the Mini or YouTube scenes, chosen
// by the server. Every scene change bumps `gen`; callbacks from an older scene
// (a video ending, an error, a slow YouTube load) check it and quietly bail, and
// the old scene's media is stopped and destroyed, so only the current scene plays.
const $ = s => document.querySelector(s);
let sceneId = null, sound = false, layer = null, ytPlayer = null, gen = 0, polling = false;
const broken = new Map(); // scene id -> when it failed; skipped for a while, then retried
const BROKEN_FOR = 2 * 3600e3;

function clock() {
  const d = new Date();
  $('#clock').innerHTML = `${d.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'})}<small>${d.toLocaleDateString([], {weekday: 'long', month: 'long', day: 'numeric'})}</small>`;
}
clock(); setInterval(clock, 1000);

const msg = text => { $('#msg').textContent = text; };
function label(text) {
  const l = $('#label'); l.textContent = text; l.classList.add('show');
  clearTimeout(label.t); label.t = setTimeout(() => l.classList.remove('show'), 8000);
}
function newLayer() { const el = document.createElement('div'); el.className = 'layer'; return el; }
// Stop the old layer's media right away, fade it out, then free it.
function retire(old) {
  if (!old) return;
  old.classList.remove('on');
  try { old._stop?.(); } catch {}
  setTimeout(() => { try { old._destroy?.(); } catch {} old.remove(); }, 3000);
}
function swapIn(el) {
  document.body.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));
  const old = layer; layer = el;
  retire(old);
}

// ---- Apple Aerials (local files served by the Mini) ----
function playAerials(list, my) {
  let queue = [], failures = 0;
  const next = () => {
    if (my !== gen) return;
    if (!queue.length) queue = [...list].sort(() => Math.random() - .5);
    const a = queue.shift();
    const wrap = newLayer(), v = document.createElement('video');
    Object.assign(v, {src: `/aerial/${a.id}.mov`, muted: true, autoplay: true, playsInline: true});
    const onEnded = () => { failures = 0; next(); };
    const onError = () => {
      if (my !== gen) return;
      if (++failures >= list.length) { // every Aerial failed: say so and try again later, no tight loop
        msg('The Apple Aerials on the Mini could not be played. Trying again in a minute.');
        setTimeout(() => { if (my === gen) { msg(''); failures = 0; next(); } }, 60000);
      } else setTimeout(next, 1000);
    };
    v.addEventListener('ended', onEnded);
    v.addEventListener('error', onError);
    wrap._stop = () => { v.removeEventListener('ended', onEnded); v.removeEventListener('error', onError); v.pause(); };
    wrap._destroy = () => { v.removeAttribute('src'); v.load(); };
    wrap.appendChild(v); swapIn(wrap); label(a.label);
  };
  next();
}

// ---- YouTube ----
let ytApi = null;
function loadYT() {
  if (window.YT?.Player) return Promise.resolve();
  ytApi ||= new Promise((resolve, reject) => {
    window.onYouTubeIframeAPIReady = resolve;
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => reject(Error('YouTube could not be loaded'));
    document.head.appendChild(s);
    setTimeout(() => reject(Error('YouTube took too long to load')), 20000);
  }).catch(e => { // allow a fresh attempt next time instead of a permanently failed promise
    ytApi = null;
    document.querySelectorAll('script[src*="youtube.com/iframe_api"], #www-widgetapi-script').forEach(x => x.remove());
    if (!window.YT?.Player) delete window.YT; // a half-loaded API would make the next attempt a no-op
    throw e;
  });
  return ytApi;
}
async function showYouTube(scene, my) {
  try { await loadYT(); }
  catch {
    if (my !== gen) return;
    msg('YouTube isn’t reachable right now. Trying again shortly.');
    sceneId = null; // the next poll retries
    return;
  }
  if (my !== gen) return; // a newer scene was chosen while YouTube loaded
  const wrap = newLayer(), box = document.createElement('div'), target = document.createElement('div');
  box.className = 'yt'; box.appendChild(target); wrap.appendChild(box);
  swapIn(wrap);
  const player = new YT.Player(target, {
    videoId: scene.video,
    playerVars: {autoplay: 1, mute: 1, controls: 0, loop: 1, playlist: scene.video, rel: 0, playsinline: 1, iv_load_policy: 3, disablekb: 1},
    events: {
      onReady: e => { if (my !== gen) return; e.target.playVideo(); if (sound) e.target.unMute(); },
      onError: () => { if (my !== gen) return; broken.set(scene.id, Date.now()); sceneId = null; poll(); } // the server picks the next scene
    }
  });
  ytPlayer = player;
  wrap._stop = () => { if (ytPlayer === player) ytPlayer = null; try { player.mute(); player.pauseVideo(); } catch {} };
  wrap._destroy = () => { try { player.destroy(); } catch {} };
  label(scene.name);
}

async function show(d) {
  const my = ++gen;
  msg('');
  const scene = d.scene;
  if (scene?.type === 'youtube') return showYouTube(scene, my);
  if (scene?.type === 'aerial') {
    let list = d.aerials || [];
    if (!list.length) {
      const r = await fetch('/api/wall/calm?aerials=1').then(r => r.ok ? r.json() : {}).catch(() => ({}));
      if (my !== gen) return;
      list = r.aerials || [];
    }
    if (list.length) return playAerials(list, my);
  }
  msg(scene ? 'No Apple Aerials are downloaded yet. On the Mini: System Settings › Wallpaper, pick a few Aerial landscapes and let them download.' : 'No calm scenes are set up.');
  retire(layer); layer = null;
}

async function poll() {
  if (polling) return;
  polling = true;
  try {
    for (const [id, t] of broken) if (Date.now() - t > BROKEN_FOR) broken.delete(id);
    const skip = broken.size ? '?skip=' + encodeURIComponent([...broken.keys()].join(',')) : '';
    const r = await fetch('/api/wall/calm' + skip, {cache: 'no-store'});
    if (!r.ok) return;
    const d = await r.json();
    $('#clock').hidden = !d.clock;
    if (d.sound !== sound) { sound = d.sound; try { if (ytPlayer) sound ? ytPlayer.unMute() : ytPlayer.mute(); } catch {} }
    const id = d.scene?.id || null;
    if (id !== sceneId) { sceneId = id; await show(d); }
  } catch {} finally { polling = false; }
}
poll(); setInterval(poll, 8000);

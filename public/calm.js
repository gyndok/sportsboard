const $ = s => document.querySelector(s);
let sceneId = null, sound = false, layer = null, ytPlayer = null, aerialQueue = [], aerialList = [];
const broken = new Set();

function clock() {
  const d = new Date();
  $('#clock').innerHTML = `${d.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'})}<small>${d.toLocaleDateString([], {weekday: 'long', month: 'long', day: 'numeric'})}</small>`;
}
clock(); setInterval(clock, 1000);

function swapIn(el) {
  document.body.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));
  const old = layer; layer = el;
  if (old) { old.classList.remove('on'); setTimeout(() => old.remove(), 3000); }
}
function label(text) {
  const l = $('#label'); l.textContent = text; l.classList.add('show');
  clearTimeout(label.t); label.t = setTimeout(() => l.classList.remove('show'), 8000);
}

// ---- Apple Aerials (local files served by the Mini) ----
function nextAerial() {
  if (!aerialQueue.length) aerialQueue = [...aerialList].sort(() => Math.random() - .5);
  const a = aerialQueue.shift();
  const wrap = document.createElement('div'); wrap.className = 'layer';
  const v = document.createElement('video');
  Object.assign(v, {src: `/aerial/${a.id}.mov`, muted: true, autoplay: true, playsInline: true});
  v.addEventListener('ended', nextAerial);
  v.addEventListener('error', () => setTimeout(nextAerial, 1000));
  wrap.appendChild(v); swapIn(wrap); label(a.label);
}

// ---- YouTube ----
let ytReady;
function loadYT() {
  ytReady ||= new Promise(res => { window.onYouTubeIframeAPIReady = res; const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(s); });
  return ytReady;
}
async function showYouTube(scene) {
  await loadYT();
  const wrap = document.createElement('div'); wrap.className = 'layer';
  const box = document.createElement('div'); box.className = 'yt'; const target = document.createElement('div'); box.appendChild(target); wrap.appendChild(box);
  swapIn(wrap);
  ytPlayer = new YT.Player(target, {
    videoId: scene.video,
    playerVars: {autoplay: 1, mute: 1, controls: 0, loop: 1, playlist: scene.video, rel: 0, playsinline: 1, iv_load_policy: 3, disablekb: 1},
    events: {
      onReady: e => { e.target.playVideo(); if (sound) e.target.unMute(); },
      onError: () => { broken.add(scene.id); $('#msg').textContent = `“${scene.name}” can't be embedded — remove it in the remote.`; sceneId = null; poll(); }
    }
  });
  label(scene.name);
}

async function show(d) {
  const scene = d.scene;
  $('#msg').textContent = '';
  ytPlayer = null;
  if (scene?.type === 'youtube' && !broken.has(scene.id)) return showYouTube(scene);
  if (scene?.type === 'aerial' || broken.has(scene?.id)) {
    aerialList = d.aerials || [];
    if (!aerialList.length) {
      const r = await fetch('/api/wall/calm?aerials=1').then(r => r.json()).catch(() => ({}));
      aerialList = r.aerials || [];
    }
    if (aerialList.length) { aerialQueue = []; return nextAerial(); }
    $('#msg').textContent = 'No Apple Aerials are downloaded yet. On the Mini: System Settings › Wallpaper, pick a few Aerial landscapes and let them download.';
    layer?.classList.remove('on');
  }
}

async function poll() {
  try {
    const d = await fetch('/api/wall/calm').then(r => r.json());
    $('#clock').hidden = !d.clock;
    if (d.sound !== sound) { sound = d.sound; if (ytPlayer?.unMute) sound ? ytPlayer.unMute() : ytPlayer.mute(); }
    const id = d.scene?.id || null;
    if (id !== sceneId) { sceneId = id; await show(d); }
  } catch {}
}
poll(); setInterval(poll, 8000);

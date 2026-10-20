const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
let wall = null, busy = false;

const layoutIcons = {
  single: ['0/0/2/2'], side: ['0/0/2/1', '0/1/2/2'], three: ['0/0/1/1', '0/1/1/2', '1/0/2/2'],
  grid: ['0/0/1/1', '0/1/1/2', '1/0/2/1', '1/1/2/2'], main2: ['0/0/2/1', '0/1/1/2', '1/1/2/2'], main3: ['0/0/3/2', '0/2/1/3', '1/2/2/3', '2/2/3/3']
};

async function load() {
  try {
    const r = await fetch('/api/wall'); wall = await r.json(); render();
  } catch { $('#status').textContent = 'Mini unreachable'; }
}

async function patch(body, label = 'Updating TV…') {
  if (busy) return; busy = true; document.body.classList.add('busy');
  $('#status').textContent = label;
  try {
    const r = await fetch('/api/wall', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
    const d = await r.json(); if (!r.ok) throw Error(d.error);
    wall.state = d.state; wall.scene = d.scene; render();
  } catch (e) { $('#status').textContent = e.message || 'Failed'; }
  finally { busy = false; document.body.classList.remove('busy'); }
}

function render() {
  const s = wall.state;
  $('#status').textContent = {grid: 'Game day', sportsboard: 'Scoreboard', calm: 'Calm', off: 'Off'}[s.mode];
  document.querySelectorAll('#modes button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === s.mode));
  for (const [id, m] of [['grid-panel', 'grid'], ['calm-panel', 'calm'], ['sb-panel', 'sportsboard'], ['off-panel', 'off']]) $('#' + id).hidden = s.mode !== m;
  // In Off/Scoreboard, still let him pre-configure game day
  if (s.mode === 'off') $('#grid-panel').hidden = false;
  $('#warnings').innerHTML = (s.warnings || []).map(w => `<p class="warn">${esc(w)}</p>`).join('');

  $('#layouts').innerHTML = Object.entries(wall.layouts).map(([id, l]) =>
    `<button data-layout="${id}" aria-pressed="${s.layout === id}" title="${esc(l.name)}"><span class="mini l-${id}">${layoutIcons[id].map(a => `<i style="grid-area:${incr(a)}"></i>`).join('')}</span><small>${esc(l.name)}</small></button>`).join('');
  $('#sidebar').checked = s.sidebar;
  const svcName = id => wall.services.find(x => x.id === id)?.name || id;
  const what = slot => (wall.channels || []).find(c => c.url === slot.link)?.name || (slot.link ? 'Game link' : svcName(slot.service).replace(' / Sunday Ticket', ''));
  const showing = s.mode === 'grid' ? s.slots.slice(0, wall.layouts[s.layout].slots) : [];
  $('#sound-bar').innerHTML = showing.length ? showing.map((slot, i) => slot.service === 'sportsboard' ? '' :
      `<button data-audio="${slot.uid}" aria-pressed="${s.audio === slot.uid}"><b>${s.audio === slot.uid ? '🔊' : '🔈'} ${i + 1}</b><small>${esc(what(slot))}</small></button>`).join('') +
      `<button data-audio="none" aria-pressed="${s.audio === 'none'}"><b>🔇</b><small>Mute all</small></button>`
    : '<p class="hint">Start Game day to choose which screen you hear.</p>';
  const mainLayout = s.mode === 'grid' && /^main/.test(s.layout);
  $('#swap-wrap').hidden = !mainLayout;
  if (mainLayout) $('#swap-bar').innerHTML = showing.slice(1).map((slot, i) => slot.service === 'sportsboard' ? '' :
    `<button data-promote="${slot.uid}"><b>⇱ ${i + 2}</b><small>${esc(what(slot))}</small></button>`).join('');
  // Playback controls follow the screen you're listening to.
  const heard = showing.findIndex(slot => slot.uid === s.audio && slot.service !== 'sportsboard');
  $('#pb-wrap').hidden = s.mode !== 'grid';
  $('#pb-target').textContent = heard >= 0 ? `Screen ${heard + 1} · ${what(showing[heard])}` : '';
  document.querySelectorAll('#pb button').forEach(b => { b.disabled = heard < 0; });
  if (heard < 0) $('#pb-status').textContent = 'Pick a screen with sound (🔊) to control it.';
  else if ($('#pb-status').textContent.startsWith('Pick a screen')) $('#pb-status').textContent = '';
  $('#sound-hint').hidden = !!wall.soundHelper || s.mode !== 'grid';
  $('#sound-hint').textContent = 'Sound switching is in basic mode. Install the Sportsboard Sound helper in Chrome on the Mini so only the chosen screen ever plays (see README).';
  renderOdds();
  renderTools();
  $('#clean').checked = s.clean !== false;
  // Which screen gets the wall (only offered when the Mac has more than one).
  const ds = wall.displays || [];
  $('#screen-wrap').hidden = ds.length < 2;
  const onScreen = (s.display && (ds.find(d => d.id === s.display.id) || ds.find(d => d.name === s.display.name))) || ds.find(d => d.primary);
  $('#displays').innerHTML = ds.map(d => `<button data-display="${d.id}" aria-pressed="${d === onScreen}"><b>${d === onScreen ? '📺 ' : ''}${esc(d.name)}</b><small>${d.width}×${d.height}${d.primary ? ' · main' : ''}</small></button>`).join('');

  const cap = wall.layouts[s.layout].slots;
  $('#slots').innerHTML = s.slots.slice(0, cap).map((slot, i) => `
    <li data-uid="${slot.uid}" class="${s.audio === slot.uid ? 'has-audio' : ''} ${s.solo === slot.uid ? 'is-solo' : ''}">
      <div class="slot-top"><span class="num">${i === 0 && /main/.test(s.layout) ? 'BIG' : i + 1}</span>
        <select data-act="service" aria-label="Screen ${i + 1} service">${wall.services.map(x => `<option value="${x.id}" ${x.id === slot.service ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
        <button data-act="audio" aria-pressed="${s.audio === slot.uid}" title="Sound from this screen">🔊</button>
        <button data-act="solo" aria-pressed="${s.solo === slot.uid}" title="Fill the screen">⤢</button>
        ${i > 0 ? '<button data-act="promote" title="Make this the main screen">⬆</button>' : ''}
        ${slot.service === 'youtubetv' && s.mode === 'grid' ? '<button data-act="save" title="Save the channel on this screen as a button">💾</button>' : ''}
      </div>
      <form class="slot-link" data-act="link"><input name="link" value="${esc(slot.link)}" placeholder="Game link (optional)" inputmode="url"><button>Go</button>${slot.link ? '<button type="button" data-act="clear">✕</button>' : ''}</form>
    </li>`).join('');

  const chans = wall.channels || [];
  $('#channels').innerHTML = chans.length ? chans.map(c => `<span class="scene"><button data-channel="${esc(c.id)}" data-title="${esc(c.name)}">${esc(c.name)}</button><button class="x" data-remove-channel="${esc(c.id)}" aria-label="Remove ${esc(c.name)}">✕</button></span>`).join('')
    : '<p class="hint">None yet. Put a YouTube TV channel on a screen, then tap 💾 on that screen to save it here.</p>';
  const pinned = s.calm.pinned;
  const cat = sc => sc.category || (sc.type === 'aerial' ? 'Apple Aerials' : 'My scenes');
  const groups = {};
  wall.scenes.forEach(sc => (groups[cat(sc)] ||= []).push(sc));
  const editing = document.body.classList.contains('editing-scenes');
  const openCat = pinned?.startsWith('cat:') ? pinned.slice(4) : cat(wall.scenes.find(sc => sc.id === pinned) || {});
  $('#scenes').innerHTML = `<div class="scene-top"><button data-scene="" aria-pressed="${!pinned}">⟳ Auto by time of day</button><button class="edit-scenes" aria-pressed="${editing}">${editing ? 'Done' : 'Edit'}</button></div>` +
    Object.entries(groups).map(([name, list]) => `<details class="scene-group" ${name === openCat ? 'open' : ''}><summary>${esc(name)} <small>${list.length}</small>${pinned === 'cat:' + name ? ' <b>▶</b>' : ''}</summary>
      <div class="scenes"><button data-scene="cat:${esc(name)}" aria-pressed="${pinned === 'cat:' + name}">⟳ Rotate all ${esc(name)}</button>
      ${list.map(sc => `<span class="scene"><button data-scene="${esc(sc.id)}" aria-pressed="${pinned === sc.id}">${esc(sc.name)}</button>${editing && sc.type !== 'aerial' ? `<button class="x" data-remove="${esc(sc.id)}" aria-label="Remove ${esc(sc.name)}">✕</button>` : ''}</span>`).join('')}</div></details>`).join('');
  $('#now-scene').textContent = wall.scene ? `Now showing: ${wall.scene.name}` : '';
  if (wall.aerialCount === 0) $('#now-scene').textContent += ' · No Apple Aerials downloaded yet (System Settings › Wallpaper › download a few).';
  $('#clock').checked = s.calm.clock; $('#sound').checked = s.calm.sound; $('#names').checked = !!s.calm.names;
  renderSun();
  if (wall.remoteUrls?.length) $('#phone').innerHTML = `Open on your phone: ${wall.remoteUrls.map(u => `<a href="${esc(u)}">${esc(u)}</a>`).join(' · ')}`;
}
// Odds chart: on/off, delay, and what each screen is showing.
function renderOdds() {
  const o = wall.odds;
  $('#odds-wrap').hidden = !o || wall.state.mode !== 'grid';
  if (!o) return;
  $('#odds-on').checked = o.on;
  $('#odds-delay-val').textContent = `${o.delay}s`;
  document.querySelectorAll('#odds-delay button').forEach(b => { b.disabled = !o.on; });
  $('#odds-size').hidden = !o.on;
  document.querySelectorAll('#odds-size button').forEach(b => b.setAttribute('aria-pressed', b.dataset.size === (o.size || 'M')));
  const pc = p => p < 0.005 ? '<1' : p > 0.995 ? '>99' : Math.round(p * 100);
  // Every screen can be set by hand; "Automatic" lets Sportsboard work it out from the stream.
  // Which corner the chart sits in on each screen (✕ hides it there).
  const corners = x => `<span class="corners" role="group" aria-label="Where the chart goes on screen ${x.screen}">${[['tl', '↖', 'Top left'], ['tr', '↗', 'Top right'], ['bl', '↙', 'Bottom left'], ['br', '↘', 'Bottom right'], ['off', '✕', 'Hide on this screen']]
    .map(([c, icon, name]) => `<button data-corner="${c}" data-screen="${esc(x.uid)}" aria-pressed="${(x.corner || 'tl') === c}" aria-label="${name}" title="${name}">${icon}</button>`).join('')}</span>`;
  const pick = x => `<select data-link="${esc(x.uid)}" aria-label="Game for the chart on screen ${x.screen}"><option value="">Chart: automatic</option>${liveGames.map(e => `<option value="${esc(e.league)}:${esc(e.id)}" ${x.hand && x.hand === `${e.league}:${e.id}` ? 'selected' : ''}>Chart: ${esc(e.teams.map(t => t.abbr).join(' @ '))}${e.state === 'in' ? '' : ' · ' + esc(new Date(e.date).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}))}</option>`).join('')}</select>`;
  $('#odds-screens').innerHTML = o.on ? (o.screens || []).map(x => {
    if (!x.game) {
      const seen = (x.seen || []).filter(t => t !== x.title);
      return `<p>Screen ${x.screen} · <small>${x.title ? `no game found in “${esc(x.title)}”` : 'no title from this stream'}${seen.length ? ` (also saw: ${seen.map(t => `“${esc(t)}”`).join(', ')})` : ''}</small>${pick(x)}${corners(x)}</p>`;
    }
    const [a, h] = x.game.split(' @ ');
    const odds = x.chance ? `${esc(a)} ${pc(x.chance.away)}% · ${esc(h)} ${pc(x.chance.home)}%` : x.market ? 'waiting for prices' : 'no Polymarket market for this game';
    const via = {picked: x.hand ? ' · set by hand' : ' · picked from Games', network: ` · only game live on ${esc(x.title)}`, kept: ' · still on, past its time slot'}[x.via] || '';
    return `<p>Screen ${x.screen} · ${esc(x.game)} <small>${x.corner === 'off' ? 'chart hidden · ' : ''}${odds}${x.behind > 3 ? ` · ${x.behind}s behind live` : ''}${via}</small>${pick(x)}${corners(x)}</p>`;
  }).join('') : '';
}
async function setOdds(body) {
  try {
    const r = await fetch('/api/wall/odds', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
    const d = await r.json(); if (!r.ok) throw Error(d.error);
    wall.odds = d.odds; renderOdds();
  } catch (e) { $('#status').textContent = e.message || 'Failed'; }
}
$('#odds-on').addEventListener('change', e => setOdds({on: e.target.checked}));
// Tie a screen to a game by hand when its stream doesn't say which game it is.
$('#odds-screens').addEventListener('change', e => {
  const sel = e.target.closest('[data-link]'); if (!sel) return;
  const [league, id] = sel.value.split(':');
  setOdds({link: {screen: sel.dataset.link, game: sel.value ? {league, id} : null}});
  $('#status').textContent = sel.value ? 'Chart set · it appears within about 10 seconds' : 'Chart back to automatic';
  setTimeout(load, 6000);
});
$('#odds-size').addEventListener('click', e => { const b = e.target.closest('[data-size]'); if (b) setOdds({size: b.dataset.size}); });
$('#odds-screens').addEventListener('click', e => {
  const b = e.target.closest('[data-corner]'); if (!b) return;
  for (const x of wall.odds?.screens || []) if (x.uid === b.dataset.screen) x.corner = b.dataset.corner; // show it right away
  renderOdds();
  setOdds({corner: {screen: b.dataset.screen, corner: b.dataset.corner}});
});
$('#odds-delay').addEventListener('click', e => { const b = e.target.closest('[data-nudge]'); if (b && !b.disabled) setOdds({nudge: Number(b.dataset.nudge)}); });
// ---------- fix-its ----------
const toolsSay = t => { $('#tools-status').textContent = t; };
$('#zoom-reset').addEventListener('click', async () => {
  try {
    const r = await fetch('/api/wall/zoom', {method: 'POST'});
    const d = await r.json().catch(() => ({}));
    toolsSay(r.ok ? 'Zoom reset · every game is back to normal size.' : d.error || 'That didn’t work.');
  } catch { toolsSay('The Mini didn’t respond.'); }
});
$('#restart').addEventListener('click', async () => {
  if (!confirm('Update and restart Sportsboard? It takes about a minute, and the games on the TV stay up.')) return;
  const was = wall?.started;
  $('#restart').disabled = true;
  toolsSay('Checking GitHub for an update…');
  try {
    const r = await fetch('/api/wall/restart', {method: 'POST'});
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { toolsSay(d.error || 'That didn’t work.'); $('#restart').disabled = false; return; }
    toolsSay(`${d.update ? d.update + ' ' : ''}Restarting…`);
  } catch { toolsSay('Restarting…'); }
  // Wait for the new copy to answer, then reload so the remote is the new version too.
  const t0 = Date.now();
  const tick = async () => {
    try { const w = await (await fetch('/api/wall', {cache: 'no-store'})).json(); if (w.started && w.started !== was) return location.reload(); } catch {}
    if (Date.now() - t0 > 120000) { toolsSay('Sportsboard hasn’t come back yet. On the Mini, double-click Restart Sportsboard.command.'); $('#restart').disabled = false; return; }
    setTimeout(tick, 2000);
  };
  setTimeout(tick, 3000);
});
function renderTools() {
  $('#zoom-reset').disabled = wall.state.mode !== 'grid';
  $('#restart').hidden = wall.canRestart === false;
}
// ---------- Calm by sunrise and sunset ----------
const clock12 = m => { const h = Math.floor(m / 60) % 24; return `${(h + 11) % 12 + 1}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const blockName = from => ({'06:00': 'Morning', '12:00': 'Afternoon', '18:00': 'Evening', '21:00': 'Night'})[from] || `From ${from}`;
function renderSun() {
  const c = wall.calmTimes;
  $('#calm-sun').closest('label').hidden = $('#calm-times').hidden = $('#calm-place').hidden = !c;
  if (!c) return;
  $('#calm-sun').checked = c.on;
  const today = c.blocks.map(b => `${blockName(b.from)} ${clock12(b.start)}`).join(' · ');
  const where = !c.place ? '' : c.place.auto ? `${esc(c.place.name)}, from the Mac’s time zone (set your city below for exact times)` : esc(c.place.name);
  $('#calm-times').innerHTML = !c.on ? `Clock times: ${today}`
    : c.sunrise == null ? `${where ? where + '. ' : ''}No sunrise or sunset to go by, so clock times: ${today}`
    : `${where}: sunrise ${clock12(c.sunrise)}, sunset ${clock12(c.sunset)}.<br>Today: ${today}`;
  $('#calm-place').hidden = !c.on;
}
async function setSun(body, label) {
  $('#status').textContent = label;
  try {
    const r = await fetch('/api/wall/sun', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Error(d.error || 'That didn’t work.');
    wall.calmTimes = d.calmTimes; wall.scene = d.scene; render();
    return true;
  } catch (e) { $('#status').textContent = e.message || 'Failed'; return false; }
}
$('#calm-sun').addEventListener('change', e => setSun({on: e.target.checked}, 'Updating Calm…'));
$('#calm-place').addEventListener('submit', async e => {
  e.preventDefault();
  const q = e.target.place.value.trim(); if (!q) return;
  if (await setSun({place: q}, 'Looking it up…')) e.target.reset();
});
function incr(a) { return a.split('/').map(Number).map(n => n + 1).join('/'); }

const slotsCopy = () => wall.state.slots.map(s => ({...s}));

$('#modes').addEventListener('click', e => { const b = e.target.closest('button'); if (b) patch({mode: b.dataset.mode}, b.dataset.mode === 'off' ? 'Closing windows…' : 'Setting up the TV…'); });
$('#layouts').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const need = wall.layouts[b.dataset.layout].slots, slots = slotsCopy();
  while (slots.length < need) slots.push({service: 'youtubetv', link: ''});
  patch({layout: b.dataset.layout, slots, solo: null});
});
$('#displays').addEventListener('click', e => {
  const b = e.target.closest('[data-display]'); if (!b) return;
  const d = (wall.displays || []).find(x => String(x.id) === b.dataset.display); if (!d) return;
  patch({display: d.primary ? null : {id: d.id, name: d.name}}, 'Moving the wall…');
});
$('#clean').addEventListener('change', e => patch({clean: e.target.checked}, e.target.checked ? 'Hiding desktop…' : 'Showing desktop…'));
// Swap a small screen into the big spot; its sound comes with it.
$('#swap-bar').addEventListener('click', e => {
  const b = e.target.closest('[data-promote]'); if (!b) return;
  const slots = slotsCopy(), i = slots.findIndex(x => x.uid === b.dataset.promote);
  [slots[0], slots[i]] = [slots[i], slots[0]];
  patch({slots, solo: null, audio: b.dataset.promote}, 'Swapping…');
});
$('#sound-bar').addEventListener('click', e => { const b = e.target.closest('[data-audio]'); if (b) patch({audio: b.dataset.audio}, 'Switching sound…'); });
$('#sidebar').addEventListener('change', e => patch({sidebar: e.target.checked}));
// ---------- playback (the screen with sound) ----------
const clockText = n => { n = Math.max(0, Math.round(n || 0)); const h = Math.floor(n / 3600), m = Math.floor(n / 60) % 60, sec = String(n % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`; };
function playbackText(d, action) {
  if (d.error) return d.error;
  if (action === 'cc') return {on: 'Captions on', off: 'Captions off', switched: 'Captions switched'}[d.cc] || 'Captions switched';
  const where = d.live ? (d.behind <= 12 ? 'At live' : `${clockText(d.behind)} behind live`) : `${clockText(d.position)}${d.duration ? ' / ' + clockText(d.duration) : ''}`;
  return `${d.paused ? 'Paused' : 'Playing'} · ${where}`;
}
let pbSeq = 0;
async function playback(action) {
  const seq = ++pbSeq;
  try {
    const r = await fetch('/api/wall/playback', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action})});
    const d = await r.json().catch(() => ({error: 'The Mini didn’t respond.'}));
    if (seq === pbSeq) $('#pb-status').textContent = playbackText(r.ok ? d : {error: d.error || 'That didn’t work.'}, action);
    // Seeks settle a moment later; show where the screen ended up (captions keep their message).
    if (r.ok && action !== 'cc' && action !== 'status') setTimeout(() => { if (seq === pbSeq) playback('status'); }, 1200);
  } catch { if (seq === pbSeq) $('#pb-status').textContent = 'The Mini didn’t respond.'; }
}
$('#pb').addEventListener('click', e => { const b = e.target.closest('[data-pb]'); if (b && !b.disabled) playback(b.dataset.pb); });
$('#slots').addEventListener('click', e => {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const uid = b.closest('li').dataset.uid, s = wall.state, slots = slotsCopy();
  if (b.dataset.act === 'audio') patch({audio: uid}, 'Switching sound…');
  if (b.dataset.act === 'solo') patch({solo: s.solo === uid ? null : uid});
  if (b.dataset.act === 'promote') { const i = slots.findIndex(x => x.uid === uid); slots.unshift(...slots.splice(i, 1)); patch({slots, solo: null, audio: uid}, 'Swapping…'); }
  if (b.dataset.act === 'save') {
    const name = prompt('Name this channel the way the scoreboard shows it (e.g. FS1, ESPN, FOX).\nAdd other spellings after commas: FOX, FOX 26');
    if (!name) return;
    const [first, ...rest] = name.split(',').map(x => x.trim()).filter(Boolean);
    fetch('/api/wall/channel', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({slot: uid, name: first, aliases: rest.join(',')})})
      .then(r => r.json().then(d => { $('#status').textContent = r.ok ? `Saved ${first}` : d.error; load(); }));
  }
  if (b.dataset.act === 'clear') { slots.find(x => x.uid === uid).link = ''; patch({slots}); }
});
$('#slots').addEventListener('change', e => {
  if (e.target.dataset.act !== 'service') return;
  const uid = e.target.closest('li').dataset.uid, slots = slotsCopy(), slot = slots.find(x => x.uid === uid);
  slot.service = e.target.value; slot.link = '';
  patch({slots}, 'Loading stream…');
});
$('#slots').addEventListener('submit', e => {
  e.preventDefault();
  const uid = e.target.closest('li').dataset.uid, slots = slotsCopy();
  slots.find(x => x.uid === uid).link = e.target.link.value.trim();
  patch({slots}, 'Opening game…');
});
$('#scenes').addEventListener('click', async e => {
  const rm = e.target.closest('[data-remove]');
  if (rm) {
    await fetch('/api/wall/scene', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({remove: rm.dataset.remove})});
    return load();
  }
  if (e.target.closest('.edit-scenes')) { document.body.classList.toggle('editing-scenes'); return render(); }
  const b = e.target.closest('[data-scene]'); if (b) patch({calm: {pinned: b.dataset.scene || null}});
});
$('#clock').addEventListener('change', e => patch({calm: {clock: e.target.checked}}));
$('#sound').addEventListener('change', e => patch({calm: {sound: e.target.checked}}));
$('#names').addEventListener('change', e => patch({calm: {names: e.target.checked}}));
$('#add-scene').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target;
  const r = await fetch('/api/wall/scene', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name: f.name.value, url: f.url.value, when: f.when.value})});
  const d = await r.json();
  if (!r.ok) { $('#status').textContent = d.error; return; }
  f.reset(); load();
});

document.addEventListener('click', async e => {
  const rm = e.target.closest('[data-remove-channel]'); if (!rm) return;
  await fetch('/api/wall/channel', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({remove: rm.dataset.removeChannel})});
  load();
});
document.addEventListener('wall-changed', () => setTimeout(load, 300));

let liveGames = [];
async function loadGames() {
  const feed = await ScoreFeed.load();
  liveGames = feed.events.filter(e => e.state !== 'post').sort((a, b) => (a.state === 'in' ? 0 : 1) - (b.state === 'in' ? 0 : 1) || Date.parse(a.date) - Date.parse(b.date));
  const all = feed.events
    .filter(e => e.state !== 'post').sort((a, b) => (a.state === 'in' ? 0 : 1) - (b.state === 'in' ? 0 : 1) || Date.parse(a.date) - Date.parse(b.date));
  $('#games').innerHTML = all.length ? all.map(e => `<div class="game-row"><span class="gl">${e.state === 'in' ? '<b>LIVE</b>' : new Date(e.date).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'})} · ${esc(e.league)}</span>
      <span class="gt">${esc(e.teams.map(t => t.abbr + (e.state === 'in' ? ' ' + t.score : '')).join(' @ '))}</span>
      ${e.broadcast ? `<button class="watch-chip" data-watch="${esc(e.broadcast)}" data-title="${esc(e.teams.map(t => t.abbr).join(' @ '))}" data-game-league="${esc(e.league)}" data-game-id="${esc(e.id)}">📺 ${esc(e.broadcast)}</button>` : '<span class="hint">No TV listed</span>'}</div>`).join('')
    : `<p class="hint">${esc(ScoreFeed.emptyText(feed, 'No more games today.'))}</p>`;
  if (!feed.complete) $('#games').insertAdjacentHTML('beforeend', `<p class="warn">${esc(ScoreFeed.note(feed))}</p>`);
}
loadGames(); setInterval(loadGames, 60000);

load(); setInterval(() => { if (!busy && !document.activeElement?.matches('input,select')) load(); }, 15000);

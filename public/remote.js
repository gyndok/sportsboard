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
  $('#clean').checked = s.clean !== false;

  const cap = wall.layouts[s.layout].slots;
  $('#slots').innerHTML = s.slots.slice(0, cap).map((slot, i) => `
    <li data-uid="${slot.uid}" class="${s.audio === slot.uid ? 'has-audio' : ''} ${s.solo === slot.uid ? 'is-solo' : ''}">
      <div class="slot-top"><span class="num">${i === 0 && /main/.test(s.layout) ? 'BIG' : i + 1}</span>
        <select data-act="service" aria-label="Screen ${i + 1} service">${wall.services.map(x => `<option value="${x.id}" ${x.id === slot.service ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
        <button data-act="audio" aria-pressed="${s.audio === slot.uid}" title="Sound from this screen">🔊</button>
        <button data-act="solo" aria-pressed="${s.solo === slot.uid}" title="Fill the screen">⤢</button>
        ${i > 0 ? '<button data-act="promote" title="Make this the main screen">⬆</button>' : ''}
      </div>
      <form class="slot-link" data-act="link"><input name="link" value="${esc(slot.link)}" placeholder="Game link (optional)" inputmode="url"><button>Go</button>${slot.link ? '<button type="button" data-act="clear">✕</button>' : ''}</form>
    </li>`).join('');

  const pinned = s.calm.pinned;
  $('#scenes').innerHTML = `<button data-scene="" aria-pressed="${!pinned}">⟳ Auto by time of day</button>` +
    wall.scenes.map(sc => `<span class="scene"><button data-scene="${sc.id}" aria-pressed="${pinned === sc.id}">${esc(sc.name)}</button>${sc.type !== 'aerial' && sc.id !== 'fireplace' ? `<button class="x" data-remove="${sc.id}" aria-label="Remove ${esc(sc.name)}">✕</button>` : ''}</span>`).join('');
  $('#now-scene').textContent = wall.scene ? `Now showing: ${wall.scene.name}` : '';
  if (wall.aerialCount === 0) $('#now-scene').textContent += ' · No Apple Aerials downloaded yet (System Settings › Wallpaper › download a few).';
  $('#clock').checked = s.calm.clock; $('#sound').checked = s.calm.sound;
  if (wall.remoteUrls?.length) $('#phone').innerHTML = `Open on your phone: ${wall.remoteUrls.map(u => `<a href="${esc(u)}">${esc(u)}</a>`).join(' · ')}`;
}
function incr(a) { return a.split('/').map(Number).map(n => n + 1).join('/'); }

const slotsCopy = () => wall.state.slots.map(s => ({...s}));

$('#modes').addEventListener('click', e => { const b = e.target.closest('button'); if (b) patch({mode: b.dataset.mode}, b.dataset.mode === 'off' ? 'Closing windows…' : 'Setting up the TV…'); });
$('#layouts').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const need = wall.layouts[b.dataset.layout].slots, slots = slotsCopy();
  while (slots.length < need) slots.push({service: 'youtubetv', link: ''});
  patch({layout: b.dataset.layout, slots, solo: null});
});
$('#clean').addEventListener('change', e => patch({clean: e.target.checked}, e.target.checked ? 'Hiding desktop…' : 'Showing desktop…'));
$('#sidebar').addEventListener('change', e => patch({sidebar: e.target.checked}));
$('#slots').addEventListener('click', e => {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const uid = b.closest('li').dataset.uid, s = wall.state, slots = slotsCopy();
  if (b.dataset.act === 'audio') patch({audio: uid}, 'Switching sound…');
  if (b.dataset.act === 'solo') patch({solo: s.solo === uid ? null : uid});
  if (b.dataset.act === 'promote') { const i = slots.findIndex(x => x.uid === uid); slots.unshift(...slots.splice(i, 1)); patch({slots, solo: null}); }
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
  const b = e.target.closest('[data-scene]'); if (b) patch({calm: {pinned: b.dataset.scene || null}});
});
$('#clock').addEventListener('change', e => patch({calm: {clock: e.target.checked}}));
$('#sound').addEventListener('change', e => patch({calm: {sound: e.target.checked}}));
$('#add-scene').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target;
  const r = await fetch('/api/wall/scene', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name: f.name.value, url: f.url.value, when: f.when.value})});
  const d = await r.json();
  if (!r.ok) { $('#status').textContent = d.error; return; }
  f.reset(); load();
});

load(); setInterval(() => { if (!busy && !document.activeElement?.matches('input,select')) load(); }, 15000);

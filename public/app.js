// Sportsboard: today's games laid out like a sportsbook board. Each league gets a ruled
// column (continuing into more columns, with its header repeated, when it runs long);
// every game is two rows, ID · TEAM · SCORE · PS/TOT · ML · TV, alternating green and
// white. On the TV (?tv=1, or full screen) the controls disappear, the text is sized to
// fill the screen, and a slate too big for one screen pages through every 15 seconds.
const LEAGUES = ['NFL', 'NCAAF', 'MLB', 'NBA', 'NHL'];
const TITLES = {NFL: 'NFL', NCAAF: 'COLLEGE FOOTBALL', MLB: 'MLB', NBA: 'NBA', NHL: 'NHL'};
const labels = TITLES; // details.js names the league in the game dialog with this
const ID_BASE = {NFL: 101, NCAAF: 201, MLB: 901, NBA: 501, NHL: 51}; // house numbers: away odd, home even
const NETWORKS = {'ESPN+': 'ESPN+', Peacock: 'PCOCK', 'Prime Video': 'PRIME', 'Amazon Prime Video': 'PRIME', 'NFL Network': 'NFLN', 'NFL Net': 'NFLN', 'Big Ten Network': 'BTN', 'SEC Network': 'SECN', 'SEC Network+': 'SECN+', 'ACC Network': 'ACCN', 'ACC Network Extra': 'ACCNX', 'CBS Sports Network': 'CBSSN', 'CBS Sports Net': 'CBSSN', 'NBA TV': 'NBATV', 'MLB Network': 'MLBN', 'MLB Net': 'MLBN', 'NHL Network': 'NHLN', 'NHL Net': 'NHLN', 'Apple TV': 'APPLE', 'Apple TV+': 'APPLE', 'Paramount+': 'PARA+', truTV: 'TRUTV', 'Fox Sports 1': 'FS1', 'Fox Sports 2': 'FS2', 'ESPN Unlimited': 'ESPN', 'YouTube TV': 'YTTV', YouTube: 'YT', Netflix: 'NFLX'};
const MEASURE_PX = 20; // block heights are measured once at this size and scaled
const COL_EM = 24.5;   // narrowest comfortable column, in em of the board's font size
const TV_MAX_PX = 34, TV_MIN_PX = 17, PAGE_MS = 15000;

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const kiosk = new URLSearchParams(location.search).has('tv'); // the TV wall opens /?tv=1
let selected = 'ALL', filter = 'all', data = {}, generation = 0, controller, followToday = true;
let page = 0, pageTimer = null, lastLayout = null;

const favoriteKey = (league, team) => `${league}:${team.name}`;
let favorites = new Set();
try { const saved = JSON.parse(localStorage.getItem('sportsboard.favorites') || '[]'); if (Array.isArray(saved)) favorites = new Set(saved.filter(x => typeof x === 'string')); } catch {}
const isFavorite = e => e.teams.some(t => favorites.has(favoriteKey(e.league, t)));

const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
$('#date').value = localDate();
$('#zone').textContent = `Game times: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
function clock() {
  const d = new Date();
  $('#clock').textContent = d.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
  $('#today').textContent = d.toLocaleDateString([], {weekday: 'long', month: 'long', day: 'numeric'});
}
clock(); setInterval(clock, 1000);

const tvMode = () => kiosk || !!document.fullscreenElement;
function applyMode() {
  document.body.classList.toggle('tv', tvMode());
  document.body.classList.toggle('kiosk', kiosk);
}

// ---------- numbers the way a board prints them ----------
function half(x) {
  const a = Math.abs(x), whole = Math.floor(a + 1e-9), frac = a - whole;
  const f = Math.abs(frac - 0.5) < 1e-6 ? '½' : frac < 1e-6 ? '' : String(Math.round(frac * 100) / 100).slice(1);
  return (whole === 0 && f ? '' : String(whole)) + f;
}
function lines(e) {
  const rows = [{pt: '', ml: ''}, {pt: '', ml: ''}], o = e.odds;
  if (!o) return rows;
  const favRow = o.fav === 'away' ? 0 : 1, other = 1 - favRow;
  if (o.line != null) rows[favRow].pt = o.line === 0 ? 'PK' : '-' + half(o.line);
  if (o.total != null) rows[o.line != null ? other : 1].pt = half(o.total); // the total sits on the underdog's line
  if (o.ml) { rows[0].ml = o.ml.away || ''; rows[1].ml = o.ml.home || ''; }
  return rows;
}
function network(broadcast) {
  const first = String(broadcast || '').split(' / ')[0].trim();
  if (!first) return '';
  return NETWORKS[first] || first.toUpperCase().replace(/\s+/g, '').slice(0, 6);
}
const timeOf = e => new Date(e.date).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
// ESPN writes a running clock as "4:12 - 1st"; a board reads "1ST 4:12".
const liveText = st => { const m = String(st).match(/^(\d{1,2}:\d{2})\s*-\s*(.+)$/); return m ? `${m[2]} ${m[1]}` : st; };
function groupText(e, withLeague) {
  const text = e.state === 'pre' ? (/postpon|cancel|delay|suspend|TBD/i.test(e.status) ? e.status : timeOf(e)) : e.state === 'in' ? liveText(e.status) : e.status;
  return (withLeague ? `${TITLES[e.league]} · ` : '') + text;
}

// ---------- what goes on the board ----------
const stateOrder = {in: 0, pre: 1, post: 2};
const byBoardOrder = (a, b) => (stateOrder[a.state] ?? 3) - (stateOrder[b.state] ?? 3) || Date.parse(a.date) - Date.parse(b.date) || String(a.id).localeCompare(String(b.id));
function rotation(league) { // stable numbers for the day: by start time, not by board position
  const ids = {};
  [...(data[league]?.events || [])].sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || String(a.id).localeCompare(String(b.id)))
    .forEach((e, i) => { ids[e.id] = ID_BASE[league] + 2 * i; });
  return ids;
}
function sections() {
  const leagues = selected === 'ALL' ? LEAGUES : [selected];
  const games = l => (data[l]?.events || []).map(e => ({...e, league: l})).filter(e => filter === 'all' || e.state === filter);
  const pinned = leagues.flatMap(games).filter(isFavorite).sort(byBoardOrder);
  const out = [];
  if (pinned.length) out.push({key: 'FAV', title: '★ FAVORITES', games: pinned, mixed: true});
  for (const l of leagues) {
    const d = data[l], list = games(l).filter(e => !isFavorite(e)).sort(byBoardOrder);
    let note = '';
    if (!d) note = 'LOADING…';
    else if (d.error && !d.events) note = 'SCORES TEMPORARILY UNAVAILABLE';
    else if (!list.length) {
      if (selected === 'ALL' && !d.error) continue; // an idle league doesn't need a column
      note = games(l).length ? 'FAVORITES PINNED ABOVE' : filter === 'all' ? 'NO GAMES SCHEDULED' : `NO ${{in: 'LIVE', pre: 'UPCOMING', post: 'FINAL'}[filter]} GAMES`;
    }
    out.push({key: l, title: TITLES[l], games: list, note, warn: d?.error && d?.events ? 'FEED DELAYED · SHOWING LAST SCORES' : ''});
  }
  if (!out.length) out.push({key: 'NONE', title: 'SPORTSBOARD', games: [], note: filter === 'all' ? 'NO GAMES SCHEDULED TODAY' : 'NO GAMES MATCH THIS FILTER'});
  return out;
}

const dateLine = () => new Date($('#date').value + 'T12:00:00').toLocaleDateString([], {weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'}).toUpperCase();
const COLS = '<div class="cols"><span>ID</span><span>TEAM</span><span>SCR</span><span>PS/TOT</span><span>ML</span><span>TV</span></div>';
const headHtml = (s, cont) => `<div class="head${cont ? ' cont' : ''}"><h2>${esc(s.title)}${cont ? ' <small>CONT.</small>' : ''}</h2>${cont ? '' : `<p>${esc(dateLine())}</p>`}${COLS}</div>`;

function gameHtml(e, shade, ids) {
  const odds = lines(e), tv = e.state !== 'post' ? network(e.broadcast) : '';
  const matchup = e.teams.map(t => t.abbr).join(' @ ');
  return `<article class="game s${shade} ${esc(e.state)}" data-game="${esc(e.id)}" data-league="${esc(e.league)}">${e.teams.map((t, i) => {
    const key = favoriteKey(e.league, t), fav = favorites.has(key);
    const id = ids[e.id] != null ? ids[e.id] + i : '';
    return `<div class="row">${i === 0 ? `<button class="id game-open" aria-label="View ${esc(e.name)} game details">${id}</button>` : `<span class="id">${id}</span>`}`
      + `<span class="team"><button class="star" data-favorite="${esc(key)}" aria-pressed="${fav}" aria-label="${fav ? 'Unpin' : 'Pin'} ${esc(t.name)}" title="${fav ? 'Unpin favorite' : 'Pin team to top'}">${fav ? '★' : '☆'}</button>${t.rank ? `<small>${t.rank}</small>` : ''}${esc(t.short || t.name)}</span>`
      + `<span class="scr">${e.state === 'pre' ? '' : esc(t.score)}</span><span class="pt">${esc(odds[i].pt)}</span><span class="ml">${esc(odds[i].ml)}</span>`
      + `<span class="tv">${i === 0 && tv ? `<button class="net" data-watch="${esc(e.broadcast)}" data-title="${esc(matchup)}" title="Watch ${esc(e.broadcast)} on the TV">${esc(tv)}</button>` : ''}</span></div>`;
  }).join('')}</article>`;
}

// Every section becomes a list of blocks: its header, status lines, games and notes.
function buildBlocks() {
  return sections().map(s => {
    const ids = s.mixed ? Object.assign({}, ...LEAGUES.map(rotation)) : rotation(s.key);
    const blocks = [{k: 'head', html: headHtml(s)}];
    if (s.warn) blocks.push({k: 'note', html: `<div class="note warn">${esc(s.warn)}</div>`});
    let last = null;
    s.games.forEach((e, i) => {
      const text = groupText(e, s.mixed);
      if (text !== last) { blocks.push({k: 'group', html: `<div class="group ${esc(e.state)}">${e.state === 'in' ? '<i>●</i> ' : ''}${esc(text)}</div>`}); last = text; }
      blocks.push({k: 'game', html: gameHtml(e, i % 2, ids)});
    });
    if (s.note) blocks.push({k: 'note', html: `<div class="note">${esc(s.note)}</div>`});
    return {blocks, cont: {k: 'head', html: headHtml(s, true)}};
  });
}

// Measure each block once (heights scale with the font size: rows never wrap).
function measure(secs) {
  const m = document.createElement('div');
  m.className = 'board measure'; m.style.fontSize = MEASURE_PX + 'px';
  const col = document.createElement('div'); col.className = 'col'; m.appendChild(col);
  const all = secs.flatMap(s => [...s.blocks, s.cont]);
  col.innerHTML = all.map(b => b.html).join('');
  document.body.appendChild(m);
  [...col.children].forEach((el, i) => { all[i].h = el.getBoundingClientRect().height; });
  m.remove();
}

// Fill columns top to bottom up to height h (px at scale 1 = MEASURE_PX). A column that
// continues a league starts with its header again, and with the current status line.
function pack(secs, scale, h) {
  const cols = []; let col, used;
  const fresh = () => { col = []; cols.push(col); used = 0; };
  fresh();
  for (const s of secs) {
    const b = s.blocks;
    const opening = (b[0].h + (b[1]?.h || 0) + (b[1]?.k === 'group' ? b[2]?.h || 0 : 0)) * scale;
    if (used > 0 && used + opening > h) fresh();
    col.push(b[0]); used += b[0].h * scale;
    let group = null;
    for (let i = 1; i < b.length; i++) {
      const x = b[i];
      let need = x.h * scale;
      if (x.k === 'group') { group = x; if (b[i + 1]?.k === 'game') need += b[i + 1].h * scale; } // never strand a status line
      if (used + need > h && used > 0) {
        fresh(); col.push(s.cont); used += s.cont.h * scale;
        if (x.k === 'game' && group) { col.push(group); used += group.h * scale; }
      }
      col.push(x); used += x.h * scale;
    }
  }
  return cols;
}

function layout() {
  const board = $('#board');
  const secs = buildBlocks();
  measure(secs);
  // Width available to the board (not the board's own width, which the last draw may have
  // narrowed to the columns it used).
  const box = board.parentElement, pad = getComputedStyle(box);
  const tv = tvMode(), width = (box.clientWidth - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight)) || innerWidth;
  let px, cols, perPage;
  if (tv) {
    // Biggest text that fits every column on one screen; if even the smallest doesn't,
    // keep the smallest and page through the columns.
    // Sizes follow the window, so a small Game day tile gets smaller type than the full TV.
    const height = board.clientHeight, most = Math.min(TV_MAX_PX, Math.max(12, height / 24)), least = Math.min(TV_MIN_PX, Math.max(10, height / 62));
    const usable = px => height * 0.985 - px * 0.5; // column padding + rounding slack
    const fit = px => { perPage = Math.max(1, Math.floor(width / (COL_EM * px))); cols = pack(secs, px / MEASURE_PX, usable(px)); return cols.length <= perPage; };
    for (px = most; px > least && !fit(px); px -= 0.5);
    if (px <= least) { px = least; fit(px); }
  } else {
    // Balanced newspaper columns, but never shorter than about a screenful unless
    // everything fits in less.
    px = width < 520 ? 15 : width < 1100 ? 16 : 17;
    perPage = Math.max(1, Math.floor(width / (COL_EM * px)));
    const scale = px / MEASURE_PX;
    const total = secs.reduce((n, s) => n + s.blocks.reduce((m, b) => m + b.h, 0), 0) * scale;
    const opening = Math.max(...secs.map(s => (s.blocks[0].h + (s.blocks[1]?.h || 0) + (s.blocks[2]?.h || 0)) * scale));
    let h = Math.max(total / perPage, opening, Math.min(total, 26 * px));
    for (let i = 0; i < 400; i++, h += px * 0.6) { cols = pack(secs, scale, h); if (cols.length <= perPage) break; }
  }
  const pages = tv ? Math.max(1, Math.ceil(cols.length / perPage)) : 1;
  lastLayout = {cols, perPage, pages, px, tv};
  if (page >= pages) page = 0;
  draw();
  clearInterval(pageTimer);
  if (pages > 1) pageTimer = setInterval(() => { page = (page + 1) % lastLayout.pages; draw(); }, PAGE_MS);
}
function draw() {
  const {cols, perPage, pages, px, tv} = lastLayout, board = $('#board');
  const shown = tv ? cols.slice(page * perPage, page * perPage + perPage) : cols;
  // Column widths: on a paged TV board every page keeps the same widths; a TV board that
  // fits on one screen stretches its columns across it; on a computer, columns keep a
  // readable width and the board is only as wide as the columns it uses.
  const slots = tv ? (pages > 1 ? perPage : shown.length) : perPage;
  board.style.fontSize = px + 'px';
  board.style.setProperty('--slots', slots);
  board.style.setProperty('--used', tv && pages > 1 ? perPage : shown.length);
  const active = board.contains(document.activeElement) ? document.activeElement : null;
  const keepFav = active?.dataset.favorite, keepGame = active?.classList.contains('game-open') ? active.closest('[data-game]')?.dataset.game : null;
  board.innerHTML = shown.map(c => `<div class="col">${c.map(b => b.html).join('')}</div>`).join('');
  if (keepFav) [...board.querySelectorAll('[data-favorite]')].find(b => b.dataset.favorite === keepFav)?.focus({preventScroll: true});
  else if (keepGame) [...board.querySelectorAll('[data-game]')].find(g => g.dataset.game === keepGame)?.querySelector('.game-open')?.focus({preventScroll: true});
  $('#page').hidden = pages < 2;
  $('#page').textContent = pages > 1 ? `PAGE ${page + 1} / ${pages}` : '';
}
const render = () => layout();

// ---------- data ----------
async function refresh(clear = false) {
  controller?.abort(); controller = new AbortController();
  const signal = controller.signal, run = ++generation;
  if (clear) data = {};
  render(); $('#refresh').disabled = true; $('#summary').textContent = 'Updating scores…';
  await Promise.all(LEAGUES.map(async l => {
    try {
      const r = await fetch(`/api/scores?league=${l}&date=${$('#date').value.replaceAll('-', '')}`, {signal});
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      if (run === generation) data[l] = d;
    } catch (e) {
      if (run === generation) data[l] = {...data[l], error: e.name === 'AbortError' ? 'Request interrupted' : e.message, stale: true};
    }
  }));
  if (run !== generation) return;
  render();
  $('#refresh').disabled = false;
  const failed = LEAGUES.filter(l => data[l]?.error), live = Object.values(data).flatMap(d => d.events || []).filter(e => e.state === 'in').length;
  $('#summary').textContent = failed.length ? `${failed.length} feed${failed.length === 1 ? '' : 's'} unavailable · retrying every 30s` : `${live} live · Updated ${new Date().toLocaleTimeString([], {hour: 'numeric', minute: '2-digit', second: '2-digit'})}`;
  $('#note').textContent = failed.length ? `${failed.join(', ')} FEED${failed.length === 1 ? '' : 'S'} UNAVAILABLE` : '';
}

// ---------- controls ----------
$('#board').addEventListener('click', e => {
  const button = e.target.closest('[data-favorite]');
  if (!button) return;
  const key = button.dataset.favorite;
  favorites.has(key) ? favorites.delete(key) : favorites.add(key);
  try { localStorage.setItem('sportsboard.favorites', JSON.stringify([...favorites])); }
  catch { $('#summary').textContent = 'Favorites work for this visit; browser storage is unavailable.'; }
  button.focus(); render();
});
$('#leagues').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; selected = b.dataset.league; $('#leagues').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); page = 0; render(); });
$('#filters').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; filter = b.dataset.state; $('#filters').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); page = 0; render(); });
// Follow today across midnight unless a different date was picked; Today resumes it.
$('#date').onchange = () => { if ($('#date').value) { followToday = $('#date').value === localDate(); refresh(true); } };
function shift(n) { const d = new Date($('#date').value + 'T12:00:00'); d.setDate(d.getDate() + n); $('#date').value = localDate(d); followToday = $('#date').value === localDate(); refresh(true); }
$('#previous').onclick = () => shift(-1); $('#next').onclick = () => shift(1);
$('#reset').onclick = () => { followToday = true; $('#date').value = localDate(); refresh(true); };
$('#refresh').onclick = () => refresh();
$('#fullscreen').onclick = async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { $('#summary').textContent = 'Full screen is unavailable in this browser.'; }
};
document.addEventListener('fullscreenchange', () => { $('#fullscreen').textContent = document.fullscreenElement ? 'Exit full screen ↙' : 'Full screen ↗'; applyMode(); page = 0; render(); });
let resizeTimer;
addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 150); });
document.fonts?.ready.then(render);

applyMode();
refresh();
setInterval(() => {
  if (followToday && $('#date').value !== localDate()) { $('#date').value = localDate(); refresh(true); }
  else refresh();
}, 30000);

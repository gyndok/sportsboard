const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
let favorites = new Set();
try { favorites = new Set(JSON.parse(localStorage.getItem('sportsboard.favorites') || '[]')); } catch {}
const isFav = e => e.teams.some(t => favorites.has(`${e.league}:${t.name}`));

function tick() {
  const d = new Date();
  $('#time').textContent = d.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
  $('#date').textContent = d.toLocaleDateString([], {weekday: 'long', month: 'short', day: 'numeric'});
}
tick(); setInterval(tick, 1000);

// Same conventions as the board: games alternate green and white, a running clock reads
// "1ST 4:12", and an upcoming game shows its line (spread on the favorite, total on the dog).
const liveText = st => { const m = String(st).match(/^(\d{1,2}:\d{2})\s*-\s*(.+)$/); return m ? `${m[2]} ${m[1]}` : st; };
const half = x => { const a = Math.abs(x), w = Math.floor(a + 1e-9), f = a - w; const fr = Math.abs(f - 0.5) < 1e-6 ? '½' : f < 1e-6 ? '' : String(Math.round(f * 100) / 100).slice(1); return (w === 0 && fr ? '' : String(w)) + fr; };
function lines(e) {
  const rows = ['', ''], o = e.odds;
  if (!o) return rows;
  const fav = o.fav === 'away' ? 0 : 1;
  if (o.line != null) rows[fav] = o.line === 0 ? 'PK' : '-' + half(o.line);
  if (o.total != null) rows[o.line != null ? 1 - fav : 1] = half(o.total);
  return rows;
}
// Polymarket chance to win, beside the score (live) or the line (upcoming).
let mkts = {};
const chance = (e, k) => {
  const m = mkts[e.league]?.[e.id], p = m && (k === 0 ? m.away : m.home);
  if (e.state === 'post' || !Number.isFinite(p)) return '';
  const move = Number.isFinite(m.move) ? (k === 0 ? m.move : -m.move) : 0;
  return `<em class="pc">${move >= 0.05 ? '▲' : move <= -0.05 ? '▼' : ''}${p < 0.005 ? '<1' : p > 0.995 ? '>99' : Math.round(p * 100)}%</em>`;
};
async function loadMarkets(events) {
  const d = new Date(), day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const leagues = [...new Set(events.filter(e => e.state !== 'post').map(e => e.league))];
  const next = {};
  await Promise.all(leagues.map(async l => {
    try { const r = await fetch(`/api/market?league=${l}&date=${day}`, {cache: 'no-store'}); if (r.ok) next[l] = (await r.json()).markets || {}; } catch {}
  }));
  mkts = next;
}
const game = (e, i) => {
  const ln = lines(e);
  const status = e.state === 'pre' ? new Date(e.date).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}) : e.state === 'in' ? liveText(e.status) : e.status;
  return `<div class="g s${i % 2} ${esc(e.state)}">
  <div class="meta"><span>${isFav(e) ? '<span class="fav">★</span> ' : ''}${esc(e.league)}</span><span>${esc(status)}</span></div>
  ${e.teams.map((t, k) => `<div class="row"><span>${t.rank ? `<small>${t.rank}</small>` : ''}${esc(t.short || t.abbr)}</span><span class="r">${chance(e, k)}<b>${e.state === 'pre' ? esc(ln[k]) : esc(t.score)}</b></span></div>`).join('')}
</div>`;
};

// Election night: the panel can show the tracker's races too (?show=election or ?show=both).
const show = new URLSearchParams(location.search).get('show');
let election = null;
async function loadElection() {
  if (show !== 'election' && show !== 'both') return;
  try { const r = await fetch('/api/wall/election', {cache: 'no-store'}); election = r.ok ? await r.json() : {error: (await r.json().catch(() => ({}))).error || 'Election results unavailable'}; }
  catch { election = election || {error: 'Election results unavailable'}; }
}
const closeMin = t => { const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(t || ''); return m ? (Number(m[1]) % 12 + (/pm/i.test(m[3]) ? 12 : 0)) * 60 + Number(m[2]) : 9999; };
const fmtClose = t => closeMin(t) < 9999 ? t.replace(':00', '') : 'TBD';
const raceCard = (x, i) => {
  const counting = !x.call && (x.reporting != null || x.d.pct != null);
  const status = x.call ? `${x.call} WIN` : counting ? (x.reporting != null ? `${x.reporting}% IN` : 'COUNTING') : `CLOSES ${fmtClose(x.close)}`;
  const side = c => `<div class="row"><span>${x.call === c.party ? '✓ ' : ''}<small>${c.party}</small>${esc(c.name)}</span><span class="r"><b>${c.pct != null ? c.pct.toFixed(1) : ''}</b></span></div>`;
  const where = String(x.where).replace('Railroad Commissioner', 'Railroad Comm.').replace(/Commissioner,?/, 'Comm.').replace('Attorney General', 'Atty. Gen.').replace('Lt. Governor', 'Lt. Gov.');
  return `<div class="g s${i % 2} ${x.call ? 'post' : counting ? 'in' : 'pre'}"><div class="meta"><span>${esc(x.kind)} · ${esc(where)}</span><span>${esc(status)}</span></div>${side(x.d)}${side(x.r)}</div>`;
};
function electionHtml() {
  if (!election) return '<p class="empty">Loading election results…</p>';
  if (election.error) return `<p class="empty">${esc(election.error)}</p>`;
  const races = election.races || [], s = election.senate;
  const counting = races.filter(x => !x.call && (x.reporting != null || x.d.pct != null)).sort((a, b) => (b.reporting ?? 0) - (a.reporting ?? 0));
  const called = races.filter(x => x.call);
  const waiting = races.filter(x => !x.call && x.reporting == null && x.d.pct == null).sort((a, b) => closeMin(a.close) - closeMin(b.close));
  const block = (title, list) => list.length ? `<h3>${title}</h3>${list.map((x, i) => raceCard(x, i)).join('')}` : '';
  const head = s ? `<h3 class="el-head">Senate · D ${s.d} · R ${s.r}${s.i ? ` · I ${s.i}` : ''}<small>${s.pending} to call · ${s.majority} for control</small></h3>` : '';
  return head + block(`Counting · ${counting.length}`, counting) + block(`Called · ${called.length}`, called) + block('Polls close', waiting);
}
// Credits civicAPI when its live counts are on the panel (it asks to be named), and says so
// while it's too busy to answer.
const electionNote = () => {
  if (!election || election.error) return '';
  const busy = election.live?.retrying?.length ? ` · civicAPI busy, retrying ${election.live.retrying.join(', ')}` : '';
  return election.liveAt ? `Live counts: civicAPI · ${whenText(new Date(election.liveAt))}${busy}`
    : `Election results via ${election.source || 'the tracker'}${election.updated ? ` · updated ${whenText(new Date(election.updated))}` : ''}${election.stale ? ' · retrying' : ''}${busy || ' · waiting for civicAPI’s live counts'}`;
};
function whenText(d) {
  const t = d.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
  return d.toDateString() === new Date().toDateString() ? t : `${d.toLocaleDateString([], {month: 'short', day: 'numeric'})}, ${t}`;
}

async function refresh() {
  await loadElection();
  if (show === 'election') {
    $('#track').innerHTML = electionHtml();
    $('#foot').textContent = electionNote();
    return;
  }
  const feed = await ScoreFeed.load();
  const all = feed.events;
  await loadMarkets(all);
  const byFav = (a, b) => isFav(b) - isFav(a) || Date.parse(a.date) - Date.parse(b.date);
  const live = all.filter(e => e.state === 'in').sort(byFav);
  const next = all.filter(e => e.state === 'pre').sort(byFav).slice(0, 12);
  const done = all.filter(e => e.state === 'post').sort((a, b) => isFav(b) - isFav(a) || Date.parse(b.date) - Date.parse(a.date)).slice(0, 10);
  const block = (title, list) => list.length ? `<h3>${title}</h3>${list.map((e, i) => game(e, i)).join('')}` : '';
  const games = (block(`In progress · ${live.length}`, live) + block('Up next', next) + block('Final', done)) || `<p class="empty">${esc(ScoreFeed.emptyText(feed, 'No games today.'))}</p>`;
  $('#track').innerHTML = show === 'both' ? electionHtml() + '<h3 class="el-split">Scores</h3>' + games : games;
  $('#foot').textContent = show === 'both' ? `${electionNote()} · ${ScoreFeed.note(feed)}` : ScoreFeed.note(feed);
  $('#foot').classList.toggle('warn-foot', !feed.complete);
}
refresh(); setInterval(refresh, 30000);

// Slow auto-scroll when the list is taller than the screen.
const feed = document.querySelector('.feed');
let pause = 120;
setInterval(() => {
  if (feed.scrollHeight <= feed.clientHeight + 4) return;
  if (pause > 0) { pause--; return; }
  feed.scrollTop += 1;
  if (feed.scrollTop + feed.clientHeight >= feed.scrollHeight - 1) { pause = 160; setTimeout(() => { feed.scrollTop = 0; }, 4000); }
}, 50);

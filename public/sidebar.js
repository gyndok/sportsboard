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

async function refresh() {
  const feed = await ScoreFeed.load();
  const all = feed.events;
  await loadMarkets(all);
  const byFav = (a, b) => isFav(b) - isFav(a) || Date.parse(a.date) - Date.parse(b.date);
  const live = all.filter(e => e.state === 'in').sort(byFav);
  const next = all.filter(e => e.state === 'pre').sort(byFav).slice(0, 12);
  const done = all.filter(e => e.state === 'post').sort((a, b) => isFav(b) - isFav(a) || Date.parse(b.date) - Date.parse(a.date)).slice(0, 10);
  const block = (title, list) => list.length ? `<h3>${title}</h3>${list.map((e, i) => game(e, i)).join('')}` : '';
  $('#track').innerHTML = (block(`In progress · ${live.length}`, live) + block('Up next', next) + block('Final', done)) || `<p class="empty">${esc(ScoreFeed.emptyText(feed, 'No games today.'))}</p>`;
  $('#foot').textContent = ScoreFeed.note(feed);
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

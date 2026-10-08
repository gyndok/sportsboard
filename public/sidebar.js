const leagues = ['NFL', 'NCAAF', 'MLB', 'NBA', 'NHL'];
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
let favorites = new Set();
try { favorites = new Set(JSON.parse(localStorage.getItem('sportsboard.favorites') || '[]')); } catch {}
const isFav = e => e.teams.some(t => favorites.has(`${e.league}:${t.name}`));
const ymd = (d = new Date()) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

function tick() {
  const d = new Date();
  $('#time').textContent = d.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
  $('#date').textContent = d.toLocaleDateString([], {weekday: 'long', month: 'short', day: 'numeric'});
}
tick(); setInterval(tick, 1000);

const game = e => `<div class="g ${e.state}">
  <div class="meta"><span>${isFav(e) ? '<span class="fav">★</span> ' : ''}${esc(e.league)}</span><span>${esc(e.state === 'pre' ? new Date(e.date).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}) : e.status)}</span></div>
  ${e.teams.map(t => `<div class="row"><span>${t.rank ? `<small>${t.rank}</small> ` : ''}${esc(t.abbr)}</span><b>${e.state === 'pre' ? '' : esc(t.score)}</b></div>`).join('')}
</div>`;

async function refresh() {
  const results = await Promise.all(leagues.map(l => fetch(`/api/scores?league=${l}&date=${ymd()}`).then(r => r.json()).then(d => (d.events || []).map(e => ({...e, league: l}))).catch(() => [])));
  const all = results.flat();
  const byFav = (a, b) => isFav(b) - isFav(a) || Date.parse(a.date) - Date.parse(b.date);
  const live = all.filter(e => e.state === 'in').sort(byFav);
  const next = all.filter(e => e.state === 'pre').sort(byFav).slice(0, 12);
  const done = all.filter(e => e.state === 'post').sort((a, b) => isFav(b) - isFav(a) || Date.parse(b.date) - Date.parse(a.date)).slice(0, 10);
  const block = (title, list) => list.length ? `<h3>${title}</h3>${list.map(game).join('')}` : '';
  $('#track').innerHTML = (block(`Live · ${live.length}`, live) + block('Up next', next) + block('Final', done)) || '<p class="empty">No games today.</p>';
  $('#foot').textContent = `Updated ${new Date().toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'})}`;
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

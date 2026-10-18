// Live win probabilities from Polymarket US prediction markets, matched to ESPN games.
// Public endpoints only (no account or key). A game's moneyline market prices the "long"
// side's chance to win; the other side is 1 − that. The listing already carries the best
// bid and ask, so one request per league covers every game; price history (for the trend
// line) is fetched only for games in progress.
const GATEWAY = 'https://gateway.polymarket.us';
export const POLY_LEAGUES = {NFL: 'nfl', NCAAF: 'cfb', NBA: 'nba', NHL: 'nhl', MLB: 'mlb'};
const LISTING_MS = 30_000, HISTORY_MS = 90_000, PAGE = 50, MAX_PAGES = 4;
const TREND_POINTS = 40;

let fetchImpl = (...a) => fetch(...a);
export function setPolyFetch(f) { fetchImpl = f; listingCache.clear(); historyCache.clear(); }

async function getJson(url) {
  const r = await fetchImpl(url, {signal: AbortSignal.timeout(12000), headers: {Accept: 'application/json'}});
  if (!r.ok) throw Error(`Polymarket returned ${r.status}`);
  return r.json();
}

// One cached value per key, shared by concurrent callers; a failed refresh keeps the old value.
function cached(cache, key, maxAge, load) {
  const old = cache.get(key);
  if (old?.value !== undefined && Date.now() - old.saved < maxAge) return Promise.resolve(old.value);
  if (old?.task) return old.task;
  const task = load().then(value => { cache.set(key, {value, saved: Date.now()}); if (cache.size > 200) cache.delete(cache.keys().next().value); return value; },
    err => { if (old?.value !== undefined) { cache.set(key, {value: old.value, saved: Date.now()}); return old.value; } cache.delete(key); throw err; });
  cache.set(key, {...old, task});
  return task;
}
const listingCache = new Map(), historyCache = new Map();

// ---------- names ----------
export function norm(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['\u2019`]/g, '').replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().replace(/ st$/, ' state');
}
// Every name a Polymarket team goes by. Their fields differ by league: NFL safeName is
// "TEN Titans", NBA name/safeName are "Celtics"/"Boston", CFB name/alias "Miami"/"Hurricanes".
function teamKeys(t = {}) {
  const name = t.name || '', alias = t.alias || '', safe = t.safeName || '';
  const bare = safe.replace(/^[A-Z]{2,4}\s+(?=\S)/, '');
  return new Set([name, alias, safe, bare, t.displayAbbreviation, t.abbreviation, `${name} ${alias}`, `${safe} ${name}`, `${safe} ${alias}`, `${bare} ${name}`].map(norm).filter(Boolean));
}
// How well an ESPN team matches a Polymarket team: 3 full name, 2 short name, 1 abbreviation.
function nameScore(espn, keys) {
  if (keys.has(norm(espn.name))) return 3;
  if (keys.has(norm(espn.short))) return 2;
  if (keys.has(norm(espn.abbr))) return 1;
  return 0;
}

// ---------- listing ----------
const num = q => { const n = parseFloat(q?.value ?? q); return Number.isFinite(n) ? n : null; };
// Chance the long side wins: the bid/ask midpoint when the book is tight, else the long quote.
export function longChance(market) {
  const bid = num(market?.bestBidQuote), ask = num(market?.bestAskQuote);
  if (bid !== null && ask !== null && ask >= bid && ask - bid <= 0.15) return (bid + ask) / 2;
  const long = (market?.marketSides || []).find(s => s.long);
  return num(long?.quote) ?? num(long?.price);
}
export function parseEvent(e) {
  const m = (e?.markets || []).find(x => x?.marketType === 'moneyline');
  const sides = (m?.marketSides || []).filter(s => s?.team);
  if (!m || sides.length !== 2) return null;
  const p = longChance(m);
  return {
    slug: e.slug, market: m.slug, title: e.title, start: Date.parse(e.startTime || e.startDate) || 0,
    live: !!e.live, ended: !!e.ended || !!m.closed,
    sides: sides.map(s => ({keys: teamKeys(s.team), long: !!s.long, color: s.team.color?.dark || s.team.colorPrimary || null, abbr: s.team.displayAbbreviation || String(s.team.abbreviation || '').toUpperCase()})),
    p: p === null ? null : Math.min(1, Math.max(0, p))
  };
}
async function listing(league) {
  const slug = POLY_LEAGUES[league];
  if (!slug) return [];
  return cached(listingCache, league, LISTING_MS, async () => {
    const out = [], horizon = Date.now() + 2 * 86400_000;
    for (let page = 0; page < MAX_PAGES; page++) {
      const evs = (await getJson(`${GATEWAY}/v2/leagues/${slug}/events?limit=${PAGE}&offset=${page * PAGE}`)).events;
      if (!Array.isArray(evs)) break;
      for (const e of evs) { const g = parseEvent(e); if (g) out.push(g); }
      if (evs.length < PAGE || evs.some(e => Date.parse(e.startTime) > horizon)) break;
    }
    return out;
  });
}

// ---------- matching ----------
// Pairs ESPN games with Polymarket games: both teams must match by name and the start times
// must be within 8 hours (the same two teams can meet on consecutive days in a series).
// Returns Map(espnId -> {game, awayIsLong}).
export function matchGames(events, games) {
  const out = new Map(), used = new Set();
  const pairs = [];
  for (const e of events || []) {
    const [away, home] = e.teams || [];
    if (!away || !home) continue;
    const t = Date.parse(e.date);
    for (const g of games) {
      if (Number.isFinite(t) && g.start && Math.abs(g.start - t) > 8 * 3600_000) continue;
      const [a, b] = g.sides;
      const straight = Math.min(nameScore(away, a.keys), nameScore(home, b.keys));
      const crossed = Math.min(nameScore(away, b.keys), nameScore(home, a.keys));
      const best = Math.max(straight, crossed);
      if (!best) continue;
      const awaySide = straight >= crossed ? a : b;
      pairs.push({id: e.id, g, score: best * 10 - Math.abs((g.start || t) - t) / 3600_000, awayIsLong: awaySide.long, awayColor: awaySide.color, homeColor: (awaySide === a ? b : a).color});
    }
  }
  pairs.sort((x, y) => y.score - x.score);
  for (const p of pairs) {
    if (out.has(p.id) || used.has(p.g.slug)) continue;
    out.set(p.id, p); used.add(p.g.slug);
  }
  return out;
}

// ---------- trend ----------
// The long side's price over the game (or the last 12 hours before it), sampled into at most
// TREND_POINTS evenly spaced buckets. Listing placeholders (e.g. 0.96/0.96) are dropped by
// requiring long + short ≈ 1.
export function shapeHistory(history, start, now = Date.now()) {
  const pts = (Array.isArray(history) ? history : [])
    .filter(h => Number.isFinite(h?.timestamp) && Number.isFinite(h?.longPrice) && (!Number.isFinite(h.shortPrice) || Math.abs(h.longPrice + h.shortPrice - 1) <= 0.05))
    .map(h => [h.timestamp * 1000, h.longPrice]).sort((a, b) => a[0] - b[0]);
  if (!pts.length) return [];
  const from = start && start < now ? start : now - 12 * 3600_000, span = Math.max(1, now - from);
  const buckets = new Array(TREND_POINTS).fill(null);
  let carry = null;
  for (const [t, v] of pts) {
    if (t < from) { carry = v; continue; }
    buckets[Math.min(TREND_POINTS - 1, Math.floor((t - from) / span * TREND_POINTS))] = v;
  }
  const out = [];
  for (const v of buckets) { if (v !== null) carry = v; if (carry !== null) out.push(carry); }
  return out.map(v => Math.round(v * 1000) / 1000);
}
function trend(g) {
  return cached(historyCache, g.market, HISTORY_MS, async () =>
    shapeHistory((await getJson(`${GATEWAY}/v1/price-history?symbol=${encodeURIComponent(g.market)}&fidelity=5&fixedInterval=1`)).history, g.start));
}

// ---------- per-league answer for the board ----------
const pct = x => Math.round(x * 1000) / 1000;
// events: ESPN events from normalize(). Returns {[espnId]: {away, home, trend?, move?, live}}
// with chances 0–1 for each side; trend is the away side's chance over time.
export async function marketsFor(league, events) {
  if (!POLY_LEAGUES[league] || !events?.length) return {};
  const games = await listing(league);
  const matched = matchGames(events, games);
  const out = {};
  const byId = new Map(events.map(e => [e.id, e]));
  await Promise.all([...matched].map(async ([id, {g, awayIsLong, awayColor, homeColor}]) => {
    if (g.p === null) return;
    const e = byId.get(id);
    const away = awayIsLong ? g.p : 1 - g.p;
    const entry = {away: pct(away), home: pct(1 - away), live: g.live, colors: [awayColor, homeColor]};
    if (e?.state === 'in' || (g.live && !g.ended)) {
      try {
        const t = (await trend(g)).map(v => pct(awayIsLong ? v : 1 - v));
        if (t.length) {
          t.push(entry.away);
          entry.trend = t;
          // Move over roughly the last tenth of the game so far (one bucket ≈ 1/40th).
          const ref = t[Math.max(0, t.length - 1 - 4)];
          entry.move = pct(entry.away - ref);
        }
      } catch {}
    }
    out[id] = entry;
  }));
  return out;
}

// ---------- live chart for one game on the TV wall ----------
// Which game a stream is showing, from its title: "Houston Texans vs. Jacksonville Jaguars",
// "College Football: #7 Nebraska at Oregon (Replay)", "Bears @ Falcons".
const MATCHUP = /^(.+?)\s+(?:at|vs\.?|v\.?|@)\s+(.+)$/i;
const cleanSide = s => s.replace(/^\s*(?:#|No\.?\s*)\d+\s+/i, '').replace(/^\(\d+\)\s*/, '').replace(/\s*\([^)]*\)\s*$/, '').trim();
export function parseMatchup(title) {
  for (const seg of String(title || '').split(/\s*[:|•–—]\s*|\s+-\s+/)) {
    const m = MATCHUP.exec(seg.trim());
    if (m) { const a = cleanSide(m[1]), b = cleanSide(m[2]); if (a && b) return [a, b]; }
  }
  return null;
}
// 3: full name, 2: short name or nickname ("Titans"), 1: city/school prefix or abbreviation.
function sideScore(side, t) {
  const s = norm(side), name = norm(t.name), short = norm(t.short);
  if (!s) return 0;
  if (s === name) return 3;
  if (s === short || (s.length > 3 && name.endsWith(' ' + s))) return 2;
  if (name.startsWith(s + ' ') || s === norm(t.abbr)) return 1;
  return 0;
}
// eventsByLeague: {NFL: [espn events], ...}. Returns {league, event} or null.
export function findEvent(title, eventsByLeague) {
  const sides = parseMatchup(title);
  if (!sides) return null;
  let best = null, bestScore = 0;
  for (const [league, events] of Object.entries(eventsByLeague || {})) for (const e of events || []) {
    const [away, home] = e.teams || [];
    if (!away || !home) continue;
    const pair = (x, y) => { const a = sideScore(sides[0], x), b = sideScore(sides[1], y); return a && b ? a + b : 0; };
    let score = Math.max(pair(away, home), pair(home, away));
    if (!score) continue;
    score += e.state === 'in' ? 0.5 : e.state === 'post' ? -0.5 : 0;
    if (score > bestScore) { bestScore = score; best = {league, event: e}; }
  }
  return best;
}

const ticks = new Map(), bboCache = new Map(), fullHistoryCache = new Map();
const TICK_CAP = 6000;
async function bbo(market) {
  return cached(bboCache, market, 4000, async () => {
    const md = (await getJson(`${GATEWAY}/v1/markets/${encodeURIComponent(market)}/bbo`)).marketData || {};
    const bid = num(md.bestBid), ask = num(md.bestAsk);
    return bid !== null && ask !== null && ask >= bid && ask - bid <= 0.15 ? (bid + ask) / 2 : num(md.currentPx);
  });
}
// Minute-by-minute history for the game (fetched once in a while), then a live price every
// few seconds on top. Returns [[ms, longChance], ...] sorted by time.
async function series(g) {
  const hist = await cached(fullHistoryCache, g.market, 20 * 60_000, async () => {
    const h = (await getJson(`${GATEWAY}/v1/price-history?symbol=${encodeURIComponent(g.market)}&fidelity=1&fixedInterval=1`)).history;
    const from = (g.start || Date.now()) - 6 * 3600_000;
    return (Array.isArray(h) ? h : []).filter(x => Number.isFinite(x?.timestamp) && Number.isFinite(x?.longPrice) && (!Number.isFinite(x.shortPrice) || Math.abs(x.longPrice + x.shortPrice - 1) <= 0.05))
      .map(x => [x.timestamp * 1000, x.longPrice]).filter(([t]) => t >= from).sort((a, b) => a[0] - b[0]);
  }).catch(() => []);
  let list = ticks.get(g.market);
  if (!list) { list = []; ticks.set(g.market, list); if (ticks.size > 40) ticks.delete(ticks.keys().next().value); }
  try { const p = await bbo(g.market); if (p !== null && (!list.length || Date.now() - list.at(-1)[0] >= 3000)) list.push([Date.now(), p]); } catch {}
  if (list.length > TICK_CAP) list.splice(0, list.length - TICK_CAP);
  const lastHist = hist.length ? hist.at(-1)[0] : 0;
  return hist.concat(list.filter(([t]) => t > lastHist));
}

// Everything the TV needs to draw one game's chart, before the broadcast delay is applied.
export async function liveGame(league, event) {
  if (!POLY_LEAGUES[league] || !event) return null;
  const games = await listing(league);
  const m = matchGames([event], games).get(event.id);
  if (!m) return null;
  const [away, home] = event.teams;
  const pts = (await series(m.g)).map(([t, v]) => [t, m.awayIsLong ? v : 1 - v]);
  if (!pts.length && m.g.p !== null) pts.push([Date.now(), m.awayIsLong ? m.g.p : 1 - m.g.p]);
  return {key: m.g.market, start: m.g.start, live: m.g.live, away: {abbr: away.abbr, color: m.awayColor}, home: {abbr: home.abbr, color: m.homeColor}, pts};
}

// Team colors that read over video: brightened if dark, and the home side switched to light
// grey when the two teams' colors are too close to tell apart.
function rgb(hex) { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
const toHex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
export function tvColor(hex, fallback) {
  const c = rgb(hex) || rgb(fallback);
  const v = Math.max(...c) / 255;
  if (v >= 0.82) return toHex(c);
  if (v === 0) return '#d0d0d0';
  const k = 0.82 / v;
  return toHex(c.map(x => x * k));
}
// Applies the delay: only prices from before (now − delay) are shown, so the chart moves
// when the play happens on the TV, not 10–20 s earlier. Pregame shows the last 6 hours.
export function chartData(game, delaySec, now = Date.now()) {
  if (!game?.pts?.length) return null;
  const cutoff = now - Math.max(0, delaySec) * 1000;
  const shown = game.pts.filter(([t]) => t <= cutoff);
  if (!shown.length) return null;
  const from = game.start && game.start < cutoff ? game.start : cutoff - 6 * 3600_000;
  const span = Math.max(60_000, cutoff - from);
  let carry = null;
  const inWin = [];
  for (const [t, v] of shown) { if (t < from) carry = v; else inWin.push([t, v]); }
  if (carry !== null) inWin.unshift([from, carry]);
  // At most 90 points: the last price in each slice of time.
  const N = 90, slots = new Array(N).fill(null);
  for (const [t, v] of inWin) slots[Math.min(N - 1, Math.floor((t - from) / span * N))] = [t, v];
  const pts = slots.filter(Boolean).map(([t, v]) => [Math.round((t - from) / span * 1000) / 1000, Math.round(v * 1000) / 1000]);
  const last = inWin.at(-1)?.[1] ?? carry;
  if (pts.length && pts.at(-1)[0] < 1) pts.push([1, Math.round(last * 1000) / 1000]);
  let away = tvColor(game.away.color, '#46e65c'), home = tvColor(game.home.color, '#f3f3f1');
  const a = rgb(away), h = rgb(home);
  if (a && h && Math.hypot(a[0] - h[0], a[1] - h[1], a[2] - h[2]) < 90) home = '#d0d0d0';
  return {away: {abbr: game.away.abbr, color: away, p: last}, home: {abbr: game.home.abbr, color: home, p: 1 - last}, pts, delay: Math.round(delaySec)};
}

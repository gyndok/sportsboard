import test from 'node:test';
import assert from 'node:assert/strict';
import {parseEvent, longChance, matchGames, shapeHistory, marketsFor, setPolyFetch, norm} from '../poly.mjs';
import {createServer} from '../server.mjs';

// Shapes copied from Polymarket US listings (trimmed): NFL safeName "TEN Titans",
// NBA name "Celtics" + safeName "Boston", CFB name "Miami" + alias "Hurricanes".
const side = (team, long, quote) => ({long, quote: {value: String(quote)}, team});
const event = (slug, start, sides, extra = {}) => ({
  slug, title: slug, startTime: start, live: false, ended: false, ...extra,
  markets: [{marketType: 'moneyline', slug: 'aec-' + slug, bestBidQuote: {value: '0.1100'}, bestAskQuote: {value: '0.1125'}, marketSides: sides, ...extra.market}]
});
const nflTen = {name: 'Tennessee Titans', alias: 'Titans', safeName: 'TEN Titans', abbreviation: 'ten', displayAbbreviation: 'TEN', color: {dark: '#4B92DB'}};
const nflInd = {name: 'Indianapolis Colts', alias: 'Colts', safeName: 'IND Colts', abbreviation: 'ind', displayAbbreviation: 'IND', color: {dark: '#386299'}};
const nbaBos = {name: 'Celtics', alias: 'Celtics', safeName: 'Boston', abbreviation: 'bos', displayAbbreviation: 'BOS'};
const nbaDet = {name: 'Pistons', alias: 'Pistons', safeName: 'Detroit', abbreviation: 'det', displayAbbreviation: 'DET'};
const cfbMia = {name: 'Miami', alias: 'Hurricanes', safeName: 'Miami', abbreviation: 'mia', displayAbbreviation: 'MIA'};
const cfbMiaOh = {name: 'Miami (OH)', alias: 'RedHawks', safeName: 'Miami (OH)', abbreviation: 'mioh', displayAbbreviation: 'M-OH'};
const cfbFsu = {name: 'Florida State', alias: 'Seminoles', safeName: 'Florida State', abbreviation: 'fsu', displayAbbreviation: 'FSU'};
const cfbBall = {name: 'Ball State', alias: 'Cardinals', safeName: 'Ball State', abbreviation: 'ball', displayAbbreviation: 'BALL'};
const espn = (id, date, away, home, state = 'pre') => ({id, date, state, teams: [{...away, home: false}, {...home, home: true}]});

test('chance comes from the bid/ask midpoint, or the long quote when the book is wide', () => {
  assert.equal(longChance({bestBidQuote: {value: '0.60'}, bestAskQuote: {value: '0.62'}}), 0.61);
  assert.equal(longChance({bestBidQuote: {value: '0.10'}, bestAskQuote: {value: '0.60'}, marketSides: [{long: false, quote: {value: '0.7'}}, {long: true, quote: {value: '0.3'}}]}), 0.3);
  assert.equal(longChance({}), null);
});

test('events without a two-team moneyline are skipped', () => {
  assert.equal(parseEvent({markets: [{marketType: 'total'}]}), null);
  assert.equal(parseEvent({markets: [{marketType: 'moneyline', marketSides: [side(nflTen, true, 0.1)]}]}), null);
  const g = parseEvent(event('nfl-ten-ind', '2026-10-18T17:00:00Z', [side(nflTen, true, 0.1125), side(nflInd, false, 0.89)], {live: true}));
  assert.equal(g.market, 'aec-nfl-ten-ind'); assert.equal(g.live, true);
  assert.ok(Math.abs(g.p - 0.11125) < 1e-9);
});

test('ESPN games match Polymarket games across leagues name styles', () => {
  const games = [
    event('nfl-ten-ind', '2026-10-18T17:00:00Z', [side(nflTen, true, 0.11), side(nflInd, false, 0.89)]),
    event('nba-bos-det', '2026-10-20T23:00:00Z', [side(nbaBos, true, 0.4), side(nbaDet, false, 0.6)]),
    event('cfb-fsu-mia', '2026-10-24T19:30:00Z', [side(cfbFsu, true, 0.3), side(cfbMia, false, 0.7)]),
    event('cfb-ball-mioh', '2026-10-24T19:30:00Z', [side(cfbBall, true, 0.5), side(cfbMiaOh, false, 0.5)])
  ].map(parseEvent);
  const events = [
    espn('1', '2026-10-18T17:00Z', {name: 'Tennessee Titans', short: 'Titans', abbr: 'TEN'}, {name: 'Indianapolis Colts', short: 'Colts', abbr: 'IND'}),
    espn('2', '2026-10-20T23:00Z', {name: 'Boston Celtics', short: 'Celtics', abbr: 'BOS'}, {name: 'Detroit Pistons', short: 'Pistons', abbr: 'DET'}),
    espn('3', '2026-10-24T19:30Z', {name: 'Florida State Seminoles', short: 'Florida St', abbr: 'FSU'}, {name: 'Miami Hurricanes', short: 'Miami', abbr: 'MIA'}),
    espn('4', '2026-10-24T19:30Z', {name: 'Ball State Cardinals', short: 'Ball St', abbr: 'BALL'}, {name: 'Miami (OH) RedHawks', short: 'Miami OH', abbr: 'M-OH'}),
    espn('5', '2026-10-24T19:30Z', {name: 'Nowhere Tech', short: 'Nowhere', abbr: 'NWT'}, {name: 'Miami Hurricanes', short: 'Miami', abbr: 'MIA'})
  ];
  const m = matchGames(events, games);
  assert.equal(m.get('1').g.slug, 'nfl-ten-ind');
  assert.equal(m.get('2').g.slug, 'nba-bos-det');
  assert.equal(m.get('3').g.slug, 'cfb-fsu-mia');
  assert.equal(m.get('4').g.slug, 'cfb-ball-mioh');
  assert.equal(m.has('5'), false, 'one team matching is not enough');
  assert.equal(m.get('1').awayIsLong, true);
});

test('home/away follow the names, not Polymarket order; far-apart dates never match', () => {
  const games = [parseEvent(event('nfl-ten-ind', '2026-10-18T17:00:00Z', [side(nflInd, true, 0.89), side(nflTen, false, 0.11)]))];
  const e = espn('1', '2026-10-18T17:00Z', {name: 'Tennessee Titans', short: 'Titans', abbr: 'TEN'}, {name: 'Indianapolis Colts', short: 'Colts', abbr: 'IND'});
  assert.equal(matchGames([e], games).get('1').awayIsLong, false);
  assert.equal(matchGames([{...e, date: '2026-10-21T17:00Z'}], games).size, 0);
});

test('price history becomes a short, clean trend', () => {
  const start = Date.parse('2026-10-18T17:00:00Z'), s = start / 1000;
  const hist = [
    {timestamp: s - 7200, longPrice: 0.96, shortPrice: 0.96}, // listing placeholder: dropped
    {timestamp: s - 3600, longPrice: 0.40, shortPrice: 0.60}, // pregame print carries in
    {timestamp: s + 1800, longPrice: 0.30, shortPrice: 0.70},
    {timestamp: s + 5400, longPrice: 0.10, shortPrice: 0.90}
  ];
  const t = shapeHistory(hist, start, start + 7200_000);
  assert.ok(t.length > 2 && t.length <= 40);
  assert.equal(t[0], 0.4); assert.equal(t.at(-1), 0.1);
  assert.deepEqual(shapeHistory([], start), []);
  assert.deepEqual(shapeHistory('junk', start), []);
});

test('marketsFor puts each side on the right team and adds a trend for live games', async () => {
  const now = Date.now(), start = new Date(now - 3600_000).toISOString();
  setPolyFetch(async url => {
    const body = /\/v2\/leagues\/nfl\//.test(url) ? {events: [event('nfl-ten-ind', start, [side(nflTen, true, 0.1125), side(nflInd, false, 0.89)], {live: true})]}
      : /price-history/.test(url) ? {history: [{timestamp: (now - 3000_000) / 1000, longPrice: 0.5, shortPrice: 0.5}, {timestamp: (now - 600_000) / 1000, longPrice: 0.2, shortPrice: 0.8}]}
      : {};
    return new Response(JSON.stringify(body), {status: 200});
  });
  try {
    const m = await marketsFor('NFL', [espn('9', start, {name: 'Tennessee Titans', short: 'Titans', abbr: 'TEN'}, {name: 'Indianapolis Colts', short: 'Colts', abbr: 'IND'}, 'in')]);
    assert.ok(Math.abs(m['9'].away - 0.111) < 0.001);
    assert.ok(Math.abs(m['9'].away + m['9'].home - 1) < 0.002);
    assert.ok(m['9'].trend.length >= 2 && m['9'].trend[0] === 0.5);
    assert.ok(m['9'].move < 0);
    assert.deepEqual(await marketsFor('XFL', []), {});
  } finally { setPolyFetch((...a) => fetch(...a)); }
});

test('a failing market feed is reported, not thrown', async () => {
  setPolyFetch(async () => new Response('nope', {status: 500}));
  try { await assert.rejects(marketsFor('NBA', [espn('1', '2026-10-20T23:00Z', {name: 'A', short: 'A', abbr: 'A'}, {name: 'B', short: 'B', abbr: 'B'})])); }
  finally { setPolyFetch((...a) => fetch(...a)); }
});

test('/api/market validates its input', async () => {
  const server = createServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(`${base}/api/market?league=XFL&date=20261018`)).status, 400);
    assert.equal((await fetch(`${base}/api/market?league=NFL&date=2026101`)).status, 400);
  } finally { await new Promise(r => server.close(r)); }
});

test('names normalize the way the two feeds differ', () => {
  assert.equal(norm('Michigan St'), 'michigan state');
  assert.equal(norm('Texas A&M'), 'texas a and m');
  assert.equal(norm('São Paulo'), 'sao paulo');
  assert.equal(norm("Hawai'i Rainbow Warriors"), norm('Hawaii Rainbow Warriors'));
});

import {parseMatchup, findEvent, chartData, tvColor} from '../poly.mjs';
import {ODDS_JS} from '../wall.mjs';

test('stream titles name the two teams', () => {
  assert.deepEqual(parseMatchup('Houston Texans vs. Jacksonville Jaguars'), ['Houston Texans', 'Jacksonville Jaguars']);
  assert.deepEqual(parseMatchup('College Football: #7 Nebraska at Oregon (Replay)'), ['Nebraska', 'Oregon']);
  assert.deepEqual(parseMatchup('NFL | Bears @ Falcons'), ['Bears', 'Falcons']);
  assert.equal(parseMatchup('NFL RedZone'), null);
  assert.equal(parseMatchup(''), null);
});

test('a stream title finds the right game in any league', () => {
  const ev = (id, away, home, state = 'in') => ({id, state, teams: [{name: away[0], short: away[1], abbr: away[2]}, {name: home[0], short: home[1], abbr: home[2]}]});
  const events = {
    NFL: [ev('1', ['Chicago Bears', 'Bears', 'CHI'], ['Atlanta Falcons', 'Falcons', 'ATL']), ev('2', ['Houston Texans', 'Texans', 'HOU'], ['Jacksonville Jaguars', 'Jaguars', 'JAX'])],
    NCAAF: [ev('3', ['Nebraska Cornhuskers', 'Nebraska', 'NEB'], ['Oregon Ducks', 'Oregon', 'ORE'], 'pre')]
  };
  assert.equal(findEvent('Bears at Falcons', events).event.id, '1');
  assert.equal(findEvent('Jacksonville Jaguars vs. Houston Texans', events).event.id, '2', 'either order');
  assert.deepEqual(findEvent('College Football: #7 Nebraska at Oregon', events), {league: 'NCAAF', event: events.NCAAF[0]});
  assert.equal(findEvent('Chicago at Atlanta', events).event.id, '1', 'city names');
  assert.equal(findEvent('Bears at Packers', events), null, 'both teams must match');
  assert.equal(findEvent('SportsCenter', events), null);
});

test('the chart only shows prices from before the delay', () => {
  const now = Date.parse('2026-10-18T19:00:00Z'), start = now - 3600_000;
  const game = {start, away: {abbr: 'CHI', color: '#0B162A'}, home: {abbr: 'ATL', color: '#A71930'},
    pts: [[start - 600_000, 0.5], [start + 1800_000, 0.6], [now - 30_000, 0.7], [now - 5_000, 0.9]]};
  const d = chartData(game, 20, now);
  assert.equal(d.away.p, 0.7, 'the 0.9 print 5 s ago is still hidden behind a 20 s delay');
  assert.ok(Math.abs(d.home.p - 0.3) < 1e-9);
  assert.equal(d.pts[0][0], 0); assert.equal(d.pts.at(-1)[0], 1);
  assert.ok(d.pts.length <= 91);
  assert.equal(chartData(game, 0, now).away.p, 0.9);
  assert.equal(chartData({...game, pts: [[now - 1000, 0.5]]}, 20, now), null, 'nothing old enough to show yet');
  assert.equal(d.delay, 20);
});

test('team colors are brightened for video, and too-similar colors split', () => {
  assert.equal(tvColor('#ffffff'), '#ffffff');
  const dark = tvColor('#002C5F');
  assert.ok(Math.max(...[1, 3, 5].map(i => parseInt(dark.slice(i, i + 2), 16))) >= 0.8 * 255);
  assert.equal(tvColor(null, '#46e65c'), '#46e65c');
  const now = Date.now(), d = chartData({start: now - 1000_000, away: {abbr: 'A', color: '#cc0000'}, home: {abbr: 'B', color: '#c80505'}, pts: [[now - 100_000, 0.5]]}, 0, now);
  assert.equal(d.home.color, '#d0d0d0');
});

test('the odds page script compiles with and without a chart', () => {
  for (const data of ['null', JSON.stringify({away: {abbr: 'A', color: '#fff', p: 0.4}, home: {abbr: 'B', color: '#ddd', p: 0.6}, pts: [[0, 0.5], [1, 0.4]], delay: 20})]) {
    assert.doesNotThrow(() => new Function('return ' + ODDS_JS.replace('__DATA__', data)), 'valid JavaScript');
  }
  assert.ok(!/innerHTML/.test(ODDS_JS), 'no innerHTML: YouTube pages require trusted HTML');
});

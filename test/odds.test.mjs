import test from 'node:test';
import assert from 'node:assert/strict';
import {normalize, oddsOf} from '../server.mjs';

const teams = [{abbr: 'BUF', home: false}, {abbr: 'KC', home: true}];

test('newer ESPN odds: closing spread, total and moneylines', () => {
  const o = oddsOf([{
    provider: {name: 'ESPN BET'}, details: 'KC -3.5', overUnder: 47.5, spread: -3.5,
    moneyline: {home: {open: {odds: '-160'}, close: {odds: '-185'}}, away: {open: {odds: '+140'}, close: {odds: '+154'}}},
    pointSpread: {home: {close: {line: '-3.5', odds: '-110'}}, away: {close: {line: '+3.5', odds: '-110'}}},
    total: {over: {close: {line: 'o47.5', odds: '-110'}}, under: {close: {line: 'u47.5'}}}
  }], teams);
  assert.deepEqual(o, {fav: 'home', line: 3.5, total: 47.5, ml: {away: '+154', home: '-185'}});
});

test('older ESPN odds: numeric moneylines and details', () => {
  const o = oddsOf([{details: 'BUF -2.5', overUnder: 51, spread: 2.5, awayTeamOdds: {favorite: true, moneyLine: -135}, homeTeamOdds: {favorite: false, moneyLine: 115}}], teams);
  assert.deepEqual(o, {fav: 'away', line: 2.5, total: 51, ml: {away: '-135', home: '+115'}});
});

test('baseball puts the moneyline in details; that is not read as a spread', () => {
  const mlbTeams = [{abbr: 'NYY', home: false}, {abbr: 'BOS', home: true}];
  const o = oddsOf([{details: 'NYY -155', overUnder: 8.5, spread: 1.5, awayTeamOdds: {favorite: true, moneyLine: -155}, homeTeamOdds: {favorite: false, moneyLine: 135}}], mlbTeams);
  assert.deepEqual(o, {fav: 'away', line: 1.5, total: 8.5, ml: {away: '-155', home: '+135'}});
});

test('pick em, even money, missing and junk odds', () => {
  assert.deepEqual(oddsOf([{details: 'EVEN', overUnder: 44, awayTeamOdds: {moneyLine: 100}, homeTeamOdds: {moneyLine: -100}}], teams), {fav: null, line: 0, total: 44, ml: {away: 'EV', home: 'EV'}});
  assert.equal(oddsOf(undefined, teams), null);
  assert.equal(oddsOf([], teams), null);
  assert.equal(oddsOf([{provider: {name: 'x'}}], teams), null);
  assert.equal(oddsOf(['nonsense'], teams), null);
  assert.deepEqual(oddsOf([{overUnder: 'n/a', details: 'XYZ -3', moneyline: {home: {close: {odds: 'OFF'}}}}], teams), null);
});

test('normalize carries short names and odds for the board', () => {
  const e = normalize({id: '1', date: '2026-10-11T17:00Z', name: 'Bills at Chiefs', competitions: [{
    status: {type: {state: 'pre', shortDetail: '10/11 - 12:00 PM EDT'}},
    broadcasts: [{names: ['CBS']}],
    odds: [{details: 'KC -3.5', overUnder: 47.5}],
    competitors: [
      {homeAway: 'home', score: '0', team: {displayName: 'Kansas City Chiefs', shortDisplayName: 'Chiefs', abbreviation: 'KC'}},
      {homeAway: 'away', score: '0', team: {displayName: 'Buffalo Bills', shortDisplayName: 'Bills', abbreviation: 'BUF'}}
    ]
  }]});
  assert.deepEqual(e.teams.map(t => t.short), ['Bills', 'Chiefs']);
  assert.deepEqual(e.odds, {fav: 'home', line: 3.5, total: 47.5, ml: null});
  assert.equal(normalize({id: '2', competitions: [{competitors: []}]}).odds, null);
});

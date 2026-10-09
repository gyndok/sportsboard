// Shared score-feed client for the scores panel and the remote.
// Keeps each league's last good data, reports which leagues failed, and dates the
// scores by when the server actually received them, never by when the page redrew.
window.ScoreFeed = (() => {
  const leagues = ['NFL', 'NCAAF', 'MLB', 'NBA', 'NHL'];
  const ymd = (d = new Date()) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const last = {};
  let inflight = null;

  async function fetchLeague(l, day) {
    const r = await fetch(`/api/scores?league=${l}&date=${day}`, {cache: 'no-store'});
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !Array.isArray(d.events)) throw Error(d.error || `HTTP ${r.status}`);
    last[l] = {day, events: d.events.map(e => ({...e, league: l})), updated: d.updated, stale: !!d.stale};
    return d.stale ? 'stale' : 'ok';
  }

  function load() {
    if (inflight) return inflight; // never stack overlapping refreshes
    inflight = (async () => {
      const day = ymd(), status = {};
      await Promise.all(leagues.map(async l => { try { status[l] = await fetchLeague(l, day); } catch { status[l] = 'failed'; } }));
      for (const l of leagues) if (last[l] && last[l].day !== day) delete last[l]; // yesterday's games don't count after midnight
      const have = leagues.filter(l => last[l]);
      const times = have.map(l => Date.parse(last[l].updated)).filter(Number.isFinite);
      return {
        events: have.flatMap(l => last[l].events),
        problems: leagues.filter(l => status[l] !== 'ok'),
        haveAny: have.length > 0,
        complete: leagues.every(l => status[l] === 'ok'),
        asOf: times.length ? new Date(Math.min(...times)) : null
      };
    })().finally(() => { inflight = null; });
    return inflight;
  }

  const time = d => d.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
  const note = r => !r.haveAny ? 'Scores unavailable · retrying'
    : `${r.problems.length ? `${r.problems.join(', ')} unavailable · ` : ''}Scores as of ${r.asOf ? time(r.asOf) : '—'}`;
  const emptyText = (r, whenComplete) => !r.haveAny ? 'Scores are unavailable right now. Retrying…'
    : r.complete ? whenComplete : 'No games in the leagues that loaded.';
  return {load, note, emptyText, leagues};
})();

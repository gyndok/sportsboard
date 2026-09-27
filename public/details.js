const dialog=document.querySelector('#game-dialog'),content=document.querySelector('#game-content');
let activeGame=null,detailAbort=null,detailTimer=null,detailLast=null,detailOpener=null;
const safe=value=>esc(value);
const table=(heads,rows)=>`<div class="table-scroll"><table><thead><tr>${heads.map(h=>`<th scope="col">${safe(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((v,i)=>i?`<td>${safe(v)}</td>`:`<th scope="row">${safe(v)}</th>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const section=(title,body)=>`<section class="detail-section"><h3>${safe(title)}</h3>${body}</section>`;
function drawDetails(d){
 const c=d.competition,teams=[...(c.competitors||[])].sort((a,b)=>a.homeAway===b.homeAway?0:a.homeAway==='away'?-1:1),state=c.status?.type?.state;
 const league=d.league,baseball=league==='MLB',hockey=league==='NHL';
 const venue=d.gameInfo?.venue;
 let html=`<p class="detail-status">${safe(labels[league])} · ${safe(c.status?.type?.detail||'Scheduled')}</p><div class="matchup">${teams.map(t=>`<div><span>${safe(t.team?.displayName)}</span><strong>${state==='pre'?'–':safe(t.score??'–')}</strong><small>${t.homeAway==='home'?'Home':'Away'}${t.record?.length?' · '+safe(t.record.find(r=>r.type==='total')?.displayValue||''):''}</small></div>`).join('')}</div><p class="detail-note">${safe(new Date(c.date).toLocaleString([],{dateStyle:'medium',timeStyle:'short'}))}${venue?' · '+safe(venue.fullName):''}</p>`;
 const broadcasts=(c.broadcasts||[]).flatMap(b=>b.names||b.media?.shortName||[]);
 if(broadcasts.length)html+=`<p class="detail-note">TV: ${safe(broadcasts.join(' / '))}</p>`;
 if(state==='pre')html+=`<p class="detail-note">Game statistics appear when play begins. Pregame information is shown when available.</p>`;
 const periodCount=Math.max(0,...teams.map(t=>t.linescores?.length||0));
 if(periodCount){
 const baseline=baseball?9:hockey?3:4,count=Math.max(baseline,periodCount);
 const periods=Array.from({length:count},(_,i)=>baseball?String(i+1):i<baseline?`${hockey?'P':'Q'}${i+1}`:i===baseline?'OT':`${i-baseline+1}OT`);
 html+=section(baseball?'Inning-by-inning':hockey?'Scoring by period':'Scoring by quarter',table(['Team',...periods,baseball?'R':'Total'],teams.map(t=>[t.team?.abbreviation,...Array.from({length:count},(_,i)=>t.linescores?.[i]?.displayValue??t.linescores?.[i]?.value??'–'),t.score??'–'])));
 }
 const stats=d.boxscore?.teams||[];
 const flat=s=>(s||[]).flatMap(x=>x.stats?flat(x.stats):x.displayValue!==undefined?[x]:[]);
 const maps=teams.map(t=>flat(stats.find(b=>b.team?.id===t.team?.id)?.statistics));
 const priorities=baseball?['runs','hits','errors','homeRuns','RBIs','walks','strikeouts','leftOnBase','runnersLeftOnBase','stolenBases']:hockey?['shots','shotsOnGoal','hits','blockedShots','faceoffsWon','faceoffPercent','powerPlayGoals','powerPlayOpportunities','powerPlayPct','penaltyMinutes','giveaways','takeaways']:league==='NBA'?['fieldGoalsMade-fieldGoalsAttempted','fieldGoalPct','threePointFieldGoalsMade-threePointFieldGoalsAttempted','threePointFieldGoalPct','freeThrowsMade-freeThrowsAttempted','freeThrowPct','totalRebounds','offensiveRebounds','assists','steals','blocks','turnovers','fouls']:['totalYards','netPassingYards','rushingYards','firstDowns','thirdDownEff','fourthDownEff','turnovers','totalPenaltiesYards','possessionTime'];
 const available=[...new Set(maps.flatMap(s=>s.map(v=>v.name)))];
 const names=priorities.filter(n=>available.includes(n));
 if(names.length)html+=section('Team comparison',table(['Statistic',...teams.map(t=>t.team?.abbreviation)],names.map(n=>[maps.flat().find(s=>s.name===n)?.label||maps.flat().find(s=>s.name===n)?.displayName||n,...maps.map(m=>m.find(s=>s.name===n)?.displayValue??'–')])));
 for(const group of d.leaders||[]){
 const rows=(group.leaders||[]).flatMap(category=>(category.leaders||[]).map(p=>[category.displayName||category.name,p.athlete?.displayName||p.athlete?.shortName,p.displayValue]));
 if(rows.length)html+=section(`${group.team?.displayName||'Game'} leaders`,table(['Category','Player','Performance'],rows));
 }
 const categories=baseball?['batting','pitching']:hockey||league==='NBA'?null:['passing','rushing','receiving','defensive'];
 let playerCount=0;
 for(const team of d.boxscore?.players||[]){
 for(const group of team.statistics||[]){
 if(categories&&!categories.includes(group.name||group.type))continue;
 const athletes=(group.athletes||[]).filter(p=>Array.isArray(p.stats)&&p.stats.length);
 if(!athletes.length)continue;playerCount+=athletes.length;
 const headers=group.labels||group.names||[];
 html+=section(`${team.team?.displayName||''} · ${group.text||group.name||group.type||'Player box score'}`,table(['Player',...headers],athletes.map(p=>[p.athlete?.displayName||p.athlete?.shortName||'Unknown',...headers.map((_,i)=>p.stats[i]??'–')])));
 }}
 const probables=teams.flatMap(t=>(t.probables||[]).map(p=>[t.team?.abbreviation,p.athlete?.displayName,p.displayName||'Probable starter']));
 if(probables.length&&state==='pre')html+=section('Probable starters',table(['Team','Player','Role'],probables));
 const plays=d.scoringPlays||[];
 if(plays.length)html+=section('Scoring plays',`<ol class="plays">${[...plays].reverse().map(p=>`<li><span>${safe(p.team?.abbreviation||'')} · ${safe(p.period?.displayValue||p.period?.number||'')} ${safe(p.clock?.displayValue||'')} · ${safe(p.awayScore)}–${safe(p.homeScore)}</span><p>${safe(p.text)}</p></li>`).join('')}</ol>`);
 if(!playerCount&&!names.length&&!periodCount&&state!=='pre')html+='<p class="detail-note">Detailed statistics have not been published for this game yet.</p>';
 html+=`<p class="detail-note ${d.stale?'detail-error':''}" role="status">${d.stale?'Feed unavailable — showing last received details. ':''}Last received ${safe(new Date(d.updated).toLocaleTimeString())} · Refreshes every 30 seconds</p>`;
 content.innerHTML=html;
}
async function loadDetails(){
 if(!activeGame)return;const key=activeGame;
 detailAbort?.abort();detailAbort=new AbortController();
 try{const r=await fetch(`/api/game?league=${encodeURIComponent(key.league)}&id=${encodeURIComponent(key.id)}`,{signal:detailAbort.signal});const d=await r.json();if(!r.ok)throw Error(d.error);if(activeGame!==key)return;detailLast=d;drawDetails(d);}
 catch(error){if(error.name==='AbortError'||activeGame!==key)return;if(detailLast)drawDetails({...detailLast,stale:true});else content.innerHTML=`<p class="detail-error" role="alert">${safe(error.message)}</p><button id="retry-detail">Retry</button>`;}
}
function openDetails(game){
 detailOpener={id:game.dataset.game,league:game.dataset.league};activeGame={...detailOpener};detailLast=null;
 document.querySelector('#game-title').textContent=`${labels[activeGame.league]} · Game details`;
 content.innerHTML='<p class="detail-note" role="status">Loading game details…</p>';
 dialog.showModal();document.querySelector('#close-detail').focus();loadDetails();clearInterval(detailTimer);detailTimer=setInterval(loadDetails,30000);
}
document.querySelector('#board').addEventListener('click',e=>{if(e.target.closest('[data-favorite]'))return;const game=e.target.closest('[data-game]');if(game)openDetails(game);});
document.querySelector('#close-detail').onclick=()=>dialog.close();
content.addEventListener('click',e=>{if(e.target.closest('#retry-detail'))loadDetails();});
dialog.addEventListener('close',()=>{activeGame=null;detailAbort?.abort();clearInterval(detailTimer);const game=[...document.querySelectorAll('[data-game]')].find(g=>g.dataset.game===detailOpener?.id&&g.dataset.league===detailOpener?.league);game?.querySelector('.game-open')?.focus({preventScroll:true});});
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});

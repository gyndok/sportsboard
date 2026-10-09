const leagues=['NFL','MLB','NCAAF','NHL','NBA'];
const labels={NFL:'NFL',MLB:'MLB',NCAAF:'NCAA FOOTBALL',NHL:'NHL',NBA:'NBA'};
let selected='ALL',filter='all',data={},generation=0,controller;
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const favoriteKey=(league,team)=>`${league}:${team.name}`;
let favorites=new Set();
try{const saved=JSON.parse(localStorage.getItem('sportsboard.favorites') || '[]');if(Array.isArray(saved))favorites=new Set(saved.filter(x=>typeof x==='string'));}catch{}
const isFavorite=e=>e.teams.some(t=>favorites.has(favoriteKey(e.league,t)));
const localDate=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
$('#date').value=localDate();
$('#zone').textContent=`Game times: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
function clock(){const d=new Date();$('#clock').textContent=d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});$('#today').textContent=d.toLocaleDateString([],{weekday:'long',month:'short',day:'numeric'});}clock();setInterval(clock,1000);
function render(){
  const visible=selected==='ALL'?leagues:[selected];$('#board').classList.toggle('single',selected!=='ALL');
  const order=(a,b)=>({in:0,pre:1,post:2}[a.state]??3)-({in:0,pre:1,post:2}[b.state]??3)||Date.parse(a.date)-Date.parse(b.date);
  const gamesFor=l=>(data[l]?.events || []).map(e=>({...e,league:l})).filter(e=>filter==='all'||e.state===filter);
  const pinned=visible.flatMap(gamesFor).filter(isFavorite).sort(order);
  const sections=[...(pinned.length?[{l:'FAVORITES',d:{events:pinned},events:pinned}]:[]),...visible.map(l=>({l,d:data[l],events:gamesFor(l).filter(e=>!isFavorite(e)).sort(order)}))];
  $('#board').innerHTML=sections.map(({l,d,events})=>{
    return `<section class="league ${l==='FAVORITES'?'favorites-section':''}"><div class="league-head"><h2>${l==='FAVORITES'?'★ FAVORITES':labels[l]}</h2><span>${d?`${events.length} GAME${events.length===1?'':'S'}`:'CONNECTING'}</span></div>${d?.error?`<div class="warning">${esc(d.error)}</div>`:''}<div class="column-head"><span>TIME / STATUS</span><span>TEAM</span><span>W–L</span><span>SCR</span></div><div class="games">${events.map(e=>`<article data-game="${esc(e.id)}" data-league="${esc(e.league)}" class="game ${e.state==='in'?'live':esc(e.state)}"><div class="game-meta"><button class="game-open status" aria-label="View ${esc(e.name)} game details">${esc(e.state==='pre'?(/postpon|cancel|delay|suspend|TBD/i.test(e.status)?e.status:new Date(e.date).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})):e.status)}</button><span class="state-label">${l==='FAVORITES'?esc(e.league)+' · ':''}${e.state==='in'?'LIVE':e.state==='post'?'FINAL':'UPCOMING'}</span>${e.broadcast&&e.state!=='post'?`<button class="watch-chip" data-watch="${esc(e.broadcast)}" data-title="${esc(e.teams.map(t=>t.abbr).join(' @ '))}" title="Watch on the TV">📺 ${esc(e.broadcast)}</button>`:''}</div><div class="teams">${e.teams.map(t=>`<div class="team"><span class="name"><button class="favorite-toggle" data-favorite="${esc(favoriteKey(e.league,t))}" aria-pressed="${favorites.has(favoriteKey(e.league,t))}" aria-label="${favorites.has(favoriteKey(e.league,t))?'Unpin':'Pin'} ${esc(t.name)}" title="${favorites.has(favoriteKey(e.league,t))?'Unpin favorite':'Pin team to top'}">${favorites.has(favoriteKey(e.league,t))?'★':'☆'}</button>${t.rank?`<small>${t.rank} </small>`:''}${esc(t.name)}</span><span class="record">${esc(t.record || '—')}</span><span class="score">${e.state==='pre'?'–':esc(t.score)}</span></div>`).join('')}</div></article>`).join('') || `<div class="empty">${!d?'Loading games…':d.error&&!d.events?'Scores temporarily unavailable.':gamesFor(l).length?'Favorite games are pinned above.':filter==='all'?'No games scheduled for this date.':'No '+({in:'live',pre:'upcoming',post:'final'}[filter])+' games for this date.'}</div>`}</div></section>`;
  }).join('');
}
async function refresh(clear=false){
  controller?.abort();controller=new AbortController();const signal=controller.signal,run=++generation;
  if(clear)data={};render();$('#refresh').disabled=true;$('#summary').textContent='Updating scores…';
  await Promise.all(leagues.map(async l=>{try{const r=await fetch(`/api/scores?league=${l}&date=${$('#date').value.replaceAll('-','')}`,{signal});const d=await r.json();if(!r.ok)throw Error(d.error);if(run===generation)data[l]=d;}catch(e){if(run===generation)data[l]={...data[l],error:e.name==='AbortError'?'Request interrupted':e.message,stale:true};}if(run===generation)render();}));
  if(run!==generation)return;$('#refresh').disabled=false;
  const failed=leagues.filter(l=>data[l]?.error).length,live=Object.values(data).flatMap(d=>d.events||[]).filter(e=>e.state==='in').length;
  $('#summary').textContent=failed?`${failed} feed${failed===1?'':'s'} unavailable · retrying every 30s`:`${live} live · Updated ${new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit',second:'2-digit'})}`;
}
$('#board').addEventListener('click',e=>{
  const button=e.target.closest('[data-favorite]');if(!button)return;
  const key=button.dataset.favorite;
  favorites.has(key)?favorites.delete(key):favorites.add(key);
  try{localStorage.setItem('sportsboard.favorites',JSON.stringify([...favorites]));}catch{$('#summary').textContent='Favorites work for this visit; browser storage is unavailable.';}
  render();
  [...document.querySelectorAll('[data-favorite]')].find(b=>b.dataset.favorite===key)?.focus({preventScroll:true});
});
$('#leagues').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;selected=b.dataset.league;$('#leagues').querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',x===b));render();});
$('#filters').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;filter=b.dataset.state;$('#filters').querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',x===b));render();});
// Follow today across midnight unless a different date was picked; Today resumes it.
let followToday=true;
$('#date').onchange=()=>{if($('#date').value){followToday=$('#date').value===localDate();refresh(true);}};
function shift(n){const d=new Date($('#date').value+'T12:00:00');d.setDate(d.getDate()+n);$('#date').value=localDate(d);followToday=$('#date').value===localDate();refresh(true);}
$('#previous').onclick=()=>shift(-1);$('#next').onclick=()=>shift(1);$('#reset').onclick=()=>{followToday=true;$('#date').value=localDate();refresh(true);};$('#refresh').onclick=()=>refresh();
$('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{$('#summary').textContent='Full screen is unavailable in this browser.';}};
document.addEventListener('fullscreenchange',()=>{$('#fullscreen').textContent=document.fullscreenElement?'Exit full screen ↙':'Full screen ↗';});
refresh();setInterval(()=>{if(followToday&&$('#date').value!==localDate()){$('#date').value=localDate();refresh(true);}else refresh();},30000);

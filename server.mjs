import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {initWall, handleWall} from './wall.mjs';
const PORT=Number(process.env.PORT || 8787);
export const leagues = {NFL:'football/nfl',MLB:'baseball/mlb',NCAAF:'football/college-football',NHL:'hockey/nhl',NBA:'basketball/nba'};
const cache = new Map();
const pending = new Map();
export function normalize(e) {
  const c=e.competitions?.[0] || {}, s=c.status || e.status || {};
  const teams=[...(c.competitors || [])].sort((a,b)=>(a.homeAway==='away'?-1:1)-(b.homeAway==='away'?-1:1)).map(t=>({name:t.team?.displayName || 'TBD',short:t.team?.shortDisplayName || t.team?.displayName || 'TBD',abbr:t.team?.abbreviation || 'TBD',score:t.score ?? '0',home:t.homeAway==='home',record:t.records?.find(r=>r.type==='total')?.summary || '',rank:t.curatedRank?.current<26?t.curatedRank.current:null}));
  return {id:e.id,date:e.date,name:e.name,state:s.type?.state || 'pre',completed:!!s.type?.completed,status:s.type?.shortDetail || s.type?.description || 'Scheduled',venue:c.venue?.fullName || '',broadcast:(c.broadcasts || []).flatMap(b=>b.names || []).join(' / '),teams,odds:oddsOf(c.odds,teams)};
}
// Betting lines for the sportsbook-style board, from the first odds provider ESPN lists.
// ESPN has used two shapes: newer {moneyline,pointSpread,total} objects with open/close
// strings, and older numeric {awayTeamOdds.moneyLine, spread, overUnder}. Both are read.
// Returns {fav:'away'|'home'|null, line, total, ml:{away,home}} or null; any part may be null.
export function oddsOf(list,teams){
  const o=Array.isArray(list)?list[0]:null;
  if(!o||typeof o!=='object')return null;
  const num=v=>{const n=parseFloat(String(v??'').trim().replace(/^[ou]/i,''));return Number.isFinite(n)?n:null;};
  const side=x=>x&&typeof x==='object'?(x.close||x.current||x.open||null):null;
  const ml=v=>{if(v==null||v==='')return null;const t=String(v).trim().toUpperCase();if(/^EV(EN)?$/.test(t))return 'EV';const n=Number(t);if(!Number.isFinite(n)||Math.abs(n)<100)return null;return Math.abs(n)===100?'EV':(n>0?'+':'')+Math.round(n);};
  const money={away:ml(side(o.moneyline?.away)?.odds??o.awayTeamOdds?.moneyLine),home:ml(side(o.moneyline?.home)?.odds??o.homeTeamOdds?.moneyLine)};
  const total=num(o.overUnder)??num(side(o.total?.over)?.line);
  let fav=null,line=null;
  const homeLine=num(side(o.pointSpread?.home)?.line);
  const details=String(o.details||'').trim(), m=details.match(/^(.+?)\s+([+-]?\d+(?:\.\d+)?)$/);
  if(homeLine!==null){line=Math.abs(homeLine);fav=homeLine<0?'home':homeLine>0?'away':null;}
  else if(/^(even|pk|pick|pick'?em)$/i.test(details))line=0;
  else if(m&&Math.abs(+m[2])<100){ // "KC -3.5"; MLB/NHL put the moneyline here ("NYY -155"), which isn't a spread
    const t=(teams||[]).find(x=>x.abbr.toUpperCase()===m[1].toUpperCase());
    if(t){fav=t.home?'home':'away';line=Math.abs(+m[2]);}
  }
  if(line===null&&typeof o.spread==='number'&&Number.isFinite(o.spread)){
    line=Math.abs(o.spread);
    fav=o.homeTeamOdds?.favorite?'home':o.awayTeamOdds?.favorite?'away':o.spread<0?'home':o.spread>0?'away':null;
  }
  if(line===0)fav=null;
  const out={fav,line,total,ml:money.away||money.home?money:null};
  return out.line===null&&out.total===null&&!out.ml?null:out;
}
async function scores(league,date) {
  const key=league+date, old=cache.get(key);
  if(old && Date.now()-old.saved<25000) return old.data;
  if(pending.has(key)) return pending.get(key);
  const task=(async()=>{
    try {
      const url=new URL(`https://site.api.espn.com/apis/site/v2/sports/${leagues[league]}/scoreboard`);
      url.searchParams.set('dates',date);url.searchParams.set('limit','1000');
      if(league==='NCAAF')url.searchParams.set('groups','80');
      const r=await fetch(url,{signal:AbortSignal.timeout(12000)});
      if(!r.ok)throw Error(`Feed returned ${r.status}`);
      const raw=await r.json();if(!Array.isArray(raw.events))throw Error('Invalid feed');
      const data={league,events:raw.events.map(normalize),updated:new Date().toISOString(),stale:false};
      cache.set(key,{saved:Date.now(),data});
      if(cache.size>150)cache.delete(cache.keys().next().value);
      return data;
    }catch(err){if(old)return {...old.data,stale:true,error:'Feed unavailable; showing last received scores.'};throw err;}
  })();pending.set(key,task);try{return await task;}finally{pending.delete(key);}
}
const detailCache=new Map(), detailPending=new Map();
async function details(league,id){
  const key=league+id,old=detailCache.get(key);
  if(old && Date.now()-old.saved<25000)return old.data;
  if(detailPending.has(key))return detailPending.get(key);
  const task=(async()=>{try{
    const response=await fetch(`https://site.api.espn.com/apis/site/v2/sports/${leagues[league]}/summary?event=${id}`,{signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw Error('Unavailable');
    const raw=await response.json();
    const competition=raw.header?.competitions?.[0];
    if(!competition)throw Error('Missing game');
    const data={league,competition,gameInfo:raw.gameInfo,boxscore:raw.boxscore,leaders:raw.leaders,scoringPlays:raw.scoringPlays,updated:new Date().toISOString()};
    detailCache.set(key,{data,saved:Date.now()});
    if(detailCache.size>60)detailCache.delete(detailCache.keys().next().value);
    return data;
  }catch(error){if(old)return {...old.data,stale:true};throw error;}})();
  detailPending.set(key,task);try{return await task;}finally{detailPending.delete(key);}
}
// Real calendar dates only (YYYYMMDD), within a sane window.
export function validYmd(d){if(!/^\d{8}$/.test(d||''))return false;const y=+d.slice(0,4),m=+d.slice(4,6),day=+d.slice(6);const t=new Date(Date.UTC(y,m-1,day));return y>=2000&&y<=2100&&t.getUTCMonth()===m-1&&t.getUTCDate()===day;}
// One boundary for every request: nothing a client sends can take the server down.
export function createServer(){return http.createServer((req,res)=>{handle(req,res).catch(err=>{console.error(new Date().toISOString(),'request failed',req.method,req.url,err?.stack||err);if(!res.headersSent){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Internal error'}));}else res.destroy();});});}
async function handle(req,res){
  let url;try{url=new URL(req.url,'http://localhost');}catch{res.writeHead(400);return res.end('Bad request');}
  res.setHeader('X-Content-Type-Options','nosniff');
  if(url.pathname==='/api/game'){
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
    const league=url.searchParams.get('league'),id=url.searchParams.get('id');
    if(!Object.hasOwn(leagues,league)||!/^\d{1,15}$/.test(id||'')){res.writeHead(400);return res.end(JSON.stringify({error:'Invalid game'}));}
    try{res.end(JSON.stringify(await details(league,id)));}catch{res.writeHead(502);res.end(JSON.stringify({error:'Game details are temporarily unavailable. Please retry.'}));}return;
  }
  if(url.pathname==='/api/scores'){
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
    const league=url.searchParams.get('league'),date=url.searchParams.get('date');
    if(!Object.hasOwn(leagues,league) || !validYmd(date)){res.writeHead(400);return res.end(JSON.stringify({error:'Invalid league or date'}));}
    try{res.end(JSON.stringify(await scores(league,date)));}catch{res.writeHead(502);res.end(JSON.stringify({error:'Unable to reach the score feed. Retrying automatically.'}));}return;
  }
  if(await handleWall(req,res,url,PORT))return;
  const files={'/remote':['remote.html','text/html'],'/remote.js':['remote.js','text/javascript'],'/calm':['calm.html','text/html'],'/calm.js':['calm.js','text/javascript'],'/sidebar':['sidebar.html','text/html'],'/sidebar.js':['sidebar.js','text/javascript'],'/wall.css':['wall.css','text/css'],'/watch.js':['watch.js','text/javascript'],'/feed.js':['feed.js','text/javascript'],'/backdrop':['backdrop.html','text/html'],'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/details.js':['details.js','text/javascript'],'/style.css':['style.css','text/css'],'/favicon.svg':['favicon.svg','image/svg+xml'],'/fonts/roboto-condensed-700.woff2':['fonts/roboto-condensed-700.woff2','font/woff2'],'/fonts/roboto-condensed-500.woff2':['fonts/roboto-condensed-500.woff2','font/woff2']};
  if(!Object.hasOwn(files,url.pathname)){res.writeHead(404);return res.end('Not found');}
  try{const [file,type]=files[url.pathname];res.setHeader('Content-Type',type);if(type==='font/woff2')res.setHeader('Cache-Control','max-age=604800');res.end(await readFile(new URL(`./public/${file}`,import.meta.url)));}catch{res.writeHead(500);res.end('Unable to load page');}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){process.on('unhandledRejection',e=>console.error(new Date().toISOString(),'unhandled',e?.stack||e));await initWall({port:PORT});createServer().listen(PORT,process.env.HOST||'0.0.0.0',()=>console.log(`Sportsboard ready: http://localhost:${PORT}  ·  TV Wall remote: http://localhost:${PORT}/remote`));}

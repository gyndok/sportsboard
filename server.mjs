import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
export const leagues = {NFL:'football/nfl',MLB:'baseball/mlb',NCAAF:'football/college-football',NHL:'hockey/nhl',NBA:'basketball/nba'};
const cache = new Map();
const pending = new Map();
export function normalize(e) {
  const c=e.competitions?.[0] || {}, s=c.status || e.status || {};
  return {id:e.id,date:e.date,name:e.name,state:s.type?.state || 'pre',completed:!!s.type?.completed,status:s.type?.shortDetail || s.type?.description || 'Scheduled',venue:c.venue?.fullName || '',broadcast:(c.broadcasts || []).flatMap(b=>b.names || []).join(' / '),teams:[...(c.competitors || [])].sort((a,b)=>(a.homeAway==='away'?-1:1)-(b.homeAway==='away'?-1:1)).map(t=>({name:t.team?.displayName || 'TBD',abbr:t.team?.abbreviation || 'TBD',score:t.score ?? '0',home:t.homeAway==='home',record:t.records?.find(r=>r.type==='total')?.summary || '',rank:t.curatedRank?.current<26?t.curatedRank.current:null}))};
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
export function createServer(){return http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
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
    if(!Object.hasOwn(leagues,league) || !/^\d{8}$/.test(date || '')){res.writeHead(400);return res.end(JSON.stringify({error:'Invalid league or date'}));}
    try{res.end(JSON.stringify(await scores(league,date)));}catch{res.writeHead(502);res.end(JSON.stringify({error:'Unable to reach the score feed. Retrying automatically.'}));}return;
  }
  const files={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/details.js':['details.js','text/javascript'],'/style.css':['style.css','text/css'],'/favicon.svg':['favicon.svg','image/svg+xml']};
  if(!files[url.pathname]){res.writeHead(404);return res.end('Not found');}
  try{const [file,type]=files[url.pathname];res.setHeader('Content-Type',type);res.end(await readFile(new URL(`./public/${file}`,import.meta.url)));}catch{res.writeHead(500);res.end('Unable to load page');}
});}
if(process.argv[1]===fileURLToPath(import.meta.url))createServer().listen(Number(process.env.PORT || 8787),'127.0.0.1',()=>console.log(`Sportsboard ready: http://localhost:${process.env.PORT || 8787}`));

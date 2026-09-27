import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createServer} from '../server.mjs';
const source=await readFile(new URL('../public/details.js',import.meta.url),'utf8');
function render(league,extra={}){
 const content={innerHTML:'',addEventListener(){}};
 const document={querySelector:s=>s==='#game-content'?content:{addEventListener(){}},querySelectorAll:()=>[]};
 const context=vm.createContext({document,esc:x=>String(x??'').replaceAll('<','&lt;').replaceAll('>','&gt;'),labels:{NFL:'NFL',MLB:'MLB',NBA:'NBA',NHL:'NHL',NCAAF:'NCAAF'},setInterval,clearInterval,AbortController});
 vm.runInContext(source,context);
 context.fixture={league,updated:new Date().toISOString(),competition:{date:new Date().toISOString(),status:{type:{state:'post',detail:'Final'}},competitors:[{team:{id:'1',displayName:'<script>test</script>',abbreviation:'A'},homeAway:'away',score:'0',linescores:[{value:0}]},{team:{id:'2',displayName:'Home',abbreviation:'H'},homeAway:'home',score:'1',linescores:[{value:1}]}]},...extra};
 vm.runInContext('drawDetails(fixture)',context);return content.innerHTML;
}
test('sport scoring labels and zero scores are preserved',()=>{for(const [league,label] of [['NFL','Scoring by quarter'],['NCAAF','Scoring by quarter'],['NBA','Scoring by quarter'],['MLB','Inning-by-inning'],['NHL','Scoring by period']]){const html=render(league);assert.ok(html.includes(label));assert.ok(html.includes('<strong>0</strong>'));assert.ok(!html.includes('<script>'));}});
test('hockey goalie box score is included',()=>{assert.ok(render('NHL',{boxscore:{players:[{team:{displayName:'Home'},statistics:[{name:'goalies',labels:['SV','SA'],athletes:[{athlete:{displayName:'Goalie'},stats:['30','31']}]}]}]}}).includes('Goalie'));});
test('unavailable statistics and stale data are explicit',()=>{const html=render('NBA',{competition:{date:new Date().toISOString(),status:{type:{state:'in'}},competitors:[]},stale:true});assert.ok(html.includes('not been published'));assert.ok(html.includes('showing last received'));});
test('detail endpoint rejects invalid league and event IDs',async()=>{const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));try{for(const query of ['league=BAD&id=123','league=NFL&id=../x']){const r=await fetch(`http://127.0.0.1:${server.address().port}/api/game?${query}`);assert.equal(r.status,400);}}finally{await new Promise(r=>server.close(r));}});

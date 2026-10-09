import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../server.mjs';

async function withServer(fn) {
  const server = createServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try { await fn(`http://127.0.0.1:${server.address().port}`); } finally { await new Promise(r => server.close(r)); }
}

test('wall pages and state are served', () => withServer(async base => {
  for (const path of ['/remote', '/calm', '/sidebar', '/wall.css', '/remote.js']) assert.equal((await fetch(base + path)).status, 200, path);
  const d = await (await fetch(`${base}/api/wall`)).json();
  assert.ok(d.layouts.grid && d.layouts.main3);
  assert.ok(Array.isArray(d.services) && d.services.some(s => s.id === 'sportsboard'));
  assert.equal(d.state.windows, undefined, 'window ids stay private');
}));

test('wall rejects cross-site and malformed changes', () => withServer(async base => {
  const post = (body, headers = {}) => fetch(`${base}/api/wall`, {method: 'POST', headers: {'Content-Type': 'application/json', ...headers}, body: JSON.stringify(body)});
  assert.equal((await post({mode: 'off'}, {Origin: 'http://evil.example'})).status, 403);
  assert.equal((await post({layout: 'nope'})).status, 400);
  assert.equal((await post({mode: 'party'})).status, 400);
  assert.equal((await post({slots: [{service: 'youtubetv', link: 'javascript:alert(1)'}]})).status, 400);
}));

test('aerial route only accepts asset ids', () => withServer(async base => {
  assert.equal((await fetch(`${base}/aerial/..%2F..%2Fetc%2Fpasswd`)).status, 404);
}));

test('games route to saved channels or streaming apps', () => withServer(async base => {
  const post = (path, body) => fetch(base + path, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  let r = await post('/api/wall/watch', {broadcast: 'Some Regional Net', slot: 0});
  assert.equal(r.status, 404);
  assert.match((await r.json()).error, /No saved channel/);
  r = await post('/api/wall/watch', {broadcast: 'FS1 / Peacock', slot: 1});
  assert.equal(r.status, 200);
  assert.equal((await r.json()).label, 'Peacock');
  r = await post('/api/wall/channel', {name: 'FS1', aliases: 'Fox Sports 1', url: 'https://tv.youtube.com/watch/example'});
  assert.equal(r.status, 200);
  r = await post('/api/wall/watch', {broadcast: 'FOX SPORTS 1', slot: 2});
  const d = await r.json();
  assert.equal(d.label, 'FS1');
  assert.equal(d.state.slots[2].link, 'https://tv.youtube.com/watch/example');
  assert.equal(d.state.audio, d.state.slots[2].uid);
  assert.equal((await post('/api/wall/watch', {broadcast: 'FS1', slot: 9})).status, 400);
  assert.equal((await post('/api/wall/channel', {name: 'Bad', url: 'javascript:alert(1)'})).status, 400);
  await post('/api/wall/channel', {remove: 'fs1'});
}));

test('calm rotates a pinned category and skips unplayable scenes', () => withServer(async base => {
  const post = (path, body) => fetch(base + path, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  await post('/api/wall/scene', {name: 'Test A', url: 'https://youtu.be/aaaaaaaaaaa'});
  await post('/api/wall/scene', {name: 'Test B', url: 'https://youtu.be/bbbbbbbbbbb'});
  assert.equal((await post('/api/wall', {calm: {pinned: 'cat:My scenes'}})).status, 200);
  const first = (await (await fetch(`${base}/api/wall/calm`)).json()).scene;
  assert.equal(first.category, 'My scenes');
  const next = (await (await fetch(`${base}/api/wall/calm?skip=${first.id}`)).json()).scene;
  assert.equal(next.category, 'My scenes');
  assert.notEqual(next.id, first.id);
  const none = (await (await fetch(`${base}/api/wall/calm?skip=yt-aaaaaaaaaaa,yt-bbbbbbbbbbb`)).json()).scene;
  assert.equal(none.type, 'aerial', 'falls back to Aerials when a whole category is unplayable');
  await post('/api/wall', {calm: {pinned: 'cat:Nope'}});
  assert.equal((await (await fetch(`${base}/api/wall`)).json()).state.calm.pinned, null);
  for (const id of ['yt-aaaaaaaaaaa', 'yt-bbbbbbbbbbb']) await post('/api/wall/scene', {remove: id});
}));

test('sound helper gets a plan and long-polls for changes', () => withServer(async base => {
  const plan = await (await fetch(`${base}/api/wall/audio`)).json();
  assert.equal(typeof plan.version, 'number');
  assert.ok(Array.isArray(plan.wall));
  const t = Date.now();
  const waited = await (await fetch(`${base}/api/wall/audio?wait=1&v=${plan.version + 999}`)).json();
  assert.ok(Date.now() - t < 2000, 'a stale version returns immediately');
  assert.equal(waited.version, plan.version);
  assert.equal((await (await fetch(`${base}/api/wall`)).json()).soundHelper, true);
  assert.equal((await fetch(`${base}/api/wall`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({audio: 'none'})})).status, 200);
}));

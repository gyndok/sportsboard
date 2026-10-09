import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../server.mjs';
import os from 'node:os';
import {mkdtemp, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

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
  assert.equal((await post('/api/wall', {calm: {pinned: 'cat:Nope'}})).status, 400);
  assert.equal((await (await fetch(`${base}/api/wall`)).json()).state.calm.pinned, 'cat:My scenes', 'a rejected change leaves the pin alone');
  await post('/api/wall', {calm: {pinned: null}});
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
  assert.equal((await (await fetch(`${base}/api/wall`)).json()).soundHelper, false, 'a plain request is not the helper');
  await fetch(`${base}/api/wall/audio`, {headers: {'X-Sportsboard-Helper': '1'}});
  assert.equal((await (await fetch(`${base}/api/wall`)).json()).soundHelper, true);
  assert.equal((await fetch(`${base}/api/wall`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({audio: 'none'})})).status, 200);
}));

test('every layout keeps game tiles 16:9 and inside the screen', async () => {
  const {layoutPlan, LAYOUTS} = await import('../wall.mjs');
  for (const area of [{x: 0, y: 0, width: 2560, height: 1440}, {x: 0, y: 28, width: 1920, height: 1052}]) {
    for (const layout of Object.keys(LAYOUTS)) for (const scores of [false, true]) {
      const {tiles, scores: panel} = layoutPlan(layout, area, scores);
      assert.equal(tiles.length, LAYOUTS[layout].slots, layout);
      const boxes = [...tiles, ...(panel ? [panel] : [])];
      for (const t of tiles) assert.ok(Math.abs(t.width / t.height - 16 / 9) < 0.01, `${layout} tile is 16:9`);
      for (const b of boxes) assert.ok(b.x >= area.x - 1 && b.y >= area.y - 1 && b.x + b.width <= area.x + area.width + 1 && b.y + b.height <= area.y + area.height + 1, `${layout} fits`);
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const [p, q] = [boxes[i], boxes[j]];
        const overlap = Math.min(p.x + p.width, q.x + q.width) - Math.max(p.x, q.x) > 2 && Math.min(p.y + p.height, q.y + q.height) - Math.max(p.y, q.y) > 2;
        assert.ok(!overlap, `${layout}${scores ? '+scores' : ''} boxes ${i},${j} don't overlap`);
      }
      assert.equal(!!panel, scores, `${layout} scores panel only when asked`);
    }
  }
});

test('swapping a small screen to big keeps window identities and moves the sound', () => withServer(async base => {
  const post = body => fetch(`${base}/api/wall`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)}).then(r => r.json());
  let {state} = await post({mode: 'grid', layout: 'main2'});
  const [big, small] = [state.slots[0], state.slots[2]];
  const slots = state.slots.map(s => ({...s}));
  [slots[0], slots[2]] = [slots[2], slots[0]];
  ({state} = await post({slots, audio: small.uid}));
  assert.equal(state.slots[0].uid, small.uid);
  assert.equal(state.slots[2].uid, big.uid);
  assert.equal(state.audio, small.uid);
}));

test('malformed requests are refused without taking the server down', () => withServer(async base => {
  const raw = (body, headers = {}, method = 'POST') => fetch(`${base}/api/wall`, {method, headers: {'Content-Type': 'application/json', ...headers}, body});
  assert.equal((await raw('{}', {Origin: 'null'})).status, 403);
  assert.equal((await raw('{}', {Origin: 'not a url'})).status, 403);
  assert.equal((await raw('{"mode":')).status, 400);
  assert.equal((await raw('[1,2]')).status, 400);
  assert.equal((await raw('null')).status, 400);
  assert.equal((await raw('{"surprise":1}')).status, 400);
  assert.equal((await raw('x'.repeat(30000))).status, 413);
  assert.equal((await raw('{}', {}, 'PUT')).status, 405);
  assert.equal((await fetch(`${base}/api/wall/channel`)).status, 405);
  assert.equal((await fetch(`${base}/api/scores?league=NFL&date=20261340`)).status, 400, 'impossible dates are rejected');
  assert.equal((await fetch(`${base}/api/scores?league=toString&date=20261009`)).status, 400);
  assert.equal((await fetch(`${base}/api/wall`)).status, 200, 'still serving after all of that');
}));

test('a rejected change leaves the whole state untouched', () => withServer(async base => {
  const post = body => fetch(`${base}/api/wall`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  const before = (await (await fetch(`${base}/api/wall`)).json()).state;
  for (const body of [
    {mode: 'calm', layout: 'nope'},
    {mode: 'calm', layout: 'toString'},
    {mode: 'calm', layout: 'constructor'},
    {mode: 'calm', slots: [{uid: 'aaa', service: 'youtubetv'}, {uid: 'aaa', service: 'peacock'}]},
    {mode: 'calm', slots: Array.from({length: 5}, () => ({service: 'youtubetv'}))},
    {mode: 'calm', slots: [{uid: 'BAD ID!', service: 'youtubetv'}]},
    {mode: 'calm', sidebar: 'yes'},
    {mode: 'calm', audio: 'nobody'},
    {mode: 'calm', calm: {pinned: 42}}
  ]) assert.equal((await post(body)).status, 400, JSON.stringify(body));
  const after = (await (await fetch(`${base}/api/wall`)).json()).state;
  for (const k of ['mode', 'layout', 'slots', 'sidebar', 'audio', 'calm']) assert.deepEqual(after[k], before[k], k);
  const ok = await post({layout: 'grid', slots: [{service: 'youtubetv'}, {service: 'peacock'}, {service: 'youtubetv'}, {service: 'sportsboard'}]});
  assert.equal(ok.status, 200, 'a valid four-screen layout still works');
  const ids = (await ok.json()).state.slots.map(s => s.uid);
  assert.equal(new Set(ids).size, 4, 'missing ids are generated and unique');
}));

test('phone links still work when network-interface lookup fails', () => withServer(async base => {
  const real = os.networkInterfaces;
  os.networkInterfaces = () => { throw Error('denied'); };
  try {
    const r = await fetch(`${base}/api/wall`);
    assert.equal(r.status, 200);
    assert.deepEqual((await r.json()).remoteUrls, []);
  } finally { os.networkInterfaces = real; }
}));

test('aerial video ranges are validated and served safely', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aerials-'));
  const id = '12345678-1234-1234-1234-123456789ABC';
  await mkdir(path.join(root, '4KSDR240FPS'));
  await writeFile(path.join(root, 'entries.json'), JSON.stringify({assets: [{id, accessibilityLabel: 'Test'}]}));
  await writeFile(path.join(root, '4KSDR240FPS', `${id}.mov`), Buffer.alloc(1000, 7));
  process.env.WALL_AERIAL_ROOT = root;
  try {
    await withServer(async base => {
      const get = (range, method = 'GET') => fetch(`${base}/aerial/${id}.mov`, {method, headers: range ? {Range: range} : {}});
      let r = await get('bytes=0-99');
      assert.equal(r.status, 206); assert.equal((await r.arrayBuffer()).byteLength, 100);
      r = await get('bytes=-10');
      assert.equal(r.status, 206); assert.equal(r.headers.get('content-range'), 'bytes 990-999/1000'); await r.arrayBuffer();
      r = await get('bytes=900-5000');
      assert.equal(r.headers.get('content-range'), 'bytes 900-999/1000'); await r.arrayBuffer();
      for (const bad of ['bytes=2000-', 'bytes=5-2', 'bytes=-0']) {
        r = await get(bad);
        assert.equal(r.status, 416, bad); assert.equal(r.headers.get('content-range'), 'bytes */1000'); await r.arrayBuffer();
      }
      r = await get(null, 'HEAD');
      assert.equal(r.status, 200); assert.equal(r.headers.get('content-length'), '1000');
      r = await get('bytes=abc');
      assert.equal(r.status, 200, 'unparseable ranges fall back to the whole file'); await r.arrayBuffer();
      assert.equal((await fetch(`${base}/aerial/not-an-id.mov`)).status, 404);
      assert.equal((await fetch(`${base}/api/wall`)).status, 200);
    });
  } finally { delete process.env.WALL_AERIAL_ROOT; }
});

test('restart keeps the wall when one saved value is stale, and never clobbers the config backup', async () => {
  const {initWall} = await import('../wall.mjs');
  const cfg = path.join(os.tmpdir(), `wall-config-test-${process.pid}.json`);
  const st = path.join(os.tmpdir(), `wall-state-test-${process.pid}.json`);
  const {readFile} = await import('node:fs/promises');
  const good = {channels: [{id: 'fs1', name: 'FS1', aliases: [], url: 'https://tv.youtube.com/watch/example'}]};
  await writeFile(`${cfg}.last-good`, JSON.stringify(good));
  await writeFile(cfg, '{"channels": [ truncated');
  await writeFile(st, JSON.stringify({mode: 'grid', layout: 'main3', sidebar: true, calm: {pinned: 'yt-deleted-scene', clock: false},
    slots: [{uid: 'aaa', service: 'youtubetv', link: ''}, {uid: 'bbb', service: 'peacock', link: ''}]}));
  await initWall({port: 0});
  await withServer(async base => {
    const d = await (await fetch(`${base}/api/wall`)).json();
    assert.equal(d.channels[0]?.id, 'fs1', 'channels recovered from the backup');
    assert.equal(d.state.layout, 'main3', 'layout kept');
    assert.equal(d.state.sidebar, true);
    assert.equal(d.state.calm.pinned, null, 'only the stale pin is dropped');
    assert.equal(d.state.calm.clock, false);
    assert.deepEqual(d.state.slots.map(s => s.uid), ['aaa', 'bbb']);
  });
  assert.equal(JSON.parse(await readFile(`${cfg}.last-good`, 'utf8')).channels[0].id, 'fs1', 'backup untouched');
  assert.equal(JSON.parse(await readFile(cfg, 'utf8')).channels[0].id, 'fs1', 'main file rewritten from the recovered settings');
  assert.ok((await readFile(`${cfg}.corrupt`, 'utf8')).includes('truncated'), 'the corrupt file is kept for inspection');
});

test('deleting the pinned scene clears the pin', () => withServer(async base => {
  const post = (p, body) => fetch(base + p, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  await post('/api/wall/scene', {name: 'Gone soon', url: 'https://youtu.be/ccccccccccc'});
  assert.equal((await post('/api/wall', {calm: {pinned: 'yt-ccccccccccc'}})).status, 200);
  await post('/api/wall/scene', {remove: 'yt-ccccccccccc'});
  assert.equal((await (await fetch(`${base}/api/wall`)).json()).state.calm.pinned, null);
}));

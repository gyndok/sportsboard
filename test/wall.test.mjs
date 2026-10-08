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

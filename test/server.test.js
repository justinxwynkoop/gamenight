import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, cpSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { WebSocket } from 'ws';

const root = path.resolve(import.meta.dirname, '..');
const PIN = '2468';
const dataDir = mkdtempSync(path.join(tmpdir(), 'gamenight-'));
cpSync(path.join(root, 'data/jeopardy'), path.join(dataDir, 'jeopardy'), { recursive: true });

const freePort = () => new Promise((res) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });

async function startServer(port) {
  const proc = spawn('node', ['server.js'], { cwd: root, env: { ...process.env, PORT: String(port), HOST_PIN: PIN, DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve, reject) => {
    proc.stdout.on('data', (d) => { if (String(d).includes('running')) resolve(); });
    proc.on('exit', (c) => reject(new Error(`server exited ${c}`)));
  });
  return proc;
}
const stopServer = (proc) => new Promise((res) => { proc.once('exit', res); proc.kill('SIGTERM'); });

class Client {
  constructor(port) { this.msgs = []; this.view = null; this.ws = new WebSocket(`ws://localhost:${port}/ws`); this.raw = [];
    this.ws.on('message', (d) => { this.raw.push(String(d)); const m = JSON.parse(d); this.msgs.push(m); if (m.t === 'state') this.view = m.view; }); }
  open() { return new Promise((r) => (this.ws.readyState === 1 ? r() : this.ws.once('open', r))); }
  send(m) { this.ws.send(JSON.stringify(m)); }
  act(action, args = {}) { this.send({ t: 'act', action, args }); }
  async until(fn, label = 'condition') {
    for (let i = 0; i < 100; i++) { const r = fn(this); if (r) return r; await new Promise((s) => setTimeout(s, 20)); }
    throw new Error(`timed out waiting for ${label}`);
  }
  close() { this.ws.close(); }
}
async function connectAs(port, hello) { const c = new Client(port); await c.open(); c.send(hello); return c; }

test('server end to end', async (t) => {
  const port = await freePort();
  let proc = await startServer(port);
  t.after(async () => { await stopServer(proc).catch(() => {}); rmSync(dataDir, { recursive: true, force: true }); });
  const base = `http://localhost:${port}`;

  await t.test('editor API needs the host PIN', async () => {
    assert.equal((await fetch(`${base}/api/games/jeopardy/sets`)).status, 401);
    assert.equal((await fetch(`${base}/api/games/jeopardy/sets`, { headers: { 'x-host-pin': 'nope' } })).status, 401);
    const ok = await fetch(`${base}/api/games/jeopardy/sets`, { headers: { 'x-host-pin': PIN } });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json())[0].id, 'family-night');
    // Invalid set is rejected
    const bad = await fetch(`${base}/api/games/jeopardy/sets/broken`, { method: 'PUT', headers: { 'x-host-pin': PIN }, body: '{"title":"x"}' });
    assert.equal(bad.status, 400);
  });

  await t.test('games are listed, and set endpoints are per game', async () => {
    const games = await (await fetch(`${base}/api/games`)).json();
    assert.deepEqual(games.map((g) => g.id), ['jeopardy']);
    assert.ok(games[0].name && games[0].description);
    const h = { 'x-host-pin': PIN };
    assert.equal((await fetch(`${base}/api/games/nope/sets`, { headers: h })).status, 404);
    assert.equal((await fetch(`${base}/api/sets`, { headers: h })).status, 404); // the old, un-namespaced route is gone
  });

  await t.test('custom sounds in data/sounds are listed and served; other names are refused', async () => {
    assert.deepEqual(await (await fetch(`${base}/api/sounds`)).json(), []);
    mkdirSync(path.join(dataDir, 'sounds'), { recursive: true });
    writeFileSync(path.join(dataDir, 'sounds', 'think.mp3'), Buffer.from([1, 2, 3, 4]));
    writeFileSync(path.join(dataDir, 'sounds', 'Bad Name.mp3'), Buffer.from([9]));   // not a name the game would use
    writeFileSync(path.join(dataDir, 'sounds', 'notes.txt'), 'x');
    assert.deepEqual(await (await fetch(`${base}/api/sounds`)).json(), [{ name: 'think', url: '/sounds/think.mp3' }]);
    const file = await fetch(`${base}/sounds/think.mp3`);
    assert.equal(file.status, 200);
    assert.equal(file.headers.get('content-type'), 'audio/mpeg');
    assert.deepEqual([...Buffer.from(await file.arrayBuffer())], [1, 2, 3, 4]);
    assert.equal((await fetch(`${base}/sounds/notes.txt`)).status, 404);
    assert.equal((await fetch(`${base}/sounds/..%2fstate.json`)).status, 404);
    assert.equal((await fetch(`${base}/sounds/missing.mp3`)).status, 404);
  });

  await t.test('the join address comes from the current network and is served as JSON and a QR code', async () => {
    const info = await (await fetch(`${base}/api/info`)).json();
    assert.match(info.joinUrl, new RegExp(`^http://[^/]+:${port}/$`));
    const qr = await fetch(`${base}/api/qr.svg`);
    assert.equal(qr.status, 200);
    assert.match(await qr.text(), /^<svg/);
  });

  await t.test('static files stay inside public/', async () => {
    assert.equal((await fetch(`${base}/tv`)).status, 200);
    assert.equal((await fetch(`${base}/%2e%2e/server.js`)).status, 404);
    assert.equal((await fetch(`${base}/..%2fserver.js`)).status, 404);
  });

  const host = await connectAs(port, { t: 'hello', role: 'host', pin: PIN });
  const tv = await connectAs(port, { t: 'hello', role: 'tv' });
  const wrong = await connectAs(port, { t: 'hello', role: 'host', pin: '0000' });
  await t.test('wrong host PIN is refused and gets no state', async () => {
    await wrong.until((c) => c.msgs.some((m) => m.t === 'bad-pin'), 'bad-pin');
    assert.equal(wrong.view, null);
  });
  await host.until((c) => c.view, 'host state');

  const ann = await connectAs(port, { t: 'hello', role: 'player' });
  const bo = await connectAs(port, { t: 'hello', role: 'player' });
  await ann.until((c) => c.msgs.some((m) => m.t === 'need-join'));
  ann.send({ t: 'join', name: 'Ann', color: '#ef4444' });
  bo.send({ t: 'join', name: 'Bo' });
  const annToken = (await ann.until((c) => c.msgs.find((m) => m.t === 'joined'))).token;
  await bo.until((c) => c.msgs.find((m) => m.t === 'joined'));
  host.act('startGame');
  await tv.until((c) => c.view?.game?.status === 'board', 'board');

  await t.test('answers never reach the TV or phones before the reveal', async () => {
    host.act('select', { c: 0, r: 0 });
    await tv.until((c) => c.view?.game?.clue?.step === 'reading');
    assert.equal(tv.view.game.clue.answer, null);
    await host.until((c) => c.view?.game?.clue?.answer);
    assert.equal(host.view.game.clue.answer, 'The Pacific Ocean');
    for (const c of [tv, ann, bo]) assert.ok(!c.raw.some((r) => r.includes('Pacific Ocean')), 'answer leaked');
  });

  await t.test('simultaneous buzzes produce exactly one winner', async () => {
    host.act('openBuzzers');
    await tv.until((c) => c.view?.game?.clue?.step === 'open');
    ann.send({ t: 'buzz' }); bo.send({ t: 'buzz' });
    const ra = await ann.until((c) => c.msgs.find((m) => m.t === 'buzz-result'));
    const rb = await bo.until((c) => c.msgs.find((m) => m.t === 'buzz-result'));
    assert.equal([ra, rb].filter((r) => r.ok).length, 1);
    await tv.until((c) => c.view?.game?.clue?.step === 'answering');
  });

  await t.test('only the host can drive the game', async () => {
    ann.act('correct');
    bo.act('correct');
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(tv.view.game.clue.step, 'answering');
    host.act('correct');
    await tv.until((c) => c.view?.game?.clue?.step === 'revealed');
    assert.equal(tv.view.game.clue.answer, 'The Pacific Ocean');
    host.act('closeClue');
  });

  await t.test('a refreshed phone rejoins as the same player with its score', async () => {
    const scoreBefore = tv.view.room.units.find((u) => u.name === 'Ann').score + tv.view.room.units.find((u) => u.name === 'Bo').score;
    assert.equal(scoreBefore, 200);
    ann.close();
    const again = await connectAs(port, { t: 'hello', role: 'player', token: annToken });
    await again.until((c) => c.view?.room?.me?.name === 'Ann');
    assert.ok(!again.msgs.some((m) => m.t === 'need-join'));
  });

  await t.test('the server expires an answer timer on its own', async () => {
    host.act('setSettings', { answerSeconds: 1 });
    host.act('select', { c: 1, r: 0 });
    await tv.until((c) => c.view?.game?.clue?.step === 'reading');
    host.act('openBuzzers');
    await tv.until((c) => c.view?.game?.clue?.step === 'open');
    bo.send({ t: 'buzz' });
    await tv.until((c) => c.view?.game?.clue?.timer, 'timer started');
    assert.equal(tv.view.game.clue.timer.timedOut, false);
    assert.ok(tv.view.game.clue.timer.leftMs <= 1000);
    await tv.until((c) => c.view?.game?.clue?.timer?.timedOut, 'timer expiry');   // pushed by the server, no host action
    assert.equal(tv.view.game.clue.step, 'answering');                           // the host still decides
    host.act('reveal'); host.act('closeClue');
    await tv.until((c) => c.view?.game?.status === 'board');
    host.act('setSettings', { answerSeconds: 10 });
  });

  await t.test('game survives a server restart', async () => {
    await new Promise((r) => setTimeout(r, 500)); // let the debounced save land
    await stopServer(proc);
    proc = await startServer(port);
    const again = await connectAs(port, { t: 'hello', role: 'player', token: annToken });
    await again.until((c) => c.view?.room?.me);
    const v = again.view;
    assert.equal(v.room.me.name, 'Ann');
    assert.equal(v.game.status, 'board');
    assert.equal(v.game.board[0][0].used, true);
    assert.equal(v.room.units.reduce((s, u) => s + u.score, 0), 200);
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, cpSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import os from 'node:os';
import { pickAddress } from '../lib.js';
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
  async until(fn, label = 'condition', ms = 2000) {
    for (let i = 0; i < ms / 20; i++) { const r = fn(this); if (r) return r; await new Promise((s) => setTimeout(s, 20)); }
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
    assert.ok((await ok.json()).some((set) => set.id === 'family-night'));   // the shipped sample sets are listed
    // Invalid set is rejected
    const bad = await fetch(`${base}/api/games/jeopardy/sets/broken`, { method: 'PUT', headers: { 'x-host-pin': PIN }, body: '{"title":"x"}' });
    assert.equal(bad.status, 400);
  });

  await t.test('games are listed, and set endpoints are per game', async () => {
    const games = await (await fetch(`${base}/api/games`)).json();
    assert.deepEqual(games.map((g) => g.id), ['jeopardy', 'feud']);
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
    // A game's own sounds live in data/sounds/<game>/, are listed with that game, and only for games that exist.
    mkdirSync(path.join(dataDir, 'sounds', 'feud'), { recursive: true });
    mkdirSync(path.join(dataDir, 'sounds', 'nogame'), { recursive: true });
    writeFileSync(path.join(dataDir, 'sounds', 'feud', 'ding.mp3'), Buffer.from([7, 7]));
    writeFileSync(path.join(dataDir, 'sounds', 'nogame', 'ding.mp3'), Buffer.from([8]));
    assert.deepEqual(await (await fetch(`${base}/api/sounds`)).json(), [{ name: 'think', url: '/sounds/think.mp3' }, { name: 'ding', url: '/sounds/feud/ding.mp3', game: 'feud' }]);
    assert.deepEqual([...Buffer.from(await (await fetch(`${base}/sounds/feud/ding.mp3`)).arrayBuffer())], [7, 7]);
    assert.equal((await fetch(`${base}/sounds/nogame/ding.mp3`)).status, 404);
    assert.equal((await fetch(`${base}/sounds/feud/..%2fthink.mp3`)).status, 404);
    assert.equal((await fetch(`${base}/sounds/feud/missing.mp3`)).status, 404);
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

  await t.test('host info (address, QR and PIN) is shown only to a browser on the machine itself', async () => {
    const local = await fetch(`${base}/host-info`);
    assert.equal(local.status, 200);
    const html = await local.text();
    assert.ok(html.includes(PIN) && html.includes('<svg') && html.includes('/host'));
    const lan = pickAddress(os.networkInterfaces());
    if (lan !== 'localhost') {                                    // reaching the server by its network address is "someone else"
      const other = await fetch(`http://${lan}:${port}/host-info`);
      assert.equal(other.status, 404);
      assert.ok(!(await other.text()).includes(PIN));
    }
  });

  await t.test('static files stay inside public/', async () => {
    assert.equal((await fetch(`${base}/tv`)).status, 200);
    const check = await fetch(`${base}/check`);                     // the connection checker for phones that can't join
    assert.equal(check.status, 200);
    assert.match(await check.text(), /connection check/i);
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
  host.act('chooseGame', { id: 'jeopardy' });     // with two games installed the host picks one
  host.act('start');
  await tv.until((c) => c.view?.game?.phase === 'round-intro', 'round intro');
  host.act('advance');                            // skip the opening titles
  await tv.until((c) => c.view?.game?.phase === 'board', 'board');
  // A clue that is not a Daily Double (the host sees where those are).
  const spot = (() => { const dd = host.view.game.secret.dd; for (let c = 0; c < 6; c++) for (let r = 0; r < 5; r++) if (!dd[c][r]) return [c, r]; })();
  const valueOf = ([c, r]) => tv.view.game.board[c].clues[r].value;

  await t.test('answers never reach the TV or phones before the reveal', async () => {
    await host.until((c) => c.view?.game?.phase === 'board');
    host.act('pick', { ci: spot[0], ri: spot[1] });
    await tv.until((c) => c.view?.game?.phase === 'reading');
    await host.until((c) => c.view?.game?.secret?.answer, 'host sees the answer');
    const answer = host.view.game.secret.answer;
    assert.equal(tv.view.game.clue.answer, null);
    for (const c of [tv, ann, bo]) assert.ok(!c.raw.some((r) => r.includes(JSON.stringify(answer))), 'answer leaked');
  });

  await t.test('simultaneous buzzes produce exactly one winner, and the other is timed too', async () => {
    host.act('openNow');
    await tv.until((c) => c.view?.game?.phase === 'open');
    ann.send({ t: 'buzz' }); bo.send({ t: 'buzz' });
    const ra = await ann.until((c) => c.msgs.find((m) => m.t === 'buzz-result'));
    const rb = await bo.until((c) => c.msgs.find((m) => m.t === 'buzz-result'));
    assert.deepEqual([ra.result, rb.result].sort(), ['late', 'won']);
    await tv.until((c) => c.view?.game?.phase === 'answering');
    assert.equal(tv.view.game.timer.kind, 'answer');
  });

  await t.test('only the host can drive the game, and only the winner can answer', async () => {
    ann.act('skip'); bo.act('skip');
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(tv.view.game.phase, 'answering');
    const [winner, loser] = tv.view.game.clue.buzzedId === tv.view.game.players.find((p) => p.name === 'Ann').id ? [ann, bo] : [bo, ann];
    loser.send({ t: 'answer', text: host.view.game.secret.answer });
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(tv.view.game.phase, 'answering');
    winner.send({ t: 'answer', text: host.view.game.secret.answer });       // typed, judged by the server
    await tv.until((c) => c.view?.game?.phase === 'ruling', 'ruling');
    await tv.until((c) => c.view?.game?.phase === 'reveal', 'reveal', 4000);
    assert.equal(tv.view.game.lastResult.correct, true);
    assert.equal(tv.view.game.clue.answer, host.view.game.secret.answer);
    assert.equal(tv.view.room.units.reduce((s, u) => s + u.score, 0), valueOf(spot));
    host.act('advance');
    await tv.until((c) => c.view?.game?.phase === 'board');
  });

  await t.test('a refreshed phone rejoins as the same player with its score', async () => {
    ann.close();
    const again = await connectAs(port, { t: 'hello', role: 'player', token: annToken });
    await again.until((c) => c.view?.room?.me?.name === 'Ann');
    assert.ok(!again.msgs.some((m) => m.t === 'need-join'));
    assert.equal(again.view.game.me.id, again.view.room.me.id);
  });

  await t.test('the server opens the buzzers by itself once the clue has been read', async () => {
    const dd = host.view.game.secret.dd;
    const next = [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1]].find(([c, r]) => !dd[c][r]);
    host.act('pick', { ci: next[0], ri: next[1] });
    await tv.until((c) => c.view?.game?.phase === 'reading');
    const t0 = Date.now();
    // This TV reads clues out loud but is only a test client, so it never says it is done: the longer backstop applies.
    await tv.until((c) => c.view?.game?.phase === 'open', 'buzzers open', 18000);
    assert.ok(Date.now() - t0 >= 1500);
    assert.equal(tv.view.game.timer.kind, 'buzz');
    host.act('skip');
    await tv.until((c) => c.view?.game?.phase === 'reveal');
    host.act('advance');
    await tv.until((c) => c.view?.game?.phase === 'board');
  });

  await t.test('game survives a server restart', async () => {
    await new Promise((r) => setTimeout(r, 500)); // let the debounced save land
    await stopServer(proc);
    proc = await startServer(port);
    const again = await connectAs(port, { t: 'hello', role: 'player', token: annToken });
    await again.until((c) => c.view?.room?.me);
    const v = again.view;
    assert.equal(v.room.me.name, 'Ann');
    assert.equal(v.game.phase, 'board');
    assert.equal(v.game.board[spot[0]].clues[spot[1]].used, true);
    assert.equal(v.room.units.reduce((s, u) => s + u.score, 0), valueOf(spot));
  });
});

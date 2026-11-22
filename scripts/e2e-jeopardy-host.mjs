// Plays Jeopardy with the host page in a real browser and checks what the host sees on a clue: who buzzed in first, and the
// Correct / Wrong buttons (in both the typed-answers and the host-judges modes).
//   node scripts/e2e-jeopardy-host.mjs        (SHOT_DIR=<folder> saves screenshots of the host page)
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { Realtime } from '../public/relay/phoenix.js';
import { createEngine } from '../engine/core.js';
import { GAMES } from '../games/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await import('./build-web.mjs');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? 'playwright');
const feud = JSON.parse(readFileSync(path.join(root, 'data/feud/family-night-basics.json'), 'utf8'));
const jeo = JSON.parse(readFileSync(path.join(root, 'data/jeopardy/family-night.json'), 'utf8'));

// --- a stand-in for Supabase Realtime ---
const sb = new WebSocketServer({ port: 0 });
await new Promise((r) => sb.on('listening', r));
sb.on('connection', (sock) => {
  sock.topics = new Set();
  sock.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.event === 'phx_join') { sock.topics.add(m.topic); sock.send(JSON.stringify({ topic: m.topic, event: 'phx_reply', ref: m.ref, payload: { status: 'ok', response: {} } })); }
    else if (m.event === 'heartbeat') sock.send(JSON.stringify({ topic: 'phoenix', event: 'phx_reply', ref: m.ref, payload: { status: 'ok', response: {} } }));
    else if (m.event === 'broadcast' && sock.topics.has(m.topic)) for (const o of sb.clients) if (o !== sock && o.topics.has(m.topic) && o.readyState === 1) o.send(JSON.stringify({ topic: m.topic, event: 'broadcast', payload: m.payload }));
  });
});
const relay = { url: `http://127.0.0.1:${sb.address().port}`, key: 'sb_publishable_test' };

// --- the TV: the engine, on the relay ---
let engine;
const tv = new Realtime({ ...relay, WebSocketImpl: WebSocket, onBroadcast: (t, e, p) => engine.onBroadcast(t, e, p) });
// A stand-in for the Apple TV's store of the family's own sounds.
const soundFiles = new Map();
const sounds = {
  save: ({ game, name, ext, index, total, data }) => { const k = `${game}__${name}`; const f = soundFiles.get(k)?.total === total ? soundFiles.get(k) : { ext, total, pieces: [] }; f.pieces[index] = data; soundFiles.set(k, f); return f.pieces.filter(Boolean).length === total; },
  list: () => [...soundFiles].filter(([, f]) => f.pieces.filter(Boolean).length === f.total).map(([k, f]) => { const [game, name] = k.split('__'); return { game, name, ext: f.ext, bytes: Buffer.from(f.pieces.join(''), 'base64').length }; }),
  remove: (game, name) => { soundFiles.delete(`${game}__${name}`); },
};
let savedSets = {};
engine = createEngine({ games: GAMES, pin: '4321', sounds, code: 'ABCD', now: () => performance.now(), content: { feud: { basics: feud }, jeopardy: { 'family-night': jeo } }, send: () => {}, broadcast: (t, e, p) => tv.send(t, e, p), onSetsChanged: (c) => { savedSets = c; } });
tv.join(engine.relayTopic); tv.connect();
const ticker = setInterval(() => engine.tick(), 250);

// --- the site (web/), with the stand-in's address in config.js ---
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
// web/ is the built site: run `node scripts/build-web.mjs` first (this script does it for you).
const pages = { '/': 'play.html', '/play': 'play.html', '/host': 'host.html', '/editor': 'editor.html' };
const site = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/config.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(`globalThis.GN_RELAY = ${JSON.stringify(relay)};`); }
  const file = path.join(root, 'web', pages[url.pathname] ?? decodeURIComponent(url.pathname.slice(1)));
  if (!file.startsWith(path.join(root, 'web')) || !existsSync(file)) { res.writeHead(404); return res.end('no'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' }); res.end(readFileSync(file));
});
await new Promise((r) => site.listen(0, r));
const base = `http://127.0.0.1:${site.address().port}`;

const problems = [];
const browser = await chromium.launch();
const fail = (m) => { problems.push(m); console.error('FAIL:', m); };
const watch = (page, who) => { page.on('response', (r) => { if (r.status() >= 400) console.error(`  (${who}: ${r.status()} ${r.url()})`); }); page.on('pageerror', (e) => fail(`${who} page error: ${e.message}`)); page.on('console', (m) => { if (m.type() === 'error') fail(`${who} console error: ${m.text()}`); }); };
const until = async (fn, what, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return; await new Promise((r) => setTimeout(r, 50)); } fail(`timed out: ${what}`); throw new Error(what); };


const shot = (page, name) => (process.env.SHOT_DIR ? page.screenshot({ path: `${process.env.SHOT_DIR}/jeopardyhost-${name}.png` }) : null);
const text = async (page) => (await page.locator('body').innerText()).replace(/\n+/g, ' | ');
try {
  engine.room.act('chooseGame', { id: 'jeopardy' });
  for (const name of ['Ann', 'Bo', 'Cy']) {
    const p = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 }); watch(p, name);
    await p.goto(`${base}/?r=ABCD`);
    await until(async () => (await p.locator('input').count()) > 0, `${name}'s join form`);
    await p.locator('input').first().fill(name);
    await p.getByRole('button', { name: /^join$/i }).click();
    await until(() => engine.room.players.some((x) => x.name === name), `${name} to join`);
  }
  const host = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 }); watch(host, 'host');
  await host.goto(`${base}/host?r=ABCD&pin=4321`);
  await until(() => engine.room.hosts >= 1, 'the room to know a host is connected');
  const g = engine.room.game;
  const [ann, bo] = engine.room.players;
  const dockText = async () => (await host.locator('.dock').innerText()).replace(/\n+/g, ' | ');
  const clue = async (label) => {
    // pick the first clue that is not a Daily Double, open the buzzers, and have Bo then Ann buzz
    const b = g.board();
    outer: for (let ci = 0; ci < 6; ci++) for (let ri = 0; ri < 5; ri++) if (!b[ci].clues[ri].used && !b[ci].clues[ri].dd) { g.pick(ci, ri); break outer; }
    g.openNow();
    await until(() => g.phase === 'open', `${label}: the buzzers to open`);
    await new Promise((r) => setTimeout(r, 200));
    g.buzz(bo.id, null, null);
    await new Promise((r) => setTimeout(r, 80));
    g.buzz(ann.id, null, null);
    await until(() => g.phase === 'answering', `${label}: someone to be answering`);
  };
  for (const hostJudges of [false, true]) {
    const label = hostJudges ? 'host judges' : 'typed answers';
    if (g.phase === 'lobby') g.start();
    if (g.phase === 'round-intro') g.advance();
    if (hostJudges !== g.hostJudges()) { g.settings.hostJudges = hostJudges; }
    await clue(label);
    await until(async () => /Buzzed in first/i.test(await text(host)), `${label}: who buzzed in first on the host page`);
    await until(async () => /Correct/.test(await dockText()) && /Wrong/.test(await dockText()), `${label}: the Correct and Wrong buttons (dock: ${await dockText()})`);
    console.log(`${label}: the host sees who buzzed in first, with Correct and Wrong`);
    await shot(host, `answering-${hostJudges ? 'spoken' : 'typed'}`);
    await host.getByRole('button', { name: 'Wrong', exact: true }).click();
    await until(() => g.phase === 'ruling', `${label}: the Wrong ruling`);
    assert.equal(g.lastResult.correct, false);
    await until(async () => /Buzzed in first/i.test(await text(host)), `${label}: the buzz order during the ruling`);
    // after the ruling the buzzers reopen for the others: the order of the first opening stays on the host page
    await until(() => g.phase === 'open' || g.phase === 'reveal', `${label}: the buzzers to reopen`, 15000);
    if (g.phase === 'open') await until(async () => /Buzzed in first/i.test(await text(host)), `${label}: the buzz order while the buzzers are open again`);
    g.skipClue();
    await until(() => g.phase === 'reveal', `${label}: the answer`);
    await until(async () => /Buzzed in first/i.test(await text(host)), `${label}: the buzz order on the answer screen`);
    g.advance();
    await until(() => g.phase === 'board', `${label}: back to the board`);
  }
} catch (e) { if (!problems.length) fail(e.message); }
await browser.close(); tv.close(); clearInterval(ticker); sb.close(); site.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nOK');
process.exit(problems.length ? 1 : 0);

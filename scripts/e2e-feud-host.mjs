// Plays Family Feud from the host page in a real browser: players join, the host starts it, and steps through a round.
//   node scripts/e2e-feud-host.mjs            (SHOT_DIR=<folder> saves screenshots of the host page)
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


const shot = (page, name) => (process.env.SHOT_DIR ? page.screenshot({ path: `${process.env.SHOT_DIR}/feudhost-${name}.png` }) : null);
const text = async (page) => (await page.locator('body').innerText()).replace(/\n+/g, ' | ');
try {
  engine.room.act('chooseGame', { id: 'feud' });
  const phones = [];
  for (const name of ['Ann', 'Bo', 'Cy', 'Di']) {
    const p = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 }); watch(p, name);
    await p.goto(`${base}/?r=ABCD`);
    await until(async () => (await p.locator('input').count()) > 0, `${name}'s join form`);
    await p.locator('input').first().fill(name);
    await p.getByRole('button', { name: /^join$/i }).click();
    await until(() => engine.room.players.some((x) => x.name === name), `${name} to join`);
    phones.push(p);
  }
  // Nobody is hosting yet: the first player is the captain and has the controls to start the game.
  await until(async () => /start the game/i.test(await text(phones[0])), 'the captain’s Start button on the first player’s phone');
  console.log('no host: the first player is the captain and can start the game');
  const host = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 }); watch(host, 'host');
  await host.goto(`${base}/host?r=ABCD&pin=4321`);
  await until(async () => (await host.getByRole('button', { name: 'Settings', exact: true }).count()) > 0, 'the host page to open signed in');
  await until(() => engine.room.hosts >= 1, 'the room to know a host is connected');
  // A host is connected: there is no captain, and the first player has no controls.
  await until(async () => !/start the game/i.test(await text(phones[0])) && /the host starts the game/i.test(await text(phones[0])), 'the captain’s controls to go away once a host is connected');
  console.log('a host is connected: no captain, and the phones say the host starts the game');
  await until(async () => /Start game/.test(await text(host)), 'the Feud host screen');
  await shot(host, 'setup');
  // The host steps through the face-off with the big button at the bottom.
  const seen = [];
  for (let step = 0; step < 6; step++) {
    const dock = host.locator('.dock button:not([disabled])');
    if (!(await dock.count())) break;
    seen.push((await dock.allInnerTexts()).join(' / '));
    await dock.first().click();
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log('host buttons, in order:', seen.join(' → '));
  if (!/Start game/.test(seen[0]) || !/Open buzzers/.test(seen[1])) fail(`the host's buttons are ${JSON.stringify(seen)}`);
  // The phones: everyone sees the question, nobody sees the answer board.
  const g = engine.room.game;
  const round = g.publicView().round;
  const answersText = g.set.rounds[round.number - 1].answers.map((a) => a.text);
  await until(async () => (await text(phones[0])).includes(round.question), 'the question on a phone');
  const phoneText = await text(phones[0]);
  if (answersText.some((a) => phoneText.toLowerCase().includes(a.toLowerCase()))) fail('a phone shows the survey answers');
  if (await phones[0].locator('.pm-slot').count()) fail('a phone shows the answer board');
  console.log('phones show the question and not the answer board');
  // The face-off buzz times, on the host page and the TV's view.
  g.openBuzzers();
  const reps = Object.values(g.run.faceoff.reps);
  await new Promise((r) => setTimeout(r, 250));
  engine.room.playerMessage(reps[1], { t: 'buzz' });
  await new Promise((r) => setTimeout(r, 120));
  engine.room.playerMessage(reps[0], { t: 'buzz' });
  await until(async () => /1\s*\|?\s*\w+\s*\|?\s*0\.\d{3}s/.test(await text(host)) || /\d\.\d{3}s/.test(await text(host)), 'the buzz times on the host page');
  console.log('the host page lists the face-off buzz times');
  // Play: the host sees who is up and starts the answer clock.
  g.awardBuzz(g.run.faceoff.reps ? engine.room.teams[0].id : null);
  g.answer(0); g.choose(true);
  await until(async () => / is up/.test(await text(host)), 'the host page to say who is up');
  await host.getByRole('button', { name: /Start the 10s clock/ }).click();
  await until(async () => (g.publicView().round.timer?.totalMs ?? 0) === 10000, 'the 10 second clock to start');
  await until(async () => /\d+s/.test(await text(host)), 'the clock on the host page');
  console.log('the host sees who is up and started the 10 second answer clock');
  // The tabs of the host page.
  for (const tab of ['Players', 'Scores', 'Settings', 'Game']) {
    await host.getByRole('button', { name: new RegExp(`^${tab}`) }).first().click();
    await new Promise((r) => setTimeout(r, 300));
    await shot(host, `tab-${tab}`);
  }
  console.log('Feud host page: every tab opens');
} catch (e) { if (!problems.length) fail(e.message); }
await browser.close(); tv.close(); clearInterval(ticker); sb.close(); site.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nOK');
process.exit(problems.length ? 1 : 0);

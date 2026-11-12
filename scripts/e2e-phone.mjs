// Drives the real phone and host pages in a real browser (Chromium via Playwright) against a stand-in for Supabase
// Realtime, with the engine playing the TV. Catches things Node tests cannot, such as browser-only errors.
//   node scripts/e2e-phone.mjs          (needs Playwright: it is preinstalled in the cloud sandbox)
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
engine = createEngine({ games: GAMES, pin: '4321', code: 'ABCD', now: () => performance.now(), content: { feud: { basics: feud }, jeopardy: { 'family-night': jeo } }, send: () => {}, broadcast: (t, e, p) => tv.send(t, e, p) });
tv.join(engine.relayTopic); tv.connect();
const ticker = setInterval(() => engine.tick(), 250);

// --- the site (web/), with the stand-in's address in config.js ---
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
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

try {
  const player = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 }); watch(player, 'player');
  await player.goto(`${base}/?r=ABCD`);
  await until(async () => (await player.locator('input').count()) > 0, 'the join form (the phone page reached the TV)');
  console.log('player page got the TV\'s answer and shows the join form');
  await player.locator('input').first().fill('Ann');
  await player.getByRole('button', { name: /join|play|enter|ready/i }).first().click();
  await until(() => engine.room.players.some((p) => p.name === 'Ann'), 'Ann to join the room');
  console.log('Ann joined');

  // Jeopardy: between clues the phone shows the board; while a clue is live it shows the buzz button.
  engine.room.act('chooseGame', { id: 'jeopardy' });
  engine.room.act('chooseSet', { id: 'family-night' });
  engine.room.act('startGame', {});
  await until(async () => (await player.locator('.phone-board:not(.hidden) .pb-cell').count()) > 20, 'the board on the phone');
  const cats = await player.locator('.phone-board .pb-cat').allInnerTexts();
  console.log(`phone shows the Jeopardy board: ${cats.length} categories, ${await player.locator('.phone-board .pb-cell').count()} squares`);
  if (process.env.SHOT) await player.screenshot({ path: process.env.SHOT });
  if (await player.locator('button.buzz').isVisible()) fail('the buzz button is showing next to the board');
  engine.room.act('select', { c: 0, r: 0 });
  await until(async () => await player.locator('button.buzz').isVisible(), 'the buzz button once a clue is picked');
  if (await player.locator('.phone-board:not(.hidden)').count()) fail('the board is still showing during a clue');
  console.log('during a clue the phone shows the buzz button instead');
  engine.room.act('endGame', {});

  const host = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 }); watch(host, 'host');
  await host.goto(`${base}/host?r=ABCD`);
  await until(async () => (await host.locator('input').count()) > 0, 'the host PIN form');
  await host.locator('input').first().fill('4321');
  await host.keyboard.press('Enter');
  await until(async () => /feud|jeopardy|game/i.test(await host.locator('body').innerText()), 'the host controls');
  console.log('host page unlocked with the PIN');
  await host.getByText(/family feud/i).first().click();
  await until(() => engine.room.gameId === 'feud', 'the host to choose Family Feud');
  console.log('host chose Family Feud through the relay');

  // From the host page, the Questions tab opens the editor with the PIN and room already known (one address to remember).
  await host.getByRole('button', { name: /questions/i }).click();
  await until(async () => (await host.locator('summary').count()) > 0, 'the editor to open from the host page without asking for the PIN again');
  console.log('host page → Questions tab → editor, no PIN or room code asked again');
  if (process.env.SHOT2) await host.screenshot({ path: process.env.SHOT2 });

  // The question editor, online: PIN, then import a set by pasting it, then see it in the TV's list.
  const editor = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 }); watch(editor, 'editor');
  await editor.goto(`${base}/editor?game=feud&r=ABCD`);
  await until(async () => (await editor.locator('input[type=password]').count()) > 0, 'the editor PIN form');
  await editor.locator('input[type=password]').fill('4321');
  await editor.keyboard.press('Enter');
  const paste = editor.locator('textarea[placeholder^="Paste a link"]');
  await until(async () => (await paste.count()) > 0, 'the editor and its import box');
  await editor.getByText('Import sets', { exact: false }).first().click();   // the import box is folded away until opened
  if (process.env.SHOT3) await editor.screenshot({ path: process.env.SHOT3 });
  await paste.fill(JSON.stringify({ ...feud, title: 'E2E Set' }));
  await editor.getByRole('button', { name: 'Import' }).click();
  await until(async () => /Imported 1/.test(await editor.locator('body').innerText()), 'the import to finish');
  await until(() => JSON.parse(engine.listSets ? JSON.stringify(engine.listSets('feud')) : '[]').some((x) => x.id === 'e2e-set'), 'the TV to have the new set');
  console.log('editor: PIN accepted, a set was imported and the TV has it');

  // A plain-text file chosen (the same path as dropping it), written in the simple text format.
  await editor.locator('input[type=file]').setInputFiles({
    name: 'my-questions.txt', mimeType: 'text/plain',
    buffer: Buffer.from(`title: From A Text File
? Name a pet
Dog - 50
Cat - 30
Fish - 20
? Name a color
Red - 40
Blue - 35
Green - 25
? Name a season
Summer - 40
Winter - 35
Fall - 25`),
  });
  await until(async () => /Imported 1 from my-questions.txt/.test(await editor.locator('body').innerText()), 'the text file to be imported');
  await until(() => engine.listSets('feud').some((x) => x.id === 'from-a-text-file'), 'the TV to have the text-file set');
  console.log('editor: a plain .txt file was imported and the TV has it');

  // A real drop (what dragging a file from the Mac onto the page does), with the card folded.
  await editor.evaluate(() => {
    document.querySelector('details.card').open = false;
    const dt = new DataTransfer();
    dt.items.add(new File([JSON.stringify({ title: 'Dropped Set', rounds: [1, 2, 3].map((n) => ({ question: `Q${n}`, answers: [{ text: 'A', points: 50 }, { text: 'B', points: 30 }, { text: 'C', points: 20 }] })) })], 'dropped.json', { type: 'application/json' }));
    document.querySelector('details.card').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await until(() => engine.listSets('feud').some((x) => x.id === 'dropped-set'), 'the dropped file to be imported');
  console.log('editor: a file dropped on the folded import card was imported');

  if (process.env.SHOT_DIR) {   // pictures of the editors at phone size, for a look
    const shot = (name) => editor.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png` });
    await editor.reload();
    await editor.locator('select[aria-label="Question set"]').waitFor();
    await editor.locator('select[aria-label="Question set"]').selectOption({ label: feud.title });
    await editor.locator('.acc-head').first().waitFor();
    await editor.locator('.acc-head').first().click();
    await shot('feud-open');
    await editor.locator('.acc-head').nth(1).click();
    await shot('feud-second');
    await editor.goto(`${base}/editor?game=jeopardy&r=ABCD`);
    await editor.locator('select[aria-label="Question set"]').waitFor();
    await editor.locator('select[aria-label="Question set"]').selectOption({ label: jeo.title });
    await editor.locator('.acc-head').first().click();
    await shot('jeopardy-open');
  }
} catch (e) { if (!problems.length) fail(e.message); }
await browser.close(); tv.close(); clearInterval(ticker); sb.close(); site.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nOK');
process.exit(problems.length ? 1 : 0);

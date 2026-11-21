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
engine = createEngine({ games: GAMES, pin: '4321', sounds, code: 'ABCD', now: () => performance.now(), content: { feud: { basics: feud }, jeopardy: { 'family-night': jeo } }, send: () => {}, broadcast: (t, e, p) => tv.send(t, e, p) });
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

try {
  const player = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 }); watch(player, 'player');
  await player.goto(`${base}/?r=ABCD`);
  await until(async () => (await player.locator('input').count()) > 0, 'the join form (the phone page reached the TV)');
  console.log('player page got the TV\'s answer and shows the join form');
  await player.locator('input').first().fill('Ann');
  await player.getByRole('button', { name: /join|play|enter|ready/i }).first().click();
  await until(() => engine.room.players.some((p) => p.name === 'Ann'), 'Ann to join the room');
  console.log('Ann joined');

  // Jeopardy, played through the real phone page: the captain sets up and starts, the player in control picks on a
  // mini board, the buzzer, a typed answer that the game checks, then the reveal.
  const bo = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 }); watch(bo, 'bo');
  await bo.goto(`${base}/?r=ABCD`);
  await until(async () => (await bo.locator('input').count()) > 0, 'Bo\'s join form');
  await bo.locator('input').first().fill('Bo');
  await bo.getByRole('button', { name: /join|play|enter|ready/i }).first().click();
  await until(() => engine.room.players.some((p) => p.name === 'Bo'), 'Bo to join the room');
  engine.room.act('chooseGame', { id: 'jeopardy' });
  await until(async () => (await player.locator('.jp').count()) > 0, 'the Jeopardy phone screen');
  await until(async () => /captain/i.test(await player.locator('.jp').innerText()), 'the captain\'s lobby on the first player\'s phone');
  const shotJ = (page, name) => (process.env.SHOT_DIR ? page.screenshot({ path: `${process.env.SHOT_DIR}/jeopardy-${name}.png` }) : null);
  await shotJ(player, 'lobby');
  await player.getByRole('button', { name: /start game/i }).click();
  await until(() => engine.room.game.phase === 'round-intro', 'the captain to start the game from the phone');
  await player.getByRole('button', { name: /skip intro/i }).click();   // the round's titles, skipped from the captain's phone
  await until(() => engine.room.game.phase === 'board', 'the board after the round\'s titles');
  console.log('captain started Jeopardy from the phone; Ann and Bo are the players');
  const g = engine.room.game;
  const phones = { [engine.room.players.find((p) => p.name === 'Ann').id]: player, [engine.room.players.find((p) => p.name === 'Bo').id]: bo };
  const ctl = phones[g.controllerId];
  await until(async () => (await ctl.locator('.jp-mini button').count()) === 30, 'the mini board on the picker\'s phone');
  await shotJ(ctl, 'board');
  // each tile takes its column colour from an inline --col; if that is dropped the values vanish into the background
  const tileBg = await ctl.locator('.jp-mini button').first().evaluate((b) => getComputedStyle(b).backgroundColor);
  if (/^rgba\(0, 0, 0, 0\)$|^transparent$/.test(tileBg)) throw new Error(`mini board tiles have no colour (${tileBg}), so the dollar values can't be read`);
  const first = g.board().flatMap((c, ci) => c.clues.map((cl, ri) => ({ ci, ri, cl }))).find((x) => !x.cl.dd);
  await ctl.locator('.jp-mini button').nth(first.ri * 6 + first.ci).click();
  await until(() => ['reading', 'open'].includes(g.phase), 'the pick to reach the game');
  await until(async () => await player.locator('.jp-buzzer').isVisible(), 'the buzzer on a phone while a clue is up');
  await until(() => g.phase === 'open', 'the buzzers to open', 12000);
  await until(async () => /BUZZ!/.test(await player.locator('.jp-buzzer').innerText()), 'the buzzer to say BUZZ');
  await shotJ(player, 'buzz');
  await player.locator('.jp-buzzer').dispatchEvent('pointerdown');
  await until(() => g.phase === 'answering', 'Ann\'s buzz to win');
  await until(async () => (await player.locator('input.jp-in').count()) > 0, 'the answer box for the buzzer winner');
  await shotJ(player, 'answer');
  await player.locator('input.jp-in').fill(first.cl.a);
  await player.getByRole('button', { name: /lock it in/i }).click();
  await until(() => g.phase === 'reveal' && g.lastResult?.correct, 'the typed answer to be accepted');
  await until(async () => (await player.locator('.jp').innerText()).includes(first.cl.a), 'the reveal to show the answer');
  await shotJ(player, 'reveal');
  console.log('buzzed on a phone, typed the answer, the game accepted it and showed the reveal');
  engine.room.act('endGame', {});
  await bo.close();

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

  // The Settings tab has a card to send your own sounds to the TV: pick a file and it is kept there, in pieces if it is big.
  await host.getByRole('button', { name: 'Settings', exact: true }).click();
  await until(async () => /your own sounds/i.test(await host.locator('body').innerText()), 'the sounds card on the host page');
  const audio = Buffer.alloc(200 * 1024, 7);   // bigger than one piece, so it travels in three
  await host.locator('input[type=file][aria-label="Sound file"]').setInputFiles({ name: 'my-theme.mp3', mimeType: 'audio/mpeg', buffer: audio });
  await host.getByRole('button', { name: 'Add to the TV' }).click();
  await until(() => sounds.list().length === 1, 'the sound to reach the TV');
  const kept = sounds.list()[0];
  if (kept.game !== 'shared' || kept.name !== 'lobby' || kept.ext !== 'mp3' || kept.bytes !== audio.length) fail(`the TV kept ${JSON.stringify(kept)}`);
  await until(async () => /lobby\.mp3/i.test(await host.locator('body').innerText()), 'the new sound to be listed on the host page');
  console.log(`host page → Settings → sent a ${audio.length / 1024} KB sound to the TV in pieces, and it is listed`);
  await host.getByRole('button', { name: 'Remove', exact: true }).click();
  await until(() => sounds.list().length === 0, 'the sound to be removed');
  await host.getByRole('button', { name: /^Game$/ }).click();

  // From the host page, the Questions tab opens the editor with the PIN and room already known (one address to remember).
  await host.getByRole('button', { name: 'Questions', exact: true }).click();
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

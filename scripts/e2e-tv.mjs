// Drives the website's TV page in a real browser (Chromium via Playwright): the page runs the game engine itself, the
// way the Apple TV app does, and phones join it through a stand-in for Supabase Realtime. Checks that a TV with nothing
// but a web browser can host Jeopardy: lobby with QR and room code, the PIN in the corner menu, phones joining, the
// board, a clue with the buzzer, and the reveal.
//   node scripts/e2e-tv.mjs            (SHOT_DIR=<folder> saves screenshots of the TV)
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await import('./build-web.mjs');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? 'playwright');

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

// --- the site (web/), with the stand-in's address in config.js ---
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const pages = { '/': 'play.html', '/play': 'play.html', '/host': 'host.html', '/editor': 'editor.html', '/tv': 'tv.html' };
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
const watch = (page, who) => {
  page.on('pageerror', (e) => fail(`${who} page error: ${e.message}`));
  // The clue archive is on the internet, which the test machine may not reach; the TV falls back to the shipped sets.
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_|raw\.githubusercontent/.test(m.text())) fail(`${who} console error: ${m.text()}`); });
};
const until = async (fn, what, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return; await new Promise((r) => setTimeout(r, 50)); } fail(`timed out: ${what}`); throw new Error(what); };
const shot = (page, name) => (process.env.SHOT_DIR ? page.screenshot({ path: `${process.env.SHOT_DIR}/tv-${name}.png` }) : null);

try {
  const tv = await browser.newPage({ viewport: { width: 1280, height: 720 } }); watch(tv, 'tv');
  await tv.route('https://raw.githubusercontent.com/**', (r) => r.abort());   // no clue archive here: keep the test offline
  await tv.goto(`${base}/tv?game=jeopardy`);
  await until(async () => (await tv.locator('.roomcode').count()) > 0, 'the TV lobby with a room code');
  const code = (await tv.locator('.roomcode').innerText()).trim();
  if (!/^\d{4}$/.test(code)) fail(`room code looks wrong: ${code}`);
  await until(async () => (await tv.locator('.qr-big img').getAttribute('src'))?.startsWith('data:image/svg'), 'the QR code drawn in the page');
  await tv.getByRole('button', { name: /menu/i }).click();
  const pin = (await tv.locator('.tvmenu-panel').innerText()).match(/Host PIN\s*(\d{4})/)?.[1];
  if (!pin) fail('no host PIN in the TV menu');
  await tv.getByRole('button', { name: /menu/i }).click();
  console.log(`TV page hosts room ${code}; the PIN is in the corner menu`);

  const join = async (name) => {
    const p = await browser.newPage({ viewport: { width: 390, height: 780 } }); watch(p, name);
    await p.goto(`${base}/?r=${code}`);
    await until(async () => (await p.locator('input').count()) > 0, `${name}'s join form`);
    await p.locator('input').first().fill(name);
    await p.getByRole('button', { name: /join|play|enter|ready/i }).first().click();
    await until(async () => (await tv.locator('.chip', { hasText: name }).count()) > 0, `${name} on the TV lobby`);
    return p;
  };
  const ann = await join('Ann');
  const bo = await join('Bo');
  console.log('two phones joined the browser TV');
  await shot(tv, 'lobby');

  const host = await browser.newPage({ viewport: { width: 390, height: 780 } }); watch(host, 'host');
  await host.goto(`${base}/host?r=${code}`);
  await until(async () => (await host.locator('input').count()) > 0, 'the host PIN form');
  await host.locator('input').first().fill(pin);
  await host.keyboard.press('Enter');
  await until(async () => /jeopardy/i.test(await host.locator('body').innerText()), 'the host controls');
  console.log('host page unlocked with the PIN from the TV menu');

  await until(async () => /captain/i.test(await ann.locator('.jp').innerText()), 'the captain lobby on the first phone');
  await ann.getByRole('button', { name: /start game/i }).click();
  await until(async () => (await tv.locator('.board .tile').count()) >= 25, 'the board on the TV');
  await shot(tv, 'board');
  console.log('the TV shows the board');

  // Whoever is in control picks the top-left clue on their phone.
  const picker = async () => ((await ann.locator('.jp-mini button').count()) > 0 ? ann : (await bo.locator('.jp-mini button').count()) > 0 ? bo : null);
  await until(async () => !!(await picker()), 'a mini board on the picker\'s phone');
  await (await picker()).locator('.jp-mini button').first().click();
  await until(async () => (await tv.locator('.stage .cluecat').count()) > 0, 'the clue on the TV');
  if (await tv.locator('.dd-big').count()) {
    console.log('(that was a Daily Double; skipping the buzzer part)');
  } else {
    await until(async () => (await tv.locator('.banner.open').count()) > 0, 'the TV to say Buzz in', 15000);
    await shot(tv, 'buzz-in');
    await ann.locator('.jp-buzzer').dispatchEvent('pointerdown');
    await until(async () => (await tv.locator('.banner.who').count()) > 0, 'the TV to show who buzzed');
    await shot(tv, 'answering');
    await until(async () => (await ann.locator('input.jp-in').count()) > 0, 'the answer box');
    await ann.locator('input.jp-in').fill('no idea');
    await ann.getByRole('button', { name: /lock it in/i }).click();
    console.log('Ann buzzed and answered; waiting for the reveal');
  }
  await until(async () => (await tv.locator('.stage .answer').count()) > 0, 'the reveal with the answer on the TV', 30000);
  await shot(tv, 'reveal');
  console.log('the TV showed the reveal');

  // A fresh TV with no game chosen: the lobby offers the games, and picking Family Feud switches to it.
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const tv2 = await ctx2.newPage(); watch(tv2, 'tv2');
  await tv2.goto(`${base}/tv`);
  await until(async () => (await tv2.locator('.gamepick button').count()) === 2, 'the game picker on a fresh TV');
  await tv2.getByRole('button', { name: 'Family Feud' }).click();
  await until(async () => (await tv2.locator('.gamepick').count()) === 0 && /team/i.test(await tv2.locator('.lobby').innerText()), 'the Family Feud lobby (pick a team)');
  await shot(tv2, 'feud-lobby');
  console.log('a fresh TV offered the games and switched to Family Feud');
} catch (e) { if (!problems.length) fail(e.message); }
await browser.close(); sb.close(); site.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nOK');
process.exit(problems.length ? 1 : 0);

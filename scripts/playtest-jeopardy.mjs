// Plays whole games of Jeopardy in real time, the way a family does: the website's TV page runs the game, four phones
// join through a stand-in for Supabase Realtime and play like people (slow and fast thumbs, right and wrong answers,
// Daily Doubles, Final Jeopardy), and a host page watches. Writes a timeline of what the TV and every phone showed,
// and when, so pacing and dead air can be read afterwards; with SHOT_DIR it also saves a TV screenshot at each change.
//   node scripts/playtest-jeopardy.mjs [clues per round, default 5] [games, default 1]
import http from 'node:http';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await import('./build-web.mjs');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? 'playwright');
const CLUES = Number(process.argv[2] ?? 5);
const GAMES = Number(process.argv[3] ?? 1);
const SHOTS = process.env.SHOT_DIR ? path.resolve(process.env.SHOT_DIR) : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

// --- a stand-in for Supabase Realtime, with a little network delay like the real one ---
const LAG = Number(process.env.LAG ?? 60);
const sb = new WebSocketServer({ port: 0 });
await new Promise((r) => sb.on('listening', r));
sb.on('connection', (sock) => {
  sock.topics = new Set();
  sock.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.event === 'phx_join') { sock.topics.add(m.topic); sock.send(JSON.stringify({ topic: m.topic, event: 'phx_reply', ref: m.ref, payload: { status: 'ok', response: {} } })); }
    else if (m.event === 'heartbeat') sock.send(JSON.stringify({ topic: 'phoenix', event: 'phx_reply', ref: m.ref, payload: { status: 'ok', response: {} } }));
    else if (m.event === 'broadcast' && sock.topics.has(m.topic)) {
      setTimeout(() => { for (const o of sb.clients) if (o !== sock && o.topics.has(m.topic) && o.readyState === 1) o.send(JSON.stringify({ topic: m.topic, event: 'broadcast', payload: m.payload })); }, LAG);
    }
  });
});
const relay = { url: `http://127.0.0.1:${sb.address().port}`, key: 'sb_publishable_test' };

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg' };
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

const t0 = Date.now();
const stamp = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(6);
const timeline = [];
const log = (who, text) => { const line = `${stamp()}  ${who.padEnd(7)} ${text}`; timeline.push(line); console.log(line); };
const problems = [];
const fail = (m) => { problems.push(m); log('FAIL', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return; await sleep(80); } fail(`timed out: ${what}`); throw new Error(what); };

const browser = await chromium.launch();
const watch = (page, who) => {
  page.on('pageerror', (e) => fail(`${who} page error: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_|raw\.githubusercontent/.test(m.text())) fail(`${who} console error: ${m.text()}`); });
};

// What a screen shows, in one line (for the timeline).
const tvLine = (tv) => tv.evaluate(() => {
  const txt = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
  const main = document.querySelector('.bw-stage main');
  const el = main?.firstElementChild ?? document.getElementById('app').firstElementChild;
  const tag = document.querySelector('.bw-stage .roundtag')?.innerText ?? '';
  return `${tag ? `[${tag}] ` : ''}${(el?.className ?? '?').split(' ')[0]} | ${txt((main ?? el)?.innerText).slice(0, 150)}`;
});
const phoneLine = (p) => p.evaluate(() => {
  const jp = document.querySelector('.jp');
  if (!jp) return (document.getElementById('screen')?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 100);
  const body = jp.querySelector('.jp-body');
  const ans = jp.querySelector('.jp-answer.on');
  const bz = jp.querySelector('.jp-buzzer');
  const cap = jp.querySelector('.jp-captain');
  return [(bz ? `[${bz.className.replace('jp-buzzer', '').trim()}:${bz.innerText}]` : ''), ans ? '[ANSWER BOX]' : '', (body?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 110),
    cap && cap.style.display !== 'none' && cap.innerText.trim() ? `{captain: ${cap.innerText.replace(/\s+/g, ' / ')}}` : ''].filter(Boolean).join(' ');
});

let shotN = 0;
async function observer(tv, phones, host) {
  const last = new Map();
  while (!stopped) {
    const items = [['TV', tv, tvLine], ...phones.map((p) => [p.name, p.page, phoneLine])];
    for (const [who, page, fn] of items) {
      let line; try { line = await fn(page); } catch { continue; }
      // Countdown numbers change every second; leave them out of "did the screen change".
      const key = line.replace(/\d+(\.\d+)?s?\b/g, '#');
      if (last.get(who) !== key) {
        last.set(who, key); log(who, line);
        // A moment later, so entrance animations have finished and the shot shows what people actually read.
        if (SHOTS) { const n = String(++shotN).padStart(3, '0'); setTimeout(() => page.screenshot({ path: path.join(SHOTS, `${n}-${who}.png`) }).catch(() => {}), 700); }
      }
    }
    await sleep(120);
  }
}
let stopped = false;

// The host page knows the answer to the clue on screen.
const hostAnswer = async (host) => { try { return (await host.locator('.answer b').first().innerText({ timeout: 300 })).trim(); } catch { return ''; } };

/** One phone, playing like a person: skill decides how fast they buzz and how often they know it. */
async function playPhone(p, host, rng) {
  const { page, skill } = p;
  while (!stopped) {
    await sleep(150);
    try {
      const mini = page.locator('.jp-mini button:not([disabled])');
      if (await mini.count()) {
        await sleep(900 + rng() * 1800);   // looking over the board
        const n = await mini.count(); if (!n) continue;
        await mini.nth(Math.floor(rng() * n)).click({ timeout: 1000 });
        log(p.name, '(taps a clue)');
        await sleep(800);
        continue;
      }
      const live = page.locator('.jp-buzzer.live');
      if (await live.count()) {
        if (rng() > 0.35 + skill * 0.6) { await sleep(1500); continue; }   // doesn't know it: no buzz this time
        await sleep(250 + (1 - skill) * 1500 * rng());
        if (await live.count()) { await live.dispatchEvent('pointerdown'); log(p.name, '(buzzes)'); }
        await sleep(300);
        continue;
      }
      const box = page.locator('.jp-answer.on input.jp-in');
      if (await box.count()) {
        const ans = await hostAnswer(host);
        await sleep(1500 + rng() * 2500);  // thinking and typing
        const right = rng() < skill;
        const text = right ? ans.replace(/^(the|a|an) /i, '') || 'pass' : ['no idea', 'paris', 'elvis', 'pass'][Math.floor(rng() * 4)];
        if (!(await box.count())) continue;
        await box.fill(text);
        await page.getByRole('button', { name: /lock it in/i }).click({ timeout: 1000 });
        log(p.name, `(answers "${text}")`);
        await sleep(600);
        continue;
      }
      const bet = page.locator('.jp-wager .jp-btn.huge');
      if (await bet.count()) {
        await sleep(1500 + rng() * 3000);
        if (rng() < 0.5) await page.locator('.jp-quick button').nth(Math.floor(rng() * 3)).click({ timeout: 800 }).catch(() => {});
        await bet.click({ timeout: 1000 }).catch(() => {});
        log(p.name, '(places a bet)');
        await sleep(600);
        continue;
      }
    } catch { /* the screen moved on under us */ }
  }
}

try {
  const tv = await browser.newPage({ viewport: { width: 1920, height: 1080 } }); watch(tv, 'tv');
  await tv.route('https://raw.githubusercontent.com/**', (r) => r.abort());
  await tv.goto(`${base}/tv?game=jeopardy`);
  await until(async () => (await tv.locator('.roomcode').count()) > 0, 'the TV lobby');
  const code = (await tv.locator('.roomcode').innerText()).trim();
  await tv.getByRole('button', { name: /menu/i }).click();
  const pin = (await tv.locator('.tvmenu-panel').innerText()).match(/Host PIN\s*(\d{4})/)?.[1];
  await tv.getByRole('button', { name: /menu/i }).click();

  let seed = 7; const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const phones = [];
  for (const [name, skill] of [['Jason', 0.75], ['Justin', 0.6], ['Mom', 0.45], ['Kid', 0.3]]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); watch(page, name);
    await page.goto(`${base}/?r=${code}`);
    await until(async () => (await page.locator('input').count()) > 0, `${name}'s join form`);
    await page.locator('input').first().fill(name);
    await page.getByRole('button', { name: /join/i }).first().click();
    phones.push({ name, page, skill });
  }
  const host = await browser.newPage({ viewport: { width: 390, height: 844 } }); watch(host, 'host');
  await host.goto(`${base}/host?r=${code}`);
  await until(async () => (await host.locator('input').count()) > 0, 'the host PIN form');
  await host.locator('input').first().fill(pin); await host.keyboard.press('Enter');
  await until(async () => /jeopardy/i.test(await host.locator('body').innerText()), 'the host controls');

  observer(tv, phones, host);
  phones.forEach((p) => playPhone(p, host, rng));
  const captain = phones[0].page;
  for (let game = 1; game <= GAMES; game++) {
    log('SCRIPT', `--- game ${game} ---`);
    await until(async () => (await captain.getByRole('button', { name: /start game/i }).count()) > 0, 'Start game on the captain phone');
    await captain.getByRole('button', { name: /start game/i }).click();
    for (let round = 1; round <= 2; round++) {
      await until(async () => (await tv.locator('.board .tile').count()) >= 25, `round ${round} board`, 30000);
      // Play some clues, then end the round early.
      let played = 0; let lastUsed = -1;
      while (played < CLUES) {
        await sleep(500);
        const used = await tv.locator('.board .tile.used').count().catch(() => lastUsed);
        if (used !== lastUsed) { if (lastUsed >= 0) played += used - lastUsed; lastUsed = used; }
      }
      await until(async () => (await captain.getByRole('button', { name: /end round early/i }).count()) > 0, 'End round early', 60000);
      captain.once('dialog', (d) => d.accept());
      await captain.getByRole('button', { name: /end round early/i }).click();
      log('SCRIPT', `(captain ends round ${round} early)`);
      await sleep(4000);
      await captain.getByRole('button', { name: /^continue$/i }).click();
      log('SCRIPT', '(captain taps Continue)');
    }
    await until(async () => /champion/i.test(await tv.locator('#app').innerText()), 'the champion screen', 240000);
    await sleep(4000);
    if (game < GAMES) { await captain.getByRole('button', { name: /play again/i }).click(); log('SCRIPT', '(captain taps Play again)'); }
  }
} catch (e) { if (!problems.length) fail(e.message); }
stopped = true;
await sleep(500);
if (process.env.TIMELINE) writeFileSync(process.env.TIMELINE, timeline.join('\n') + '\n');
await browser.close(); sb.close(); site.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nOK');
process.exit(problems.length ? 1 : 0);

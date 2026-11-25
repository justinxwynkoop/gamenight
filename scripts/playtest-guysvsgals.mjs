// PLAYTEST (real time, people-like pacing). Based on e2e-guysvsgals. Plays a whole game of Guys vs Gals in a real browser (Chromium via Playwright): the website's TV page runs the game,
// three phones join through a stand-in for Supabase Realtime and pick their sides, and the trophy tug of war is played
// out: the readers judge on their phones (the Guys always right, the Gals always wrong), Our Lives secrets are picked and
// guessed, charades are called, the Guys throw one challenge, and the Guys pull three trophies home. Then a pawn race,
// picked on the first player's phone, which the Guys win.
//   node scripts/e2e-guysvsgals.mjs            (SHOT_DIR=<folder> saves screenshots of the TV and the phones)
import http from 'node:http';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
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
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
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
const log = (who, text) => { const line = `${stamp()}  ${who.padEnd(6)} ${text}`; timeline.push(line); console.log(line); };
const problems = [];
const fail = (m) => { problems.push(m); log('FAIL', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return; await sleep(80); } fail(`timed out: ${what}`); throw new Error(what); };
const SHOTS = process.env.SHOT_DIR; let shotN = 0;
const snap = async (page, name) => { if (!SHOTS) return; await page.screenshot({ path: `${SHOTS}/${String(++shotN).padStart(3, '0')}-${name}.png` }); };
const browser = await chromium.launch();
const MODE = process.argv[2] ?? 'trophy';
const MINUTES = Number(process.argv[3] ?? 5);
const players = [{ name: 'Dad', side: 'guys' }, { name: 'Mom', side: 'gals' }, { name: 'Leo', side: 'guys' }, { name: 'Maya', side: 'gals' }];
const tv = await browser.newPage({ viewport: { width: 1280, height: 720 } });
tv.on('pageerror', (e) => fail(`tv error ${e.message}`));
await tv.goto(`${base}/tv?game=guysvsgals`);
await until(async () => (await tv.locator('.gv-lobby .roomcode').count()) > 0, 'lobby');
const code = (await tv.locator('.roomcode').innerText()).trim();
for (const p of players) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', (e) => fail(`${p.name} error ${e.message}`));
  page.setDefaultTimeout(3000);   // a phone a beat behind the TV: try again rather than wait
  await page.goto(`${base}/?r=${code}`);
  await until(async () => (await page.locator('input').count()) > 0, 'join');
  await page.locator('input').first().fill(p.name);
  await page.getByRole('button', { name: /^join$/i }).click();
  await until(async () => (await page.locator('.gv-sides').count()) > 0, 'sides');
  await page.locator(`button[data-side="${p.side}"]`).click();
  p.page = page;
}
const dad = players[0].page;
if (MODE === 'race') { await sleep(500); await dad.locator('button[data-mode="race"]').click(); }
await sleep(1500);
await snap(tv, 'tv-lobby'); await snap(dad, 'dad-lobby');
await dad.getByRole('button', { name: /start the battle/i }).click();
const tvSum = () => tv.locator('.gv-tv').evaluate((e) => {
  const card = e.querySelector('.gv-card');
  const phase = [...e.classList].find((c) => c.startsWith('phase-'))?.slice(6) ?? 'lobby';
  const big = (sel) => e.querySelector(sel)?.textContent.replace(/\s+/g, ' ').trim().slice(0, 110) ?? '';
  return { phase, n: card?.dataset.n ?? '', text: [big('.gv-verdict'), big('.gv-card .gv-q, .gv-card'), big('.gv-foot')].filter(Boolean).join(' || ').slice(0, 260) };
});
const phoneSum = (pg) => pg.locator('body').evaluate((b) => b.innerText.replace(/\s+/g, ' ').trim().slice(0, 150));
const lastPhone = new Map(); let lastTv = '';
const seenShots = new Set();
const watchAll = async () => {
  const s = await tvSum();
  const key = `${s.phase}|${s.n}|${s.text}`;
  if (key !== lastTv) { lastTv = key; log('TV', `[${s.phase}] ${s.text}`); const k = `${s.phase}-${s.text.slice(0, 30)}`; if (!seenShots.has(s.phase + s.n) && shotN < 70) { seenShots.add(s.phase + s.n); await snap(tv, `tv-${s.phase}`); } }
  for (const p of players) {
    const t = await phoneSum(p.page);
    if (t !== lastPhone.get(p.name)) { lastPhone.set(p.name, t); log(p.name, t); if (shotN < 70) await snap(p.page, `${p.name}-${s.phase}`); }
  }
  return s;
};
const phoneWith = async (sel) => { for (const p of players) if (await p.page.locator(sel).filter({ visible: true }).count()) return p; return null; };
const end = Date.now() + MINUTES * 60000;
let pending = null; // what a person is about to do, and when
while (Date.now() < end) {
  const s = await watchAll();
  if (s.phase === 'gameover') break;
  if (pending && Date.now() >= pending.at) { try { await pending.fn(); log('ACT', pending.what); } catch (e) { log('ACT', `could not ${pending.what}: ${e.message.split('\n')[0]}`); } pending = null; }
  if (!pending && s.phase === 'card') {
    let p;
    if ((p = await phoneWith('.gv-judge:not(.three) button.yes'))) {
      const right = Math.random() < 0.55;
      pending = { at: Date.now() + 9000, what: `${p.name} (reader) judges ${right ? 'RIGHT' : 'WRONG'} after reading + answer`, fn: () => p.page.locator(right ? '.gv-judge:not(.three) button.yes' : '.gv-judge:not(.three) button.no').click() };
    } else if ((p = await phoneWith('button.gv-pchoice[data-i]'))) {
      const txt = await p.page.locator('.gv').innerText();
      if (/secretly tap/.test(txt)) pending = { at: Date.now() + 5000, what: `${p.name} picks a secret`, fn: () => p.page.locator('button.gv-pchoice[data-i="1"]').click() };
      else pending = { at: Date.now() + 7000, what: 'the team votes', fn: async () => { for (const q of players) if (await q.page.locator('button.gv-pchoice[data-i]').count()) await q.page.locator(`button.gv-pchoice[data-i="${Math.floor(Math.random() * 3)}"]`).click().catch(() => {}); } };
    } else if ((p = await phoneWith('button.gv-pchoice[data-pid]'))) {
      pending = { at: Date.now() + 4000, what: `${p.name} picks an actor`, fn: () => p.page.locator('button.gv-pchoice[data-pid]').first().click() };
    } else if ((p = await phoneWith('button.gv-ready'))) {
      pending = { at: Date.now() + 5000, what: `${p.name} has read the charade and presses Start`, fn: () => p.page.locator('button.gv-ready').click() };
    } else if ((p = await phoneWith('.gv-judge.three'))) {
      pending = { at: Date.now() + 20000, what: `${p.name} calls who shouted it first`, fn: () => p.page.locator(`.gv-judge.three button[data-side="${Math.random() < 0.5 ? 'guys' : 'gals'}"]`).click() };
    }
  }
  await sleep(250);
}
await watchAll();
await snap(tv, 'tv-end');
writeFileSync(`${process.env.OUT ?? '.'}/timeline-${MODE}.txt`, timeline.join('\n'));
await browser.close(); sb.close(); site.close();
process.exit(0);

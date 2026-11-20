// Screenshots of every Jeopardy screen, for design reviews: plays a scripted game on the real engine and shows each
// step on the real pages (the TV page, three phones and the host page) in Chromium, through a stand-in home server.
//   node scripts/gallery-jeopardy.mjs <folder>            (GALLERY_ONLY=board,final-wager picks steps)
// Writes <folder>/<step>--tv.png, --phone-<name>.png and --host.png, and index.html to look through them.
import http from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';
import { Room } from '../room.js';
import { GAMES } from '../games/index.js';
import { T, readingTime, speakingTime } from '../games/jeopardy/game.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] ?? 'gallery-out');
mkdirSync(out, { recursive: true });
const only = process.env.GALLERY_ONLY ? new Set(process.env.GALLERY_ONLY.split(',')) : null;
await import('./build-web.mjs');

// ---------- the game, step by step ----------
const setsDir = path.join(root, 'data/jeopardy');
const readSet = (id) => { try { return JSON.parse(readFileSync(path.join(setsDir, `${id}.json`), 'utf8')); } catch { return null; } };
const setIds = ['family-night', 'animal-kingdom', 'world-geography', 'movies-and-cartoons', 'science-lab', 'food-and-cooking'];
let t = 1000;
let seed = 11;
const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const room = new Room({ games: GAMES, now: () => t, random, loadContent: (_g, id) => readSet(id), listContent: () => setIds.map((id) => ({ id, title: readSet(id)?.title ?? id })) });
const advance = (ms) => { t += ms; room.tick(); };
room.chooseGame('jeopardy');
const g = room.game;
// The buzzers open after the reading time, or with the TV reading clues aloud and never saying it is done, the longer one.
const waitFor = (q) => (g.readsAloud() ? speakingTime(q) : readingTime(q));
const people = [['Maya', '#ff5d8f'], ['Leo', '#3ec7ff'], ['Dad', '#ffd23f'], ['Grandma', '#7ee081']].map(([name, color]) => room.join({ name, color }));
people.forEach((p) => room.setConnected(p.id, true));
g.takeArchiveRequest?.();
const [maya, leo, dad, gma] = people;

const steps = [];
const snap = (name, extra = {}) => {
  steps.push({
    name, extra,
    // Copies: the views share arrays with the live game, which later steps change.
    tv: structuredClone(room.publicView()), host: structuredClone(room.hostView()),
    phones: Object.fromEntries(people.map((p) => [p.name, structuredClone(room.playerView(p.id))])),
  });
};
const spots = () => g.board().flatMap((c, ci) => c.clues.map((cl, ri) => ({ ci, ri, cl })));
const ctrlName = () => people.find((p) => p.id === g.controllerId)?.name;

snap('lobby');
g.start();
g.controllerId = maya.id;
snap('round-1-intro', { focus: 'Maya' });
g.advance();
// Some scores, so the sidebar looks like a game under way.
room.adjustScore(maya.id, { set: 1200 }); room.adjustScore(leo.id, { set: 800 }); room.adjustScore(dad.id, { set: -200 }); room.adjustScore(gma.id, { set: 400 });
// A few clues already played.
for (const s of spots().filter((x) => !x.cl.dd).slice(0, 4)) s.cl.used = true;
snap('board', { focus: 'Maya' });
const first = spots().find((x) => !x.cl.dd && !x.cl.used && x.ri >= 2);
g.pick(first.ci, first.ri);
advance(800);
snap('reading', { focus: 'Maya' });
advance(waitFor(first.cl.q) + 10 - 800);
advance(1500);
snap('buzzers-open', { focus: 'Leo' });
advance(300); g.buzz(leo.id); advance(80); g.buzz(maya.id); advance(140); g.buzz(dad.id);
advance(2000);
snap('answering', { focus: 'Leo' });
g.answer(leo.id, 'a kangaroo');
snap('ruling-wrong', { focus: 'Leo' });
advance(T.ruling + 10);
advance(200);
snap('wrong-buzzers-reopen', { focus: 'Maya' });
advance(250); g.buzz(maya.id, g.clue.open);
g.answer(maya.id, first.cl.a);
snap('ruling-right', { focus: 'Maya' });
advance(T.ruling + 10);
snap('reveal-correct', { focus: 'Maya' });
g.react(dad.id, 2); g.react(gma.id, 0);
advance(T.reveal + 10);

const second = spots().find((x) => !x.cl.dd && !x.cl.used);
g.pick(second.ci, second.ri);
advance(waitFor(second.cl.q) + 10);
advance(T.buzzWindow + 10);
snap('reveal-nobody', { focus: 'Maya' });
advance(T.reveal + 10);

const dd = spots().find((x) => x.cl.dd);
g.controllerId = maya.id;
g.pick(dd.ci, dd.ri);
snap('daily-double-wager', { focus: 'Maya' });
g.ddWager(maya.id, 1000);
snap('daily-double-bet', { focus: 'Maya' });
advance(3000);
snap('daily-double-clue', { focus: 'Maya' });
g.answer(maya.id, dd.cl.a);
advance(T.ruling + 10);
snap('daily-double-reveal', { focus: 'Maya' });
advance(T.reveal + 10);

// The rest of round 1, quickly, with a spread of right and wrong answers.
let turn = 0;
const playOut = () => {
  while (g.phase === 'board') {
    const spot = spots().find((x) => !x.cl.used);
    g.pick(spot.ci, spot.ri);
    const who = people[turn++ % people.length];
    if (spot.cl.dd) { g.ddWager(g.controllerId, 200); g.answer(g.controllerId, spot.cl.a); } else {
      advance(waitFor(spot.cl.q) + 10);
      if (turn % 5 !== 0) { g.buzz(who.id); g.answer(who.id, turn % 3 ? spot.cl.a : 'no idea'); } else advance(T.buzzWindow + 10);
    }
    for (let i = 0; i < 6 && !['board', 'round-end'].includes(g.phase); i++) advance(Math.max(T.reveal, T.buzzWindow) + 10);
  }
};
playOut();
snap('round-end', { focus: 'Maya' });
g.advance();
snap('round-2-intro', { focus: ctrlName() });
g.advance();
for (const s of spots().slice(0, 7)) s.cl.used = true;
snap('board-round-2', { focus: ctrlName() });
playOut();
g.setFinalForAll(true);
g.advance();
snap('final-category-wager', { focus: 'Leo' });
g.finalWager(maya.id, 2000); g.finalWager(leo.id, 500);
snap('final-some-wagered', { focus: 'Dad' });
for (const p of people) if (!g.final.wagers[p.id]) g.finalWager(p.id, 0);
advance(1500);
snap('final-clue', { focus: 'Leo' });
g.finalAnswer(maya.id, g.finalClue.a); g.finalAnswer(leo.id, 'no clue');
snap('final-some-answered', { focus: 'Dad' });
g.finalAnswer(dad.id, g.finalClue.a); g.finalAnswer(gma.id, 'pass');
advance(2000);
snap('final-reveal-response', { focus: 'Maya' });
advance(T.finalBeat + 10);
snap('final-reveal-verdict', { focus: 'Maya' });
for (let i = 0; i < 20 && g.final.stage !== 'done'; i++) advance(T.finalStep + 10);
snap('final-correct-answer', { focus: 'Maya' });
for (let i = 0; i < 20 && g.phase !== 'gameover'; i++) advance(T.finalStep + 10);
snap('champion', { focus: 'Maya' });
g.playAgain();
// The host judging spoken answers, with the answer clock.
g.setHostJudges(true); g.setAnswerTime(10);
snap('lobby-host-judges');
g.start(); g.advance();
const hs = spots().find((x) => !x.cl.dd);
g.pick(hs.ci, hs.ri);
advance(900);
snap('host-reading', { focus: 'Leo' });
g.openNow(); advance(400); g.buzz(leo.id); advance(1200);
snap('host-answering', { focus: 'Leo' });

// ---------- the stand-in home server: web/, and a /ws that sends whatever step is showing ----------
const joinUrl = 'http://gamenight.local/';
const qrSvg = await QRCode.toString(joinUrl, { type: 'svg', margin: 1 });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.png': 'image/png' };
const pages = { '/': 'play.html', '/play': 'play.html', '/host': 'host.html', '/tv': 'tv.html' };
const site = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/config.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(''); }
  if (url.pathname === '/api/info') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ joinUrl })); }
  if (url.pathname === '/api/qr.svg') { res.writeHead(200, { 'content-type': 'image/svg+xml' }); return res.end(qrSvg); }
  if (url.pathname === '/api/sounds') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{}'); }
  if (url.pathname === '/api/games/jeopardy/sets') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(setIds.map((id) => ({ id, title: readSet(id)?.title ?? id })))); }
  if (url.pathname.startsWith('/api/')) { res.writeHead(404); return res.end('{}'); }
  const file = path.join(root, 'web', pages[url.pathname] ?? decodeURIComponent(url.pathname.slice(1)));
  if (!file.startsWith(path.join(root, 'web')) || !existsSync(file)) { res.writeHead(404); return res.end('no'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' }); res.end(readFileSync(file));
});
const wss = new WebSocketServer({ server: site, path: '/ws' });
let current = steps[0];
const viewFor = (c) => (c.role === 'tv' ? current.tv : c.role === 'host' ? current.host : current.phones[c.name]);
wss.on('connection', (sock) => {
  sock.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.t === 'hello') {
      sock.role = m.role === 'player' ? 'player' : m.role;
      sock.name = sock.name ?? null;
      if (sock.role === 'player' && !sock.name) { sock.send(JSON.stringify({ t: 'state', view: current.tv })); sock.send(JSON.stringify({ t: 'need-join' })); return; }
      sock.send(JSON.stringify({ t: 'state', view: viewFor(sock) }));
    } else if (m.t === 'join') {
      sock.role = 'player'; sock.name = m.name;
      sock.send(JSON.stringify({ t: 'joined', token: `tok-${m.name}` }));
      sock.send(JSON.stringify({ t: 'state', view: viewFor(sock) }));
    }
  });
});
await new Promise((r) => site.listen(0, r));
const base = `http://127.0.0.1:${site.address().port}`;
const push = () => { for (const s of wss.clients) if (s.role && (s.role !== 'player' || s.name)) s.send(JSON.stringify({ t: 'state', view: viewFor(s) })); };

// ---------- the browser ----------
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? 'playwright');
const browser = await chromium.launch();
const errors = [];
const watch = (page, who) => page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
const tvW = Number(process.env.GALLERY_TV_WIDTH ?? 1920);
const tv = await browser.newPage({ viewport: { width: tvW, height: Math.round(tvW * 9 / 16) } }); watch(tv, 'tv');
await tv.goto(`${base}/tv`);
const phones = {};
for (const p of people.slice(0, 3)) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(); watch(page, p.name);
  await page.goto(`${base}/`);
  await page.waitForSelector('input');
  await page.locator('input').first().fill(p.name);
  await page.getByRole('button', { name: /^join$/i }).click();
  phones[p.name] = page;
}
const hctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const host = await hctx.newPage(); watch(host, 'host');
await host.addInitScript(() => localStorage.setItem('gn-pin', JSON.stringify('1234')));
await host.goto(`${base}/host`);
await host.waitForTimeout(500);
if (await host.locator('input').count()) { await host.locator('input').first().fill('1234'); await host.keyboard.press('Enter'); }

const shots = [];
for (const s of steps) {
  if (only && !only.has(s.name)) continue;
  current = s;
  push();
  // Let the entrance animations finish (the round's titles take a few seconds; the Daily Double bet shows briefly).
  await tv.waitForTimeout(s.name.endsWith('intro') ? 6000 : s.name === 'daily-double-bet' ? 900 : s.name === 'daily-double-clue' ? 2600 : s.name === 'champion' ? 3500 : 1300);
  const files = [`${s.name}--tv.png`];
  await tv.screenshot({ path: path.join(out, files[0]) });
  if (process.env.GALLERY_DEBUG) console.log(await tv.evaluate((sel) => [...document.querySelectorAll(sel)].map((e) => { const c = getComputedStyle(e); return [e.className, c.backgroundImage.slice(0, 80), c.backgroundColor, c.width, c.justifyContent, c.position]; }), process.env.GALLERY_DEBUG));
  for (const [name, page] of Object.entries(phones)) {
    if (s.name.startsWith('lobby') || name === s.extra.focus || name === 'Dad') {
      const f = `${s.name}--phone-${name}.png`;
      await page.screenshot({ path: path.join(out, f) }); files.push(f);
    }
  }
  const hf = `${s.name}--host.png`;
  await host.screenshot({ path: path.join(out, hf) }); files.push(hf);
  shots.push({ name: s.name, files });
  console.log('shot', s.name);
}
writeFileSync(path.join(out, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Jeopardy gallery</title><style>body{background:#111;color:#eee;font:14px system-ui;margin:20px}h2{margin:28px 0 8px}img{height:420px;margin:0 8px 8px 0;border:1px solid #333}img.tv{height:420px}</style>
${shots.map((s) => `<h2>${s.name}</h2>${s.files.map((f) => `<img class="${f.includes('--tv') ? 'tv' : ''}" src="${f}">`).join('')}`).join('\n')}`);
await browser.close(); site.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`\n${shots.length} steps in ${out}`);

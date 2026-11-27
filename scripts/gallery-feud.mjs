// Screenshots of every Family Feud screen, for design reviews: plays a scripted game on the real engine and shows each
// step on the real pages (the TV page, three phones and the host page) in Chromium, through a stand-in home server.
//   node scripts/gallery-feud.mjs <folder>            (GALLERY_ONLY=board,fm-reveal picks steps)
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
import { ranked } from '../games/feud/game.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] ?? 'gallery-out');
mkdirSync(out, { recursive: true });
const only = process.env.GALLERY_ONLY ? new Set(process.env.GALLERY_ONLY.split(',')) : null;
await import('./build-web.mjs');

// ---------- the game, step by step ----------
const set = JSON.parse(readFileSync(path.join(root, 'data/feud/family-night-basics.json'), 'utf8'));
let t = 1000;
const room = new Room({ games: GAMES, now: () => t, loadContent: () => set, listContent: () => [{ id: 'basics', title: set.title }] });
const advance = (ms) => { t += ms; room.tick(); };
room.chooseGame('feud');
const g = room.game;
const people = ['Maya', 'Leo', 'Dad', 'Grandma', 'Sam', 'Uncle Joe'].map((name) => room.join({ name }));
people.forEach((p) => room.setConnected(p.id, true));
g.chooseSet('basics');
const [red, blue] = room.teams;
const team = (u) => people.filter((p) => p.teamId === u.id);

const steps = [];
const snap = (name, extra = {}) => {
  steps.push({
    name, extra,
    tv: structuredClone(room.publicView()), host: structuredClone(room.hostView()),
    phones: Object.fromEntries(people.map((p) => [p.name, structuredClone(room.playerView(p.id))])),
  });
};
const focusOf = (u) => team(u)[0]?.name;

snap('lobby');
g.startGame();
snap('faceoff', { focus: focusOf(red) });
g.openBuzzers();
snap('faceoff-open', { focus: focusOf(red) });
advance(412); g.buzz(g.run.faceoff.reps[red.id]); advance(180); g.buzz(g.run.faceoff.reps[blue.id]);
snap('faceoff-buzzed', { focus: focusOf(red) });
g.answer(1);
snap('faceoff-second', { focus: focusOf(blue) });
g.miss();
snap('choose', { focus: focusOf(red) });
g.choose(true);
g.answer(0); g.answer(3);
snap('board', { focus: focusOf(red) });
g.miss();
advance(2500);
snap('board-strike', { focus: focusOf(red) });
g.miss(); g.miss();
advance(2500);
snap('steal', { focus: focusOf(blue) });
g.answer(2);
snap('round-end', { focus: focusOf(blue) });
g.showAnswer();                                    // the host turns the answers over one at a time
snap('round-end-one', { focus: focusOf(blue) });
g.revealRest();
snap('round-end-all', { focus: focusOf(blue) });
// Skip on to round 4 (double points).
for (let r = 1; r < 3; r++) { g.nextRound(); g.awardBuzz(r % 2 ? blue.id : red.id); g.answer(0); g.choose(true); for (let i = 1; i < ranked(set.rounds[g.run.round]).length; i++) g.answer(i); }
red.score = 168; blue.score = 141;
g.nextRound(); g.awardBuzz(red.id); g.answer(0); g.choose(true); g.answer(2);
snap('round-4-double', { focus: focusOf(red) });
red.score = 312; blue.score = 141;
g.run.step = 'roundEnd';
g.nextRound();
snap('fm-intro', { focus: focusOf(red) });
g.fmStart();
advance(9000);
snap('fm-player1', { focus: focusOf(red) });
const [p1, p2] = g.run.fm.players.map((id) => room.player(id));
g.fmAnswersFrom(p1.id, ['Apple', 'Dog', 'Sneakers', 'Kitchen', 'Nap']);
g.fmNext();                                        // Player 1 is done: their answers are revealed first
snap('fm-p1-reveal-start', { focus: p1.name });
for (let i = 0; i < 6; i++) g.fmRevealNext();
snap('fm-p1-reveal', { focus: p1.name });
while (!g.publicView().fm.partDone) g.fmRevealNext();
snap('fm-p1-done', { focus: p1.name });
g.fmNext();                                        // hidden, and Player 2 comes in with Player 1's score still up
advance(12000);
snap('fm-player2', { focus: p2.name });
g.fmAnswersFrom(p2.id, ['Apple', 'Cat', 'Boots', 'Garage', 'Read']);   // "Apple" repeats Player 1: turned away
snap('fm-player2-repeat', { focus: p2.name });
g.fmAnswersFrom(p2.id, ['Banana', 'Cat', 'Boots', 'Garage', 'Read']);
g.fmNext();
snap('fm-reveal-start', { focus: p1.name });
for (let i = 0; i < 6; i++) g.fmRevealNext();
snap('fm-reveal', { focus: p1.name });
for (let i = 0; i < 40 && g.run.fm.step !== 'results'; i++) g.fmRevealNext();
snap('fm-results', { focus: p1.name });
g.finishGame();
advance(10);
snap('done', { focus: p1.name });

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
  if (url.pathname === '/api/games/feud/sets') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify([{ id: 'basics', title: set.title }])); }
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

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? 'playwright');
const browser = await chromium.launch();
const errors = [];
const watch = (page, who) => page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
const tvW = Number(process.env.GALLERY_TV_WIDTH ?? 1920);
const tv = await browser.newPage({ viewport: { width: tvW, height: Math.round(tvW * 9 / 16) } }); watch(tv, 'tv');
await tv.goto(`${base}/tv`);
const phones = {};
const phoneNames = [...new Set([focusOf(red), focusOf(blue), p1.name, p2.name])];
for (const name of phoneNames) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(); watch(page, name);
  await page.goto(`${base}/`);
  await page.waitForSelector('input');
  await page.locator('input').first().fill(name);
  await page.getByRole('button', { name: /^join$/i }).click();
  phones[name] = page;
}
const hctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const host = await hctx.newPage(); watch(host, 'host');
await host.addInitScript(() => localStorage.setItem('gn-pin', JSON.stringify('1234')));
await host.goto(`${base}/host`);
await host.waitForTimeout(500);
const pinBox = host.locator('input[type=password], input[inputmode=numeric]'); if (await pinBox.count()) { await pinBox.first().fill('1234'); await host.keyboard.press('Enter'); }

const shots = [];
for (const s of steps) {
  if (only && !only.has(s.name)) continue;
  current = s;
  push();
  await tv.waitForTimeout(s.name === 'done' || s.name === 'fm-results' ? 3000 : 1600);
  const files = [`${s.name}--tv.png`];
  await tv.screenshot({ path: path.join(out, files[0]) });
  for (const [name, page] of Object.entries(phones)) {
    if (name === s.extra.focus || (s.name === 'lobby' && name === focusOf(red))) {
      const f = `${s.name}--phone-${name}.png`;
      await page.screenshot({ path: path.join(out, f) }); files.push(f);
    }
  }
  const hf = `${s.name}--host.png`;
  await host.screenshot({ path: path.join(out, hf) }); files.push(hf);
  shots.push({ name: s.name, files });
  console.log('shot', s.name);
}
writeFileSync(path.join(out, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Feud gallery</title><style>body{background:#111;color:#eee;font:14px system-ui;margin:20px}h2{margin:28px 0 8px}img{height:420px;margin:0 8px 8px 0;border:1px solid #333}</style>
${shots.map((s) => `<h2>${s.name}</h2>${s.files.map((f) => `<img src="${f}">`).join('')}`).join('\n')}`);
await browser.close(); site.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`\n${shots.length} steps in ${out}`);

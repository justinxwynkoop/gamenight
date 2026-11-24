// Plays a whole game of Guys vs Gals in a real browser (Chromium via Playwright): the website's TV page runs the game,
// three phones join through a stand-in for Supabase Realtime and pick their sides, the coin toss picks who goes first,
// the teams vote on their questions (the Guys always right, the Gals always wrong, with the answer peeked from the other
// side's phone), play the Lightning Rounds they reach, and the Guys win.
//   node scripts/e2e-guysvsgals.mjs            (SHOT_DIR=<folder> saves screenshots of the TV and the phones)
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

const problems = [];
const browser = await chromium.launch();
const fail = (m) => { problems.push(m); console.error('FAIL:', m); };
const watch = (page, who) => {
  page.on('pageerror', (e) => fail(`${who} page error: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_|raw\.githubusercontent/.test(m.text())) fail(`${who} console error: ${m.text()}`); });
};
const until = async (fn, what, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return; await new Promise((r) => setTimeout(r, 50)); } fail(`timed out: ${what}`); throw new Error(what); };
const shots = new Set();
const shot = async (page, name) => { if (!process.env.SHOT_DIR || shots.has(name)) return; shots.add(name); await page.waitForTimeout(1200); await page.screenshot({ path: `${process.env.SHOT_DIR}/guysvsgals-${name}.png` }); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Ann is a Guy; Bo and Cy are Gals.
const players = [{ name: 'Ann', side: 'guys' }, { name: 'Bo', side: 'gals' }, { name: 'Cy', side: 'gals' }];
try {
  const tv = await browser.newPage({ viewport: { width: 1280, height: 720 } }); watch(tv, 'tv');
  await tv.goto(`${base}/tv?game=guysvsgals`);
  await until(async () => (await tv.locator('.gv-lobby .roomcode').count()) > 0, 'the TV lobby with a room code');
  const code = (await tv.locator('.roomcode').innerText()).trim();
  const tvText = async () => (await tv.locator('.gv-tv').evaluate((e) => e.textContent));
  for (const p of players) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); watch(page, p.name);
    await page.goto(`${base}/?r=${code}`);
    await until(async () => (await page.locator('input').count()) > 0, `${p.name}'s join form`);
    await page.locator('input').first().fill(p.name);
    await page.getByRole('button', { name: /^join$/i }).click();
    await until(async () => (await page.locator('.gv-sides').count()) > 0, `${p.name}'s side picker`);
    if (p.name === 'Ann') await shot(page, 'phone-pick-side');
    await page.locator(`button[data-side="${p.side}"]`).click();
    await until(async () => (await page.locator(`button[data-side="${p.side}"].on`).count()) > 0, `${p.name} on the ${p.side}`);
    p.page = page;
  }
  await until(async () => {
    const guys = await tv.locator('.gv-roster.guys').innerText();
    const gals = await tv.locator('.gv-roster.gals').innerText();
    return guys.includes('Ann') && gals.includes('Bo') && gals.includes('Cy') && !guys.includes('Bo');
  }, 'everyone on the right side of the TV lobby');
  await shot(tv, 'lobby');
  await shot(players[0].page, 'phone-lobby');
  if (await players[1].page.getByRole('button', { name: /start the battle/i }).count()) fail('a player who joined second can start');
  await players[0].page.getByRole('button', { name: /start the battle/i }).click();

  await until(async () => /Coin toss/i.test(await tvText()), 'the coin toss');
  await sleep(1600); await shot(tv, 'toss');
  const team = (side) => players.filter((p) => p.side === side);
  const ann = players[0].page;
  let questions = 0;
  let lightnings = 0;
  const end = Date.now() + 6 * 60_000;
  while (Date.now() < end) {
    const t = await tvText();
    if (/WIN!|A TIE/.test(t) && (await tv.locator('.gv-win').count())) break;
    const phase = await tv.locator('.gv-tv').evaluate((e) => [...e.classList].find((c) => c.startsWith('phase-'))?.slice(6) ?? 'lobby');
    if (phase === 'question') {
      // Whose turn: their phones have choice buttons; the other side's phones can peek at the answer.
      const turnSide = (await players[0].page.locator('button.gv-pchoice').count()) ? 'guys' : 'gals';
      const voters = team(turnSide);
      const watcher = players.find((p) => p.side !== turnSide).page;
      const peek = watcher.locator('button.gv-peek');
      if (!(await peek.count())) { await sleep(100); continue; }
      if ((await tv.locator('.gv-choices .right').count())) fail('the TV shows the answer before it is locked in');
      if ((await voters[0].page.locator('.gv-pchoice.right').count())) fail('the answering team can see the answer');
      await peek.click();
      await until(async () => (await watcher.locator('.gv-pchoice.right').count()) === 1, 'the peeked answer');
      const answer = await watcher.locator('.gv-pchoice').evaluateAll((els) => els.findIndex((e) => e.classList.contains('right')));
      const choices = await voters[0].page.locator('button.gv-pchoice').count();
      const pick = turnSide === 'guys' ? answer : (answer + 1) % choices;
      if (!questions) { await shot(tv, 'question'); await shot(watcher, 'phone-peek'); }
      for (const v of voters) await v.page.locator(`button.gv-pchoice[data-i="${pick}"]`).click().catch(() => {});
      if (!questions) await shot(voters[0].page, 'phone-voted');
      questions++;
      await until(async () => /phase-reveal/.test(await tv.locator('.gv-tv').getAttribute('class')), 'the answer to be revealed', 10000);
      const right = await tv.locator('.gv-choices .right').count();
      if (!right) fail('the TV does not show the right answer once it is revealed');
      if (questions === 1) await shot(tv, 'reveal');
      // Speed things along: the first player moves on.
      await sleep(400);
      const move = ann.getByRole('button', { name: /^Move on$/ });
      if (await move.count()) { await ann.locator('details.gv-pcard summary', { hasText: 'gone quiet' }).click().catch(() => {}); await move.click().catch(() => {}); }
      continue;
    }
    if (phase === 'lightning') {
      // Anyone on the team taps; the other side's phones know the answer.
      let side = null;
      for (const p of players) if (await p.page.locator('.gv-ptf').count()) { side = p.side; break; }
      if (!side) { await sleep(100); continue; }
      const tapper = team(side)[0].page;
      const knower = players.find((p) => p.side !== side).page;
      const hint = await knower.locator('.gv').innerText();
      const m = hint.match(/it’s (TRUE|FALSE)/);
      if (!m) { await sleep(100); continue; }
      if (!lightnings++) { await shot(tv, 'lightning'); await shot(tapper, 'phone-lightning'); }
      const truth = m[1] === 'TRUE';
      const say = side === 'guys' ? truth : !truth;
      const before = await tapper.locator('.gv').innerText();
      await tapper.getByRole('button', { name: say ? 'TRUE' : 'FALSE' }).click().catch(() => {});
      // Wait for the next statement (or the end of the round, which may not change the phone at once).
      for (let k = 0; k < 60 && (await tapper.locator('.gv').innerText()) === before; k++) await sleep(50);
      continue;
    }
    await sleep(150);
  }
  await until(async () => (await tv.locator('.gv-win').count()) > 0, 'the winner screen', 20000);
  await shot(tv, 'win');
  const t = await tvText();
  if (!/THE GUYS WIN/.test(t)) fail(`the Guys should win: ${t.slice(0, 200)}`);
  await shot(ann, 'phone-gameover');
  if (!(await ann.locator('.gv').innerText()).includes('your team')) fail('the winner’s phone does not say they won');
  console.log(`${questions} questions, ${lightnings} lightning statements`);
  await ann.getByRole('button', { name: /rematch/i }).click();
  await until(async () => (await tv.locator('.gv-lobby').count()) > 0, 'Rematch to return to the lobby');
  console.log('Guys vs Gals played through three phones and the TV page');
} catch (e) { if (!problems.length) fail(e.message); }
await browser.close(); sb.close(); site.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nOK');
process.exit(problems.length ? 1 : 0);

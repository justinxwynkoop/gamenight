// Plays a whole game of Jeopardy the way a family does with a host: the website's TV page runs the game, three phones
// join, and the host runs everything from the host page (only its buttons, never the engine directly). It walks
// through every step a host meets and checks the host always has the button the moment needs:
//   host judges out loud: Open buzzers, Correct, Wrong (and the buzzers opening again for the others), nobody
//   buzzing, the answer clock running out, a Daily Double bet typed in by the host and one placed on the phone,
//   ending a round, round 2, Final Jeopardy (wagers, the clue, answers, the reveal), the champion and Play again;
//   then typed answers with a host watching (a phone types, the game judges).
// With DROP=0.2 the stand-in for Supabase loses that share of the TV's messages on purpose: a lost one must never
// leave a phone or the host on an old screen.
//   node scripts/e2e-jeopardy-flow.mjs      (SHOT_DIR=<folder> saves screenshots; DROP=0.2 to lose messages)
import http from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await import('./build-web.mjs');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? 'playwright');
const DROP = Number(process.env.DROP ?? 0);
const SHOTS = process.env.SHOT_DIR ? path.resolve(process.env.SHOT_DIR) : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

// --- a stand-in for Supabase Realtime that loses some of what the TV sends to phones (never what phones send) ---
let seed = 11; const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
let hostId = null; let hostView = null; let dropped = 0;
const sb = new WebSocketServer({ port: 0 });
await new Promise((r) => sb.on('listening', r));
sb.on('connection', (sock) => {
  sock.topics = new Set();
  sock.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.event === 'phx_join') { sock.topics.add(m.topic); sock.send(JSON.stringify({ topic: m.topic, event: 'phx_reply', ref: m.ref, payload: { status: 'ok', response: {} } })); return; }
    if (m.event === 'heartbeat') { sock.send(JSON.stringify({ topic: 'phoenix', event: 'phx_reply', ref: m.ref, payload: { status: 'ok', response: {} } })); return; }
    if (m.event !== 'broadcast' || !sock.topics.has(m.topic)) return;
    const p = m.payload?.payload;
    if (p?.m?.t === 'hello' && p.m.role === 'host') hostId = p.c;
    const toClient = m.topic.split(':').length === 4;   // realtime:gn:<code>:<client>
    if (toClient && hostId && m.topic.endsWith(`:${hostId}`) && p?.t === 'state') hostView = p.view.game;
    if (toClient && p?.t === 'state' && rng() < DROP) { dropped++; return; }
    setTimeout(() => { for (const o of sb.clients) if (o !== sock && o.topics.has(m.topic) && o.readyState === 1) o.send(JSON.stringify({ topic: m.topic, event: 'broadcast', payload: m.payload })); }, 30);
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
const log = (text) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}  ${text}`);
const problems = [];
const fail = (m) => { problems.push(m); log(`FAIL: ${m}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what, ms = 12000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return; } catch { /* the page moved on */ } await sleep(60); } throw new Error(`timed out: ${what} (host sees phase ${hostView?.phase})`); };

const browser = await chromium.launch();
const watch = (page, who) => {
  page.on('pageerror', (e) => fail(`${who} page error: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_|raw\.githubusercontent/.test(m.text())) fail(`${who} console error: ${m.text()}`); });
};
let shotN = 0;
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${String(++shotN).padStart(2, '0')}-${name}.png`) }).catch(() => {}); };

try {
  const tv = await browser.newPage({ viewport: { width: 1920, height: 1080 } }); watch(tv, 'tv');
  await tv.route('https://raw.githubusercontent.com/**', (r) => r.abort());
  await tv.goto(`${base}/tv?game=jeopardy`);
  await until(async () => (await tv.locator('.roomcode').count()) > 0, 'the TV lobby');
  const code = (await tv.locator('.roomcode').innerText()).trim();
  await tv.getByRole('button', { name: /menu/i }).click();
  const pin = (await tv.locator('.tvmenu-panel').innerText()).match(/Host PIN\s*(\d{4})/)?.[1];
  await tv.getByRole('button', { name: /menu/i }).click();

  const phones = {};
  for (const name of ['Ann', 'Bo', 'Cy']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); watch(page, name);
    await page.goto(`${base}/?r=${code}`);
    await until(async () => (await page.locator('input').count()) > 0, `${name}'s join form`);
    await page.locator('input').first().fill(name);
    await page.getByRole('button', { name: /join/i }).first().click();
    await until(async () => /YOU’RE IN/.test(await page.locator('body').innerText()), `${name} to join`);
    phones[name] = page;
  }
  const host = await browser.newPage({ viewport: { width: 390, height: 844 } }); watch(host, 'host');
  await host.goto(`${base}/host?r=${code}`);
  await until(async () => (await host.locator('input').count()) > 0, 'the host PIN form');
  await host.locator('input').first().fill(pin); await host.keyboard.press('Enter');
  await until(async () => /jeopardy/i.test(await host.locator('body').innerText()), 'the host controls');
  log(`TV ${code}, three phones and the host are in`);

  const pid = (name) => hostView.players.find((p) => p.name === name)?.id;
  const nameOf = (id) => hostView.players.find((p) => p.id === id)?.name;
  const dock = async () => (await host.locator('.dock').innerText().catch(() => '')).replace(/\s+/g, ' ');
  /** The host page shows this button (in the action bar unless said otherwise); tap it. */
  const tap = async (label, what = label, where = '.dock') => {
    const b = host.locator(`${where} button`, { hasText: label }).first();
    await until(async () => (await b.count()) > 0 && await b.isEnabled(), `the host's "${label}" button (${what}); the bar shows: ${await dock()}`);
    await b.click();
  };
  const phase = (ph, what = ph, ms) => until(() => hostView?.phase === ph, `${what}`, ms);
  const buzz = async (name) => {
    const p = phones[name];
    await until(async () => (await p.locator('.jp-buzzer.live').count()) > 0, `${name}'s buzzer to turn gold`);
    await p.locator('.jp-buzzwrap').dispatchEvent('pointerdown');
  };
  /** The round's titles: skip them from the host page (if the host's view of them was lost, they end by themselves). */
  const skipTitles = async () => {
    await until(() => ['round-intro', 'board'].includes(hostView?.phase), 'the round titles');
    const b = host.locator('.dock button', { hasText: 'Skip to the board' });
    await until(async () => hostView.phase === 'board' || (await b.count()) > 0, 'Skip to the board on the host page');
    if (hostView.phase === 'round-intro') await b.click().catch(() => {});
    await phase('board', 'the board');
  };
  const sure = async () => { const b = host.locator('.sheet button', { hasText: /End round|End game|Reveal|Yes/ }).first(); await until(async () => (await b.count()) > 0, 'the confirm sheet'); await b.click(); };
  /** Tap a tile on the host's board: a Daily Double or not. */
  const pickTile = async (dd) => {
    await phase('board', 'the board');
    const tiles = host.locator(`.jp-mini button:not([disabled])${dd ? '.dd' : ':not(.dd)'}`);
    await until(async () => (await tiles.count()) > 0, `a ${dd ? 'Daily Double' : 'plain'} tile on the host's board`);
    await tiles.first().click();
  };

  // ---------- setup: a host who judges out loud, a 5 second answer clock ----------
  await tap('A host judges out loud', 'switching host judging on', '.main');
  await until(() => hostView?.hostJudges === true, 'host judging to be on');
  await tap('5s', 'the answer clock', '.main');
  await until(() => hostView?.answerTime === 5, 'the 5 second answer clock');
  await shot(host, 'host-lobby');
  await tap('Start game');
  await skipTitles();
  log('round 1: the host skipped the titles');

  // 1. Correct
  await pickTile(false);
  await phase('reading', 'the clue');
  await tap('Open buzzers');
  await buzz('Ann');
  await phase('answering', 'Ann answering');
  await until(async () => /buzzed in first/i.test(await host.locator('body').innerText()), 'who buzzed in first, on the host page');
  await shot(host, 'host-answering');
  await tap('Correct');
  await phase('board', 'back to the board after a right answer');
  if (hostView.controllerId !== pid('Ann')) fail('a right answer gives control to Ann');
  log('clue 1: Ann buzzed, the host ruled Correct');

  // 2. Wrong, the buzzers open again for the others, then Correct; the host on another tab is brought back
  await pickTile(false);
  await tap('Open buzzers');
  await host.locator('nav .tab', { hasText: 'Scores' }).click();
  await buzz('Bo');
  await phase('answering', 'Bo answering');
  await until(async () => (await host.locator('nav .tab[aria-current="page"]').innerText()).includes('Game'), 'the Game tab to come back by itself when the host must rule');
  await tap('Wrong');
  await phase('ruling', 'the ruling');
  await phase('open', 'the buzzers to open again for the others');
  await until(async () => /Bo missed/i.test(await host.locator('body').innerText()), 'the host to see that Bo missed');
  await buzz('Cy');
  await phase('answering', 'Cy answering');
  await tap('Correct');
  await phase('board', 'the board after Cy');
  log('clue 2: Bo wrong (and the buzzers opened again), Cy right; the Game tab came back by itself');

  // 3. Nobody buzzes: the host shows the answer
  await pickTile(false);
  await tap('Open buzzers');
  await phase('open', 'the buzzers open');
  await tap('Nobody. Show the answer');
  await phase('reveal', 'the answer');
  await tap('Back to the board');
  log('clue 3: nobody buzzed; the host showed the answer and went back to the board');

  // 4. The answer clock runs out: TIME, the host can still rule in the grace, then it counts as a miss
  await pickTile(false);
  await tap('Open buzzers');
  await buzz('Bo');
  await phase('answering', 'Bo answering');
  await sleep(5000 + 3000);   // the 5 second clock has run out a few seconds ago
  if (hostView.phase !== 'answering' || !/Correct/.test(await dock())) fail(`seconds after time ran out the host can still rule (phase ${hostView.phase}, bar: ${await dock()})`);
  await phase('ruling', 'the clue to count as a miss after the grace', 12000);
  if (!hostView.lastResult?.timedOut) fail('running out of time is a timed-out miss');
  await phase('open', 'the buzzers to open again for the others');
  await tap('Nobody. Show the answer');
  await phase('reveal', 'the answer');
  await tap('Back to the board');
  log('clue 4: the clock ran out, the host still had Correct / Wrong for a while, then it counted as a miss');

  // 5. Daily Double: the player tells the host the bet and the host types it in
  await pickTile(true);
  await phase('dd-wager', 'the Daily Double wager');
  const ddBy = nameOf(hostView.controllerId);
  await host.locator('input[data-k="dd-wager"]').fill('300');
  await shot(host, 'host-dd-wager');
  await tap('Place this bet');
  await phase('dd-answer', 'the Daily Double clue');
  if (hostView.clue.wager !== 300) fail(`the host's typed bet is the wager (got ${hostView.clue.wager})`);
  await tap('Correct');
  await phase('board', 'back to the board (with a host, a right answer skips the answer screen)');
  log(`clue 5: Daily Double, ${ddBy} told the host $300, the host typed it in and ruled Correct`);

  await tap('End the round now');
  await sure();
  await phase('round-end', 'the end of round 1');
  await tap('Start the next round');
  await phase('round-intro', 'round 2 titles');
  await phase('board', 'round 2 board', 12000);
  log('round 2: the titles ran by themselves');

  // 6. Daily Double bet on the phone, Wrong
  await pickTile(true);
  await phase('dd-wager', 'the round 2 Daily Double');
  const better = phones[nameOf(hostView.controllerId)];
  const bet = better.locator('.jp-wager .jp-btn.huge');
  await until(async () => (await bet.count()) > 0, 'the bet button on the phone');
  await bet.click();
  await phase('dd-answer', 'the Daily Double clue');
  await tap('Wrong');
  await phase('reveal', 'the answer');
  await tap('Back to the board');
  log('clue 6: a Daily Double bet on the phone, ruled Wrong');

  await tap('End the round now');
  await sure();
  await phase('round-end', 'the end of round 2');
  await tap('On to Final Jeopardy');
  await phase('final-wager', 'Final Jeopardy wagers');
  for (const [name, p] of Object.entries(phones)) {
    const b = p.locator('.jp-wager .jp-btn.huge');
    await until(async () => (await b.count()) > 0, `${name}'s Final wager`);
    await b.click();
  }
  await tap('Show the clue');
  await phase('final-answer', 'the Final clue');
  const fa = hostView.secret.finalAnswer;
  for (const [name, p] of Object.entries(phones)) {
    const box = p.locator('.jp-answer.on input.jp-in');
    await until(async () => (await box.count()) > 0, `${name}'s Final answer box`);
    await box.fill(name === 'Ann' ? fa : 'no idea');
    await p.getByRole('button', { name: /lock it in/i }).click();
  }
  await phase('final-reveal', 'the Final reveal');
  for (let i = 0; i < 12 && hostView.phase === 'final-reveal'; i++) { await tap('Next reveal'); await sleep(400); }
  await phase('gameover', 'the champion');
  await shot(tv, 'tv-champion');
  log(`Final Jeopardy: wagers, the clue, answers, the reveal; scores ${hostView.players.map((p) => `${p.name} ${p.score}`).join(', ')}`);
  await tap('Play again');
  await phase('lobby', 'back in the lobby');

  // ---------- typed answers with a host watching ----------
  await tap('A host judges out loud', 'switching host judging off', '.main');
  await until(() => hostView?.hostJudges === false, 'host judging to be off');
  await tap('Start game');
  await skipTitles();
  await phase('board', 'the board');
  // The player in control picks on their phone.
  const picker = phones[nameOf(hostView.controllerId)];
  const tile = picker.locator('.jp-mini button:not([disabled])');
  await until(async () => (await tile.count()) > 0, 'the board on the phone of the player in control');
  let dd = true;
  for (let tries = 0; tries < 30 && dd; tries++) {
    await tile.nth(tries).click();
    await until(() => hostView.phase !== 'board', 'the pick');
    dd = hostView.phase === 'dd-wager';
    if (dd) { await tap('Skip this clue'); await phase('reveal', 'the skipped Daily Double'); await tap('Back to the board'); await phase('board', 'the board'); }
  }
  await phase('open', 'the buzzers to open by themselves', 15000);
  await buzz('Bo');
  await phase('answering', 'Bo typing');
  await until(async () => /Correct/.test(await dock()) && /Wrong/.test(await dock()), 'Correct / Wrong for the host while a phone types its answer');
  const ans = hostView.secret.answer;
  const box = phones.Bo.locator('.jp-answer.on input.jp-in');
  await until(async () => (await box.count()) > 0, 'Bo\'s answer box');
  await box.fill(ans);
  await phones.Bo.getByRole('button', { name: /lock it in/i }).click();
  await phase('ruling', 'the game judging Bo\'s answer');
  if (!hostView.lastResult?.correct) fail(`the game takes the right typed answer "${ans}"`);
  await phase('reveal', 'the answer');
  await tap('Back to the board');
  await phase('board', 'the board');
  log('typed answers: Bo typed the right answer and the game took it');
  await tap('End the game');
  await sure();
  await phase('lobby', 'back in the lobby after End game');
  log(`done (${dropped} of the TV's messages were lost on purpose on the way)`);
} catch (e) {
  fail(e.message);
  for (const pg of browser.contexts().flatMap((c) => c.pages())) {
    const t = await pg.locator('body').innerText().catch(() => '');
    console.log(`--- ${pg.url()} ---\n${t.replace(/\s+/g, ' ').slice(0, 600)}`);
  }
}
await browser.close(); sb.close(); site.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nOK');
process.exit(problems.length ? 1 : 0);

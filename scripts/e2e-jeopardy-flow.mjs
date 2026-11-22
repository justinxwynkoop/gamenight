// First, with no host at all: typed answers the game judges (a right one goes straight back to the board, as on the
// show, and a clue nobody buzzes shows its answer). Then plays a whole game of Jeopardy the way a family does with a host: the website's TV page runs the game, three phones
// join, and the host runs everything from the host page (only its buttons, never the engine directly). It walks
// through every step a host meets and checks the host always has the button the moment needs:
//   host judges out loud: Open buzzers, Correct, Wrong (and the buzzers opening again for the others), nobody
//   buzzing, the answer clock running out, two Daily Double bets typed in by the host (the phone has no bet buttons),
//   ending a round, round 2, Final Jeopardy (wagers, the clue, answers, the reveal), the champion and Play again;
//   then a second game, checking no phone ever shows an answer box while a host is in (only Final Jeopardy is typed).
// With DROP=0.2 the stand-in for Supabase loses that share of the TV's messages on purpose: a lost one must never
// leave a phone or the host on an old screen.
//   node scripts/e2e-jeopardy-flow.mjs      (SHOT_DIR=<folder> saves screenshots; DROP=0.2 to lose messages)
import http from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { HOUSE_PACKS } from '../games/jeopardy/packs/index.js';

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
// What the TV last told any phone (the shared part of the view), and every phase it went through, in order.
let anyView = null; const phases = [];
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
    if (toClient && p?.t === 'state' && p.view?.game?.phase) { anyView = p.view.game; if (phases.at(-1) !== anyView.phase) phases.push(anyView.phase); }
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
  // ---------- no host page: the captain (Ann, first in) turns on host judging and runs it from her phone ----------
  {
    const ann = phones.Ann;
    const capBtn = (label) => ann.locator('.jp-captain button', { hasText: label }).first();
    const tapCap = async (label) => { const b = capBtn(label); await until(async () => (await b.count()) > 0, `"${label}" on the captain's phone`); await b.click(); };
    const toggle = ann.locator('button', { hasText: 'A host judges out loud' }).first();
    await until(async () => (await toggle.count()) > 0, 'the host judging switch on the captain phone');
    await toggle.click();
    await until(async () => /You’re the host/.test(await ann.locator('body').innerText()), 'the captain phone saying she is the host');
    await tapCap('Start game');
    await until(async () => (await capBtn('Skip intro').count()) > 0 || (await ann.locator('button.jp-pval').count()) > 0, 'round 1 on the captain phone');
    if (await capBtn('Skip intro').count()) await capBtn('Skip intro').click();
    const tiles = ann.locator('.jp-pcat:not([data-media]) button.jp-pval');
    await until(async () => (await tiles.count()) > 0, 'the board on the captain-host phone');
    // Pick until a plain clue comes up (skip a Daily Double).
    for (let i = 0; i < 10; i++) {
      await tiles.first().click();
      await until(async () => (await ann.locator('.jp-go').count()) > 0, 'the Open button on the captain-host phone');
      await ann.locator('.jp-go').click();
      await until(async () => (await capBtn('Open buzzers').count()) > 0 || (await capBtn('Skip clue').count()) > 0, 'the clue on the captain phone');
      if (await capBtn('Open buzzers').count()) break;
      ann.once('dialog', (d) => d.accept()); await capBtn('Skip clue').click();
      await until(async () => (await capBtn('Continue').count()) > 0, 'Continue'); await capBtn('Continue').click();
      await until(async () => (await tiles.count()) > 0, 'the board again');
    }
    await shot(ann, 'captain-host-reading');
    await tapCap('Open buzzers');
    await until(async () => (await phones.Bo.locator('.jp-buzzer.live').count()) > 0, 'Bo\'s buzzer to turn gold');
    await phones.Bo.locator('.jp-buzzwrap').dispatchEvent('pointerdown');
    await until(async () => (await capBtn('Correct').count()) > 0 && (await capBtn('Wrong').count()) > 0, 'Correct and Wrong on the captain-host phone');
    await tapCap('Show the answer');
    await until(async () => (await capBtn('Answer:').count()) > 0, 'the answer for the captain-host');
    await shot(ann, 'captain-host-judging');
    await tapCap('Correct');
    await until(async () => (await tiles.count()) > 0 && /bo/i.test(await ann.locator('.jp-pickhead').innerText()), 'the board, Bo to pick');
    ann.once('dialog', (d) => d.accept());
    await tapCap('End game');
    await until(async () => (await toggle.count()) > 0, 'the lobby again');
    await toggle.click();
    await until(async () => /You’re the captain/.test(await ann.locator('body').innerText()), 'host judging off again');
    log('no host page: Ann turned host judging on and ran a clue from her phone (Open buzzers, Correct)');
  }

  // ---------- no host at all: typed answers, the game judges, a right answer goes straight back to the board ----------
  {
    const ann = phones.Ann;
    const answers = new Map(HOUSE_PACKS.flatMap((p) => p.data.categories.flatMap((c) => c.clues.map((cl) => [cl.q, cl.a]))));
    const capBtn = (label) => ann.locator('.jp-captain button', { hasText: label }).first();
    const tapCap = async (label) => { const b = capBtn(label); await until(async () => (await b.count()) > 0, `"${label}" on the captain's phone`); await b.click(); };
    const ph = (want, what, ms) => until(() => anyView?.phase === want, what, ms);
    const nameOfAny = (id) => anyView.players.find((p) => p.id === id)?.name;
    const pickPlain = async () => {
      for (let i = 0; i < 10; i++) {
        await ph('board', 'the board');
        const ctl = phones[nameOfAny(anyView.controllerId)];
        const t = ctl.locator('.jp-pcat:not([data-media]) button.jp-pval:not(.dd)');
        await until(async () => (await t.count()) > 0, 'the picker on the phone in control');
        await t.first().click();
        await until(async () => (await ctl.locator('.jp-go').count()) > 0, 'Open on the phone in control');
        await ctl.locator('.jp-go').click();
        await until(() => anyView.phase !== 'board', 'the pick');
        if (anyView.phase !== 'dd-wager') return;
        ann.once('dialog', (d) => d.accept()); await tapCap('Skip clue');
        await ph('reveal', 'the skipped Daily Double'); await tapCap('Continue');
      }
    };
    const buzzIn = async (name) => {
      await until(async () => (await phones[name].locator('.jp-buzzer.live').count()) > 0, `${name}'s buzzer to turn gold`, 20000);
      await phones[name].locator('.jp-buzzwrap').dispatchEvent('pointerdown');
      await ph('answering', `${name} answering`);
    };
    const typeIn = async (name, text) => {
      const box = phones[name].locator('.jp-answer.on input.jp-in');
      await until(async () => (await box.count()) > 0, `${name}'s answer box (no host: answers are typed)`);
      await box.fill(text);
      await phones[name].getByRole('button', { name: /lock it in/i }).click();
    };
    await tapCap('Start game');
    await until(async () => (await capBtn('Skip intro').count()) > 0 || anyView?.phase === 'board', 'round 1');
    if (await capBtn('Skip intro').count()) await capBtn('Skip intro').click();
    // A wrong typed answer, the buzzers open again by themselves, then a right one: straight back to the board.
    await pickPlain();
    await ph('open', 'the buzzers to open by themselves (no host)', 20000);
    const right = answers.get(anyView.clue.q);
    if (!right) fail(`could not find the answer to "${anyView.clue.q}"`);
    await buzzIn('Cy');
    await typeIn('Cy', 'zzzzzz');
    await ph('ruling', 'the game judging Cy');
    if (anyView.lastResult?.correct !== false) fail('a wrong typed answer is ruled wrong');
    await ph('open', 'the buzzers opening again for the others');
    await buzzIn('Bo');
    phases.length = 0;
    await typeIn('Bo', right);
    await ph('board', 'the board right after Bo\'s right answer');
    if (phases.includes('reveal')) fail(`a right answer went through the answer screen (${phases.join(' → ')})`);
    if (!anyView.lastResult?.correct) fail(`the game takes the right typed answer "${right}"`);
    if (nameOfAny(anyView.controllerId) !== 'Bo') fail('a right answer gives control to Bo');
    log(`no host: Cy typed a wrong answer, Bo typed "${right}", and the game went straight back to the board (${phases.join(' → ')})`);
    // Nobody buzzes: the answer is shown, then the board comes back by itself.
    await pickPlain();
    await ph('open', 'the buzzers to open', 20000);
    await ph('reveal', 'the answer when nobody buzzes', 20000);
    await ph('board', 'the board again by itself', 15000);
    log('no host: nobody buzzed, the answer was shown, the board came back by itself');
    ann.once('dialog', (d) => d.accept());
    await tapCap('End game');
    await ph('lobby', 'the lobby again');
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
    // Not a picture, sound or video clue: those wait for the TV to play them, which this test does not time.
    // A Daily Double may sit in the picture or sound column: the bet comes first, so that is fine.
    const tiles = host.locator(dd ? 'button.jp-pval.dd' : '.jp-pcat:not([data-media]) button.jp-pval:not(.dd)');
    await until(async () => (await tiles.count()) > 0, `a ${dd ? 'Daily Double' : 'plain'} value on the host's picker`);
    const ci = Number(await tiles.first().getAttribute('data-ci')); const ri = Number(await tiles.first().getAttribute('data-ri'));
    await tiles.first().click();
    // Choosing it lights it up on the TV before it opens.
    await until(() => hostView.peek?.ci === ci && hostView.peek?.ri === ri, 'the chosen clue in the view');
    await until(async () => (await tv.locator('.board .tile.peek').count()) === 1, 'the chosen clue glowing on the TV');
    await host.locator('.jp-go').click();
  };

  // ---------- setup: a host who judges out loud, a 5 second answer clock ----------
  // With a host page connected, answers are always said out loud: there is nothing to switch on.
  await until(() => hostView?.hostJudges === true, 'host judging to be on as soon as the host is in');
  if (await host.locator('.main button', { hasText: 'A host judges out loud' }).count()) fail('the host page still offers to switch spoken answers off');
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

  // 6. Daily Double: the phone only says to tell the host the bet (no bet buttons), the host types it, Wrong
  await pickTile(true);
  await phase('dd-wager', 'the round 2 Daily Double');
  const better = phones[nameOf(hostView.controllerId)];
  await until(async () => /Tell the host how much you bet/.test(await better.locator('body').innerText()), 'the tell-the-host-your-bet screen on the phone');
  if (await better.locator('.jp-wager .jp-btn.huge').count()) fail('the phone offers its own Daily Double bet while a host is in');
  await host.locator('input[data-k="dd-wager"]').fill('200');
  await tap('Place this bet');
  await phase('dd-answer', 'the Daily Double clue');
  await tap('Wrong');
  await phase('reveal', 'the answer');
  await tap('Back to the board');
  log('clue 6: a Daily Double, the phone said to tell the host, the host typed $200 and ruled Wrong');

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

  // ---------- a second game: still no answer box on any phone while the host is in ----------
  await until(() => hostView?.hostJudges === true, 'spoken answers again in the new game');
  await tap('Start game');
  await skipTitles();
  await phase('board', 'the board');
  // With a host, the player in control says the pick out loud: their phone has no picker, and the host taps it.
  const picker = phones[nameOf(hostView.controllerId)];
  await until(async () => /Say a category and a value out loud/.test(await picker.locator('body').innerText()), 'the say-your-pick screen on the phone in control');
  if (await picker.locator('button.jp-pval').count()) fail('a player can pick on their phone while a host is connected');
  let dd = true;
  for (let tries = 0; tries < 30 && dd; tries++) {
    await pickTile(false);
    await until(() => hostView.phase !== 'board', 'the pick');
    dd = hostView.phase === 'dd-wager';
    if (dd) { await tap('Skip this clue'); await phase('reveal', 'the skipped Daily Double'); await tap('Back to the board'); await phase('board', 'the board'); }
  }
  await phase('reading', 'the clue');
  await tap('Open buzzers');
  await buzz('Bo');
  await phase('answering', 'Bo answering out loud');
  await until(async () => /Say your answer out loud/i.test(await phones.Bo.locator('body').innerText()), 'Bo\'s phone telling him to say it out loud');
  for (const [name, p] of Object.entries(phones)) {
    // The box is kept off screen between turns (so a phone can bring the keyboard up fast); it must not be shown or focused.
    if (await p.locator('.jp-answer.on').count()) fail(`${name}'s phone shows an answer box while a host is in`);
    if (await p.evaluate(() => document.activeElement?.matches?.('input.jp-in'))) fail(`${name}'s phone has the keyboard up for an answer while a host is in`);
  }
  await tap('Correct');
  await phase('board', 'back to the board after the host ruled Correct');
  log('second game: Bo said it out loud, no phone had an answer box, the host ruled Correct');
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

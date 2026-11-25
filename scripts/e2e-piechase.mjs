// Plays a whole game of Pie Chase in a real browser (Chromium via Playwright): the website's TV page runs the game, three
// phones join through a stand-in for Supabase Realtime, roll to see who goes first, roll and move, read each other the
// questions and judge them, win wedges, and one of them wins in the hub on a category the others picked. On the way the
// TV page is reloaded, and the game carries on where it was.
//   node scripts/e2e-piechase.mjs            (SHOT_DIR=<folder> saves screenshots of the TV and the phones)
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
  // The clue archive is on the internet, which the test machine may not reach; the TV falls back to the shipped sets.
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_|raw\.githubusercontent/.test(m.text())) fail(`${who} console error: ${m.text()}`); });
};
const until = async (fn, what, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return; await new Promise((r) => setTimeout(r, 50)); } fail(`timed out: ${what}`); throw new Error(what); };


import { distance, HUB } from '../games/piechase/board.js';

const names = ['Ann', 'Bo', 'Cy'];
// Screenshots wait for the cards to finish sliding in (and a token to finish hopping).
const shot = async (page, name) => { if (!process.env.SHOT_DIR) return; await page.waitForTimeout(1600); await page.screenshot({ path: `${process.env.SHOT_DIR}/piechase-${name}.png` }); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const tvCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  let tv = await tvCtx.newPage(); watch(tv, 'tv');
  await tv.goto(`${base}/tv?game=piechase`);
  await until(async () => (await tv.locator('.pc-lobby .roomcode').count()) > 0, 'the TV lobby with a room code');
  const code = (await tv.locator('.roomcode').innerText()).trim();
  const phones = [];
  for (const name of names) {
    let p;
    if (name === 'Cy') {
      // Cy shares Bo's phone: Bo's lobby opens a second player in a new tab of the same browser.
      const [tab] = await Promise.all([phones[1].context().waitForEvent('page'), phones[1].getByRole('link', { name: /Add another player on this phone/ }).click()]);
      p = tab; watch(p, name);
      await p.waitForLoadState();
    } else {
      p = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); watch(p, name);
      await p.goto(`${base}/?r=${code}`);
    }
    await until(async () => (await p.locator('input').count()) > 0, `${name}'s join form`);
    await p.locator('input').first().fill(name);
    await p.getByRole('button', { name: /^join$/i }).click();
    await until(async () => (await p.locator('.pc').count()) > 0, `${name}'s Pie Chase lobby`);
    phones.push(p);
  }
  const tvText = async () => (await tv.locator('.pc-tv').evaluate((e) => e.textContent));
  await until(async () => names.every((n) => tvText().then((t) => t.includes(n))), 'everyone on the TV lobby');
  await shot(tv, 'lobby');
  await shot(phones[0], 'phone-lobby');
  if (await phones[1].getByRole('button', { name: /start the game/i }).count()) fail('a player who joined second can start');
  await phones[0].getByRole('button', { name: /start the game/i }).click();

  // Who goes first: everyone rolls (again, if they tie for highest).
  await until(async () => /Who goes first|A tie/.test(await tvText()), 'the roll for who goes first');
  await shot(tv, 'rolloff');
  for (let i = 0; i < 20 && !/goes first!/.test(await tvText()); i++) {
    for (const p of phones) { const b = p.getByRole('button', { name: /^🎲 Roll$/ }); if (await b.count()) await b.click().catch(() => {}); }
    await sleep(300);
  }
  await until(async () => /goes first!/.test(await tvText()), 'someone to go first');
  await shot(tv, 'rolloff-done');
  const firstName = (await tvText()).match(/(\w+) goes first!/)[1];
  await until(async () => /turn: roll the die/.test(await tvText()), 'the first turn', 8000);
  if (!(await tvText()).includes(`${firstName}’s turn`)) fail(`the TV does not say it is ${firstName}'s turn`);

  const whoseTurn = async () => { for (const [i, p] of phones.entries()) if (await p.getByRole('button', { name: /Roll the die/ }).count()) return i; return -1; };
  const wedgesOf = async (i) => Number((await phones[i].locator('.pc-me .dim').innerText()).match(/(\d+) of/)[1]);
  const champion = names.indexOf(firstName);
  let wedgeSeen = false;
  let questions = 0;
  let checkedSecret = false;

  /** One roll for whoever's turn it is: pick a space, answer, judge. `want` picks the space. */
  async function turn(want) {
    await until(async () => (await whoseTurn()) >= 0, 'someone to be able to roll');
    const i = await whoseTurn();
    const me = phones[i];
    await me.getByRole('button', { name: /Roll the die/ }).click();
    await until(async () => (await me.locator('.pc-dest').count()) > 0 || /Moving to/.test(await me.locator('.pc').innerText()), 'the places to move to');
    if (await me.locator('.pc-dest').count()) {
      if (!checkedSecret) await shot(me, 'phone-move');
      const ids = await me.locator('.pc-dest').evaluateAll((els) => els.map((e) => e.dataset.id));
      const texts = await me.locator('.pc-dest').allInnerTexts();
      const pick = want(ids, texts, i);
      if (!checkedSecret) await shot(tv, 'move');
      await me.locator(`.pc-dest[data-id="${pick}"]`).click();
    }
    // Landing: a question, the hub (pick a category), or Roll Again.
    await until(async () => /answers out loud|is in the hub|Roll Again!|rolls again/.test(await tvText()), 'the landing', 8000);
    let t = await tvText();
    if (/is in the hub/.test(t)) {
      const final = /every wedge/.test(t);
      const chooser = final ? phones.find((p, k) => k !== i) : me;
      // The answerer cannot pick their own winning category.
      if (final && (await me.locator('.pc-cat').count())) fail('the player in the hub can pick their own winning category');
      await until(async () => (await chooser.locator('.pc-cat').count()) === 6, 'the category buttons');
      if (final) { await shot(tv, 'final-choose'); await shot(chooser, 'phone-final-choose'); }
      await chooser.locator('.pc-cat').nth(5).click();
      await until(async () => /answers out loud/.test(await tvText()), 'the question after the hub', 8000);
      t = await tvText();
    }
    if (/Roll Again!/.test(t)) return { i, roll: true };
    // The question: the answerer's phone and the TV never show the answer; the reader's phone does.
    const reader = phones[(i + 1) % phones.length];
    // Wait for this question on the reader's phone (it may still be showing the last answer for a moment).
    await until(async () => (await reader.locator('.pc-qcard .a').count()) > 0 && /Read this to/.test(await reader.locator('.pc').innerText()), 'the answer on the reader’s phone');
    const answer = (await reader.locator('.pc-qcard .a').innerText()).replace(/^Answer\s*/i, '').trim();
    if ((await me.locator('.pc-qcard .a').count())) fail('the answering player can see the answer');
    // The question's own words may hold the answer ("In Green Eggs and Ham, what colour are the eggs?"),
    // so look everywhere on the TV but the question, and for the answer line itself.
    if (await tv.locator('.pc-ans').count()) fail('the TV shows the answer line before it is judged');
    const aroundQuestion = (await tvText()).replace(await tv.locator('.pc-q').innerText(), '');
    if (aroundQuestion.includes(answer) && answer.length > 3) fail(`the TV shows the answer before it is judged: ${answer}`);
    if (!/Read this to/.test(await reader.locator('.pc').innerText())) fail('the next player is not asked to read');
    if (!checkedSecret) { await shot(tv, 'question'); await shot(reader, 'phone-reader'); await shot(me, 'phone-answering'); checkedSecret = true; }
    const right = i === champion;
    await reader.getByRole('button', { name: right ? /Right/ : /Wrong/ }).click();
    questions++;
    await until(async () => /RIGHT|NOT QUITE|WINS/.test(await tvText()), 'the verdict on the TV');
    if (!(await tvText()).includes(answer)) fail('the TV does not show the answer once it is judged');
    t = await tvText();
    if (/wins the .* wedge/.test(t) && !wedgeSeen) { wedgeSeen = true; await shot(tv, 'wedge'); }
    if (/WINS!/.test(t)) return { i, won: true };
    return { i, right };
  }

  // Play until the first player has won a wedge: they head for any headquarters whose wedge they lack.
  const towardHq = (ids, texts) => ids[texts.findIndex((x) => /win the wedge/.test(x))] ?? ids[0];
  for (let n = 0; n < 40 && !wedgeSeen; n++) await turn(towardHq);
  if (!wedgeSeen) fail('nobody won a wedge in 40 rolls');
  if ((await wedgesOf(champion)) < 1) fail('the first player has no wedge on their phone');

  // The TV page is reloaded mid-game: it picks up where it was. While it is down, the first player is given the other
  // wedges in the saved game (playing out every one would take minutes), so the end game can be played for real.
  await until(async () => (await tvText()).includes('turn: roll the die') || /rolls again/.test(await tvText()), 'a turn to begin');
  await sleep(600);   // the TV saves the room a moment after each change
  const saved = JSON.parse(await tv.evaluate(() => localStorage.getItem('gn-tv-room')));
  const champId = saved.game.order.find((id) => saved.players.find((p) => p.id === id)?.name === names[champion]);
  saved.game.wedges[champId] = [0, 1, 2, 3, 4, 5];
  // Close the TV, then write the edit from another page on the same site, so the closing TV cannot save over it.
  await tv.close();
  const writer = await tvCtx.newPage();
  await writer.goto(`${base}/menu.css`);
  await writer.evaluate((text) => { localStorage.setItem('gn-tv-room', text); }, JSON.stringify(saved));
  await writer.close();
  tv = await tvCtx.newPage(); watch(tv, 'tv (reloaded)');
  await tv.goto(`${base}/tv?game=piechase`);
  await until(async () => (await tv.locator('.pc-tv .pc-unit').count()) === 3, 'the reloaded TV to show the game');
  if ((await tv.locator('.roomcode').count())) fail('the reloaded TV went back to the lobby');
  await until(async () => /6 wedges/.test(await tv.locator('.pc-unit').nth(saved.game.order.indexOf(champId)).innerText()), 'the first player with six wedges');
  await shot(tv, 'six-wedges');

  // Now the first player heads for the hub (any roll that lands on it, else the space nearest it); the others get it wrong.
  const towardHub = (ids, texts, i) => (i !== champion ? ids[0] : ids.includes(HUB) ? HUB : ids.slice().sort((a, b) => distance(a, HUB) - distance(b, HUB))[0]);
  let won = false;
  for (let n = 0; n < 60 && !won; n++) won = !!(await turn(towardHub)).won;
  if (!won) fail('the first player did not win within 60 rolls');
  await shot(tv, 'win');
  await until(async () => /WINNER/.test(await tvText()), 'the winner screen', 10000);
  await shot(tv, 'gameover');
  await shot(phones[champion], 'phone-gameover');
  if (!(await phones[champion].locator('.pc').innerText()).includes('That’s you')) fail('the winner’s phone does not say they won');
  console.log(`${questions} questions; ${names[champion]} won`);
  // Only the first player to join can start again.
  await phones[0].getByRole('button', { name: /play again/i }).click();
  await until(async () => (await tv.locator('.pc-lobby').count()) > 0, 'Play again to return to the lobby');
  console.log('Pie Chase played through three phones and the TV page');
} catch (e) { if (!problems.length) fail(e.message); }
await browser.close(); sb.close(); site.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nOK');
process.exit(problems.length ? 1 : 0);

// Plays a whole game of Guys vs Gals in a real browser (Chromium via Playwright): the website's TV page runs the game,
// three phones join through a stand-in for Supabase Realtime and pick their sides, and the trophy tug of war is played
// out: the readers judge on their phones (the Guys always right, the Gals always wrong), Our Lives secrets are picked and
// guessed, charades are called, the Guys throw one challenge, and the Guys pull three trophies home. Then a pawn race,
// picked on the first player's phone, which the Guys win.
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
  const tvTabs = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const tv = await tvTabs.newPage(); watch(tv, 'tv');
  await tv.goto(`${base}/tv?game=guysvsgals`);
  await until(async () => (await tv.locator('.gv-lobby .roomcode').count()) > 0, 'the TV lobby with a room code');
  const code = (await tv.locator('.roomcode').innerText()).trim();
  const tvText = async () => (await tv.locator('.gv-tv').evaluate((e) => e.textContent));
  // A second TV tab in the same browser shares the room. It must not run a second copy of the game (the phones would
  // flip between the two copies' questions): it waits, and stays out of the room.
  const tv2 = await tvTabs.newPage(); watch(tv2, 'second tv');
  await tv2.goto(`${base}/tv?game=guysvsgals`);
  await until(async () => (await tv2.locator('.tv-second').count()) > 0, 'the second TV tab to say the game is open elsewhere');
  for (const p of players) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); watch(page, p.name);
    await page.goto(`${base}/?r=${code}`);
    await until(async () => (await page.locator('input').count()) > 0, `${p.name}'s join form`);
    await page.locator('input').first().fill(p.name);
    await page.getByRole('button', { name: /^join$/i }).click();
    await until(async () => (await page.locator('.gv-sides').count()) > 0, `${p.name}'s side picker`);
    if (p.name === 'Ann') await shot(page, 'phone-pick-side');
    if (p.name === 'Ann') {
      const href = await page.locator('.gv-another').getAttribute('href');
      if (!/[?&]seat=2\b/.test(href ?? '')) throw new Error(`"Add another player on this phone" should open seat 2, got ${href}`);
    }
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

  const ann = players[0].page;
  const bo = players[1].page;
  const pages = players.map((p) => p.page);
  const tvState = () => tv.locator('.gv-tv').evaluate((e) => {
    const card = e.querySelector('.gv-card');
    return {
      phase: [...e.classList].find((c) => c.startsWith('phase-'))?.slice(6) ?? 'lobby',
      turn: e.querySelector('.gv-team.turn, .gv-bteam.turn')?.classList.contains('guys') ? 'guys' : e.querySelector('.gv-team.turn, .gv-bteam.turn') ? 'gals' : null,
      n: card?.dataset.n ?? null, deck: [...(card?.classList ?? [])].find((c) => c.startsWith('deck-'))?.slice(5) ?? null,
      challenged: !!e.querySelector('.gv-stamp'), answer: !!e.querySelector('.gv-answer'), pic: !!e.querySelector('.gv-card .gv-pic'),
      sig: `${[...e.classList].join(' ')}|${card?.dataset.n}|${card?.querySelector('.gv-foot')?.textContent ?? ''}|${!!e.querySelector('.gv-stamp')}`,
    };
  });
  /** The first phone showing `sel`, or null. */
  const phoneWith = async (sel) => { for (const pg of pages) if (await pg.locator(sel).count()) return pg; return null; };
  await until(async () => (await tvState()).phase === 'card', 'the first card');
  const decks = new Set();
  let cards = 0;
  let challenged = false;
  let trophies = 0;
  let last = null;
  const end = Date.now() + 6 * 60_000;
  while (Date.now() < end) {
    const st = await tvState();
    const was = last; last = st.phase;
    if (st.phase === 'gameover') break;
    if (st.phase === 'trophy') { if (was !== 'trophy' && !trophies++) await shot(tv, 'trophy'); await sleep(150); continue; }
    if (st.phase === 'result') {
      if (cards === 1) await shot(tv, 'result');
      const move = ann.getByRole('button', { name: /^Move on$/ });
      if (await move.count()) { await ann.locator('details.gv-pcard summary', { hasText: 'gone quiet' }).click().catch(() => {}); await move.click().catch(() => {}); }
      await sleep(150);
      continue;
    }
    if (st.phase !== 'card') { await sleep(150); continue; }
    if (st.answer) fail('the TV shows the answer before the card is judged');
    decks.add(st.deck);
    if (st.deck === 'pics' && !st.pic) fail('an Our Pics card without its picture');
    const guysTurn = st.turn === 'guys';
    let acted = false;
    // The Guys throw one challenge on a spoken card of theirs; the Gals then answer it themselves (and get it). Only the
    // reader's phone ever shows the answer, so the Gal who answers has not seen it.
    if (guysTurn && !challenged && ['facts', 'stuff', 'pics'].includes(st.deck) && (await ann.locator('.gv-challenge').count())) {
      await shot(ann, 'phone-challenge');
      const readers = [];
      for (const p of players.slice(1)) if (await p.page.locator('.gv-pans').count()) readers.push(p.name);
      if (readers.length !== 1) fail(`exactly one Gal (the reader) should see the answer, saw ${readers.length}`);
      await ann.locator('.gv-challenge').click(); challenged = true; acted = true;
    } else if (await phoneWith('.gv-judge:not(.three) button.yes')) {
      const judge = await phoneWith('.gv-judge:not(.three) button.yes');
      if (st.challenged) await shot(tv, 'challenge');
      if (!cards) { await shot(tv, 'card'); await shot(judge, 'phone-reader'); }
      if (st.deck === 'pics') { await shot(tv, 'pics'); }
      // Normal: right for the Guys, wrong for the Gals. Challenged (the Guys answer): they got it.
      await judge.locator(st.challenged || guysTurn ? 'button.yes' : 'button.no').click(); acted = true;
    } else if (await phoneWith('button.gv-pchoice[data-i]')) {
      const pg = await phoneWith('button.gv-pchoice[data-i]');
      const text = await pg.locator('.gv').innerText();
      if (/secretly tap/.test(text)) { await shot(tv, 'lives'); await pg.locator('button.gv-pchoice[data-i="0"]').click(); acted = true; }
      else {
        // Guessing: the reader picked A. The Guys guess right, the Gals wrong.
        for (const p of players) if (await p.page.locator('button.gv-pchoice[data-i]').count()) await p.page.locator(`button.gv-pchoice[data-i="${p.side === 'guys' ? 0 : 1}"]`).click().catch(() => {});
        acted = true;
      }
    } else if (await phoneWith('button.gv-pchoice[data-pid]')) {
      await (await phoneWith('button.gv-pchoice[data-pid]')).locator('button.gv-pchoice[data-pid]').first().click(); acted = true;
    } else if (await phoneWith('.gv-judge.three')) {
      await shot(tv, 'moves');
      const caller = await phoneWith('.gv-judge.three');
      if (!(await phoneWith('.gv-move'))) fail('nobody’s phone shows the charade');
      await caller.locator('.gv-judge.three button[data-side="guys"]').click(); acted = true;
    }
    if (!acted) { await sleep(120); continue; }
    if (['facts', 'stuff', 'pics'].includes(st.deck)) cards++;
    await until(async () => (await tvState()).sig !== st.sig, 'the TV to move on', 10000);
  }
  for (const d of ['facts', 'stuff', 'pics', 'lives', 'moves']) if (!decks.has(d)) fail(`never played an ${d} card`);
  if (trophies !== 3) fail(`the Guys should win three trophies, saw ${trophies}`);
  if (!challenged) fail('never challenged');
  await until(async () => (await tv.locator('.gv-win').count()) > 0, 'the winner screen', 20000);
  await shot(tv, 'win');
  const t = await tvText();
  if (!/THE GUYS WIN/.test(t)) fail(`the Guys should win: ${t.slice(0, 200)}`);
  await shot(ann, 'phone-gameover');
  if (!(await ann.locator('.gv').innerText()).includes('your team')) fail('the winner’s phone does not say they won');
  console.log(`decks played: ${[...decks].join(', ')}; ${trophies} trophies won`);
  await ann.getByRole('button', { name: /rematch/i }).click();
  await until(async () => (await tv.locator('.gv-lobby').count()) > 0, 'Rematch to return to the lobby');
  console.log('Guys vs Gals played through three phones and the TV page');

  // ---- The pawn race: Ann picks it in the lobby, the Guys get every question right and the Gals none. ----
  if (await players[1].page.locator('button[data-mode="race"]').count()) fail('only the first player picks the game');
  await ann.locator('button[data-mode="race"]').click();
  await until(async () => /The race/.test(await tvText()), 'the TV lobby to show the race rules');
  await shot(tv, 'race-lobby');
  await ann.getByRole('button', { name: /start the battle/i }).click();
  await until(async () => (await tv.locator('.gv-board .gv-dot').count()) > 0, 'the race board');
  let wilds = 0;
  let questions = 0;
  let across = 0;
  const raceEnd = Date.now() + 6 * 60_000;
  while (Date.now() < raceEnd) {
    if (await tv.locator('.gv-win').count()) break;
    const st = await tvState();
    if (st.phase === 'result') {
      if (await tv.locator('.gv-wildcard').count()) { if (!wilds++) await shot(tv, 'race-wild'); }
      if (/PAWN IS ACROSS/.test(await tv.locator('.gv-verdict').innerText().catch(() => ''))) across++;
      const move = ann.getByRole('button', { name: /^Move on$/ });
      if (await move.count()) { await ann.locator('details.gv-pcard summary', { hasText: 'gone quiet' }).click().catch(() => {}); await move.click().catch(() => {}); }
      await until(async () => (await tvState()).sig !== st.sig, 'the race to move on', 10000);
      continue;
    }
    if (st.phase !== 'card') { await sleep(120); continue; }
    if (st.answer) fail('the TV shows the answer before the question is judged');
    if (!(await tv.locator('.gv-qcount').count())) fail('the race card does not say which question it is');
    const judge = await phoneWith('.gv-judge:not(.three) button.yes');
    if (!judge) { await sleep(120); continue; }
    if (!questions++) { await shot(tv, 'race-card'); await shot(judge, 'race-phone-reader'); }
    if (await phoneWith('.gv-challenge')) fail('a challenge button in the race');
    await judge.locator(st.turn === 'guys' ? 'button.yes' : 'button.no').click();
    await until(async () => (await tvState()).sig !== st.sig, 'the TV to show the result', 10000);
  }
  await until(async () => (await tv.locator('.gv-win').count()) > 0, 'the race winner screen', 20000);
  await shot(tv, 'race-win');
  if (!/THE GUYS WIN/.test(await tvText())) fail('the Guys should win the race');
  if (!wilds) fail('never drew a wild card in the race');
  console.log(`race: ${questions} questions, ${wilds} wild cards, ${across} pawns across before the last`);

  // The second tab sat out the whole game. When the first tab closes it takes over, in the same room.
  if (!(await tv2.locator('.tv-second').count())) fail('the second TV tab joined in while the first was open');
  await tv.close();
  await until(async () => (await tv2.locator('.gv-tv').count()) > 0, 'the second TV tab to take over');
  const menuText = await tv2.locator('.tvmenu-panel').evaluate((e) => e.textContent);
  if (!menuText.includes(code)) fail(`the tab that took over is not in room ${code}`);
} catch (e) { if (!problems.length) fail(e.message); }
await browser.close(); sb.close(); site.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nOK');
process.exit(problems.length ? 1 : 0);

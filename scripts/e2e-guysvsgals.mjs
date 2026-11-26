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
const shot = async (page, name) => { if (!process.env.SHOT_DIR || shots.has(name)) return; shots.add(name); await page.waitForTimeout(1200); await page.screenshot({ path: `${process.env.SHOT_DIR}/guysvsgals-${name}.png`, fullPage: /phone/.test(name) }); };
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
  let mcSeen = false; let mcMarked = false;
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
      if ((await tv.locator('.gv-card .gv-choice').count()) && (await tv.locator('.gv-card .gv-choice.right').count()) === 1) { mcMarked = true; await shot(tv, 'choices-result'); }
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
      // Multiple choice: A, B and C are on the TV and the reader's phone, and nothing is marked until it is judged.
      if (await tv.locator('.gv-card .gv-choice').count()) {
        if ((await tv.locator('.gv-card .gv-choice').count()) !== 3) fail('a multiple choice card needs A, B and C on the TV');
        if (await tv.locator('.gv-card .gv-choice.right').count()) fail('the TV marks the right choice before the card is judged');
        if ((await judge.locator('.gv-pchoice').count()) !== 3) fail('the reader does not see the three choices');
        await shot(tv, 'choices'); await shot(judge, 'phone-choices');
        mcSeen = true;
      }
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
    } else if (await phoneWith('button.gv-ready')) {
      // Charades: the two actors read what to act out, and the clock waits until both have pressed Start.
      const first = await phoneWith('button.gv-ready');
      if (!(await first.locator('.gv-move').count())) fail('an actor cannot see what to act out before the clock starts');
      if (await phoneWith('.gv-judge.three')) fail('the charade can be called before it has started');
      await shot(tv, 'moves-ready'); await shot(first, 'phone-moves-ready');
      if (!/GET READY/i.test(await tvText())) fail('the TV does not say to get ready');
      await first.locator('button.gv-ready').click();
      await until(async () => (await first.locator('.gv-ready-wait').count()) > 0 || (await phoneWith('.gv-judge.three')) !== null, 'the first actor to be ready');
      const second = await phoneWith('button.gv-ready');
      if (second) await second.locator('button.gv-ready').click();
      await until(async () => (await phoneWith('.gv-judge.three')) !== null, 'the charade to start once both are ready');
      acted = true;
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
  if (mcSeen && !mcMarked) fail('a multiple choice card never marked its right answer on the TV');
  for (const d of ['facts', 'stuff', 'pics', 'moves']) if (!decks.has(d)) fail(`never played an ${d} card`);
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

  // ---- Which questions: new games start on the grown-up set, and the first player can switch sets from a phone. ----
  const other = players[1].page;
  await until(async () => /Questions: Grown-Ups Night/.test(await other.locator('.gv').innerText()), 'the other phones to say which questions are in play');
  if (await other.locator('button[data-set]').count()) fail('only the first player picks the questions');
  await ann.locator('button[data-set="family"]').click();
  await until(async () => !/Grown-Ups/.test(await other.locator('.gv').innerText()) && /Questions: /.test(await other.locator('.gv').innerText()), 'the Family set to be picked from a phone');
  await ann.locator('button[data-set="grownups"]').click();
  await until(async () => /Questions: Grown-Ups Night/.test(await other.locator('.gv').innerText()), 'the grown-up set to be picked again');
  await shot(ann, 'lobby-sets');

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
  let picks = 0;
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
    // Right: the team at play picks the space its pawn steps onto, from the lettered lit spaces on the TV.
    const lit = await tv.locator('.gv-dot.next[data-k]').evaluateAll((els) => els.map((e) => ({ k: e.dataset.k, x: e.dataset.x, row: e.dataset.row, wild: e.classList.contains('wild') })));
    if (lit.length) {
      const picker = await phoneWith('.gv-step');
      if (!picker) { await sleep(120); continue; }
      const side = players.find((p) => p.page === picker).side;
      if (side !== st.turn) fail(`a ${side} phone can pick the ${st.turn}' space`);
      for (const p of players) if (p.side !== st.turn && (await p.page.locator('.gv-step, button.gv-mdot').count())) fail(`${p.name} is not on the team at play but can pick a space`);
      const keys = await picker.locator('.gv-step').evaluateAll((els) => els.map((e) => e.dataset.k));
      if (keys.join() !== lit.map((l) => l.k).join()) fail(`the phone offers spaces ${keys} but the TV lights ${lit.map((l) => l.k)}`);
      if ((await picker.locator('button.gv-mdot').count()) !== lit.length) fail('the little board on the phone does not light the same spaces');
      if (lit.length !== 2 && lit.length !== 6) fail(`expected two spaces to pick from (six from START), saw ${lit.length}`);
      if (!picks) { await shot(tv, 'race-pick'); await shot(picker, 'race-phone-pick'); }
      // Take the last one; every other time, by tapping the space on the phone's little board instead of its button.
      const want = lit[lit.length - 1];
      await (picks++ % 2 ? picker.locator(`button.gv-mdot[data-k="${want.k}"]`) : picker.locator(`.gv-step[data-k="${want.k}"]`)).click();
      await until(async () => (await tvState()).phase !== 'card' || !(await tv.locator('.gv-dot.next[data-k]').count()), 'the pawn to step', 10000);
      // (A wild space draws a wild card, which can move the pawn on at once: only a plain space is checked.)
      if (!want.wild && !(await tv.locator(`.gv-dot[data-x="${want.x}"][data-row="${want.row}"] .gv-dot-pawn`).count())) fail(`the pawn did not step onto the space that was picked (${want.k})`);
      continue;
    }
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
  if (picks < 6) fail(`the Guys should have picked their space after each right answer, saw ${picks} picks`);
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

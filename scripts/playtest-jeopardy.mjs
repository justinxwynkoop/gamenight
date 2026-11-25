// Plays whole games of Jeopardy in real time, the way a family does: the website's TV page runs the game, four phones
// join through a stand-in for Supabase Realtime and play like people (slow and fast thumbs, right and wrong answers,
// Daily Doubles, Final Jeopardy). Writes a timeline of what the TV and every phone showed, and when, so pacing and dead
// air can be read afterwards; with SHOT_DIR it also saves a screenshot at each change.
//
//   MODE=host     (default) a host page runs the game: players say picks and answers out loud, the host taps them
//   MODE=captain  "a host judges out loud" with no host page: the first phone to join is the host
//   MODE=typed    no host: phones pick and type their answers, the game judges them
//   CHAOS=1       things that go wrong at a real game night, part way through: a phone reloads, a second TV tab is
//                 opened and closed, a phone loses Wi-Fi for half a minute, and (MODE=host) the host's phone sleeps
//
//   node scripts/playtest-jeopardy.mjs [clues per round, default 5] [games, default 1]
// Checks as it goes, and fails on: a page error, a phone with an answer box or a Daily Double bet while a host is in
// (only Final Jeopardy is typed), a phone whose clue changes under it, the game sitting on one screen with nobody to
// move it on, or a whole game that does not reach the champion.
import http from 'node:http';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.env.NO_BUILD !== '1') await import('./build-web.mjs');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? 'playwright');
const CLUES = Number(process.argv[2] ?? 5);
const GAMES = Number(process.argv[3] ?? 1);
const MODE = process.env.MODE ?? 'host';
const CHAOS = process.env.CHAOS === '1';
const SHOTS = process.env.SHOT_DIR ? path.resolve(process.env.SHOT_DIR) : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

// --- a stand-in for Supabase Realtime, with a little network delay like the real one ---
// It also keeps the last view the TV sent each client, so the script can check what every screen was told.
const LAG = Number(process.env.LAG ?? 60);
const views = new Map();        // client id -> last game view sent to it
let hostClient = null;
const sb = new WebSocketServer({ port: 0 });
await new Promise((r) => sb.on('listening', r));
const offline = new Set();      // sockets whose page has "lost Wi-Fi": nothing in or out
sb.on('connection', (sock) => {
  sock.topics = new Set();
  sock.on('message', (raw) => {
    if (offline.has(sock)) return;
    const m = JSON.parse(raw.toString());
    if (m.event === 'phx_join') { sock.topics.add(m.topic); sock.send(JSON.stringify({ topic: m.topic, event: 'phx_reply', ref: m.ref, payload: { status: 'ok', response: {} } })); }
    else if (m.event === 'heartbeat') sock.send(JSON.stringify({ topic: 'phoenix', event: 'phx_reply', ref: m.ref, payload: { status: 'ok', response: {} } }));
    else if (m.event === 'broadcast' && sock.topics.has(m.topic)) {
      const p = m.payload?.payload;
      if (p?.m?.t === 'hello' && p.m.role === 'host') hostClient = p.c;
      const parts = m.topic.split(':');
      if (parts.length === 4 && p?.t === 'state' && p.view?.game) views.set(parts[3], p.view.game);
      setTimeout(() => { for (const o of sb.clients) if (o !== sock && !offline.has(o) && o.topics.has(m.topic) && o.readyState === 1) o.send(JSON.stringify({ topic: m.topic, event: 'broadcast', payload: m.payload })); }, LAG);
    }
  });
});
const relay = { url: `http://127.0.0.1:${sb.address().port}`, key: 'sb_publishable_test' };

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.png': 'image/png', '.woff2': 'font/woff2' };
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
const until = async (fn, what, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return; } catch { /* moved on */ } await sleep(80); } fail(`timed out: ${what}`); throw new Error(what); };

const browser = await chromium.launch();
const watch = (page, who) => {
  page.on('pageerror', (e) => fail(`${who} page error: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_|raw\.githubusercontent|WebSocket/.test(m.text())) fail(`${who} console error: ${m.text()}`); });
};

// What a screen shows, in one line (for the timeline).
const tvLine = (tv) => tv.evaluate(() => {
  const txt = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
  const main = document.querySelector('.bw-stage main');
  const el = main?.firstElementChild ?? document.getElementById('app').firstElementChild;
  const tag = document.querySelector('.bw-stage .roundtag')?.innerText ?? '';
  const guide = document.querySelector('.guide')?.innerText ?? '';
  return `${tag ? `[${tag}] ` : ''}${(el?.className ?? '?').split(' ')[0]} | ${txt((main ?? el)?.innerText).slice(0, 120)}${guide ? ` || ${txt(guide).slice(0, 110)}` : ''}`;
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
const hostLine = (p) => p.evaluate(() => {
  const t = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
  return `${t(document.querySelector('.main')?.innerText).slice(0, 120)} || dock: ${t(document.querySelector('.dock')?.innerText).slice(0, 80)}`;
});

let shotN = 0;
let stopped = false;
let phones = [];
let host = null;
let tv = null;
const lastChange = new Map();
async function observer() {
  const last = new Map();
  while (!stopped) {
    const items = [['TV', tv, tvLine], ...phones.map((p) => [p.name, p.page, phoneLine]), ...(host ? [['host', host, hostLine]] : [])];
    for (const [who, page, fn] of items) {
      let line; try { line = await fn(page); } catch { continue; }
      // Countdown numbers change every second; leave them out of "did the screen change".
      const key = line.replace(/\d+(\.\d+)?s?\b/g, '#');
      if (last.get(who) !== key) {
        last.set(who, key); lastChange.set(who, Date.now()); log(who, line);
        if (SHOTS) { const n = String(++shotN).padStart(3, '0'); setTimeout(() => page.screenshot({ path: path.join(SHOTS, `${n}-${who}.png`) }).catch(() => {}), 700); }
      }
    }
    await sleep(120);
  }
}

// ---------- checks, from what the TV told each screen ----------
const seenClues = new Map();   // phone name -> { key: clue position, q }
const phaseSince = { phase: '', at: Date.now() };
async function checker() {
  while (!stopped) {
    await sleep(250);
    const tvView = [...views.values()][0];
    const any = hostClient ? views.get(hostClient) : tvView;
    for (const p of phones) {
      if (p.away) continue;
      try {
        const own = views.get(p.client) ?? any;   // what the TV last told this phone
        const phase = own?.phase;
        if (own?.hostJudges && MODE !== 'typed' && phase && !phase.startsWith('final') && (await p.page.locator('.jp-answer.on').count())) fail(`${p.name} has an answer box while a host judges (${phase})`);
        if (own?.hosted && phase === 'dd-wager' && (await p.page.locator('.jp-wager .jp-btn.huge').count())) fail(`${p.name} has Daily Double bet buttons while a host page is in`);
        // The clue on a phone never changes while it is up (two engines answering one room would flip it).
        const meta = await p.page.locator('.jp-body .jp-meta').first().innerText({ timeout: 100 }).catch(() => null);
        const q = await p.page.locator('.jp-body .jp-clue').first().innerText({ timeout: 100 }).catch(() => null);
        if (meta && q) {
          const k = `${any?.round}-${meta.replace(/\s+/g, ' ')}`;
          const was = seenClues.get(p.name);
          if (was && was.k === k && was.q !== q && !/Bet /.test(meta)) fail(`${p.name}'s clue changed under them: "${was.q.slice(0, 40)}" -> "${q.slice(0, 40)}"`);
          seenClues.set(p.name, { k, q });
        }
      } catch { /* the page moved on */ }
    }
    // Dead air: one phase for a long time while nobody has anything to do.
    const ph = any?.phase;
    if (ph !== phaseSince.phase) { phaseSince.phase = ph; phaseSince.at = Date.now(); }
    const limit = { 'round-intro': 12000, reading: 30000, open: 12000, answering: 50000, ruling: 6000, reveal: 9000, 'dd-answer': 70000 }[ph];
    if (limit && Date.now() - phaseSince.at > limit && !phaseSince.flagged) { phaseSince.flagged = true; fail(`stuck in ${ph} for ${(limit / 1000).toFixed(0)}s`); }
    if (ph !== phaseSince.flaggedPhase) { phaseSince.flaggedPhase = ph; phaseSince.flagged = false; }
  }
}

// The answer to the clue on screen (the host page shows it; with no host the script peeks at the pack through the view).
const hostAnswer = async () => { try { return (await host.locator('.answer b').first().innerText({ timeout: 300 })).trim(); } catch { return ''; } };

let seed = Number(process.env.SEED ?? 7); const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const SKILL = { Jason: 0.75, Justin: 0.6, Mom: 0.45, Kid: 0.3 };

/** One phone, playing like a person: skill decides how fast they buzz and how often they know it. */
async function playPhone(p) {
  const { page, skill } = p;
  while (!stopped) {
    await sleep(150);
    if (p.away) continue;
    try {
      const mini = page.locator('.jp-body button.jp-pval');
      if (await mini.count()) {
        await sleep(900 + rng() * 1800);   // looking over the board
        const n = await mini.count(); if (!n) continue;
        await mini.nth(Math.floor(rng() * n)).click({ timeout: 1000 });
        await page.locator('.jp-go').click({ timeout: 1000 });
        log(p.name, '(taps a clue)');
        await sleep(800);
        continue;
      }
      const live = page.locator('.jp-buzzer.live');
      if (await live.count()) {
        if (rng() > 0.35 + skill * 0.6) { await sleep(1500); continue; }   // doesn't know it: no buzz this time
        await sleep(150 + (1 - skill) * 900 * rng());
        if (await live.count()) { await page.locator('.jp-buzzwrap').dispatchEvent('pointerdown'); log(p.name, '(buzzes)'); }
        await sleep(300);
        continue;
      }
      // Sometimes a thumb lands a moment before the buzzer turns gold.
      if ((await page.locator('.jp-buzzer.wait').count()) && rng() < 0.01) { await page.locator('.jp-buzzwrap').dispatchEvent('pointerdown'); log(p.name, '(buzzes too early)'); await sleep(400); continue; }
      const box = page.locator('.jp-answer.on input.jp-in');
      if (await box.count()) {
        const ans = (host ? await hostAnswer() : '') || p.answerFor?.() || '';
        await sleep(1500 + rng() * 2500);  // thinking and typing
        const right = rng() < skill && ans;
        const text = right ? ans.replace(/^(the|a|an) /i, '') : ['no idea', 'paris', 'elvis', 'pass'][Math.floor(rng() * 4)];
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

/** The host page, run like a person: reads the clue out, opens the buzzers, rules on what is said, types the bets. */
async function playHost() {
  const dockBtn = (label) => host.locator('.dock button', { hasText: label }).first();
  while (!stopped) {
    await sleep(200);
    if (hostAsleep) continue;
    const g = views.get(hostClient);
    if (!g) continue;
    try {
      if (g.phase === 'board') {
        // Now and then the pick is a Daily Double (only the host can see where they are), so those get played too.
        const tiles = host.locator(rng() < 0.35 && (await host.locator('.jp-gridpick button.jp-pval.dd').count()) ? '.jp-gridpick button.jp-pval.dd' : '.jp-gridpick button.jp-pval');
        if (!(await tiles.count())) continue;
        await sleep(1200 + rng() * 1500);   // the player says their pick
        const n = await tiles.count(); if (!n) continue;
        await tiles.nth(Math.floor(rng() * n)).click({ timeout: 800 });
        await sleep(500);
        await host.locator('.jp-go').click({ timeout: 800 });
        log('host', '(opens the clue that was called)');
        await waitPhaseChange('board');
      } else if (g.phase === 'reading') {
        await sleep(2000 + String(g.clue?.q ?? '').length * 45);   // reading it out loud
        if (views.get(hostClient)?.phase !== 'reading') continue;
        await dockBtn('Open buzzers').click({ timeout: 800 });
        log('host', '(opens the buzzers)');
        await waitPhaseChange('reading');
      } else if (g.phase === 'answering' || g.phase === 'dd-answer') {
        const who = g.phase === 'answering' ? g.clue.buzzedId : g.controllerId;
        const name = g.players.find((x) => x.id === who)?.name;
        await sleep(1200 + rng() * 2000);   // they say it
        const now = views.get(hostClient);
        if (now?.phase !== g.phase) continue;
        const right = rng() < (SKILL[name] ?? 0.5);
        await dockBtn(right ? 'Correct' : 'Wrong').click({ timeout: 800 });
        log('host', `(rules ${name} ${right ? 'Correct' : 'Wrong'})`);
        await waitPhaseChange(g.phase);
      } else if (g.phase === 'dd-wager') {
        await sleep(1500 + rng() * 1500);
        const max = Math.max(g.players.find((x) => x.id === g.controllerId)?.score ?? 0, 1000 * g.round);
        const amt = Math.round((rng() * max) / 100) * 100;
        await host.locator('input[data-k="dd-wager"]').fill(String(amt));
        await dockBtn('Place this bet').click({ timeout: 800 });
        log('host', `(types the bet: $${amt})`);
        await waitPhaseChange('dd-wager');
      } else if (g.phase === 'final-wager') {
        const b = dockBtn('Show the clue');
        if (await b.count() && !(await b.isDisabled())) { await sleep(1000); await b.click(); log('host', '(shows the final clue)'); await waitPhaseChange('final-wager'); }
      }
    } catch { /* the host page moved on */ }
  }
}
async function waitPhaseChange(from) { const end = Date.now() + 8000; while (Date.now() < end && views.get(hostClient)?.phase === from) await sleep(100); }

/** The captain's phone, when it is the host (MODE=captain). */
async function playCaptainHost(p) {
  const { page } = p;
  const capBtn = (label) => page.locator('.jp-captain button', { hasText: label }).first();
  while (!stopped) {
    await sleep(200);
    const g = views.get(p.client);
    if (!g || p.away) continue;
    try {
      if (g.phase === 'board' && (await page.locator('.jp-gridpick button.jp-pval').count())) {
        await sleep(1200 + rng() * 1500);
        const tiles = page.locator('.jp-gridpick button.jp-pval');
        const n = await tiles.count(); if (!n) continue;
        await tiles.nth(Math.floor(rng() * n)).click({ timeout: 800 });
        await sleep(500);
        await page.locator('.jp-go').click({ timeout: 800 });
        log(p.name, '(host: opens the clue that was called)');
        await sleep(1000);
      } else if (g.phase === 'reading' && (await capBtn('Open buzzers').count())) {
        await sleep(2000 + String(g.clue?.q ?? '').length * 45);
        await capBtn('Open buzzers').click({ timeout: 800 });
        log(p.name, '(host: opens the buzzers)');
        await sleep(800);
      } else if ((g.phase === 'answering' || g.phase === 'dd-answer') && (await capBtn('Correct').count())) {
        const who = g.phase === 'answering' ? g.clue.buzzedId : g.controllerId;
        const name = g.players.find((x) => x.id === who)?.name;
        await sleep(1200 + rng() * 2000);
        const right = rng() < (SKILL[name] ?? 0.5);
        await capBtn(right ? 'Correct' : 'Wrong').click({ timeout: 800 });
        log(p.name, `(host: rules ${name} ${right ? 'Correct' : 'Wrong'})`);
        await sleep(800);
      }
    } catch { /* moved on */ }
  }
}

let hostAsleep = false;
async function chaos(at) {
  if (!CHAOS) return;
  const victim = phones[2];
  if (at === 2) {
    log('CHAOS', `${victim.name} reloads their phone`);
    await victim.page.reload();
    await until(async () => (await victim.page.locator('.jp').count()) > 0, `${victim.name} back in the game after a reload`);
    log('CHAOS', `${victim.name} is back`);
  } else if (at === 3) {
    log('CHAOS', 'someone opens the TV page in a second tab');
    const tv2 = await tv.context().newPage(); watch(tv2, 'tv2');
    await tv2.route('https://raw.githubusercontent.com/**', (r) => r.abort());
    await tv2.goto(`${base}/tv?game=jeopardy`);
    await sleep(6000);
    const txt = await tv2.locator('body').innerText().catch(() => '');
    log('CHAOS', `second tab says: ${txt.replace(/\s+/g, ' ').slice(0, 100)}`);
    await tv2.close();
    log('CHAOS', 'second tab closed');
  } else if (at === 4) {
    log('CHAOS', `${victim.name}'s phone loses Wi-Fi for 30s`);
    victim.away = true;
    for (const s of victim.socks()) offline.add(s);
    await sleep(30000);
    for (const s of victim.socks()) offline.delete(s);
    // A phone that lost Wi-Fi gets a new connection when it comes back; the page reconnects by itself.
    victim.away = false;
    log('CHAOS', `${victim.name}'s Wi-Fi is back`);
    await until(async () => [...views.values()].some((g) => g.players?.find((x) => x.name === victim.name)?.connected), `${victim.name} to show as connected again`, 30000);
    log('CHAOS', `${victim.name} is connected again`);
  } else if (at === 6 && MODE === 'host') {
    log('CHAOS', 'the host\'s phone goes to sleep for 30s');
    hostAsleep = true;
    await host.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); });
    for (const s of socksOf(host)) offline.add(s);
    await sleep(30000);
    for (const s of socksOf(host)) offline.delete(s);
    hostAsleep = false;
    log('CHAOS', 'the host\'s phone wakes up');
  }
}
// Which server sockets belong to a page: the ones opened most recently by it (tracked through a page-side marker).
const sockOwners = new Map();
sb.on('connection', (sock, req) => { sockOwners.set(sock, req.headers['user-agent'] ?? ''); });
const socksOf = (page) => [...sb.clients].filter((s) => sockOwners.get(s) === page.__ua);

try {
  const ctx = (ua) => browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: ua });
  const tvCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, userAgent: 'tv' });
  tv = await tvCtx.newPage(); tv.__ua = 'tv'; watch(tv, 'tv');
  await tv.route('https://raw.githubusercontent.com/**', (r) => r.abort());
  await tv.goto(`${base}/tv?game=jeopardy`);
  await until(async () => (await tv.locator('.roomcode').count()) > 0, 'the TV lobby');
  const code = (await tv.locator('.roomcode').innerText()).trim();
  await tv.getByRole('button', { name: /menu/i }).click();
  const pin = (await tv.locator('.tvmenu-panel').innerText()).match(/Host PIN\s*(\d{4})/)?.[1];
  await tv.getByRole('button', { name: /menu/i }).click();

  for (const name of ['Jason', 'Justin', 'Mom', 'Kid']) {
    const c = await ctx(`phone-${name}`);
    const page = await c.newPage(); page.__ua = `phone-${name}`; watch(page, name);
    await page.goto(`${base}/?r=${code}`);
    await until(async () => (await page.locator('input').count()) > 0, `${name}'s join form`);
    await page.locator('input').first().fill(name);
    await page.getByRole('button', { name: /join/i }).first().click();
    await until(async () => /YOU’RE IN/.test(await page.locator('body').innerText()), `${name} to join`);
    const p = { name, page, skill: SKILL[name], socks: () => socksOf(page) };
    phones.push(p);
  }
  // Which relay client each phone is (to read the view the TV sent it).
  await sleep(1500);
  for (const [id, g] of views) for (const p of phones) if (g.me && g.players.find((x) => x.id === g.me.id)?.name === p.name) p.client = id;
  // With no host, the script knows the answers from the TV's own view of the clue at the reveal; for typing it asks the
  // host page if there is one, else answers from what it has learned (so right answers happen with no host too).
  const learned = new Map();
  // The house packs are the only questions here (the real-show archive is not downloaded), so the answers are known.
  const { HOUSE_PACKS } = await import('../games/jeopardy/packs/index.js');
  for (const { data } of HOUSE_PACKS) {
    for (const c of data.categories ?? []) for (const cl of c.clues ?? []) learned.set(cl.q, cl.a);
    for (const f of data.finals ?? []) learned.set(f.q, f.a);
  }
  setInterval(() => { for (const g of views.values()) if (g.clue?.answer) learned.set(g.clue.q, g.clue.answer); }, 200);
  for (const p of phones) p.answerFor = () => { const g = views.get(p.client); return g?.clue?.q ? (learned.get(g.clue.q) ?? '') : ''; };

  if (MODE === 'host') {
    const hc = await ctx('host');
    host = await hc.newPage(); host.__ua = 'host'; watch(host, 'host');
    await host.goto(`${base}/host?r=${code}`);
    await until(async () => (await host.locator('input').count()) > 0, 'the host PIN form');
    await host.locator('input').first().fill(pin); await host.keyboard.press('Enter');
    await until(async () => /jeopardy/i.test(await host.locator('body').innerText()), 'the host controls');
  }
  const captain = phones[0];
  const capBtn = (label) => captain.page.locator('.jp-captain button', { hasText: label }).first();
  if (MODE === 'captain') {
    const toggle = captain.page.locator('button', { hasText: 'A host judges out loud' }).first();
    await until(async () => (await toggle.count()) > 0, 'the host-judges switch on the captain phone');
    await toggle.click();
    await until(async () => /You’re the host/.test(await captain.page.locator('body').innerText()), 'the captain phone saying they are the host');
  }

  observer();
  checker();
  phones.forEach((p) => playPhone(p));
  if (MODE === 'host') playHost();
  // The captain hosts from their phone (MODE=captain), or stands in while the host's phone sleeps (MODE=host).
  if (MODE !== 'typed') playCaptainHost(captain);

  const tap = async (label, where = 'captain') => {
    if (where === 'host') { while (hostAsleep) await sleep(200); const b = host.locator('.dock button', { hasText: label }).first(); await until(async () => (await b.count()) > 0, `${label} on the host page`, 60000); await b.click(); }
    else { const b = capBtn(label); await until(async () => (await b.count()) > 0, `${label} on the captain phone`, 60000); await b.click(); }
    log('SCRIPT', `(taps ${label})`);
  };
  const by = MODE === 'host' ? 'host' : 'captain';
  let clueNo = 0;
  for (let game = 1; game <= GAMES; game++) {
    log('SCRIPT', `--- game ${game} (${MODE}${CHAOS ? ', chaos' : ''}) ---`);
    await tap(by === 'host' ? 'Start game' : 'Start game', by);
    for (let round = 1; round <= 2; round++) {
      await until(async () => (await tv.locator('.board .tile').count()) >= 25, `round ${round} board`, 30000);
      let played = 0; let lastUsed = -1;
      while (played < CLUES) {
        await sleep(500);
        const used = await tv.locator('.board .tile.used').count().catch(() => lastUsed);
        if (used !== lastUsed) { if (lastUsed >= 0) { played += used - lastUsed; clueNo += used - lastUsed; chaos(clueNo).catch((e) => fail(`chaos: ${e.message}`)); } lastUsed = used; }
      }
      // End the round early, from the board.
      await until(async () => views.get(hostClient ?? captain.client)?.phase === 'board', 'the board, to end the round', 90000);
      if (by === 'host') { await tap('End the round now', 'host'); await host.locator('.sheet button', { hasText: 'End round' }).first().click(); }
      else { captain.page.once('dialog', (d) => d.accept()); await tap('End round early'); }
      log('SCRIPT', `(ends round ${round} early)`);
      await sleep(3000);
      await tap(by === 'host' ? (round === 1 ? 'Start the next round' : 'On to Final Jeopardy') : 'Continue', by);
    }
    if (by === 'captain') {
      // The captain shows the final clue once everyone has bet.
      await until(async () => { const f = views.get(captain.client)?.final; return f && f.wagered.length >= f.eligible.length; }, 'every final wager', 60000);
      await sleep(1500);
      await tap('Continue');
    }
    await until(async () => [...views.values()].some((g) => g.phase === 'gameover'), 'the end of the game', 240000);
    await until(async () => /champion/i.test(await tv.locator('#app').innerText()), 'the champion screen', 10000);
    await sleep(4000);
    if (game < GAMES) await tap('Play again', by);
  }
} catch (e) { if (!problems.length) fail(e.message); }
stopped = true;
await sleep(500);
if (process.env.TIMELINE) writeFileSync(process.env.TIMELINE, timeline.join('\n') + '\n');
await browser.close(); sb.close(); site.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nOK');
process.exit(problems.length ? 1 : 0);

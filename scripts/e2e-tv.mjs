// Drives the website's TV page in a real browser (Chromium via Playwright): the page runs the game engine itself, the
// way the Apple TV app does, and phones join it through a stand-in for Supabase Realtime. Checks that a TV with nothing
// but a web browser can host Jeopardy: lobby with QR and room code, the PIN in the corner menu, phones joining, the
// board, a clue with the buzzer, and the reveal.
//   node scripts/e2e-tv.mjs            (SHOT_DIR=<folder> saves screenshots of the TV)
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
const shot = (page, name) => (process.env.SHOT_DIR ? page.screenshot({ path: `${process.env.SHOT_DIR}/tv-${name}.png` }) : null);

try {
  const tv = await browser.newPage({ viewport: { width: 1280, height: 720 } }); watch(tv, 'tv');
  // No clue archive from the internet here: the TV gets a small made-up season instead, so the test stays offline.
  const header = 'round\tclue_value\tdaily_double_value\tcategory\tcomments\tanswer\tquestion\tair_date\tnotes';
  const rows = [];
  for (const [topic, word] of [['history', 'Kings'], ['movies', 'Movies']]) {
    for (let c = 0; c < 13; c++) for (let r = 0; r < 5; r++) rows.push(['1', String((r + 1) * 200), '0', `${word} ${topic} ${c}`, '', `A ${word.toLowerCase()} clue ${c}-${r}`, `Answer ${c}-${r}`, '2005-01-01', ''].join('\t'));
  }
  await tv.route('https://raw.githubusercontent.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/plain', body: [header, ...rows].join('\n') }));
  await tv.goto(`${base}/tv?game=jeopardy`);
  await until(async () => (await tv.locator('.roomcode').count()) > 0, 'the TV lobby with a room code');
  const code = (await tv.locator('.roomcode').innerText()).trim();
  if (!/^\d{4}$/.test(code)) fail(`room code looks wrong: ${code}`);
  await until(async () => (await tv.locator('.qr-big img').getAttribute('src'))?.startsWith('data:image/svg'), 'the QR code drawn in the page');
  await tv.getByRole('button', { name: /menu/i }).click();
  const pin = (await tv.locator('.tvmenu-panel').innerText()).match(/Host PIN\s*(\d{4})/)?.[1];
  if (!pin) fail('no host PIN in the TV menu');
  await tv.getByRole('button', { name: /menu/i }).click();
  console.log(`TV page hosts room ${code}; the PIN is in the corner menu`);

  const join = async (name) => {
    const p = await browser.newPage({ viewport: { width: 390, height: 780 } }); watch(p, name);
    await p.goto(`${base}/?r=${code}`);
    await until(async () => (await p.locator('input').count()) > 0, `${name}'s join form`);
    await p.locator('input').first().fill(name);
    await p.getByRole('button', { name: /join|play|enter|ready/i }).first().click();
    await until(async () => (await tv.locator('.seat', { hasText: name }).count()) > 0, `${name} on the TV lobby`);
    return p;
  };
  const ann = await join('Ann');
  const bo = await join('Bo');
  console.log('two phones joined the browser TV');
  await shot(tv, 'lobby');

  const host = await browser.newPage({ viewport: { width: 390, height: 780 } }); watch(host, 'host');
  await host.goto(`${base}/host?r=${code}`);
  await until(async () => (await host.locator('input').count()) > 0, 'the host PIN form');
  await host.locator('input').first().fill(pin);
  await host.keyboard.press('Enter');
  await until(async () => /jeopardy/i.test(await host.locator('body').innerText()), 'the host controls');
  console.log('host page unlocked with the PIN from the TV menu');

  // With a host connected there is no captain, and the TV lobby shows only who has joined: the topics are the host's to choose.
  await until(async () => /host starts the game/i.test(await ann.locator('.jp').innerText()), 'the phones to say the host runs the game');
  await until(async () => /host is running this game/i.test(await tv.locator('body').innerText()), 'the TV lobby to say a host is running the game');
  if (await tv.getByRole('button', { name: 'Choose questions' }).count()) fail('the TV lobby still offers the topics with a host connected');
  if (/captain/i.test(await ann.locator('.jp').innerText())) fail('a phone still shows a captain with a host connected');
  console.log('with a host connected: no captain, and the TV lobby shows only who has joined');
  // Once the host page goes away (the relay drops a quiet client after about 25 seconds) the captain and the chooser come back.
  await host.close();
  await until(async () => /captain/i.test(await ann.locator('.jp').innerText()), 'the captain to come back once the host is gone', 60000);
  await until(async () => (await tv.getByRole('button', { name: 'Choose questions' }).count()) > 0, 'the TV to offer the topics again', 10000);
  console.log('host gone: the captain and the TV\'s question chooser are back');
  // The TV lobby's question chooser: three shelves (real show, family packs, your games), and the website's TV can
  // switch a pack on or off itself.
  await tv.getByRole('button', { name: 'Choose questions' }).click();
  await until(async () => (await tv.locator('.lb-packs .pk-tab').count()) >= 2 && await tv.locator('.lb-packs').isVisible(), 'the question chooser on the TV lobby');
  await shot(tv, 'lobby-packs');
  await tv.locator('.pk-tab', { hasText: 'Your games' }).click();
  await until(async () => (await tv.locator('.pk-games .pk-game').count()) > 1, 'your games (the boards from the editor) on the TV');
  if (!(await tv.locator('.pk-game .pk-cats span').count())) fail('your games do not list their categories');
  await shot(tv, 'lobby-your-games');
  await tv.locator('.pk-tab', { hasText: 'Family packs' }).click();
  await until(async () => (await tv.locator('.pk-grid .pk-card').count()) > 0, 'the family packs on the TV');
  if (!/new/i.test(await tv.locator('.pk-grid .pk-card').first().innerText())) fail('a pack does not say how much of it is new');
  const off = tv.locator('.pk-grid .pk-card:not(.on)').first();
  if (await off.count()) {
    const title = (await off.locator('b').innerText()).trim();
    await off.click();
    await until(async () => (await tv.locator('.pk-grid .pk-card.on', { hasText: title }).count()) > 0, `the TV to switch on the ${title} pack`);
    console.log(`the TV switched on the ${title} pack`);
  }
  await tv.locator('.pk-tab', { hasText: 'Real show' }).click();
  await until(async () => (await tv.locator('.pk-grid .pk-card', { hasText: 'History' }).count()) > 0, 'the real-show topics on the TV');
  await shot(tv, 'lobby-real-show');
  // The board preview: twelve categories, each one says whether it is new to this TV; clicking one swaps it.
  await tv.getByRole('button', { name: /preview and swap/i }).click();
  await until(async () => (await tv.locator('.pk-draftrow .pk-cat').count()) === 12, 'the board preview on the TV');
  await shot(tv, 'lobby-preview');
  const firstCat = await tv.locator('.pk-draftrow .pk-cat span').first().innerText();
  await tv.locator('.pk-draftrow .pk-cat').first().click();
  await until(async () => (await tv.locator('.pk-draftrow .pk-cat span').first().innerText()) !== firstCat, 'a category swapped on the TV');
  console.log('the TV previewed the board and swapped a category');
  await ann.getByRole('button', { name: /start game/i }).click();
  await until(async () => (await tv.locator('.board .tile').count()) >= 25, 'the board on the TV');
  await shot(tv, 'board');
  if (!(await tv.locator('.controls button', { hasText: /end round/i }).count())) fail('the TV has no controls of its own on the board');
  console.log('the TV shows the board');

  // Whoever is in control picks the top-left clue on their phone.
  const picker = async () => ((await ann.locator('button.jp-pval').count()) > 0 ? ann : (await bo.locator('button.jp-pval').count()) > 0 ? bo : null);
  await until(async () => !!(await picker()), 'the clue picker on the picker\'s phone');
  await (await picker()).locator('.jp-pcat:not([data-media]) button.jp-pval').first().click();   // a plain clue, not a sound or video one
  await until(async () => (await tv.locator('.board .tile.peek').count()) === 1, 'the chosen clue glowing on the TV');
  await shot(tv, 'board-peek');
  await (await picker()).locator('.jp-go').click();
  await until(async () => (await tv.locator('.card .rail, .dd').count()) > 0, 'the clue on the TV');
  if (await tv.locator('.dd').count()) {
    console.log('(that was a Daily Double; skipping the buzzer part)');
  } else {
    await until(async () => (await tv.locator('.card .go').count()) > 0, 'the TV to say Buzz in', 15000);
    await shot(tv, 'buzz-in');
    await ann.locator('.jp-buzzer').dispatchEvent('pointerdown');
    await until(async () => (await tv.locator('.card .buzzer').count()) > 0, 'the TV to show who buzzed');
    await shot(tv, 'answering');
    await until(async () => (await ann.locator('.jp-answer.on input.jp-in').count()) > 0, 'the answer box');
    await ann.locator('.jp-answer.on input.jp-in').fill('no idea');
    await ann.getByRole('button', { name: /lock it in/i }).click();
    console.log('Ann buzzed and answered; waiting for the reveal');
  }
  await until(async () => (await tv.locator('.card .ans').count()) > 0, 'the reveal with the answer on the TV', 30000);
  await shot(tv, 'reveal');
  console.log('the TV showed the reveal');

  // The TV can end the game under way: everyone is back in the lobby, still in the room.
  tv.once('dialog', (d) => d.accept());
  await tv.locator('.controls button', { hasText: /^end game$/i }).click();
  await until(async () => (await tv.locator('.seat', { hasText: 'Ann' }).count()) > 0 && (await tv.locator('.board .tile').count()) === 0, 'the lobby again after End game');
  await until(async () => /captain/i.test(await ann.locator('.jp').innerText()), 'the captain lobby on Ann\'s phone after End game');
  console.log('End game on the TV brought the TV and phones back to the lobby');

  // A new room code starts an empty room: nobody from the old room is carried over (the page used to save the old
  // room again as it reloaded, so its players came straight back, and a phone that had played was let in by itself).
  await tv.getByRole('button', { name: /menu/i }).click();
  await tv.getByRole('button', { name: /new room code/i }).click();
  await until(async () => (await tv.locator('.roomcode').count()) > 0 && (await tv.locator('.roomcode').innerText()).trim() !== code, 'a new room code');
  await tv.waitForTimeout(1500);
  if (await tv.locator('.seat', { hasText: /Ann|Bo/ }).count()) fail('the new room still has the old room\'s players');
  const code2 = (await tv.locator('.roomcode').innerText()).trim();
  await ann.goto(`${base}/?r=${code2}`);
  await until(async () => (await ann.getByRole('button', { name: /^join$/i }).count()) > 0, 'the join form (not an automatic seat) on a phone that played in the old room');
  if (await tv.locator('.seat', { hasText: 'Ann' }).count()) fail('a phone from the old room was put in the new room by itself');
  console.log('a new room code starts with nobody in it');

  // A fresh TV with no game chosen: the lobby offers the games, and picking Family Feud switches to it.
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const tv2 = await ctx2.newPage(); watch(tv2, 'tv2');
  await tv2.goto(`${base}/tv`);
  await until(async () => (await tv2.locator('.gamepick button').count()) === 3, 'the game picker on a fresh TV');
  await until(async () => (await tv2.locator('.mn-join .roomcode').count()) > 0, 'the room code on the main menu');
  // A TV remote in a TV's browser sends arrow keys: they move the highlight (Enter opens the game).
  await until(async () => (await tv2.locator('.gamecard.sel').getAttribute('aria-label')) === 'Jeopardy', 'Jeopardy highlighted first');
  await tv2.keyboard.press('ArrowRight');
  await until(async () => (await tv2.locator('.gamecard.sel').getAttribute('aria-label')) === 'Family Feud', 'the right arrow highlighting Family Feud');
  await shot(tv2, 'main-menu-feud');
  await tv2.keyboard.press('ArrowLeft');
  await tv2.waitForTimeout(1500);   // let the entrance animation finish
  await shot(tv2, 'main-menu');
  // The theme loops on the main menu too, once a click has let the browser play sound.
  await tv2.mouse.click(5, 5);
  await until(async () => (await tv2.evaluate(async () => (await import('/audio.js')).audio.musicOwner)) === 'lobby:', 'the theme music on the main menu', 15000);
  console.log('the main menu plays the theme');
  await tv2.getByRole('button', { name: 'Family Feud' }).click();
  await until(async () => (await tv2.locator('.gamepick').count()) === 0 && /team/i.test(await tv2.locator('.lobby').innerText()), 'the Family Feud lobby (pick a team)');
  await shot(tv2, 'feud-lobby');
  console.log('a fresh TV offered the games and switched to Family Feud');
} catch (e) { if (!problems.length) fail(e.message); }
await browser.close(); sb.close(); site.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nOK');
process.exit(problems.length ? 1 : 0);

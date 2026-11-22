// Plays a whole game of Spy Night in a real browser (Chromium via Playwright): the website's TV page runs the game, five phones
// join through a stand-in for Supabase Realtime, see their roles, pick teams, vote and play mission cards.
//   node scripts/e2e-spynight.mjs            (SHOT_DIR=<folder> saves screenshots of the TV and a phone)
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


const names = ['Ann', 'Bo', 'Cy', 'Di', 'Ed'];
const shot = (page, name) => (process.env.SHOT_DIR ? page.screenshot({ path: `${process.env.SHOT_DIR}/spynight-${name}.png` }) : null);
try {
  const tv = await browser.newPage({ viewport: { width: 1280, height: 720 } }); watch(tv, 'tv');
  await tv.goto(`${base}/tv?game=spynight`);
  await until(async () => (await tv.locator('.roomcode').count()) > 0, 'the TV lobby with a room code');
  const code = (await tv.locator('.roomcode').innerText()).trim();
  await shot(tv, 'lobby');
  const phones = [];
  for (const name of names) {
    const p = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 }); watch(p, name);
    await p.goto(`${base}/?r=${code}`);
    await until(async () => (await p.locator('input').count()) > 0, `${name}'s join form`);
    await p.locator('input').first().fill(name);
    await p.getByRole('button', { name: /^join$/i }).click();
    await until(async () => (await p.locator('.sn').count()) > 0, `${name}'s Spy Night lobby`);
    phones.push(p);
  }
  await until(async () => /Ready to deal/.test(await tv.locator('.sn-tv').innerText()), 'the TV to say it is ready to deal');
  await shot(phones[0], 'phone-lobby');
  // Only the first player may deal.
  if (await phones[1].getByRole('button', { name: /deal the roles/i }).count()) fail('a player who joined second can deal');
  await phones[0].getByRole('button', { name: /deal the roles/i }).click();

  // Everyone looks at their role, then taps Got it.
  const roles = [];
  for (const p of phones) {
    await p.locator('button.sn-role').click();
    await until(async () => (await p.locator('.sn-role.spy, .sn-role.resistance').count()) > 0, 'the role to show');
    roles.push((await p.locator('.sn-role').getAttribute('class')).includes('spy') ? 'spy' : 'resistance');
    if (await p.locator('.sn-role .sn-mates span').count()) fail('the role card shows the other Spies without the button');
    if (p === phones[0]) await shot(p, 'phone-role');
    await p.getByRole('button', { name: /got it/i }).click();
  }
  const spies = roles.filter((r) => r === 'spy').length;
  if (spies !== 2) fail(`five players should have 2 Spies, got ${spies}`);
  // A Spy sees the other Spy; the Resistance sees nobody.
  for (const [i, p] of phones.entries()) {
    await p.locator('.sn-peek').click();
    // The other Spies are behind a button, so a glance at the screen does not give them away.
    if (await p.locator('.sn-peekbox .sn-mates span').count()) fail(`${names[i]} sees the other Spies before pressing the button`);
    const button = p.locator('.sn-peekbox').getByRole('button', { name: /show the other/i });
    if ((await button.count()) !== (roles[i] === 'spy' ? 1 : 0)) fail(`${names[i]} (${roles[i]}) has ${await button.count()} buttons for the other Spies`);
    if (roles[i] === 'spy') await button.click();
    const mates = await p.locator('.sn-peekbox .sn-mates span').count();
    if (mates !== (roles[i] === 'spy' ? 1 : 0)) fail(`${names[i]} (${roles[i]}) sees ${mates} fellow Spies`);
    await p.locator('.sn-peekbox').click({ position: { x: 5, y: 5 } });   // the dark edge closes it
  }
  await until(async () => /is picking/.test(await tv.locator('.sn-tv').innerText()), 'the TV to move on to picking a team');
  // The TV never shows a role.
  const tvText = async () => (await tv.locator('.sn-tv').innerText());
  if (/\b(SPY|RESISTANCE)\b/.test((await tvText()).replace(/Spies|Resistance|rejected/gi, ''))) fail('the TV shows a role');

  const leaderPhone = async () => { for (const p of phones) if (await p.locator('.sn-pick').count()) return p; return null; };
  const missions = [];
  let guard = 0;
  while (guard++ < 12) {
    try { await until(async () => (await tvText()).includes('is picking') || /\bWINS?\b/.test(await tvText()), 'a leader to pick or the game to end'); } catch (e) { console.error('TV says:', JSON.stringify(await tvText()), 'after', missions); throw e; }
    if (/\bWINS?\b/.test(await tvText())) break;
    const lead = await leaderPhone();
    if (!lead) { await new Promise((r) => setTimeout(r, 100)); continue; }
    const heading = await lead.locator('.sn-card h2').first().innerText(); const need = Number((heading.match(/pick (\d)/i) ?? (console.error('heading:', JSON.stringify(heading)), []))[1]);
    // Put every Spy on the team first so the Spies can win quickly.
    const order = [...phones.keys()].sort((a, b) => (roles[a] === 'spy' ? -1 : 1) - (roles[b] === 'spy' ? -1 : 1));
    for (const i of order.slice(0, need)) await lead.locator('.sn-pick button').nth(i).click();
    await shot(lead, 'phone-pick');
    await lead.getByRole('button', { name: /send this team to a vote/i }).click();
    await until(async () => (await tvText()).includes('Approve or reject'), 'the vote to start');
    await shot(tv, 'vote');
    for (const p of phones) await p.getByRole('button', { name: /^Approve/ }).click();
    await until(async () => /TEAM APPROVED/.test(await tvText()), 'the team to be approved');
    await shot(tv, 'vote-result');
    await until(async () => (await tvText()).includes('on the mission'), 'the mission to start', 15000);
    // Team members play: Spies play Fail, the Resistance play Success.
    const onTeam = [];
    for (const [i, p] of phones.entries()) if (await p.getByRole('button', { name: 'Success' }).count()) onTeam.push(i);
    for (const i of onTeam) {
      if (roles[i] === 'spy') await phones[i].getByRole('button', { name: 'Fail' }).click();
      else {
        if (!(await phones[i].getByRole('button', { name: 'Fail' }).isDisabled())) fail('the Resistance can press Fail');
        await phones[i].getByRole('button', { name: 'Success' }).click();
      }
    }
    await until(async () => /MISSION (SUCCEEDED|FAILED)/.test(await tvText()), 'the mission result', 15000);
    await shot(tv, 'mission-result');
    missions.push((await tvText()).includes('MISSION FAILED') ? 'fail' : 'success');
    await new Promise((r) => setTimeout(r, 7500));   // the result stays up for a few seconds
  }
  await until(async () => /\bWINS?\b/.test(await tvText()), 'the game to end', 15000);
  await shot(tv, 'gameover');
  const final = await tvText();
  // Under the five tiles: who went on each mission, and at the end who played Success and who played Fail.
  const lists = await tv.locator('.sn-who').allInnerTexts();
  if (lists.length < 3 || !lists.every((t) => /[✓✗]/.test(t))) fail(`the TV's lists of who went on each mission: ${JSON.stringify(lists)}`);
  if (!(await phones[0].locator('.sn-who li.fail').count())) fail('the phone does not show who played Fail at the end');
  console.log(`missions: ${missions.join(', ')}; ${final.match(/THE (SPIES|RESISTANCE) WINS?/)[0]}`);
  if (!/Spy/.test(final)) fail('the final screen does not reveal the roles');
  await phones[0].getByRole('button', { name: /play again/i }).click();
  await until(async () => /Ready to deal/.test(await tvText()), 'Play again to return to the lobby');
  console.log('Spy Night played through five phones and the TV page');
} catch (e) { if (!problems.length) fail(e.message); }
await browser.close(); sb.close(); site.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nOK');
process.exit(problems.length ? 1 : 0);

// Records what the Game Night server sends a TV, as test fixtures for Tests/GameNightCoreTests.
// It plays a scripted game (join, clues, buzzes, Daily Double, Final Jeopardy, winner)
// against the real server and saves the TV's view after each step.
//
// Use: copy this file into a checkout of github.com/justinxwynkoop/gamenight (next to
// server.js), run `npm install`, then
//     node record-fixtures.mjs /path/to/familygamenight/Tests/GameNightCoreTests/Fixtures
// It uses a throwaway data folder (data-fixture-run/) and port 3111, and copies the
// sample question set from data/jeopardy/. Three fixtures are hand-made and not
// produced here: no-game-chosen, other-game, lobby-teams (and the server picks
// Jeopardy automatically when it is the only game, so "no-game" is not recorded).
// Plays a scripted Jeopardy game against the real server and records what the TV receives.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import WebSocket from 'ws';

const OUT = process.argv[2];
const PORT = 3111;
mkdirSync(OUT, { recursive: true });
const DATA = new URL('./data-fixture-run', import.meta.url).pathname;
mkdirSync(DATA + '/jeopardy', { recursive: true });
copyFileSync(new URL('./data/jeopardy/family-night.json', import.meta.url).pathname, DATA + '/jeopardy/family-night.json');

const server = spawn('node', ['server.js'], {
  cwd: new URL('.', import.meta.url).pathname,
  env: { ...process.env, PORT: String(PORT), HOST_PIN: '1234', DATA_DIR: DATA, PUBLIC_URL: 'http://gamenight.local:3111/' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', () => {}); server.stderr.on('data', (d) => process.stderr.write(d));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1200);

const open = (hello) => new Promise((resolve) => {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  const o = { ws, last: null, msgs: [], errors: [] };
  ws.on('open', () => ws.send(JSON.stringify(hello)));
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    if (m.t === 'state') o.last = m.view; else { o.msgs.push(m); if (m.t === 'error') o.errors.push(m.message); }
    if (!o.ready) { o.ready = true; setTimeout(() => resolve(o), 100); }
  });
  o.send = (m) => ws.send(JSON.stringify(m));
});

const tv = await open({ t: 'hello', role: 'tv' });
const host = await open({ t: 'hello', role: 'host', pin: '1234' });
const saved = [];
async function snap(label) {
  await sleep(250);
  writeFileSync(`${OUT}/${label}.json`, JSON.stringify(tv.last, null, 2) + '\n');
  saved.push(label);
  const g = tv.last.game;
  console.log(label.padEnd(26), g ? `status=${g.status} step=${g.clue?.step ?? g.final?.step ?? '-'}` : 'no game');
}
async function act(action, args = {}) {
  host.errors.length = 0;
  host.send({ t: 'act', action, args });
  await sleep(250);
  if (host.errors.length) console.log(`  !! ${action}: ${host.errors.join('; ')}`);
}

await act('chooseGame', { id: 'jeopardy' });
await snap('lobby-empty');

const people = [['Leo', '#14b8a6'], ['Maya', '#f97316'], ['Dad', '#3b82f6'], ['Grandma', '#d946ef']];
const players = [];
for (const [name, color] of people) {
  const p = await open({ t: 'hello', role: 'player' });
  p.send({ t: 'join', name, color });
  await sleep(150);
  players.push(p);
}
await snap('lobby-players');
const ids = tv.last.room.units.map((u) => u.id);
console.log('units', tv.last.room.units.map((u) => `${u.id}:${u.name}`).join(' '));

await act('startGame');
await snap('board');

// A normal clue: wrong answer first, then a correct one.
await act('select', { c: 0, r: 1 });
await snap('clue-reading');
await act('openBuzzers');
await snap('clue-open');
players[1].send({ t: 'buzz' }); await sleep(250);
await snap('clue-answering');
await act('wrong');
await snap('clue-open-after-wrong');
players[0].send({ t: 'buzz' }); await sleep(250);
await act('correct');
await snap('clue-revealed-correct');
await act('closeClue');
await snap('board-after-clue');

// A skipped clue (nobody answers).
await act('select', { c: 1, r: 0 });
await act('openBuzzers');
await act('reveal');
await snap('clue-revealed-nobody');
await act('closeClue');

// Daily Double: find it from the host view.
const dd = host.last.game.dailyDoubles;
console.log('dailyDoubles', JSON.stringify(dd));
const [dc, dr] = (Array.isArray(dd[0]) ? dd[0] : String(dd[0]).split(',')).map(Number);
await act('select', { c: dc, r: dr });
await snap('dd-pick-player');
await act('setDailyDoubleUnit', { id: ids[2] });
await snap('dd-wager');
await act('setDailyDoubleWager', { amount: 400 });
await snap('dd-answering');
await act('correct');
await snap('dd-revealed');
await act('closeClue');

await act('setView', { view: 'leaderboard' });
await snap('leaderboard');
await act('setView', { view: 'board' });

// Final Jeopardy
await act('startFinal');
await snap('final-wager');
const fin = tv.last.game.final;
console.log('finalists', JSON.stringify(fin?.finalists?.map((f) => f.id)));
for (const f of fin.finalists) {
  const idx = ids.indexOf(f.id);
  players[idx].send({ t: 'final-wager', amount: 200 });
}
await sleep(300);
await snap('final-wager-locked');
await act('finalNext');
await snap('final-clue');
players[0].send({ t: 'final-answer', text: 'John Adams' });
players[2].send({ t: 'final-answer', text: 'Thomas Jefferson' });
await sleep(300);
await snap('final-clue-answered');
await act('finalNext');
await snap('final-judge');
for (const [i, f] of fin.finalists.entries()) {
  await act('finalJudge', { id: f.id, ok: i % 2 === 0 });
}
await snap('final-judged');
await act('finishFinal');
await snap('final-results');
await act('finishGame');
await snap('done');

console.log('saved:', saved.join(', '));
for (const o of [tv, host, ...players]) o.ws.close();
server.kill();
process.exit(0);

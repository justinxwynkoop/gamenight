// Records what the Game Night server sends a TV during TEAM play, as test fixtures for
// Tests/GameNightCoreTests (the companion of record-fixtures.mjs, which records individual play).
//
// Use: copy this file into a checkout of github.com/justinxwynkoop/gamenight (next to
// server.js), run `npm install`, then
//     node record-team-fixtures.mjs /path/to/familygamenight/Tests/GameNightCoreTests/Fixtures
// Six players join, so the server splits them into Red and Blue by itself. It uses a
// throwaway data folder (data-team-run/) and port 3113.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import WebSocket from 'ws';

const OUT = process.argv[2];
const PORT = 3113;
mkdirSync(OUT, { recursive: true });
const DATA = new URL('./data-team-run', import.meta.url).pathname;
mkdirSync(DATA + '/jeopardy', { recursive: true });
copyFileSync(new URL('./data/jeopardy/family-night.json', import.meta.url).pathname, DATA + '/jeopardy/family-night.json');

const server = spawn('node', ['server.js'], {
  cwd: new URL('.', import.meta.url).pathname,
  env: { ...process.env, PORT: String(PORT), HOST_PIN: '1234', DATA_DIR: DATA, PUBLIC_URL: 'http://gamenight.local:3113/' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stderr.on('data', (d) => process.stderr.write(d));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1200);

const open = (hello) => new Promise((resolve) => {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  const o = { ws, last: null, errors: [] };
  ws.on('open', () => ws.send(JSON.stringify(hello)));
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    if (m.t === 'state') o.last = m.view; else if (m.t === 'error') o.errors.push(m.message);
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
  console.log(label.padEnd(26), `mode=${tv.last.room.mode} teams=${tv.last.room.units.map((u) => `${u.name}(${u.members})`).join(' ')}`, g ? `status=${g.status}` : '');
}
async function act(action, args = {}) {
  host.errors.length = 0;
  host.send({ t: 'act', action, args });
  await sleep(250);
  if (host.errors.length) console.log(`  !! ${action}: ${host.errors.join('; ')}`);
}

await act('chooseGame', { id: 'jeopardy' });
const players = [];
for (const name of ['Ann', 'Ben', 'Cat', 'Dev', 'Eli', 'Fay']) {
  const p = await open({ t: 'hello', role: 'player' });
  p.send({ t: 'join', name });
  await sleep(150);
  players.push(p);
}
await snap('teams-lobby');
await act('setTeamCount', { count: 4 });
await snap('teams-lobby-four');
await act('setTeamCount', { count: 2 });

await act('startGame');
await snap('teams-board');
// Whichever team Ann is on answers the first clue correctly, so one team has points and the other none.
await act('select', { c: 0, r: 1 });
await act('openBuzzers');
players[0].send({ t: 'buzz' }); await sleep(250);
await snap('teams-clue-answering');
await act('correct');
await snap('teams-clue-revealed');
await act('closeClue');
await snap('teams-board-after-clue');
await act('startFinal');
await snap('teams-final-wager');

console.log('saved:', saved.join(', '));
for (const o of [tv, host, ...players]) o.ws.close();
server.kill();
process.exit(0);

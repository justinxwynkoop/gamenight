// Records what the Game Night server sends a TV during a TWO-ROUND game (Jeopardy! then Double Jeopardy!),
// as test fixtures for Tests/GameNightCoreTests. Companion of record-fixtures.mjs.
//
// Use: copy this file into a checkout of github.com/justinxwynkoop/gamenight (next to server.js), run
// `npm install`, then
//     node record-round-fixtures.mjs /path/to/familygamenight/Tests/GameNightCoreTests/Fixtures
// It uses a throwaway data folder (data-round-run/) and port 3114.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import WebSocket from 'ws';

const OUT = process.argv[2];
const PORT = 3114;
mkdirSync(OUT, { recursive: true });
const root = new URL('.', import.meta.url).pathname;
const DATA = root + 'data-round-run';
mkdirSync(DATA + '/jeopardy', { recursive: true });
for (const f of ['family-night', 'around-the-usa']) copyFileSync(`${root}data/jeopardy/${f}.json`, `${DATA}/jeopardy/${f}.json`);

const server = spawn('node', ['server.js'], { cwd: root, env: { ...process.env, PORT: String(PORT), HOST_PIN: '1234', DATA_DIR: DATA, PUBLIC_URL: 'http://gamenight.local:3114/' }, stdio: ['ignore', 'pipe', 'pipe'] });
server.stderr.on('data', (d) => process.stderr.write(d));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1200);

const open = (hello) => new Promise((resolve) => {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  const o = { ws, last: null };
  ws.on('open', () => ws.send(JSON.stringify(hello)));
  ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.t === 'state') o.last = m.view; if (!o.ready) { o.ready = true; setTimeout(() => resolve(o), 100); } });
  o.send = (m) => ws.send(JSON.stringify(m));
});
const tv = await open({ t: 'hello', role: 'tv' });
const host = await open({ t: 'hello', role: 'host', pin: '1234' });
for (const name of ['Ann', 'Ben']) { const p = await open({ t: 'hello', role: 'player' }); p.send({ t: 'join', name }); await sleep(150); }
const act = async (action, args = {}) => { host.send({ t: 'act', action, args }); await sleep(250); };
const snap = async (label) => { await sleep(250); writeFileSync(`${OUT}/${label}.json`, JSON.stringify(tv.last, null, 2) + '\n'); console.log(label.padEnd(24), `round=${tv.last.game?.round}/${tv.last.game?.rounds} ${tv.last.game?.roundTitle ?? ''}`); };

await act('setSettings', { rounds: 2 });
await act('chooseSet', { id: 'family-night', round: 1 });
await act('chooseSet', { id: 'around-the-usa', round: 2 });
await snap('rounds-lobby');
await act('startGame');
await snap('rounds-board-1');
await act('startRound2');
await snap('rounds-board-2');
server.kill();
process.exit(0);

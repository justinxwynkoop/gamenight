// Records what the Game Night server sends a TV while Family Feud is played, as test fixtures for
// Tests/GameNightCoreTests (companion of record-fixtures.mjs).
//
// Use: copy this file into a checkout of github.com/justinxwynkoop/gamenight (next to server.js), run
// `npm install`, then
//     node record-feud-fixtures.mjs /path/to/familygamenight/Tests/GameNightCoreTests/Fixtures
// It uses a throwaway data folder (data-feud-run/) and port 3115. Four players join and are dealt onto
// Red and Blue by the server.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import WebSocket from 'ws';

const OUT = process.argv[2];
const PORT = 3115;
mkdirSync(OUT, { recursive: true });
const root = new URL('.', import.meta.url).pathname;
const DATA = root + 'data-feud-run';
mkdirSync(DATA + '/feud', { recursive: true });
copyFileSync(`${root}data/feud/family-night-basics.json`, `${DATA}/feud/family-night-basics.json`);

const server = spawn('node', ['server.js'], { cwd: root, env: { ...process.env, PORT: String(PORT), HOST_PIN: '1234', DATA_DIR: DATA, PUBLIC_URL: 'http://gamenight.local:3115/' }, stdio: ['ignore', 'pipe', 'pipe'] });
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
for (const name of ['Ann', 'Ben', 'Cat', 'Dev']) { const p = await open({ t: 'hello', role: 'player' }); p.send({ t: 'join', name }); await sleep(120); }
const act = async (action, args = {}) => { host.send({ t: 'act', action, args }); await sleep(220); };
const snap = async (label) => { await sleep(200); writeFileSync(`${OUT}/${label}.json`, JSON.stringify(tv.last, null, 2) + '\n'); console.log(label.padEnd(26), tv.last.game?.status, tv.last.game?.round?.step ?? tv.last.game?.fm?.step ?? ''); };

await act('chooseGame', { id: 'feud' });
await snap('feud-lobby');
const [red, blue] = tv.last.room.units.map((u) => u.id);
await act('startGame');
await snap('feud-faceoff');
await act('openBuzzers');
await snap('feud-faceoff-open');
await act('awardBuzz', { id: red });
await snap('feud-faceoff-turn');
await act('answer', { index: 1 });
await snap('feud-faceoff-second');
await act('answer', { index: 0 });                 // blue's better answer wins the face-off
await snap('feud-choose');
await act('choose', { play: true });
await snap('feud-play');
await act('answer', { index: 2 });
await snap('feud-play-answer');
await act('miss'); await snap('feud-strike-1');
await act('miss'); await act('miss');
await snap('feud-steal');
await act('answer', { index: 3 });
await snap('feud-roundend');
await act('revealRest');
await snap('feud-roundend-all');

// Rounds 2 and 3 quickly, then round 4 (worth double).
const clear = async (team) => {
  await act('awardBuzz', { id: team }); await act('answer', { index: 0 }); await act('choose', { play: true });
  for (let i = 1; i < tv.last.game.round.answers.length; i++) await act('answer', { index: i });
};
await act('nextRound'); await clear(red); await snap('feud-round2-done');
await act('nextRound'); await clear(blue);
await act('nextRound');
await snap('feud-round4');
await clear(red);
await snap('feud-round4-done');

await act('endRounds');
await snap('feud-fm-pick');
await act('fmStart');
await snap('feud-fm-p1');
await act('fmSetAnswers', { slot: 'p1', answers: ['apple', 'dog', 'sneakers', 'kitchen', 'nap'] });
await act('fmNext');
await snap('feud-fm-p2');
await act('fmSetAnswers', { slot: 'p2', answers: ['banana', 'cat', 'socks', 'garage', 'read'] });
await act('fmNext');
await snap('feud-fm-reveal');
const rows = () => host.last.game.fm.rows;
// Each answer is revealed in two taps: what they said, then the points ("survey says").
const reveal = async (slot, q, { stop = false } = {}) => { await act('fmShowAnswer', { slot, q }); if (!stop && !rows()[q][slot].judged) await act('fmShowPoints', { slot, q }); };
await reveal('p1', 0, { stop: true });
await snap('feud-fm-said');
await act('fmShowPoints', { slot: 'p1', q: 0 });
await reveal('p2', 0);
await reveal('p1', 1);
await snap('feud-fm-partial');
for (let q = 0; q < 5; q++) for (const slot of ['p1', 'p2']) {
  if (rows()[q][slot].judged) continue;
  await reveal(slot, q);
}
await snap('feud-fm-results');
await act('finishGame');
await snap('feud-done');

// A second game where Fast Money players leave answers blank: those score 0 by themselves when revealed.
await act('endGame');
await act('startGame');
await act('adjustScore', { id: red, delta: 100 });
await act('endRounds');
await act('fmStart');
await act('fmSetAnswers', { slot: 'p1', answers: ['apple', '', 'sneakers', '', 'nap'] });
await act('fmNext');
await act('fmNext');                               // player 2 sent nothing
await act('fmShowAnswer', { slot: 'p1', q: 1 });   // a blank goes straight to its 0
await snap('feud-fm-blanks');
server.kill();
process.exit(0);

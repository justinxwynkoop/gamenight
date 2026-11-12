// Proves the online relay works against the real Supabase project: a pretend TV (the engine) and a pretend phone
// play through a random room code. Run by CI (the cloud sandbox this was written in cannot open WebSockets):
//   node scripts/relay-live.mjs
import { readFileSync } from 'node:fs';
import { WebSocket } from 'ws';
import { Realtime } from '../public/relay/phoenix.js';
import { connectRelay } from '../public/relay/client.js';
import { createEngine } from '../engine/core.js';
import { GAMES } from '../games/index.js';

const config = JSON.parse(readFileSync(new URL('../relay.config.json', import.meta.url), 'utf8'));
const feud = JSON.parse(readFileSync(new URL('../data/feud/family-night-basics.json', import.meta.url), 'utf8'));
const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
const until = async (fn, what, ms = 15000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = fn(); if (v) return v; await new Promise((r) => setTimeout(r, 25)); }
  throw new Error(`timed out waiting for ${what}`);
};

let engine;
const tv = new Realtime({ ...config, WebSocketImpl: WebSocket, onBroadcast: (t, e, p) => engine.onBroadcast(t, e, p), onStatus: (u) => log(`TV link ${u ? 'up' : 'down'}`) });
engine = createEngine({ games: GAMES, pin: '4321', now: () => performance.now(), content: { feud: { basics: feud } }, send: () => {}, broadcast: (t, e, p) => tv.send(t, e, p) });
tv.join(engine.relayTopic); tv.connect();
log(`room ${engine.code}`);

const got = { messages: [], states: [] };
const clientId = `live${Math.random().toString(36).slice(2, 10)}`;
const phone = connectRelay({ config, room: engine.code, clientId, hello: { t: 'hello', role: 'player' }, WebSocketImpl: WebSocket, onState: (v) => got.states.push(v), onMessage: (m) => got.messages.push(m) });
try {
  await until(() => got.messages.some((m) => m.t === 'need-join'), 'the TV to answer the phone');
  log('phone heard the TV');
  phone.send({ t: 'join', name: 'Live' });
  await until(() => got.messages.some((m) => m.t === 'joined'), 'the join');
  await until(() => got.states.at(-1)?.room?.me?.name === 'Live', 'the phone to see itself');
  log('phone joined and sees its own state: the relay works end to end');
  process.exitCode = 0;
} catch (e) { console.error(`FAILED: ${e.message}`); process.exitCode = 1; }
phone.close(); tv.close();
setTimeout(() => process.exit(process.exitCode), 200);

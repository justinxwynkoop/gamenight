// The online relay, end to end, against a stand-in for Supabase Realtime (a tiny Phoenix-protocol server): the TV side
// is the engine (as the Apple TV runs it) and the phone side is the browser's connectRelay.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WebSocketServer, WebSocket } from 'ws';
import { Realtime } from '../public/relay/phoenix.js';
import { connectRelay } from '../public/relay/client.js';
import { createEngine } from '../engine/core.js';
import { newRoomCode, CODE_LETTERS } from '../engine/relay.js';
import { GAMES } from '../games/index.js';

const feudSet = JSON.parse(readFileSync(new URL('../data/feud/family-night-basics.json', import.meta.url)));

/** Speaks just enough of Supabase Realtime (Phoenix protocol 1.0.0): join, heartbeat, and broadcast to the others. */
async function fakeSupabase() {
  const wss = new WebSocketServer({ port: 0 });
  await new Promise((r) => wss.on('listening', r));
  const log = { joins: [], heartbeats: 0 };
  wss.on('connection', (sock, req) => {
    log.url = req.url;
    sock.topics = new Set();
    sock.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.event === 'phx_join') {
        sock.topics.add(m.topic); log.joins.push(m.topic);
        sock.send(JSON.stringify({ topic: m.topic, event: 'phx_reply', ref: m.ref, payload: { status: 'ok', response: {} } }));
      } else if (m.event === 'heartbeat') {
        log.heartbeats++;
        sock.send(JSON.stringify({ topic: 'phoenix', event: 'phx_reply', ref: m.ref, payload: { status: 'ok', response: {} } }));
      } else if (m.event === 'broadcast' && sock.topics.has(m.topic)) {
        for (const other of wss.clients) if (other !== sock && other.topics.has(m.topic) && other.readyState === 1) other.send(JSON.stringify({ topic: m.topic, event: 'broadcast', payload: m.payload }));
      }
    });
  });
  return { url: `http://127.0.0.1:${wss.address().port}`, log, wss, close: () => { for (const c of wss.clients) c.terminate(); wss.close(); } };
}

const until = async (fn, what = 'condition') => {
  for (let i = 0; i < 200; i++) { const v = fn(); if (v) return v; await new Promise((r) => setTimeout(r, 15)); }
  assert.fail(`timed out waiting for ${what}`);
};

async function world() {
  const sb = await fakeSupabase();
  const config = { url: sb.url, key: 'sb_publishable_test' };
  let clock = 1000;
  const tvDirect = [];
  let rt; let engine;
  rt = new Realtime({ ...config, WebSocketImpl: WebSocket, onBroadcast: (t, e, p) => engine.onBroadcast(t, e, p) });
  engine = createEngine({
    games: GAMES, pin: '4321', code: 'ABCD', now: () => clock, content: { feud: { basics: feudSet } },
    send: (id, m) => tvDirect.push([id, m]),
    broadcast: (topic, event, payload) => rt.send(topic, event, payload),
  });
  rt.join(engine.relayTopic);
  rt.connect();
  const phones = [];
  const phone = (clientId, hello) => {
    const got = { states: [], messages: [], status: [] };
    const link = connectRelay({ config, room: 'ABCD', clientId, hello, WebSocketImpl: WebSocket, onState: (v) => got.states.push(v), onMessage: (m) => got.messages.push(m), onStatus: (s) => got.status.push(s), pingMs: 60, quietMs: 400 });
    phones.push(link);
    return { link, got };
  };
  return { sb, engine, rt, phone, tvDirect, advance: (ms) => { clock += ms; }, close() { phones.forEach((p) => p.close()); rt.close(); sb.close(); } };
}

test('room codes are four easy letters', () => {
  for (let i = 0; i < 50; i++) assert.match(newRoomCode(), /^[A-HJ-NP-Z]{4}$/);
  assert.equal(CODE_LETTERS.length, 24);
});

test('a phone joins by room code, plays, and the host controls the room, all through the relay', async () => {
  const w = await world();
  try {
    const ann = w.phone('annaaaaa1', { t: 'hello', role: 'player' });
    await until(() => ann.got.messages.some((m) => m.t === 'need-join'), 'the join request');
    assert.deepEqual(ann.got.status.slice(0, 1), [true], 'connected once the TV answered');
    ann.link.send({ t: 'join', name: 'Ann' });
    const joined = await until(() => ann.got.messages.find((m) => m.t === 'joined'), 'joined');
    assert.ok(joined.token);

    const host = w.phone('hostaaaa1', { t: 'hello', role: 'host', pin: '4321' });
    const first = await until(() => host.got.states.at(-1), 'the host view');
    assert.ok(first.room.games);
    host.link.act('chooseGame', { id: 'feud' });
    await until(() => host.got.states.at(-1)?.room.gameId === 'feud', 'the game to be chosen');
    await until(() => ann.got.states.at(-1)?.room.gameId === 'feud', "Ann's view to follow");
    assert.equal(ann.got.states.at(-1).room.me.name, 'Ann');
    assert.equal(first.room.players.length === 1, true);

    const bad = w.phone('wrongpin1', { t: 'hello', role: 'host', pin: '0000' });
    await until(() => bad.got.messages.some((m) => m.t === 'bad-pin'), 'the PIN to be refused');
    assert.equal(w.tvDirect.length, 0, 'relay clients are never answered through the TV-local path');
  } finally { w.close(); }
});

test('clients that go quiet are dropped, and one that comes back with its token is recognised', async () => {
  const w = await world();
  try {
    const ann = w.phone('annaaaaa2', { t: 'hello', role: 'player' });
    await until(() => ann.got.messages.some((m) => m.t === 'need-join'));
    ann.link.send({ t: 'join', name: 'Ann' });
    const { token } = await until(() => ann.got.messages.find((m) => m.t === 'joined'));
    assert.equal(w.engine.room.connected.size, 1);
    ann.link.close();
    w.advance(30_000);
    w.engine.tick();
    assert.equal(w.engine.room.connected.size, 0, 'Ann is shown as away');
    const again = w.phone('annaaaaa3', { t: 'hello', role: 'player', token });
    await until(() => again.got.states.at(-1)?.room.me?.name === 'Ann', 'Ann to be recognised by her token');
    assert.equal(w.engine.room.connected.size, 1);
  } finally { w.close(); }
});

test('junk on the room channel is ignored', async () => {
  const w = await world();
  try {
    for (const payload of [null, 5, { c: 'tv', m: { t: 'hello', role: 'host', pin: '4321' } }, { c: 'x', m: { t: 'ping' } }, { c: 'bad id!!', m: {} }, { c: 'okayclient', m: 'str' }]) {
      w.engine.onBroadcast('gn:ABCD', 'm', payload);
    }
    w.engine.onBroadcast('gn:ZZZZ', 'm', { c: 'okayclient', m: { t: 'ping' } });
    assert.equal(w.tvDirect.length, 0);
    assert.equal(w.engine.room.connected.size, 0);
  } finally { w.close(); }
});

test('the realtime client reconnects and rejoins its channels when the link drops', async () => {
  const sb = await fakeSupabase();
  try {
    const status = []; let joined = 0;
    const rt = new Realtime({ url: sb.url, key: 'k', WebSocketImpl: WebSocket, onStatus: (u) => status.push(u), onJoined: () => joined++, setTimer: (f, ms) => setTimeout(f, Math.min(ms, 30)) });
    rt.join('gn:ABCD'); rt.connect();
    await until(() => joined === 1, 'the first join');
    for (const c of sb.wss.clients) c.terminate();
    await until(() => joined === 2, 'a rejoin after the drop');
    assert.deepEqual(status.slice(0, 3), [true, false, true]);
    assert.match(sb.log.url, /apikey=k&vsn=1\.0\.0/);
    rt.close();
  } finally { sb.close(); }
});

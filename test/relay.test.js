// The online relay, end to end, against a stand-in for Supabase Realtime (a tiny Phoenix-protocol server): the TV side
// is the engine (as the Apple TV runs it) and the phone side is the browser's connectRelay.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WebSocketServer, WebSocket } from 'ws';
import { Realtime } from '../public/relay/phoenix.js';
import { connectRelay } from '../public/relay/client.js';
import { createEngine } from '../engine/core.js';
import { newRoomCode, CODE_CHARS } from '../engine/relay.js';
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
  const tvDirect = []; const saved = [];
  let rt; let engine;
  rt = new Realtime({ ...config, WebSocketImpl: WebSocket, onBroadcast: (t, e, p) => engine.onBroadcast(t, e, p) });
  engine = createEngine({
    games: GAMES, pin: '4321', code: 'ABCD', now: () => clock, content: { feud: { basics: feudSet } },
    onSetsChanged: (c) => saved.push(JSON.parse(JSON.stringify(c))),
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
  return { sb, engine, rt, phone, tvDirect, saved, advance: (ms) => { clock += ms; }, close() { phones.forEach((p) => p.close()); rt.close(); sb.close(); } };
}

test('room codes are four digits', () => {
  for (let i = 0; i < 50; i++) assert.match(newRoomCode(), /^[0-9]{4}$/);
  assert.equal(CODE_CHARS.length, 10);
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

    const lists = await host.link.rpc('listSets', { game: 'feud' });
    assert.deepEqual(lists, { ok: true, data: [{ id: 'basics', title: feudSet.title }], t: 'rpc-reply', id: lists.id });
    const one = await host.link.rpc('getSet', { game: 'feud', id: 'basics' });
    assert.equal(one.data.rounds.length, feudSet.rounds.length);
    assert.equal((await host.link.rpc('getSet', { game: 'feud', id: 'nope' })).error, 'No such set');
    assert.equal((await host.link.rpc('delete-everything', {})).error, 'Not available here');
    assert.deepEqual((await host.link.rpc('games', {})).data.map((g) => g.id), ['jeopardy', 'feud', 'spynight', 'piechase']);
    const doc = { ...feudSet, title: 'Saved from a phone' };
    assert.equal((await host.link.rpc('putSet', { game: 'feud', id: 'phone-made', doc })).ok, true);
    assert.equal((await host.link.rpc('getSet', { game: 'feud', id: 'phone-made' })).data.title, 'Saved from a phone');
    assert.match((await host.link.rpc('putSet', { game: 'feud', id: 'Bad Id', doc })).error, /lowercase/);
    assert.ok((await host.link.rpc('putSet', { game: 'feud', id: 'bad-set', doc: { title: 'x' } })).error, 'an invalid set is refused');
    assert.equal((await host.link.rpc('deleteSet', { game: 'feud', id: 'phone-made' })).ok, true);
    assert.equal((await host.link.rpc('getSet', { game: 'feud', id: 'phone-made' })).error, 'No such set');
    assert.equal(w.saved.length >= 2, true, 'the family\'s changes were handed over to be kept');
    const asked = ann.link.rpc('listSets', { game: 'feud' });   // players may not ask: no answer ever comes
    const bad = w.phone('wrongpin1', { t: 'hello', role: 'host', pin: '0000' });
    await until(() => bad.got.messages.some((m) => m.t === 'bad-pin'), 'the PIN to be refused');
    assert.equal(await Promise.race([asked, new Promise((r) => setTimeout(() => r('silent'), 150))]), 'silent');
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

test('phones carry on after the TV restarts: the new TV asks them who they are, and they say hello again', async () => {
  const sb = await fakeSupabase();
  const config = { url: sb.url, key: 'sb_publishable_test' };
  const tvUp = (saved) => {
    let engine; let text = null;
    const rt = new Realtime({ ...config, WebSocketImpl: WebSocket, onBroadcast: (t, e, p) => engine.onBroadcast(t, e, p) });
    engine = createEngine({ games: GAMES, pin: '4321', code: 'ABCD', now: () => Date.now(), saved, content: { feud: { basics: feudSet } },
      send: () => {}, save: (s) => { text = s; }, broadcast: (topic, event, payload) => rt.send(topic, event, payload) });
    rt.join(engine.relayTopic); rt.connect();
    return { engine, rt, saved: () => text };
  };
  const got = { states: [], messages: [] };
  let token = null;
  const hello = () => ({ t: 'hello', role: 'player', token });
  const link = connectRelay({ config, room: 'ABCD', clientId: 'annrestart', hello, WebSocketImpl: WebSocket, onState: (v) => got.states.push(v), onMessage: (m) => { got.messages.push(m); if (m.t === 'joined') token = m.token; }, pingMs: 40, quietMs: 400 });
  let tv = tvUp(null);
  try {
    await until(() => got.messages.some((m) => m.t === 'need-join'), 'the join request');
    link.send({ t: 'join', name: 'Ann' });
    await until(() => token, 'joined');
    await until(() => tv.saved()?.includes('Ann'), 'the room to be saved');
    const saved = tv.saved();
    tv.rt.close();
    tv = tvUp(saved);   // the TV page reloads (or the Apple TV app restarts) with the same room
    await until(() => tv.engine.room.connected.size === 1, 'Ann to be back without touching her phone');
    const before = got.states.length;
    tv.engine.room.act('chooseGame', { id: 'feud' });
    tv.engine.broadcast();
    await until(() => got.states.length > before && got.states.at(-1).room.gameId === 'feud', 'Ann to see the room change again');
    assert.equal(got.states.at(-1).room.me.name, 'Ann');
  } finally { link.close(); tv.rt.close(); sb.close(); }
});

test('clock sync: a phone learns the room clock from the quickest answer, and turns room times into its own', async () => {
  const { createClockSync } = await import('../public/relay/client.js');
  // The room's clock is 5,000ms ahead of the phone's. Messages take 30-200ms each way.
  let phone = 100;
  const room = () => phone + 5000;
  const timers = [];
  const answers = [];
  const clock = createClockSync({
    hires: () => phone,
    setTimer: (fn, ms) => timers.push({ fn, ms }),
    probe: (c) => answers.push(c),
  });
  assert.equal(clock.synced(), false);
  assert.equal(clock.now(), null);
  clock.restart();
  assert.ok(timers.length >= 5, 'a quick burst of questions');
  // Three round trips: slow out, fast back; fast both ways; slow both ways.
  for (const [out, back] of [[180, 40], [30, 32], [200, 190]]) {
    const c = phone; phone += out; const at = room(); phone += back;
    clock.answer({ c, at });
  }
  assert.equal(clock.synced(), true);
  // The quickest round trip (30 out, 32 back) decides: off by half the difference at most.
  assert.ok(Math.abs(clock.offset() - 5000) <= 1, `offset ${clock.offset()}`);
  assert.ok(Math.abs(clock.now() - room()) <= 1);
  assert.ok(Math.abs(clock.toLocal(room() + 250) - (phone + 250)) <= 1);
  assert.ok(clock.lag() > 100 && clock.lag() < 200, 'a typical one-way delay, not the best one');
  // Starting again (after a reconnect) forgets it all.
  clock.restart();
  assert.equal(clock.synced(), false);
  clock.answer({ c: 'x', at: 1 });
  assert.equal(clock.synced(), false, 'nonsense is ignored');
});

test('a view lost on the way is sent again: each ping says the last view that arrived', async () => {
  const { createRelayHost } = await import('../engine/relay.js');
  const out = [];
  const got = [];
  const relay = createRelayHost({ engine: { open() {}, close() {}, receive: (id, m) => got.push(m) }, code: 'ABCD', broadcast: (topic, event, payload) => out.push({ topic, payload }), now: () => 0 });
  const id = 'phone123';
  relay.onBroadcast('gn:ABCD', 'm', { c: id, m: { t: 'hello', role: 'player' } });
  relay.send(id, { t: 'state', view: { phase: 'open' } });
  const first = out.at(-1).payload;
  relay.send(id, { t: 'state', view: { phase: 'open' } });
  assert.equal(out.length, 1, 'a view that has not changed is not sent again');
  relay.send(id, { t: 'state', view: { phase: 'answering' } });
  const second = out.at(-1).payload;
  assert.notEqual(first.n, second.n, 'each new view has its own number');
  // The phone only got the first one: its ping says so, and the newest view comes again.
  relay.onBroadcast('gn:ABCD', 'm', { c: id, m: { t: 'ping', n: first.n } });
  assert.equal(out.length, 3);
  assert.deepEqual(out.at(-1).payload, second);
  assert.equal(out.at(-1).topic, `gn:ABCD:${id}`);
  // Up to date: nothing more. A ping from an older page (no number) gets nothing either.
  relay.onBroadcast('gn:ABCD', 'm', { c: id, m: { t: 'ping', n: second.n } });
  relay.onBroadcast('gn:ABCD', 'm', { c: id, m: { t: 'ping' } });
  assert.equal(out.length, 3);
  assert.equal(got.filter((m) => m.t === 'ping').length, 3, 'pings still reach the room');
});

test('a phone that pings the number of the last view it got: lost views come back, repeats are not shown twice', async () => {
  const w = await world();
  try {
    // Lose the next state to this phone on the way.
    const { link, got } = w.phone('lossy01', { t: 'hello', role: 'host', pin: '4321' });
    await until(() => got.states.length >= 1, 'the first view');
    const realSend = w.rt.send.bind(w.rt);
    let lose = 1;
    w.rt.send = (topic, event, payload) => { if (lose && topic.endsWith(':lossy01') && payload?.t === 'state') { lose--; return; } realSend(topic, event, payload); };
    const before = got.states.length;
    link.act('chooseGame', { id: 'feud' });
    await until(() => got.states.length > before && got.states.at(-1).room.gameId === 'feud', 'the lost view, sent again after a ping');
    const n = got.states.length;
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(got.states.length, n, 'nothing more comes while nothing changes');
  } finally { w.close(); }
});

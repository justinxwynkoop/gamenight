// The hub talks to a room with no idea how messages travel, so these tests use plain functions as the "network".
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Room } from '../room.js';
import { GAMES } from '../games/index.js';
import { createHub } from '../engine/hub.js';

const feudSet = JSON.parse(readFileSync(new URL('../data/feud/family-night-basics.json', import.meta.url)));

function setup() {
  const out = []; // [clientId, message]
  let hub;
  const room = new Room({ games: GAMES, loadContent: () => feudSet, listContent: () => [{ id: 'x', title: 'x' }], onChange: () => queueMicrotask(() => hub.broadcast()) });
  hub = createHub({ room, pinOk: (p) => p === '1234', send: (id, msg) => out.push([id, msg]), onError: () => {} });
  const to = (id) => out.filter(([c]) => c === id).map(([, m]) => m);
  const last = (id, t) => to(id).filter((m) => m.t === t).at(-1);
  const tick = () => new Promise((r) => setTimeout(r, 5));
  return { room, hub, out, to, last, tick };
}

test('a TV says hello and gets the state; the host needs the PIN', () => {
  const { hub, to } = setup();
  hub.receive('tv', { t: 'hello', role: 'tv' });
  assert.equal(to('tv')[0].t, 'state');
  assert.equal(to('tv')[0].view.room.inProgress, false);
  hub.receive('h', { t: 'hello', role: 'host', pin: 'nope' });
  assert.deepEqual(to('h'), [{ t: 'bad-pin' }]);
  hub.receive('h', { t: 'hello', role: 'host', pin: '1234' });
  assert.equal(to('h').at(-1).t, 'state');
  assert.ok(to('h').at(-1).view.room.games, 'the host view carries the game list');
  assert.equal(to('tv')[0].view.room.games, undefined, 'the TV view does not');
});

test('a player is asked to join, gets a token, and can come back with it', async () => {
  const { hub, room, last, to, tick } = setup();
  hub.receive('p1', { t: 'hello', role: 'player' });
  assert.deepEqual(to('p1')[0], { t: 'need-join' });
  hub.receive('p1', { t: 'join', name: 'Ann' });
  const { token } = last('p1', 'joined');
  assert.ok(token);
  assert.equal(room.players.length, 1);
  assert.equal(room.connected.has(room.players[0].id), true);
  await tick();
  assert.equal(last('p1', 'state').view.room.me.name, 'Ann', 'the player sees themselves in their view');
  hub.close('p1');
  assert.equal(room.connected.has(room.players[0].id), false);
  hub.receive('p2', { t: 'hello', role: 'player', token });
  assert.equal(to('p2').some((m) => m.t === 'need-join'), false, 'the token gets them back in');
  assert.equal(last('p2', 'state').view.room.me.name, 'Ann');
});

test('only the host can act; a player stays connected while one of their connections is open', async () => {
  const { hub, room, tick } = setup();
  hub.receive('p1', { t: 'hello', role: 'player' }); hub.receive('p1', { t: 'join', name: 'Ann' });
  const token = room.players[0].token;
  hub.receive('p1b', { t: 'hello', role: 'player', token });
  hub.receive('p1', { t: 'act', action: 'chooseGame', args: { id: 'feud' } });
  assert.equal(room.gameId, null, 'a player cannot choose the game');
  hub.receive('h', { t: 'hello', role: 'host', pin: '1234' });
  hub.receive('h', { t: 'act', action: 'chooseGame', args: { id: 'feud' } });
  await tick();
  assert.equal(room.gameId, 'feud');
  hub.close('p1');
  assert.equal(room.connected.has(room.players[0].id), true, 'still connected through the second connection');
  hub.close('p1b');
  assert.equal(room.connected.has(room.players[0].id), false);
});

test('every screen is told when something changes, each with its own view', async () => {
  const { hub, room, last, tick } = setup();
  hub.receive('tv', { t: 'hello', role: 'tv' });
  hub.receive('h', { t: 'hello', role: 'host', pin: '1234' });
  hub.receive('p', { t: 'hello', role: 'player' }); hub.receive('p', { t: 'join', name: 'Ann' });
  await tick();
  hub.receive('h', { t: 'act', action: 'chooseGame', args: { id: 'feud' } });
  await tick();
  assert.equal(last('tv', 'state').view.room.gameId, 'feud');
  assert.equal(last('h', 'state').view.room.gameId, 'feud');
  assert.equal(last('p', 'state').view.room.gameId, 'feud');
  assert.ok(last('p', 'state').view.room.me, 'only the player gets "me"');
  assert.equal(last('tv', 'state').view.room.me, undefined);
  assert.ok(room);
});

test('a game rule broken by the host comes back as an error, a ping as a pong, nonsense is ignored', () => {
  const { hub, to } = setup();
  hub.receive('h', { t: 'hello', role: 'host', pin: '1234' });
  hub.receive('h', { t: 'act', action: 'startGame', args: {} });   // no game chosen
  assert.equal(to('h').at(-1).t, 'error');
  hub.receive('h', { t: 'ping' });
  assert.deepEqual(to('h').at(-1), { t: 'pong' });
  const before = to('h').length;
  hub.receive('h', null); hub.receive('h', 'nope'); hub.receive('h', { t: 'who-knows' });
  assert.equal(to('h').length, before);
});

test('a buzz from a player reaches the game and its reply comes back', async () => {
  const { hub, room, to, tick } = setup();
  hub.receive('h', { t: 'hello', role: 'host', pin: '1234' });
  hub.receive('p', { t: 'hello', role: 'player' }); hub.receive('p', { t: 'join', name: 'Ann' });
  hub.receive('q', { t: 'hello', role: 'player' }); hub.receive('q', { t: 'join', name: 'Ben' });
  hub.receive('h', { t: 'act', action: 'chooseGame', args: { id: 'feud' } });
  await tick();
  room.setPlayerTeam(room.players[0].id, room.teams[0].id); room.setPlayerTeam(room.players[1].id, room.teams[1].id);   // one on each team
  hub.receive('h', { t: 'act', action: 'startGame', args: {} });
  hub.receive('h', { t: 'act', action: 'openBuzzers', args: {} });
  await tick();
  const rep = Object.values(room.game.run.faceoff.reps).find(Boolean);   // someone is always stepping up
  const id = room.players.find((x) => x.id === rep).name === 'Ann' ? 'p' : 'q';
  hub.receive(id, { t: 'buzz' });
  assert.equal(to(id).at(-1).t, 'buzz-result');
  assert.equal(to(id).at(-1).ok, true);
});

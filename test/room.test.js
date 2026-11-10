import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../room.js';
import { GameError } from '../lib.js';

// A stand-in game, to prove the room works with anything that follows the interface.
class FakeGame {
  constructor(room) { this.room = room; this.started = false; this.inited = false; }
  init() { this.inited = true; }
  inProgress() { return this.started; }
  act(action, args) {
    if (action === 'start') { this.started = true; this.room.changed(); return; }
    if (action === 'stop') { this.started = false; this.room.changed(); return; }
    if (action === 'award') { this.room.unit(args.id).score += 10; this.room.changed(); return; }
    throw new GameError(`Unknown action ${action}`);
  }
  onPlayer(player, msg) { return msg.t === 'hi' ? { t: 'hello', who: player.name } : undefined; }
  publicView() { return { game: 'fake', started: this.started }; }
  hostView() { return { ...this.publicView(), secret: 'host-only' }; }
  toJSON() { return { started: this.started }; }
  restore(d) { this.started = !!d.started; }
}
const fake = { id: 'fake', name: 'Fake Game', description: 'for tests', create: (room) => new FakeGame(room) };
const other = { ...fake, id: 'other', name: 'Other' };
const mk = () => new Room({ games: { fake, other } });

test('join rules: names unique, team required in team mode', () => {
  const room = mk();
  room.join({ name: 'Ann' });
  assert.throws(() => room.join({ name: 'ann' }), /taken/);
  assert.throws(() => room.join({ name: '  ' }), /name/i);
  room.setMode('teams');
  assert.throws(() => room.join({ name: 'Bo' }), /team/i);
  room.join({ name: 'Bo', teamId: room.teams[0].id });
  assert.equal(room.eligibleUnits().length, 1);   // only a team with someone on it can play
  assert.equal(room.units().length, 2);
});

test('the room holds at most 30 players', () => {
  const room = mk();
  for (let i = 0; i < 30; i++) room.join({ name: `P${i}` });
  assert.throws(() => room.join({ name: 'One too many' }), /full/);
});

test('choosing a game creates it; roster is locked while it is in progress', () => {
  const room = mk();
  room.join({ name: 'Ann' });
  room.chooseGame('fake');
  assert.equal(room.game.inited, true);
  room.act('start');
  assert.equal(room.inProgress(), true);
  assert.throws(() => room.chooseGame('other'), /before the game starts/);
  assert.throws(() => room.setMode('teams'), /before the game starts/);
  assert.throws(() => room.clearRoster(), /before the game starts/);
  room.act('stop');
  room.chooseGame('other');
  assert.equal(room.gameId, 'other');
  assert.throws(() => room.chooseGame('nope'), /No such game/);
});

test('re-choosing the same game keeps it (does not wipe its state)', () => {
  const room = mk();
  room.chooseGame('fake');
  const first = room.game;
  room.chooseGame('fake');
  assert.equal(room.game, first);
});

test('actions: roster ones are handled by the room, the rest by the game', () => {
  const room = mk();
  assert.throws(() => room.act('start'), /Pick a game first/);
  room.chooseGame('fake');
  room.act('addTeam', { name: 'Reds' });
  assert.equal(room.teams.length, 1);
  const p = room.join({ name: 'Ann' });
  room.act('award', { id: p.id });
  assert.equal(p.score, 10);
  room.act('adjustScore', { id: p.id, delta: -4 });
  assert.equal(p.score, 6);
  assert.throws(() => room.act('bogus'), /Unknown action/);
});

test('player messages go to the active game and its reply comes back', () => {
  const room = mk();
  const p = room.join({ name: 'Ann' });
  assert.equal(room.playerMessage(p.id, { t: 'hi' }), undefined); // no game yet
  room.chooseGame('fake');
  assert.deepEqual(room.playerMessage(p.id, { t: 'hi' }), { t: 'hello', who: 'Ann' });
  assert.equal(room.playerMessage('p999', { t: 'hi' }), undefined);
});

test('views: the host sees the roster and secrets, TV and phones do not', () => {
  const room = mk();
  room.chooseGame('fake');
  const p = room.join({ name: 'Ann' });
  const pub = room.publicView();
  const host = room.hostView();
  assert.equal(pub.game.game, 'fake');
  assert.ok(!JSON.stringify(pub).includes('host-only'));
  assert.equal(pub.room.players, undefined);
  assert.equal(pub.room.games, undefined);
  assert.equal(host.game.secret, 'host-only');
  assert.deepEqual(host.room.games.map((g) => g.id), ['fake', 'other']);
  assert.equal(host.room.players[0].name, 'Ann');
  assert.equal(room.playerView(p.id).room.me.unitId, p.id);
  assert.equal(room.playerView('p999').room.me, null);
  // tokens (a player's key) are never put in a view
  assert.ok(!JSON.stringify(host).includes(p.token));
});

test('with no game chosen the views still work', () => {
  const room = mk();
  assert.equal(room.publicView().game, null);
  assert.equal(room.hostView().game, null);
});

test('save and restore brings back the roster and the active game', () => {
  const room = mk();
  room.chooseGame('fake');
  const p = room.join({ name: 'Ann' });
  room.act('start'); room.act('award', { id: p.id });
  room.setConnected(p.id, true);
  const copy = mk();
  assert.equal(copy.restore(JSON.parse(JSON.stringify(room))), true);
  assert.equal(copy.gameId, 'fake');
  assert.equal(copy.game.started, true);
  assert.equal(copy.players[0].score, 10);
  assert.equal(copy.connected.size, 0);
  // ids keep counting up, so a new player never reuses an old id
  assert.notEqual(copy.join({ name: 'Bo' }).id, p.id);
});

test('restore ignores data from another version or an unknown game', () => {
  const room = mk();
  assert.equal(room.restore({ version: 1, players: [{ id: 'p1' }] }), false);
  assert.equal(room.restore(null), false);
  assert.equal(room.players.length, 0);
  assert.equal(room.restore({ version: 2, gameId: 'gone', players: [], teams: [] }), true);
  assert.equal(room.game, null);
});

test('removing a team puts its players back on no team', () => {
  const room = mk();
  room.setMode('teams');
  const t = room.teams[0];
  const p = room.join({ name: 'Ann', teamId: t.id });
  room.removeTeam(t.id);
  assert.equal(p.teamId, null);
});

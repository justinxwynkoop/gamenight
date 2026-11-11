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

test('join rules: names unique; in team mode you are put on a team, or on the one you ask for', () => {
  const room = mk();
  room.join({ name: 'Ann' });
  assert.throws(() => room.join({ name: 'ann' }), /taken/);
  assert.throws(() => room.join({ name: '  ' }), /name/i);
  room.setMode('teams');
  const bo = room.join({ name: 'Bo' });                        // nobody asks which team
  assert.ok(room.teams.some((t) => t.id === bo.teamId));
  const cy = room.join({ name: 'Cy', teamId: room.teams[1].id }); // a valid request is respected
  assert.equal(cy.teamId, room.teams[1].id);
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
  room.act('setMode', { mode: 'teams' });
  assert.equal(room.teams.length, 2);
  room.act('setMode', { mode: 'auto' });
  assert.equal(room.teams.length, 0);
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

// ---------- teams ----------
const names = (n, prefix = 'P') => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);
const sizes = (room) => room.teams.map((t) => room.players.filter((p) => p.teamId === t.id).length);
const onTeam = (room, p) => room.teams.find((t) => t.id === p.teamId)?.name;
function crowd(n, opts = {}) {
  const room = new Room({ games: { fake, other }, random: opts.random ?? (() => 0.5) });
  room.chooseGame('fake');
  for (const name of names(n)) room.join({ name });
  return room;
}

test('up to five players play as individuals; the sixth splits everyone into Red and Blue', () => {
  const room = crowd(5);
  assert.equal(room.mode, 'players');
  assert.equal(room.teams.length, 0);
  assert.equal(room.units().length, 5);
  room.join({ name: 'Sixth' });
  assert.equal(room.mode, 'teams');
  assert.deepEqual(room.teams.map((t) => [t.name, t.color]), [['Red', '#ef4444'], ['Blue', '#3b82f6']]);
  assert.deepEqual(sizes(room), [3, 3]);
  assert.ok(room.players.every((p) => p.teamId), 'everybody is on a team');
});

test('teams are dealt at random, and fairly', () => {
  // Different random numbers deal different teams, but the sizes stay even.
  const seen = new Set();
  for (const r of [0.01, 0.4, 0.8, 0.99]) {
    const room = crowd(7, { random: () => r });
    assert.deepEqual(sizes(room).sort(), [3, 4]);
    seen.add(room.players.map((p) => onTeam(room, p)).join());
  }
  assert.ok(seen.size > 1, 'the deal depends on the random numbers');
});

test('more than five on a team (over ten players) brings in Green and Yellow', () => {
  const room = crowd(10);
  assert.deepEqual(room.teams.map((t) => t.name), ['Red', 'Blue']);
  assert.deepEqual(sizes(room), [5, 5]);
  room.join({ name: 'Eleventh' });
  assert.deepEqual(room.teams.map((t) => [t.name, t.color]),
    [['Red', '#ef4444'], ['Blue', '#3b82f6'], ['Green', '#22c55e'], ['Yellow', '#eab308']]);
  assert.deepEqual(sizes(room).sort(), [2, 3, 3, 3]);
  assert.ok(room.players.every((p) => p.teamId));
});

test('the host can pick four teams earlier, but not two once there are more than ten players', () => {
  const room = crowd(6);
  assert.equal(room.teams.length, 2);
  room.setTeamCount(4);
  assert.equal(room.teams.length, 4);
  assert.deepEqual(sizes(room).sort(), [1, 1, 2, 2]);
  room.setTeamCount(2);
  assert.equal(room.teams.length, 2);
  assert.deepEqual(sizes(room), [3, 3]);
  assert.throws(() => room.setTeamCount(3), /2 or 4/);
  const big = crowd(11);
  assert.throws(() => big.setTeamCount(2), /four teams/);
});

test('new players join the smallest team', () => {
  const room = crowd(6);
  const a = room.players.find((p) => onTeam(room, p) === 'Red');
  room.setPlayerTeam(a.id, room.teams[1].id);          // Red 2, Blue 4
  const next = room.join({ name: 'Late' });
  assert.equal(onTeam(room, next), 'Red');
  assert.deepEqual(sizes(room), [3, 4]);
});

test('when ties are possible the team is picked at random', () => {
  const low = crowd(6, { random: () => 0 });
  const high = crowd(6, { random: () => 0.99 });
  assert.equal(onTeam(low, low.join({ name: 'X' })), 'Red');
  assert.equal(onTeam(high, high.join({ name: 'X' })), 'Blue');
});

test('the host can move players by hand and shuffle again', () => {
  const room = crowd(6);
  const [first] = room.players;
  const other = room.teams.find((t) => t.id !== first.teamId);
  room.setPlayerTeam(first.id, other.id);
  assert.equal(first.teamId, other.id);
  room.shuffleTeams();
  assert.deepEqual(sizes(room), [3, 3]);
  assert.throws(() => room.setPlayerTeam(first.id, 'nope'), /No such team/);
  const solo = crowd(2);
  assert.throws(() => solo.shuffleTeams(), /Not playing in teams/);
});

test('removing players can take the game back to individuals', () => {
  const room = crowd(6);
  assert.equal(room.mode, 'teams');
  room.removePlayer(room.players[0].id);
  assert.equal(room.mode, 'players');
  assert.equal(room.teams.length, 0);
  assert.ok(room.players.every((p) => p.teamId === null));
});

test('the host can override auto: individuals with a crowd, teams with a few', () => {
  const room = crowd(8);
  assert.equal(room.mode, 'teams');
  room.setMode('players');
  assert.equal(room.mode, 'players');
  assert.equal(room.units().length, 8);
  room.join({ name: 'Ninth' });
  assert.equal(room.mode, 'players');                  // stays individual however many join
  room.setMode('auto');
  assert.equal(room.mode, 'teams');
  const few = crowd(2);
  few.setMode('teams');
  assert.equal(few.mode, 'teams');
  assert.deepEqual(sizes(few), [1, 1]);
  assert.throws(() => few.setMode('chaos'), /Unknown mode/);
});

test('a renamed team keeps its name when teams are redealt', () => {
  const room = crowd(6);
  room.renameUnit(room.teams[0].id, 'The Foxes');
  room.setTeamCount(4);
  room.setTeamCount(2);
  assert.equal(room.teams[0].name, 'The Foxes');
  assert.equal(room.teams[0].color, '#ef4444');
});

test('once a game has started nothing is rearranged, and a late joiner still gets a team', () => {
  const room = crowd(6);
  room.act('start');
  const before = room.players.map((p) => p.teamId);
  const late = room.join({ name: 'Late' });
  assert.equal(room.mode, 'teams');
  assert.deepEqual(room.players.slice(0, 6).map((p) => p.teamId), before);
  assert.ok(room.teams.some((t) => t.id === late.teamId));
  assert.throws(() => room.setTeamCount(4), /before the game starts/);
  assert.throws(() => room.shuffleTeams(), /before the game starts/);
  const solo = crowd(3);
  solo.act('start');
  solo.join({ name: 'Late' });
  assert.equal(solo.mode, 'players');                  // individuals stay individuals mid-game
});

test('who is on each team is in the public view, and the room view says how teams are chosen', () => {
  const room = crowd(6);
  const view = room.publicView().room;
  assert.equal(view.mode, 'teams');
  assert.equal(view.modeSetting, 'auto');
  assert.equal(view.teamCount, 2);
  assert.equal(view.individualMax, 5);
  assert.equal(view.units.length, 2);
  assert.deepEqual(view.units.flatMap((u) => u.memberNames).sort(), names(6));
  assert.deepEqual(view.units.map((u) => u.members), view.units.map((u) => u.memberNames.length));
  assert.equal(crowd(3).publicView().room.units[0].memberNames, undefined);   // individuals have no members list
  const p = room.players[0];
  assert.equal(room.playerView(p.id).room.me.unitId, p.teamId);
});

test('choices survive a restart, and old saves still load', () => {
  const room = crowd(6);
  room.setTeamCount(4);
  const copy = mk();
  assert.equal(copy.restore(JSON.parse(JSON.stringify(room))), true);
  assert.equal(copy.teamCount, 4);
  assert.equal(copy.modeSetting, 'auto');
  assert.equal(copy.teams.length, 4);
  assert.equal(copy.teams[2].key, 'green');
  // A save from before auto teams: teams mode with two plain teams and no keys.
  const old = mk();
  assert.equal(old.restore({ version: 2, mode: 'teams', players: [], teams: [{ id: 't1', name: 'Team 1', color: '#ef4444', score: 0 }, { id: 't2', name: 'Team 2', color: '#3b82f6', score: 0 }] }), true);
  assert.equal(old.mode, 'teams');
  assert.equal(old.modeSetting, 'teams');
  assert.deepEqual(old.teams.map((t) => t.key), ['red', 'blue']);
});

test('clearing the players keeps the way of playing the host chose', () => {
  const room = crowd(8);
  room.clearRoster();
  assert.equal(room.players.length, 0);
  assert.equal(room.mode, 'players');                  // auto with nobody: individuals
  room.setMode('teams');
  room.clearRoster();
  assert.equal(room.mode, 'teams');
  assert.deepEqual(room.teams.map((t) => t.name), ['Red', 'Blue']);
});

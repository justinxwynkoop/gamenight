// The bundled engine (what the Apple TV runs in JavaScriptCore) is loaded into a bare VM context that has none of
// Node's or a browser's globals, then driven only through the Engine object with JSON strings, like the Swift host does.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const out = path.join(mkdtempSync(path.join(tmpdir(), 'engine-')), 'engine.js');
execFileSync(process.execPath, [new URL('../scripts/build-engine.mjs', import.meta.url).pathname, out], { stdio: 'pipe' });
const bundle = readFileSync(out, 'utf8');
const feudSet = JSON.parse(readFileSync(new URL('../data/feud/family-night-basics.json', import.meta.url)));

function boot(options = {}) {
  const sent = []; const relayed = []; const changes = []; const saves = []; const logs = []; let clock = 1000;
  const native = {
    send: (id, json) => sent.push([id, JSON.parse(json)]),
    broadcast: (topic, event, json) => relayed.push([topic, event, JSON.parse(json)]),
    save: (json) => saves.push(json),
    now: () => clock,
    random: () => Math.random(),
    log: (level, text) => logs.push([level, text]),
    saveSets: (json) => changes.push(JSON.parse(json)),
  };
  const context = vm.createContext({ __native: native });   // no console, no performance, no crypto, no timers
  vm.runInContext(bundle, context);
  const E = context.Engine;
  E.start(JSON.stringify({ pin: '4321', content: { feud: { basics: feudSet } }, ...options }));
  const to = (id) => sent.filter(([c]) => c === id).map(([, m]) => m);
  const last = (id, t) => to(id).filter((m) => m.t === t).at(-1);
  const say = (id, m) => E.receive(id, JSON.stringify(m));
  const settle = () => new Promise((r) => setImmediate(r));
  return { E, context, sent, relayed, changes, saves, logs, to, last, say, settle, advance: (ms) => { clock += ms; } };
}

test('the bundle needs nothing from Node and carries no file-reading code', () => {
  assert.doesNotMatch(bundle, /node:fs|require\(|process\.env/);
  const { E } = boot();
  const games = JSON.parse(E.games());
  assert.deepEqual(games.map((g) => g.id), ['jeopardy', 'feud']);
});

test('a TV, the host and players talk to the engine in JSON', async () => {
  const { E, last, say, settle, to } = boot();
  E.open('tv'); say('tv', { t: 'hello', role: 'tv' });
  assert.equal(to('tv')[0].t, 'state');
  say('h', { t: 'hello', role: 'host', pin: '0000' });
  assert.deepEqual(to('h'), [{ t: 'bad-pin' }]);
  say('h', { t: 'hello', role: 'host', pin: '4321' });
  assert.ok(last('h', 'state').view.room.games);
  say('p', { t: 'hello', role: 'player' }); say('p', { t: 'join', name: 'Ann' });
  say('q', { t: 'hello', role: 'player' }); say('q', { t: 'join', name: 'Ben' });
  assert.ok(last('p', 'joined').token.length >= 20, 'tokens come from the shimmed random source');
  say('h', { t: 'act', action: 'chooseGame', args: { id: 'feud' } });
  await settle();
  assert.equal(last('h', 'state').view.room.players.length, 2);
  assert.equal(last('tv', 'state').view.room.game?.id ?? last('tv', 'state').view.room.gameId, 'feud');
});

test('a Family Feud round plays through the bundle, including undo (structuredClone shim) and the clock', async () => {
  const { E, last, say, settle, advance, to } = boot();
  say('tv', { t: 'hello', role: 'tv' });
  say('h', { t: 'hello', role: 'host', pin: '4321' });
  say('p', { t: 'hello', role: 'player' }); say('p', { t: 'join', name: 'Ann' });
  say('q', { t: 'hello', role: 'player' }); say('q', { t: 'join', name: 'Ben' });
  say('h', { t: 'act', action: 'chooseGame', args: { id: 'feud' } });
  await settle();
  const teams = last('h', 'state').view.room.teams;
  const players = last('h', 'state').view.room.players;
  say('h', { t: 'act', action: 'setPlayerTeam', args: { playerId: players[0].id, teamId: teams[0].id } });
  say('h', { t: 'act', action: 'setPlayerTeam', args: { playerId: players[1].id, teamId: teams[1].id } });
  say('h', { t: 'act', action: 'startGame', args: {} });
  say('h', { t: 'act', action: 'openBuzzers', args: {} });
  await settle();
  advance(50);
  E.tick();
  assert.equal(last('h', 'state').view.room.inProgress, true);
  say('p', { t: 'buzz' }); say('q', { t: 'buzz' });   // only the team's stepping-up player is let through
  say('h', { t: 'act', action: 'answer', args: { index: 0 } });   // remembers the board first, using the structuredClone shim
  say('h', { t: 'act', action: 'undo', args: {} });
  assert.equal(last('h', 'error'), undefined, 'nothing went wrong');
  assert.ok(to('p').concat(to('q')).some((m) => m.t === 'buzz-result' && m.ok), 'one buzz was accepted');
});

test('the room is handed to save() when it changes and comes back from saved', async () => {
  const first = boot();
  first.say('p', { t: 'hello', role: 'player' }); first.say('p', { t: 'join', name: 'Ann' });
  await first.settle();
  assert.ok(first.saves.length >= 1);
  const second = boot({ saved: first.saves.at(-1) });
  second.say('h', { t: 'hello', role: 'host', pin: '4321' });
  assert.deepEqual(second.last('h', 'state').view.room.players.map((p) => p.name), ['Ann']);
});

test('question sets can be put and removed from outside, and bad input is not fatal', () => {
  const { E } = boot();
  E.putSet('feud', 'extra', JSON.stringify({ ...feudSet, title: 'Extra' }));
  assert.ok(JSON.parse(E.listSets('feud')).some((s) => s.id === 'extra' && s.title === 'Extra'));
  E.removeSet('feud', 'extra');
  assert.ok(!JSON.parse(E.listSets('feud')).some((s) => s.id === 'extra'));
  E.receive('x', 'not json');
  E.receive('x', JSON.stringify(42));
});

test('opening a tile for another game starts a fresh room, and the same game resumes', async () => {
  const first = boot({ game: 'jeopardy' });
  first.say('p', { t: 'hello', role: 'player' }); first.say('p', { t: 'join', name: 'Ann' });
  first.say('h', { t: 'hello', role: 'host', pin: '4321' });
  await first.settle();
  assert.equal(first.last('h', 'state').view.room.gameId, 'jeopardy');
  const saved = first.saves.at(-1);

  const same = boot({ game: 'jeopardy', saved });
  same.say('h', { t: 'hello', role: 'host', pin: '4321' });
  assert.deepEqual(same.last('h', 'state').view.room.players.map((p) => p.name), ['Ann'], 'the same game resumes');

  const other = boot({ game: 'feud', saved });
  other.say('h', { t: 'hello', role: 'host', pin: '4321' });
  const view = other.last('h', 'state').view;
  assert.equal(view.room.gameId, 'feud');
  assert.deepEqual(view.room.players, [], 'another game starts with an empty room');
});

test('sets the family saved come back, and a deleted bundled set stays deleted', async () => {
  const kept = [];
  const first = boot();
  // saving goes through the host's rpc, as the online editor does
  first.say('h', { t: 'hello', role: 'host', pin: '4321' });
  first.say('h', { t: 'rpc', id: 1, op: 'putSet', args: { game: 'feud', id: 'mine', doc: { ...feudSet, title: 'Mine' } } });
  first.say('h', { t: 'rpc', id: 2, op: 'deleteSet', args: { game: 'feud', id: 'basics' } });
  assert.equal(first.last('h', 'rpc-reply').ok, true);
  assert.equal(first.changes.length >= 2, true);
  const userSets = first.changes.at(-1);
  assert.equal(userSets.feud.basics, null);
  const second = boot({ userSets });
  const ids = JSON.parse(second.E.listSets('feud')).map((s) => s.id);
  assert.deepEqual(ids, ['mine']);
  void kept;
});

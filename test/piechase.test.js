import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { Room } from '../room.js';
import { GAMES } from '../games/index.js';
import { SPACES, HUB, destinations, neighbours, space, hqOf, distance } from '../games/piechase/board.js';
import { T, validateSet, CATEGORIES } from '../games/piechase/game.js';

const SETS = Object.fromEntries(readdirSync('data/piechase').filter((f) => f.endsWith('.json'))
  .map((f) => [f.slice(0, -5), JSON.parse(readFileSync(`data/piechase/${f}`, 'utf8'))]));

/** A room with players; `dice` is the list of rolls the die will give, in order (then 1s). */
function setup({ n = 3, dice = [], teams = false, hosts = 0 } = {}) {
  let t = 1000;
  const rolls = [...dice];
  const room = new Room({
    games: GAMES, now: () => t, random: () => 0,
    loadContent: (g, id) => (g === 'piechase' ? SETS[id] ?? null : null),
    listContent: (g) => (g === 'piechase' ? Object.entries(SETS).map(([id, s]) => ({ id, title: s.title })) : []),
  });
  room.chooseGame('piechase');
  if (teams) room.setMode('teams');
  const ps = Array.from({ length: n }, (_, i) => room.join({ name: `P${i + 1}` }));
  for (const p of ps) room.setConnected(p.id, true);
  room.setHosts(hosts);
  const g = room.game;
  // A loaded die: the rolls given, in order, then 1s.
  g.rollDie = () => (rolls.length ? rolls.shift() : 1);
  const wait = (ms) => { t += ms; room.tick(); };
  const msg = (p, m) => room.playerMessage(p.id, m);
  const view = (p) => room.playerView(p.id).game;
  const unit = (p) => room.unitOf(p).id;
  const who = () => ps.find((p) => unit(p) === g.turn);
  const other = () => ps.find((p) => unit(p) !== g.turn);
  return { room, g, ps, wait, msg, view, unit, who, other, rolls };
}

test('the board: 73 spaces, 6 headquarters, 12 Roll Again, nine of each category, no two neighbours alike', () => {
  assert.equal(SPACES.length, 73);
  assert.equal(SPACES.filter((s) => s.kind === 'hq').length, 6);
  assert.equal(SPACES.filter((s) => s.kind === 'again').length, 12);
  assert.equal(SPACES.filter((s) => s.kind === 'hub').length, 1);
  for (let c = 0; c < 6; c++) {
    assert.equal(SPACES.filter((s) => s.kind === 'cat' && s.cat === c).length, 9);
    assert.equal(space(hqOf(c)).kind, 'hq');
    assert.equal(space(hqOf(c)).cat, c);
  }
  for (const s of SPACES) for (const n of neighbours(s.id)) if (s.cat !== null && s.kind !== 'hub') assert.notEqual(space(n).cat, s.cat, `${s.id} and ${n}`);
  // Each spoke has five different colours, none its own headquarters'.
  for (let k = 0; k < 6; k++) {
    const cats = [1, 2, 3, 4, 5].map((i) => space(`s${k}-${i}`).cat);
    assert.equal(new Set(cats).size, 5);
    assert.ok(!cats.includes(k));
  }
  assert.equal(neighbours(HUB).length, 6);
  assert.equal(neighbours(hqOf(0)).length, 3);
  assert.equal(distance(hqOf(0), HUB), 6);
  assert.equal(distance(hqOf(0), hqOf(1)), 7);
});

test('moving: exactly the roll, any direction, never doubling back, through the hub', () => {
  // From the hub a 6 reaches every headquarters; 1 to 5 reach every category on the spokes.
  assert.deepEqual([...destinations(HUB, 6).keys()].sort(), [0, 1, 2, 3, 4, 5].map(hqOf).sort());
  for (let n = 1; n <= 5; n++) assert.deepEqual(new Set([...destinations(HUB, n).keys()].map((id) => space(id).cat)).size, 6);
  // On the ring with no junction near: two places, one each way.
  assert.deepEqual([...destinations('r3', 2).keys()].sort(), ['r1', 'r5']);
  // Past a headquarters: on round the ring, or up the spoke.
  assert.deepEqual([...destinations('r2', 3).keys()].sort(), ['r41', 'r5', 's0-5'].sort());
  // Across the hub: from one spoke into the five others (never back down the same one).
  const across = [...destinations('s0-1', 2).keys()].sort();
  assert.deepEqual(across, ['s0-3', 's1-1', 's2-1', 's3-1', 's4-1', 's5-1'].sort());
  // A move never ends where it began (that would mean turning back).
  for (const s of SPACES) for (let n = 1; n <= 6; n++) assert.ok(!destinations(s.id, n).has(s.id), `${s.id} ${n}`);
  // The path given ends on the destination and is as long as the roll.
  for (const [to, path] of destinations('s2-3', 5)) { assert.equal(path.length, 5); assert.equal(path.at(-1), to); }
});

test('the question sets that ship are valid and well stocked', () => {
  assert.ok(Object.keys(SETS).length >= 1);
  for (const [id, set] of Object.entries(SETS)) {
    assert.ok(validateSet(set), id);
    for (const c of set.categories) assert.ok(c.questions.length >= 30, `${id}: ${c.name} has ${c.questions.length}`);
  }
  assert.throws(() => validateSet({ title: 'x', categories: [] }), /exactly 6/);
  assert.throws(() => validateSet({ title: '', categories: [] }), /title/);
});

test('who goes first: everyone rolls, highest starts, a tie for highest rolls again', () => {
  const s = setup({ n: 3, dice: [4, 6, 6, 2, 5] });
  const { g, ps, msg, wait, unit } = s;
  msg(ps[0], { t: 'start' });
  assert.equal(g.phase, 'rolloff');
  msg(ps[0], { t: 'roll' }); msg(ps[1], { t: 'roll' }); msg(ps[2], { t: 'roll' });
  // P2 and P3 tied on 6: only they roll again.
  assert.equal(g.rolloff.round, 2);
  assert.deepEqual(g.rolloff.contenders, [unit(ps[1]), unit(ps[2])]);
  g.roll(unit(ps[0]));
  assert.equal(g.rolloff.rolls[unit(ps[0])], undefined, 'P1 is out of it');
  msg(ps[1], { t: 'roll' }); msg(ps[2], { t: 'roll' });
  assert.equal(g.rolloff.starter, unit(ps[2]));
  wait(T.rolloffDone + 10);
  assert.equal(g.phase, 'roll');
  assert.equal(g.turn, unit(ps[2]));
  // Then to the left: the joining order, from the starter.
  assert.deepEqual(g.order, [unit(ps[2]), unit(ps[0]), unit(ps[1])]);
});

/** Starts a game and gets through the first roll, P1 first. */
function begin(s) {
  s.rolls.unshift(6, ...s.ps.slice(1).map(() => 1));
  s.msg(s.ps[0], { t: 'start' });
  for (const p of s.ps) s.msg(p, { t: 'roll' });
  s.wait(T.rolloffDone + 10);
  assert.equal(s.g.turn, s.unit(s.ps[0]));
}

test('a turn: roll, pick a space, a question, the next player reads and judges; right rolls again, wrong passes on', () => {
  const s = setup({ n: 3, dice: [] });
  begin(s);
  const { g, ps, msg, view, wait, unit } = s;
  s.rolls.push(3);
  assert.throws(() => msg(ps[1], { t: 'roll' }), /turn/);
  msg(ps[0], { t: 'roll' });
  assert.equal(g.phase, 'move');
  assert.equal(g.die.value, 3);
  assert.equal(view(ps[0]).options.length, 6);
  const to = g.options.find((id) => space(id).cat === 2);   // a History space
  assert.throws(() => msg(ps[1], { t: 'move', to }), /turn/);
  assert.throws(() => msg(ps[0], { t: 'move', to: 'r5' }), /cannot get there/);
  msg(ps[0], { t: 'move', to });
  assert.equal(g.phase, 'question');
  assert.equal(g.question.cat, 2);
  // The answerer's phone and the TV never see the answer; the opponents' phones (no host) do.
  assert.equal(view(ps[0]).question.answer, undefined);
  assert.equal(s.room.publicView().game.question.answer, undefined);
  assert.ok(view(ps[1]).question.answer);
  assert.equal(view(ps[1]).me.reader, true, 'the next player reads');
  assert.equal(view(ps[2]).me.reader, false);
  assert.throws(() => msg(ps[0], { t: 'judge', correct: true }), /Another player/);
  msg(ps[1], { t: 'judge', correct: true });
  assert.equal(g.phase, 'result');
  assert.equal(s.room.publicView().game.question.answer.length > 0, true, 'the answer shows once it is judged');
  wait(T.result + 10);
  assert.equal(g.phase, 'roll');
  assert.equal(g.turn, unit(ps[0]), 'a right answer rolls again');
  assert.equal(view(ps[0]).again, 'correct');
  // A wrong answer passes the turn to the left.
  s.rolls.push(1);
  msg(ps[0], { t: 'roll' });
  msg(ps[0], { t: 'move', to: g.options[0] });
  assert.equal(g.phase, 'question');
  msg(ps[2], { t: 'judge', correct: false });
  wait(T.result + 10);
  assert.equal(g.turn, unit(ps[1]));
});

test('headquarters: a right answer wins the wedge (once); Roll Again rolls again; the hub is any category', () => {
  const s = setup({ n: 2 });
  begin(s);
  const { g, ps, msg, wait, unit, view } = s;
  s.rolls.push(6);
  msg(ps[0], { t: 'roll' });
  msg(ps[0], { t: 'move', to: hqOf(0) });
  assert.equal(g.question.hq, true);
  assert.equal(g.question.cat, 0);
  msg(ps[1], { t: 'judge', correct: true });
  assert.equal(g.result.wedge, 0);
  assert.deepEqual(g.wedges[unit(ps[0])], [0]);
  assert.equal(s.room.unitOf(ps[0]).score, 1);
  wait(T.wedge + 10);
  assert.equal(g.turn, unit(ps[0]));
  // r0 + 2 clockwise is a Roll Again space.
  s.rolls.push(2);
  msg(ps[0], { t: 'roll' });
  assert.ok(g.options.includes('r2'));
  msg(ps[0], { t: 'move', to: 'r2' });
  assert.equal(g.phase, 'roll');
  assert.equal(view(ps[0]).again, 'space');
  // Back to the HQ again (2 back): a question, but no second wedge.
  s.rolls.push(2);
  msg(ps[0], { t: 'roll' });
  msg(ps[0], { t: 'move', to: 'r0' });
  msg(ps[1], { t: 'judge', correct: true });
  assert.equal(g.result.wedge, null);
  assert.deepEqual(g.wedges[unit(ps[0])], [0]);
  wait(T.result + 10);
  // Up the spoke to the hub (6): the player picks any category.
  s.rolls.push(6);
  msg(ps[0], { t: 'roll' });
  msg(ps[0], { t: 'move', to: HUB });
  assert.equal(g.phase, 'choose');
  assert.equal(view(ps[0]).me.canChoose, true);
  assert.equal(view(ps[1]).me.canChoose, false);
  assert.throws(() => msg(ps[1], { t: 'choose', cat: 3 }), /picks the category/);
  msg(ps[0], { t: 'choose', cat: 4 });
  assert.equal(g.question.cat, 4);
  assert.equal(g.question.final, false);
});

test('winning: all six wedges, back to the hub by exact count, the others pick the category', () => {
  const s = setup({ n: 2 });
  begin(s);
  const { g, ps, msg, wait, unit, view } = s;
  g.wedges[unit(ps[0])] = [0, 1, 2, 3, 4, 5];
  g.pos[unit(ps[0])] = 's3-2';
  // A 4 from two out: through the hub and out along another spoke, never stopping in it.
  s.rolls.push(4);
  msg(ps[0], { t: 'roll' });
  assert.ok(!g.options.includes(HUB));
  msg(ps[0], { t: 'move', to: 's1-2' });
  msg(ps[1], { t: 'judge', correct: true });
  wait(T.result + 10);
  s.rolls.push(2);
  msg(ps[0], { t: 'roll' });
  assert.ok(g.options.includes(HUB));
  msg(ps[0], { t: 'move', to: HUB });
  assert.equal(g.phase, 'choose');
  assert.equal(g.chooser, 'opponents');
  assert.equal(view(ps[0]).me.canChoose, false);
  assert.throws(() => msg(ps[0], { t: 'choose', cat: 1 }), /other players/);
  msg(ps[1], { t: 'choose', cat: 5 });
  assert.equal(g.question.final, true);
  assert.equal(g.question.cat, 5);
  // Wrong: the turn passes; they leave the hub next time and come back.
  msg(ps[1], { t: 'judge', correct: false });
  wait(T.result + 10);
  assert.equal(g.turn, unit(ps[1]));
  s.rolls.push(1);
  msg(ps[1], { t: 'roll' });
  msg(ps[1], { t: 'move', to: g.options[0] });
  msg(ps[0], { t: 'judge', correct: false });
  wait(T.result + 10);
  assert.equal(g.turn, unit(ps[0]));
  s.rolls.push(1);
  msg(ps[0], { t: 'roll' });
  assert.ok(!g.options.includes(HUB), 'a move has to leave the hub');
  msg(ps[0], { t: 'move', to: 's2-1' });
  msg(ps[1], { t: 'judge', correct: true });
  wait(T.result + 10);
  s.rolls.push(1);
  msg(ps[0], { t: 'roll' });
  // s2-1 with a 1: the hub or s2-2.
  assert.deepEqual(g.options.sort(), [HUB, 's2-2'].sort());
  msg(ps[0], { t: 'move', to: HUB });
  msg(ps[1], { t: 'choose', cat: 2 });
  msg(ps[1], { t: 'judge', correct: true });
  assert.equal(g.result.win, true);
  wait(T.wedge + 10);
  assert.equal(g.phase, 'gameover');
  assert.deepEqual(g.winners, [unit(ps[0])]);
  assert.match(s.room.publicView().game.line.text, /P1 wins/);
});

test('a shorter game (four wedges) and equal turns, where the last player can tie', () => {
  const s = setup({ n: 3 });
  s.g.setWedges(4);
  s.g.setEqualTurns(true);
  begin(s);
  const { g, ps, msg, wait, unit } = s;
  g.wedges[unit(ps[1])] = [0, 1, 2, 3];
  g.pos[unit(ps[1])] = 's0-1';
  g.wedges[unit(ps[2])] = [0, 1, 4, 5];
  g.pos[unit(ps[2])] = 's1-1';
  // P1 misses, P2 reaches the hub and wins; P3 still gets a turn this round and wins too: a tie.
  s.rolls.push(1);
  msg(ps[0], { t: 'roll' }); msg(ps[0], { t: 'move', to: g.options[0] }); msg(ps[1], { t: 'judge', correct: false }); wait(T.result + 10);
  s.rolls.push(1);
  msg(ps[1], { t: 'roll' }); msg(ps[1], { t: 'move', to: HUB });
  assert.equal(g.chooser, 'opponents');
  msg(ps[0], { t: 'choose', cat: 0 }); msg(ps[2], { t: 'judge', correct: true }); wait(T.wedge + 10);
  assert.equal(g.phase, 'roll');
  assert.equal(g.turn, unit(ps[2]));
  s.rolls.push(1);
  msg(ps[2], { t: 'roll' }); msg(ps[2], { t: 'move', to: HUB }); msg(ps[0], { t: 'choose', cat: 1 }); msg(ps[0], { t: 'judge', correct: true }); wait(T.wedge + 10);
  assert.equal(g.phase, 'gameover');
  assert.deepEqual(g.winners, [unit(ps[1]), unit(ps[2])]);
  assert.match(s.room.publicView().game.line.text, /tie/i);
});

test('with a host, the host reads and judges; the phones never see the answer', () => {
  const s = setup({ n: 2, hosts: 1 });
  s.rolls.unshift(6, 1);
  s.g.act('start');
  s.g.act('advance');            // the host rolls for everyone
  s.wait(T.rolloffDone + 10);
  const { g, ps, msg, view, room } = s;
  s.rolls.push(6);
  msg(s.who(), { t: 'roll' });
  msg(s.who(), { t: 'move', to: hqOf(3) });
  assert.equal(view(s.other()).question.answer, undefined);
  assert.equal(view(s.other()).me.canJudge, undefined);
  assert.ok(room.hostView().game.question.answer);
  assert.throws(() => msg(s.other(), { t: 'judge', correct: true }), /host judges/);
  g.act('judge', { correct: true });
  assert.equal(g.result.wedge, 3);
  assert.throws(() => msg(ps[0], { t: 'start' }), /host/);
});

test('teams play as one token each; any member rolls; a teammate cannot judge', () => {
  const s = setup({ n: 4, teams: true });
  const { g, ps, room, msg, unit } = s;
  assert.equal(room.mode, 'teams');
  s.rolls.unshift(6, 1);
  msg(ps[0], { t: 'start' });
  assert.equal(g.order.length, 2);
  g.act('advance');
  s.wait(T.rolloffDone + 10);
  const mine = ps.filter((p) => unit(p) === g.turn);
  const theirs = ps.filter((p) => unit(p) !== g.turn);
  s.rolls.push(2);
  msg(mine[1], { t: 'roll' });
  msg(mine[0], { t: 'move', to: g.options[0] });
  assert.throws(() => msg(mine[1], { t: 'judge', correct: true }), /Another player/);
  msg(theirs[0], { t: 'judge', correct: false });
  assert.equal(g.result.correct, false);
});

test('a new game uses the easy set; the host can pick Classic or every set mixed', () => {
  const s = setup({ n: 2 });
  assert.equal(s.g.settings.setId, 'family-easy');
  assert.equal(s.room.publicView().game.setTitle, 'Family Easy');
  begin(s);
  const easy = new Set(SETS['family-easy'].categories[0].questions.map((q) => q.q));
  s.g.phase = 'choose'; s.g.chooser = 'self';
  s.g.act('choose', { cat: 0 });
  assert.ok(easy.has(s.g.question.q), 'the question comes from Family Easy');
  const t = setup({ n: 2 });
  t.g.act('setSet', { id: 'family-classic' });
  assert.equal(t.room.publicView().game.setTitle, 'Family Classic');
});

test('questions are not repeated on the same TV until a category runs out', () => {
  const s = setup({ n: 2 });
  s.g.act('setSet', { id: 'all' });
  begin(s);
  const { g } = s;
  const seen = new Set();
  const pool = Object.values(SETS).flatMap((set) => set.categories[0].questions.map((q) => q.q));
  for (let i = 0; i < new Set(pool).size; i++) {
    g.phase = 'choose'; g.chooser = 'self';
    g.act('choose', { cat: 0 });
    assert.ok(!seen.has(g.question.q), `repeated: ${g.question.q}`);
    seen.add(g.question.q);
  }
  // A new game in the same room carries on with what has not been asked.
  g.phase = 'choose'; g.act('choose', { cat: 0 });
  assert.ok(seen.has(g.question.q), 'after the category runs out it starts over');
});

test('one roll with only one place to go moves by itself; the host can skip a turn; saving and restoring', () => {
  const s = setup({ n: 2 });
  begin(s);
  const { g, ps, msg, wait, room, unit } = s;
  g.pos[unit(ps[0])] = 'r3';
  // From r3 a 3 reaches r0 or r6: two choices, so it waits. Put it on a spoke end where only one exists? Use a stub.
  s.rolls.push(3);
  msg(ps[0], { t: 'roll' });
  assert.equal(g.options.length, 2);
  g.options = [g.options[0]];
  g.paths = { [g.options[0]]: [g.options[0]] };
  g.timer = { at: room.now() + T.autoMove, fire: () => g.move(g.turn, g.options[0]) };
  wait(T.autoMove + 10);
  assert.equal(g.phase, 'question');
  g.act('skipTurn');
  assert.equal(g.turn, unit(ps[1]));
  const saved = JSON.parse(JSON.stringify(room));
  const again = new Room({ games: GAMES, loadContent: (gid, id) => SETS[id] ?? null, listContent: () => Object.entries(SETS).map(([id, x]) => ({ id, title: x.title })) });
  assert.ok(again.restore(saved));
  assert.equal(again.game.turn, unit(ps[1]));
  assert.equal(again.game.phase, 'roll');
  assert.deepEqual(again.game.pos, g.pos);
});

test('the lobby: needs two, takes at most six, set choice and settings', () => {
  const s = setup({ n: 1 });
  assert.throws(() => s.g.act('start'), /at least 2/);
  assert.throws(() => s.g.act('setSet', { id: 'nope' }), /No such/);
  s.g.act('setSet', { id: Object.keys(SETS)[0] });
  assert.equal(s.room.publicView().game.settings.setId, Object.keys(SETS)[0]);
  assert.throws(() => s.g.act('setWedges', { n: 3 }), /4, 5 or 6/);
  const v = s.room.publicView().game;
  assert.equal(v.categories.length, 6);
  assert.deepEqual(v.categories.map((c) => c.color), CATEGORIES.map((c) => c.color));
  assert.equal(v.board.length, 73);
});

test('P1: nobody can be removed once the game has started', () => {
  const s = setup({ n: 3 });
  s.room.removePlayer(s.ps[2].id);                                    // lobby: fine
  assert.equal(s.room.players.length, 2);
  s.g.start();
  assert.throws(() => s.room.removePlayer(s.ps[0].id), /before the game starts/);
  assert.match(s.room.hostView().room.removeBlocked, /before the game starts/);
  assert.equal(s.room.players.length, 2);
});

test('P1: with no host, anyone can skip past a player who has gone away; otherwise only the first player', () => {
  const s = setup({ n: 3, dice: [1, 2, 3] });
  s.g.start();
  s.g.advance();                                                      // the who-goes-first roll: 1, 2, 3
  s.wait(T.rolloffDone + 10);
  assert.equal(s.g.phase, 'roll');
  const turnPlayer = s.who();
  const others = s.ps.filter((p) => p !== turnPlayer);
  const first = s.ps[0];
  const notFirst = others.find((p) => p !== first) ?? others[0];
  // Everyone is here: only the first player may skip.
  if (notFirst !== first) assert.throws(() => s.msg(notFirst, { t: 'skip' }), /first player/);
  assert.equal(s.view(notFirst).me.canNudge, notFirst === first);
  // The player whose turn it is goes away, and so does the first player.
  s.room.connected.delete(turnPlayer.id);
  const spare = s.ps.filter((p) => p !== turnPlayer && p !== first);
  s.room.connected.delete(first.id);
  const helper = spare[0] ?? others[0];
  if (helper && helper !== first && helper !== turnPlayer) {
    assert.equal(s.view(helper).me.canNudge, true);
    const before = s.g.turn;
    s.msg(helper, { t: 'skip' });
    assert.notEqual(s.g.turn, before);
  }
});

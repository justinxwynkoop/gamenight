import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { Room } from '../room.js';
import { GAMES } from '../games/index.js';
import { existsSync } from 'node:fs';
import { T, validateSet, SIDES, GREEN, CHALLENGES, DECK_ORDER } from '../games/guysvsgals/game.js';

const SETS = Object.fromEntries(readdirSync('data/guysvsgals').filter((f) => f.endsWith('.json'))
  .map((f) => [f.slice(0, -5), JSON.parse(readFileSync(`data/guysvsgals/${f}`, 'utf8'))]));

/** A room with `guys` and `gals` players who have picked their sides. random() is fixed (the first card of a pile). */
function setup({ guys = 2, gals = 2, hosts = 0, sets = SETS } = {}) {
  let t = 1000;
  const room = new Room({
    games: GAMES, now: () => t, random: () => 0,
    loadContent: (g, id) => (g === 'guysvsgals' ? sets[id] ?? null : null),
    listContent: (g) => (g === 'guysvsgals' ? Object.entries(sets).map(([id, s]) => ({ id, title: s.title })) : []),
  });
  room.chooseGame('guysvsgals');
  const make = (n, side) => Array.from({ length: n }, (_, i) => {
    const p = room.join({ name: `${side}${i + 1}` });
    room.setConnected(p.id, true);
    room.playerMessage(p.id, { t: 'side', side });
    return p;
  });
  const G = make(guys, 'guys');
  const W = make(gals, 'gals');
  room.setHosts(hosts);
  const g = room.game;
  const wait = (ms) => { t += ms; room.tick(); };
  const msg = (p, m) => room.playerMessage(p.id, m);
  const view = (p) => room.playerView(p.id).game;
  const begin = () => msg(G[0], { t: 'start' });
  /** The player reading the card now. */
  const reader = () => [...G, ...W].find((p) => p.id === g.card.reader);
  /** The reader says right or wrong. */
  const judge = (right) => msg(reader(), { t: 'judge', right });
  /** Puts the trophy on a space (from the Gals' side: + toward the Gals) and deals a new card there. */
  const at = (pos) => { g.pos = pos; room.act('newCard'); };
  return { room, g, G, W, wait, msg, view, begin, reader, judge, at, now: () => t };
}

test('the Family set is valid and has all five decks for both sides, with their pictures', () => {
  for (const set of Object.values(SETS)) assert.equal(validateSet(set), true);
  const fam = SETS.family;
  for (const half of [fam.guyStuff, fam.galStuff]) {
    assert.ok(half.facts.length >= 130, 'facts');
    assert.ok(half.stuff.length >= 100, 'stuff');
    assert.ok(half.pics.length >= 60, 'pics');
    assert.ok(half.lives.length >= 65, 'lives');
    assert.ok(half.moves.length >= 90, 'moves');
    for (const p of half.pics) {
      assert.ok(existsSync(`public/games/guysvsgals/pics/${p.img}.png`), p.img);
      assert.ok(existsSync(`tv-app/FamilyGameNight/Assets.xcassets/GvgPic-${p.img}.imageset/${p.img}.png`), p.img);
    }
    for (const l of half.lives) assert.equal(new Set(l.choices).size, 3, l.q);
  }
});

test('validateSet explains what is missing', () => {
  assert.throws(() => validateSet({ title: 'x' }), /Guy stuff/);
  const q = { q: 'Q?', a: 'A' };
  assert.equal(validateSet({ title: 'x', guyStuff: { facts: [q] }, galStuff: { stuff: [q] } }), true);
  assert.throws(() => validateSet({ title: 'x', guyStuff: { pics: [{ img: 'wrench', q: 'Q?', a: 'A' }] }, galStuff: { facts: [q] } }), /Our Facts or Our Stuff/);
  assert.throws(() => validateSet({ title: 'x', guyStuff: { facts: [{ q: 'Q?' }] }, galStuff: { facts: [q] } }), /write the answer/);
  assert.throws(() => validateSet({ title: 'x', guyStuff: { facts: [q], pics: [{ q: 'Q?', a: 'A' }] }, galStuff: { facts: [q] } }), /choose a picture/);
  assert.throws(() => validateSet({ title: 'x', guyStuff: { facts: [q], lives: [{ q: 'Me?', choices: ['a', 'b'] }] }, galStuff: { facts: [q] } }), /A, B and C/);
  assert.throws(() => validateSet({ title: 'x', guyStuff: { facts: [q], moves: [{ m: '' }] }, galStuff: { facts: [q] } }), /act out/);
});

test('always two teams, named and coloured for the sides, and given back when another game is chosen', () => {
  const { room, G, W } = setup();
  assert.equal(room.mode, 'teams');
  const names = room.teams.map((t) => t.name).sort();
  assert.deepEqual(names, ['Gals', 'Guys']);
  assert.equal(room.teams.find((t) => t.key === 'blue').color, SIDES.guys.color);
  for (const p of G) assert.equal(room.teams.find((t) => t.id === p.teamId).name, 'Guys');
  for (const p of W) assert.equal(room.teams.find((t) => t.id === p.teamId).name, 'Gals');
  room.chooseGame('feud');
  assert.deepEqual(room.teams.map((t) => t.name), ['Red', 'Blue']);
});

test('players pick their side; a team with nobody on it cannot start', () => {
  const { room, g, G, msg, view } = setup({ guys: 1, gals: 0 });
  assert.equal(view(G[0]).me.side, 'guys');
  assert.equal(view(G[0]).me.picked, true);
  assert.throws(() => msg(G[0], { t: 'start' }), /Gals need at least one player/);
  msg(G[0], { t: 'side', side: 'gals' });
  assert.equal(view(G[0]).me.side, 'gals');
  assert.equal(g.phase, 'lobby');
  assert.equal(room.inProgress(), false);
});

test('the Gals go first: a Guy reads them a guy-stuff card and judges it; the TV never sees the answer early', () => {
  const { room, g, G, W, begin, view, judge, wait } = setup();
  begin();
  assert.equal(g.phase, 'card');
  assert.equal(g.turn, 'gals');
  assert.equal(g.pos, 0);
  const tv = room.publicView().game;
  assert.equal(tv.card.deck, 'facts');
  assert.equal(tv.card.about, 'guys');
  assert.equal(tv.card.answer, undefined);
  assert.equal(tv.card.reader.id, G[0].id);
  assert.equal(view(G[0]).me.reader, true);
  assert.equal(view(G[0]).me.canJudge, true);
  assert.ok(view(G[0]).me.answer);
  assert.equal(view(G[1]).me.answer, undefined, 'only the reader holds the card: their teammates never see the answer');
  assert.equal(view(G[1]).me.canJudge, false);
  assert.equal(view(W[0]).me.answer, undefined);
  assert.equal(view(W[0]).me.canChallenge, true);
  assert.throws(() => room.playerMessage(W[0].id, { t: 'judge', right: true }), /reader judges/);
  assert.throws(() => room.playerMessage(G[1].id, { t: 'judge', right: true }), /reader judges/);
  // Right: one space toward the Gals, and they keep going.
  judge(true);
  assert.equal(g.phase, 'result');
  assert.equal(g.pos, 1);
  assert.ok(room.publicView().game.card.answer);
  wait(T.result);
  assert.equal(g.turn, 'gals');
  assert.equal(g.card.deck, 'stuff', 'the next space draws from Our Stuff');
  assert.equal(g.card.reader, G[1].id, 'readers take turns');
});

test('a wrong answer passes the turn and leaves the trophy; on the other side of START the spaces count the same', () => {
  const { g, G, W, begin, judge, wait } = setup();
  begin();
  judge(true); wait(T.result);   // +1
  judge(false); wait(T.result);
  assert.equal(g.pos, 1);
  assert.equal(g.turn, 'guys');
  assert.equal(g.card.about, 'gals');
  assert.equal(g.card.deck, 'stuff', 'one space from START, toward the Gals, is Our Stuff for the Guys too');
  assert.ok([W[0].id, W[1].id].includes(g.card.reader));
  judge(true); wait(T.result);
  judge(true); wait(T.result);
  assert.equal(g.pos, -1);
  assert.equal(g.card.deck, 'stuff');
  assert.ok(G.length);
});

test('the pace: a right answer is a quick beat and the same team plays on; a miss holds the answer up longer', () => {
  const { g, begin, judge, wait } = setup();
  begin();
  assert.ok(T.right < T.result);
  judge(true);
  wait(T.right);
  assert.equal(g.phase, 'card', 'straight on to the next card after a right answer');
  assert.equal(g.turn, 'gals');
  judge(false);
  wait(T.right);
  assert.equal(g.phase, 'result', 'a miss stays up long enough to read the answer');
  wait(T.result - T.right);
  assert.equal(g.phase, 'card');
  assert.equal(g.turn, 'guys');
});

test('the race pace: the next question on a card follows quickly; the end of a turn holds longer', () => {
  const { g, begin, judge, wait } = race();
  begin();
  judge(true);
  wait(T.right);
  assert.equal(g.phase, 'card');
  assert.equal(g.card.i, 1, 'the second question, straight away');
  judge(false);
  wait(T.right);
  assert.equal(g.phase, 'result');
  wait(T.result - T.right);
  assert.equal(g.turn, 'guys');
});

test('a right answer on your own green space wins the trophy; a new one starts on START with the other team', () => {
  const { room, g, begin, judge, wait, at } = setup();
  begin();
  at(GREEN);
  judge(true);
  assert.equal(g.result.trophy, 'gals');
  assert.equal(g.pos, GREEN);
  wait(T.result);
  assert.equal(g.phase, 'trophy');
  assert.equal(room.publicView().game.trophyWon, 'gals');
  assert.equal(room.teams.find((t) => t.key === 'red').score, 1);
  wait(T.trophy);
  assert.equal(g.phase, 'card');
  assert.equal(g.pos, 0);
  assert.equal(g.turn, 'guys');
  assert.equal(g.trophyN, 2);
});

test('first to three trophies wins (or one or two, if the host says so)', () => {
  const { room, g, begin, judge, wait, at } = setup();
  room.act('setTarget', { n: 2 });
  begin();
  for (let i = 0; i < 2; i++) {
    if (g.turn !== 'gals') { judge(false); wait(T.result); }
    at(GREEN);
    judge(true); wait(T.result); wait(T.trophy);
  }
  assert.equal(g.phase, 'gameover');
  assert.deepEqual(g.winners, ['gals']);
  assert.equal(room.publicView().game.line.text, 'The Gals win!');
});

test('a challenge: the readers’ team answers it themselves, without having seen the answer; the reader judges', () => {
  const { room, g, G, W, begin, msg, view, wait, judge } = setup();
  begin();
  msg(W[0], { t: 'challenge' });
  assert.equal(g.tokens.gals, CHALLENGES - 1);
  assert.equal(g.card.challenged, true);
  assert.equal(view(G[0]).me.canJudge, true, 'the reader still holds the card');
  assert.ok(view(G[0]).me.answer);
  assert.equal(view(G[1]).me.answer, undefined, 'the reader’s teammate answers it, and never saw the answer');
  for (const p of W) assert.equal(view(p).me.answer, undefined);
  assert.throws(() => msg(W[1], { t: 'judge', right: true }), /reader judges/);
  assert.throws(() => msg(W[0], { t: 'challenge' }), /already/);
  // The Guys miss: the trophy comes to the Gals, who keep playing.
  judge(false);
  assert.equal(g.pos, 1);
  wait(T.result);
  assert.equal(g.turn, 'gals');
  // The Guys get it: the trophy goes their way and it's their turn.
  msg(W[0], { t: 'challenge' });
  judge(true);
  assert.equal(g.pos, 0);
  wait(T.result);
  assert.equal(g.turn, 'guys');
  assert.equal(room.publicView().game.teams.find((t) => t.side === 'gals').challenges, CHALLENGES - 2);
});

test('if the reader wanders off, their team judges; on a challenge, the team that challenged does', () => {
  const { room, g, G, W, begin, msg, view } = setup();
  begin();
  room.setConnected(G[0].id, false);
  assert.equal(view(G[1]).me.canJudge, true);
  assert.ok(view(G[1]).me.answer);
  msg(W[0], { t: 'challenge' });
  assert.equal(view(G[1]).me.answer, undefined);
  assert.equal(view(W[1]).me.canJudge, true);
  msg(W[1], { t: 'judge', right: false });
  assert.equal(g.pos, 1);
});

test('a challenge needs someone besides the reader to answer it', () => {
  const { room, W, begin, msg, view } = setup({ guys: 1 });
  begin();
  assert.equal(view(W[0]).me.canChallenge, false);
  assert.throws(() => msg(W[0], { t: 'challenge' }), /besides the reader/);
});

test('challenge tokens run out, and can be turned off', () => {
  const { room, g, W, begin, msg, judge, wait, at } = setup();
  begin();
  for (let i = 0; i < CHALLENGES; i++) { at(0); msg(W[0], { t: 'challenge' }); judge(false); wait(T.result); }
  assert.equal(g.tokens.gals, 0);
  assert.throws(() => msg(W[0], { t: 'challenge' }), /No challenge tokens/);
  judge(true);
  room.act('endGame');
  room.act('setChallenges', { on: false });
  begin();
  assert.throws(() => msg(W[0], { t: 'challenge' }), /turned off/);
});

test('Our Pics: a picture comes with the question', () => {
  const { room, begin, at } = setup();
  begin();
  at(2);
  const c = room.publicView().game.card;
  assert.equal(c.deck, 'pics');
  assert.ok(c.img);
  assert.ok(c.text);
});

test('Our Lives: the reader picks in secret, the team guesses on their phones', () => {
  const { room, g, G, W, begin, msg, view, reader, at, wait } = setup();
  begin();
  at(3);
  assert.equal(g.card.deck, 'lives');
  assert.equal(g.card.stage, 'secret');
  assert.equal(view(reader()).me.canPick, true);
  assert.throws(() => msg(W[0], { t: 'vote', choice: 0 }), /Nothing to guess/);
  assert.throws(() => msg(G.find((p) => p !== reader()), { t: 'secret', choice: 0 }), /picks this one/);
  msg(reader(), { t: 'secret', choice: 2 });
  assert.equal(g.card.stage, 'guess');
  assert.equal(room.publicView().game.card.secret, undefined, 'the TV doesn’t know');
  assert.equal(view(W[0]).me.secret, undefined);
  assert.equal(view(G[1]).me.secret, undefined, 'only the reader knows what they picked');
  assert.equal(view(reader()).me.secret, 2);
  msg(W[0], { t: 'vote', choice: 2 });
  assert.equal(g.phase, 'card', 'waits for the whole team');
  msg(W[1], { t: 'vote', choice: 1 });
  // A tie goes to the first pick: 2, which is right.
  assert.equal(g.phase, 'result');
  assert.equal(g.result.right, true);
  assert.equal(g.pos, 4);
  wait(T.result);
  assert.equal(g.card.deck, 'moves');
});

test('Our Lives challenge: the reader’s teammates guess instead', () => {
  const { g, G, W, begin, msg, reader, at } = setup();
  begin();
  at(-3);   // three spaces toward the Guys: Our Lives for the Gals too
  msg(reader(), { t: 'secret', choice: 0 });
  assert.throws(() => msg(W[0], { t: 'secret', choice: 0 }), /Nothing to pick/);
  msg(W[0], { t: 'challenge' });
  const mate = G.find((p) => p !== reader());
  assert.throws(() => msg(W[0], { t: 'vote', choice: 0 }), /Guys are guessing/);
  assert.throws(() => msg(reader(), { t: 'vote', choice: 0 }), /Guys are guessing/);
  msg(mate, { t: 'vote', choice: 1 });
  assert.equal(g.result.right, false);
  assert.equal(g.pos, -2, 'missed: the trophy comes to the Gals');
});

test('Our Moves: the reader picks an actor, both act it out, and whoever shouts it first pulls the trophy', () => {
  const { room, g, G, W, begin, msg, view, reader, at, wait } = setup();
  begin();
  at(4);
  assert.equal(g.card.deck, 'moves');
  assert.equal(g.card.stage, 'pick');
  assert.equal(view(W[0]).me.canChallenge, false);
  assert.throws(() => msg(W[0], { t: 'challenge' }), /can’t be challenged/);
  assert.throws(() => msg(W[0], { t: 'actor', pid: W[1].id }), /picks the actor/);
  assert.deepEqual(view(reader()).me.actors.map((p) => p.id), [W[0].id, W[1].id]);
  msg(reader(), { t: 'actor', pid: W[1].id });
  // Both actors read what to act out first: no clock until both have pressed Start.
  assert.equal(g.card.stage, 'ready');
  assert.ok(view(reader()).me.move);
  assert.equal(view(W[1]).me.move, view(reader()).me.move);
  assert.equal(view(W[0]).me.move, undefined);
  assert.equal(room.publicView().game.card.text, undefined, 'the TV doesn’t show it');
  assert.equal(room.publicView().game.timer, null, 'the clock waits');
  wait(T.moves * 2);
  assert.equal(g.card.stage, 'ready', 'however long they take to read');
  assert.throws(() => msg(W[0], { t: 'ready' }), /two actors/);
  assert.throws(() => msg(reader(), { t: 'moves', side: 'guys' }), /No charade right now/);
  msg(W[1], { t: 'ready' });
  assert.equal(g.card.stage, 'ready', 'one of the two is not enough');
  assert.equal(view(W[1]).me.ready, true);
  assert.deepEqual(room.publicView().game.card.ready, [W[1].id]);
  msg(reader(), { t: 'ready' });
  assert.equal(g.card.stage, 'act');
  assert.equal(view(W[1]).me.move, view(reader()).me.move);
  assert.equal(room.publicView().game.timer.kind, 'moves');
  // The Guys shout it first: stolen.
  msg(reader(), { t: 'moves', side: 'guys' });
  assert.equal(g.pos, 3);
  assert.equal(g.result.stolen, true);
  wait(T.result);
  assert.equal(g.turn, 'guys');
  // Nobody gets it in time: the turn passes.
  at(-4);
  msg(reader(), { t: 'actor', pid: G[0].id });
  msg(G[0], { t: 'ready' }); msg(reader(), { t: 'ready' });
  wait(T.moves);
  assert.equal(g.result.timeout, true);
  assert.equal(g.pos, -4);
  wait(T.result);
  assert.equal(g.turn, 'gals');
});

test('one actor on the team: nobody to pick, straight to getting ready', () => {
  const { g, room, W, begin, at, msg, reader } = setup({ gals: 1 });
  begin();
  at(4);
  assert.equal(g.card.stage, 'ready');
  // An actor who has wandered off is not waited for, and the host can start the clock too.
  room.setConnected(W[0].id, false);
  msg(reader(), { t: 'ready' });
  assert.equal(g.card.stage, 'act');
});

test('Our Moves: the host or the TV can start the clock', () => {
  const { g, room, begin, at } = setup({ gals: 1 });
  begin();
  at(4);
  room.act('advance');
  assert.equal(g.card.stage, 'act');
});

test('a set without the other decks plays Our Facts and Our Stuff everywhere', () => {
  const q = (n) => ({ q: `Question ${n}?`, a: `Answer ${n}` });
  const mini = { title: 'Mini', guyStuff: { facts: [q(1), q(2)] }, galStuff: { stuff: [q(3)] } };
  const { g, begin, at } = setup({ sets: { family: mini } });
  begin();
  for (const pos of [0, 2, 3, 4, 5]) { at(pos); assert.equal(g.card.deck, 'facts'); }
  for (const d of DECK_ORDER) assert.ok(g.deck.guyStuff[d]);
});

test('the host can judge, throw out a card, nudge the trophy and end the game', () => {
  const { room, g, G, msg } = setup({ hosts: 1 });
  room.act('start');
  const first = g.card.q;
  const who = g.card.reader;
  room.act('newCard');
  assert.notEqual(g.card.q, first);
  assert.equal(g.card.reader, who, 'the same reader');
  assert.ok(room.hostView().game.card.answer);
  room.act('judge', { right: true });
  assert.equal(g.pos, 1);
  assert.throws(() => msg(G[0], { t: 'advance' }), /host/);
  room.act('advance');
  assert.equal(g.phase, 'card');
  room.act('nudge', { delta: -1 });
  assert.equal(g.pos, 0);
  room.act('endGame');
  assert.equal(g.phase, 'lobby');
});

test('settings: trophies to win and challenges, only in the lobby', () => {
  const { room, g, begin } = setup();
  room.act('setTarget', { n: 1 });
  assert.equal(g.settings.target, 1);
  assert.throws(() => room.act('setTarget', { n: 5 }), /1, 2 or 3/);
  begin();
  assert.throws(() => room.act('setTarget', { n: 3 }), /before the game/);
  assert.equal(room.publicView().game.target, 1);
});

test('reactions float up on the TV for a few seconds', () => {
  const { room, G, msg, wait } = setup();
  msg(G[0], { t: 'react', e: 0 });
  msg(G[0], { t: 'react', e: 1 });   // too soon after the last one
  assert.equal(room.publicView().game.reactions.length, 1);
  assert.equal(room.publicView().game.reactions[0].side, 'guys');
  wait(5000);
  assert.equal(room.publicView().game.reactions.length, 0);
});

test('a saved game comes back where it was', () => {
  const { room, g, begin, judge } = setup();
  begin();
  judge(true);
  const saved = JSON.parse(JSON.stringify(room.toJSON()));
  const again = new Room({ games: GAMES, now: () => 99999, loadContent: (gid, id) => SETS[id] ?? null, listContent: () => Object.entries(SETS).map(([id, s]) => ({ id, title: s.title })) });
  assert.equal(again.restore(saved), true);
  assert.equal(again.game.phase, 'result');
  assert.equal(again.game.pos, 1);
  assert.equal(again.publicView().game.pos, 1);
  assert.equal(g.cardN, again.game.cardN);
  again.game.advance();
  assert.equal(again.game.phase, 'card');
  assert.equal(again.game.turn, 'gals');
});

// ---------- the pawn race ----------
import { RACE_LEN, RACE_WILD, RACE_QUESTIONS, WILD_CARDS } from '../games/guysvsgals/game.js';

function race(opts = {}) {
  const s = setup(opts);
  s.room.act('setRules', { mode: 'race' });
  if (opts.pawns) s.room.act('setPawns', { n: opts.pawns });
  return s;
}
const pawn = (g, side) => g.race.pawns[side].find((p) => p.state === 'board');

test('the race: a coin toss, three questions a card, one space for each right answer', () => {
  const { room, g, W, begin, judge, wait, view } = race();
  begin();
  assert.equal(g.turn, 'gals', 'random() is 0 here, so the toss goes to the Gals');
  const tv = room.publicView().game;
  assert.equal(tv.mode, 'race');
  assert.equal(tv.race.toss, 'gals');
  assert.equal(tv.race.len, RACE_LEN);
  assert.deepEqual(tv.race.pawns.gals.map((p) => p.state), ['board', 'wait']);
  assert.equal(tv.race.pawns.gals[0].x, RACE_LEN + 1, 'the Gals start on the right');
  assert.equal(tv.card.q, 1);
  assert.equal(tv.card.of, RACE_QUESTIONS);
  assert.ok(['facts', 'stuff', 'pics'].includes(tv.card.deck));
  assert.equal(tv.card.answer, undefined);
  assert.equal(view(W[0]).me.canChallenge, false, 'no challenges in the race');
  assert.throws(() => room.playerMessage(W[0].id, { t: 'challenge' }), /no challenges/);
  const first = g.card.n;
  judge(true);
  assert.equal(pawn(g, 'gals').at, 1);
  assert.equal(g.result.more, true);
  wait(T.result);
  assert.equal(g.turn, 'gals');
  assert.equal(g.card.i, 1, 'the second question on the same card');
  assert.notEqual(g.card.n, first);
  judge(false);
  assert.equal(g.result.more, false);
  assert.equal(g.result.next, 'guys');
  wait(T.result);
  assert.equal(g.turn, 'guys');
  assert.equal(g.card.i, 0);
  // Three right ends the turn.
  for (let i = 0; i < 3; i++) { judge(true); if (i < 2) { assert.equal(g.result.more, true); wait(T.result); } }
  assert.equal(g.result.more, false);
  assert.equal(pawn(g, 'guys').at >= 3, true);
});

test('the race: your own wild space draws a card at once; the other side’s only if you stop there', () => {
  const { g, begin, judge, wait } = race();
  begin();
  // The Gals' own wild space is RACE_WILD.gals: x 10 is two spaces in from their START.
  const gx = (at) => RACE_LEN + 1 - at;
  pawn(g, 'gals').at = gx(RACE_WILD.gals[0]) - 1;
  judge(true);
  assert.ok(g.result.wild, 'landed on their own wild space');
  assert.equal(g.result.wild.owner, 'gals');
  assert.ok(WILD_CARDS.gals.some((c) => c.kind === g.result.wild.kind));
  assert.ok(!g.result.wild.text.includes('{'));
  // random() is 0: the first card, ahead 2. Keep going: same card, next question.
  assert.equal(pawn(g, 'gals').at, gx(RACE_WILD.gals[0]) + 2);
  assert.equal(g.result.more, true);
  wait(T.wild);
  // Land on the Guys' wild space mid-turn: nothing yet.
  pawn(g, 'gals').at = gx(RACE_WILD.guys[0]) - 1;
  judge(true);
  assert.equal(g.result.wild, undefined, 'only if the turn ends there');
  wait(T.result);
  judge(false);
  assert.equal(g.result.wild?.owner, 'guys', 'the turn ended on the Guys’ wild space');
});

test('the race: a pawn across brings on the next; both across wins', () => {
  const { room, g, begin, judge, wait } = race();
  begin();
  pawn(g, 'gals').at = RACE_LEN;
  judge(true);
  assert.equal(g.result.crossed, 'gals');
  assert.equal(g.result.more, false, 'getting across ends the turn');
  assert.deepEqual(g.race.pawns.gals.map((p) => p.state), ['home', 'board']);
  wait(T.result);
  room.act('nudge', { delta: 1, side: 'guys' });
  assert.equal(pawn(g, 'guys').at, 1, 'the host can nudge a pawn');
  judge(false); wait(T.result);
  pawn(g, 'gals').at = RACE_LEN;
  judge(true);
  assert.equal(g.result.won, 'gals');
  wait(T.result);
  assert.equal(g.phase, 'gameover');
  assert.deepEqual(room.publicView().game.winners, ['gals']);
});

test('the race: ending a turn on the other team’s pawn takes it prisoner, once, and it is freed when the next one crosses', () => {
  const { g, begin, judge, wait } = race();
  begin();
  // The Gals stop on the Guys' pawn.
  pawn(g, 'guys').at = 4;              // x 4
  pawn(g, 'gals').at = RACE_LEN - 4;   // x 5: one more right lands on x 4
  judge(true); wait(g.result.wild ? T.wild : T.result);
  judge(false);
  assert.equal(g.result.captured, 'guys');
  assert.deepEqual(g.race.pawns.guys.map((p) => p.state), ['jail', 'board']);
  assert.equal(g.race.captured.gals, true);
  wait(T.wild);
  // The Guys' second pawn gets across: the prisoner comes back to START.
  pawn(g, 'guys').at = RACE_LEN;
  judge(true);
  assert.deepEqual(g.race.pawns.guys.map((p) => p.state), ['board', 'home']);
  assert.equal(pawn(g, 'guys').at, 0);
});

test('the race: one pawn each in a quick race, and no prisoners', () => {
  const { g, begin, judge, wait } = race({ pawns: 1 });
  begin();
  assert.equal(g.race.pawns.gals.length, 1);
  pawn(g, 'guys').at = 4;
  pawn(g, 'gals').at = RACE_LEN - 4;
  judge(true); wait(g.result.wild ? T.wild : T.result);
  judge(false);
  assert.equal(g.result.captured, undefined);
  wait(T.wild);
  pawn(g, 'guys').at = RACE_LEN;
  judge(true);
  assert.equal(g.result.won, 'guys', 'one pawn across wins a quick race');
});

test('the race survives a restart', () => {
  const { room, g, begin, judge } = race();
  begin();
  judge(true);
  const saved = JSON.parse(JSON.stringify(g.toJSON()));
  const { room: room2 } = setup();
  room2.game.restore(saved);
  assert.equal(room2.game.settings.mode, 'race');
  assert.equal(room2.publicView().game.race.pawns.gals[0].at, 1);
  assert.ok(room.publicView().game.race);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { Room } from '../room.js';
import { GAMES } from '../games/index.js';
import { T, STEP, validateSet, SIDES, LIGHTNING_ITEMS } from '../games/guysvsgals/game.js';

const SETS = Object.fromEntries(readdirSync('data/guysvsgals').filter((f) => f.endsWith('.json'))
  .map((f) => [f.slice(0, -5), JSON.parse(readFileSync(`data/guysvsgals/${f}`, 'utf8'))]));

/** A room with `guys` and `gals` players who have picked their sides. random() is fixed: the Guys win the toss. */
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
  const right = () => room.hostView().game.question.answer;
  const wrong = () => (right() + 1) % g.question.choices.length;
  /** Everyone on the team at play votes for `choice`. */
  const answer = (choice) => { for (const p of g.turn === 'guys' ? G : W) msg(p, { t: 'vote', choice }); };
  const begin = () => { msg(G[0], { t: 'start' }); wait(T.toss); };
  return { room, g, G, W, wait, msg, view, right, wrong, answer, begin, now: () => t };
}

test('the Family set is valid, big, and has both halves', () => {
  for (const set of Object.values(SETS)) assert.equal(validateSet(set), true);
  const fam = SETS.family;
  assert.ok(fam.guyStuff.questions.length >= 100);
  assert.ok(fam.galStuff.questions.length >= 100);
  assert.ok(fam.guyStuff.lightning.length >= 40);
  assert.ok(fam.galStuff.lightning.length >= 40);
  for (const half of [fam.guyStuff, fam.galStuff]) {
    for (const q of half.questions) {
      assert.ok(!q.wrong.includes(q.a), q.q);
      assert.equal(new Set([q.a, ...q.wrong]).size, q.wrong.length + 1, q.q);
    }
  }
});

test('validateSet explains what is missing', () => {
  assert.throws(() => validateSet({ title: 'x' }), /Guy stuff/);
  const q = { q: 'Q?', a: 'A', wrong: ['B'] };
  assert.equal(validateSet({ title: 'x', guyStuff: { questions: [q] }, galStuff: { questions: [q] } }), true);
  assert.throws(() => validateSet({ title: 'x', guyStuff: { questions: [{ q: 'Q?', a: 'A', wrong: [] }] }, galStuff: { questions: [q] } }), /wrong answer/);
  assert.throws(() => validateSet({ title: 'x', guyStuff: { questions: [q], lightning: [{ q: 'S', a: 'yes' }] }, galStuff: { questions: [q] } }), /true or false/);
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

test('coin toss, then a question about the other side’s stuff; the TV never sees the answer early', () => {
  const { room, g, G, W, msg, wait, view } = setup();
  msg(G[0], { t: 'start' });
  assert.equal(g.phase, 'toss');
  assert.equal(g.turn, 'guys');
  wait(T.toss);
  assert.equal(g.phase, 'question');
  const pub = room.publicView().game;
  assert.equal(pub.question.about, 'gals', 'the Guys answer gal stuff');
  assert.equal(pub.question.answer, undefined);
  assert.ok(pub.question.choices.length >= 2 && pub.question.choices.length <= 4);
  assert.equal(view(G[0]).me.answer, undefined, 'the team answering does not see it');
  assert.equal(typeof view(W[0]).me.answer, 'number', 'the other team does');
  assert.equal(typeof room.hostView().game.question.answer, 'number');
  assert.equal(pub.timer.kind, 'answer');
  assert.throws(() => msg(W[0], { t: 'vote', choice: 0 }), /straight face/);
});

test('the team votes; the most popular pick, ties going to the first, is locked in once everyone has voted', () => {
  const { g, G, msg, wait, right, wrong, begin } = setup({ guys: 3 });
  begin();
  msg(G[0], { t: 'vote', choice: wrong() });
  msg(G[1], { t: 'vote', choice: right() });
  assert.equal(g.locked, false);
  assert.equal(g.teamPick(), wrong(), 'a tie goes to the answer picked first');
  msg(G[2], { t: 'vote', choice: right() });
  assert.equal(g.locked, true);
  assert.equal(g.pick, right());
  wait(T.lockPause);
  assert.equal(g.phase, 'reveal');
  assert.equal(g.result.correct, true);
  assert.equal(g.pos.guys, STEP);
});

test('a wrong answer stays put and passes the turn; running out of time counts as wrong', () => {
  const { g, wait, answer, wrong, begin } = setup();
  begin();
  answer(wrong());
  wait(T.lockPause);
  assert.equal(g.result.correct, false);
  assert.equal(g.pos.guys, 0);
  wait(T.reveal);
  assert.equal(g.turn, 'gals');
  assert.equal(g.question.about, 'guys');
  wait(30000);   // nobody votes
  assert.equal(g.locked, true);
  wait(500);
  assert.equal(g.phase, 'reveal');
  assert.equal(g.result.timeout, true);
  assert.equal(g.pos.gals, 0);
});

test('reaching a lightning space plays a Lightning Round: true or false against the clock', () => {
  const { room, g, G, W, msg, wait, answer, right, wrong, begin, view } = setup();
  begin();
  const turn = () => { answer(g.turn === 'guys' ? right() : wrong()); wait(T.lockPause); wait(T.reveal); };
  turn(); turn();                 // guys 2, gals 0
  turn(); turn();                 // guys 4
  assert.equal(g.pos.guys, 4);
  answer(right()); wait(T.lockPause);
  assert.equal(g.pos.guys, 6);
  wait(T.reveal);
  assert.equal(g.phase, 'lightning-intro', 'passing space 5 starts a Lightning Round');
  assert.equal(room.publicView().game.lightning.side, 'guys');
  wait(T.lightningIntro);
  assert.equal(g.phase, 'lightning');
  const pub = room.publicView().game;
  assert.equal(pub.lightning.total, LIGHTNING_ITEMS);
  assert.ok(pub.lightning.current);
  assert.equal(pub.timer.kind, 'lightning');
  assert.equal(typeof view(W[0]).me.lightningAnswer, 'boolean', 'the other team knows');
  assert.equal(view(G[0]).me.lightningAnswer, undefined);
  assert.throws(() => msg(W[0], { t: 'lightning', said: true }), /Lightning Round/);
  // Two right, then the clock runs out.
  for (let k = 0; k < 2; k++) {
    const truth = g.lightning.items[g.lightning.i].a;
    msg(G[k % 2], { t: 'lightning', said: truth });
    wait(T.lightningFlash);
  }
  assert.equal(g.lightning.rights, 2);
  wait(T.lightning);
  assert.equal(g.phase, 'lightning-done');
  assert.equal(g.pos.guys, 8);
  wait(T.lightningDone);
  assert.equal(g.phase, 'question');
  assert.equal(g.turn, 'gals');
  assert.deepEqual(g.used.guys, [5]);
});

test('the first team home wins, but the other team gets a last chance and can tie', () => {
  const { g, wait, answer, right, wrong, begin, room } = setup();
  g.settings.lightning = false;
  g.settings.length = 15;
  begin();
  // The Guys answer everything right, the Gals everything wrong, until the Guys are home.
  let guard = 0;
  while (g.phase !== 'gameover' && guard++ < 40) {
    if (g.phase === 'question') { answer(g.turn === 'guys' ? right() : wrong()); wait(T.lockPause); }
    wait(T.reveal);
  }
  assert.equal(g.phase, 'gameover');
  assert.deepEqual(g.winners, ['guys']);
  assert.equal(g.pos.guys, 15);
  assert.equal(room.publicView().game.line.text, 'The Guys win!');

  // A tie: the Gals catch up on their last chance.
  const s = setup();
  s.g.settings.lightning = false;
  s.g.settings.length = 15;
  s.begin();
  s.g.pos.guys = 13;
  s.g.pos.gals = 13;
  while (s.g.phase !== 'gameover') {
    if (s.g.phase === 'question') { s.answer(s.right()); s.wait(T.lockPause); }
    s.wait(T.reveal);
    if (s.g.lastChance) assert.equal(s.g.turn, 'gals');
  }
  assert.deepEqual(s.g.winners.sort(), ['gals', 'guys']);
  assert.equal(s.room.publicView().game.line.text, 'It’s a tie!');
});

test('the host can lock in now, throw out a question, nudge a token and end the game', () => {
  const { room, g, G, begin, msg } = setup({ hosts: 1 });
  room.act('start');
  room.act('advance');
  assert.equal(g.phase, 'question');
  const first = g.question.q;
  room.act('newQuestion');
  assert.notEqual(g.question.q, first);
  room.act('nudge', { side: 'gals', delta: 1 });
  assert.equal(g.pos.gals, 1);
  assert.throws(() => msg(G[0], { t: 'advance' }), /host/);
  room.act('advance');
  assert.equal(g.locked, true);
  room.act('endGame');
  assert.equal(g.phase, 'lobby');
  assert.equal(begin.length, 0);
});

test('settings: length, answer time and lightning, only in the lobby', () => {
  const { room, g, begin } = setup();
  room.act('setLength', { n: 30 });
  room.act('setAnswerTime', { secs: 0 });
  assert.equal(g.lightningSpaces().join(), '5,10,15,20,25');
  room.act('setLightning', { on: false });
  assert.deepEqual(g.lightningSpaces(), []);
  assert.throws(() => room.act('setLength', { n: 7 }), /quick/);
  begin();
  assert.equal(g.timer, null, 'no clock');
  assert.throws(() => room.act('setLength', { n: 15 }), /before the game/);
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
  const { room, g, begin, answer, right, wait } = setup();
  begin();
  answer(right());
  wait(T.lockPause);
  const saved = JSON.parse(JSON.stringify(room.toJSON()));
  const again = new Room({ games: GAMES, now: () => 99999, loadContent: (gid, id) => SETS[id] ?? null, listContent: () => Object.entries(SETS).map(([id, s]) => ({ id, title: s.title })) });
  assert.equal(again.restore(saved), true);
  assert.equal(again.game.phase, 'reveal');
  assert.equal(again.game.pos.guys, STEP);
  assert.equal(again.publicView().game.teams.find((t) => t.side === 'guys').pos, STEP);
  assert.equal(g.questionN, again.game.questionN);
});

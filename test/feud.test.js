import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { Room } from '../room.js';
import { GAMES } from '../games/index.js';
import { GameError } from '../lib.js';
import { validateSet, matchAnswer, ranked } from '../games/feud/game.js';

const dir = new URL('../data/feud/', import.meta.url);
const set = JSON.parse(readFileSync(new URL('family-night-basics.json', dir)));

function setup({ players = ['Ann', 'Bo', 'Cy', 'Di'], content = set } = {}) {
  let t = 1000;
  const room = new Room({ games: GAMES, now: () => t, loadContent: () => content });
  room.chooseGame('feud');
  const ps = players.map((n) => room.join({ name: n }));
  const g = room.game;
  g.chooseSet('x');
  return { room, g, ps, clock: { advance: (ms) => { t += ms; } }, red: room.teams[0], blue: room.teams[1] };
}
const answersOf = (g) => ranked(g.set.rounds[g.run.round]);
/** Start and win the face-off for `team` (they pass or play as asked). */
function startAndWinFaceoff(g, team, play = true) {
  g.startGame();
  g.awardBuzz(team.id); g.answer(0);
  g.choose(play);
}

test('shipped Feud sets are valid, with sorted-able answers and no repeats', () => {
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  assert.ok(files.length >= 5);
  for (const f of files) {
    const s = JSON.parse(readFileSync(new URL(f, dir)));
    assert.equal(validateSet(s), true, f);
    assert.equal(s.rounds.length, 5, f);
    assert.equal(s.fastMoney.length, 5, f);
    const qs = [...s.rounds, ...s.fastMoney].map((q) => q.question);
    assert.equal(new Set(qs).size, qs.length, `${f} repeats a question`);
    for (const q of [...s.rounds, ...s.fastMoney]) assert.ok(q.question.length <= 120, `too long: ${q.question}`);
  }
});

test('validateSet rejects malformed sets', () => {
  assert.throws(() => validateSet({ title: 'x', rounds: [] }), GameError);
  const few = structuredClone(set); few.rounds[0].answers = few.rounds[0].answers.slice(0, 2);
  assert.throws(() => validateSet(few), /3 to 8 answers/);
  const dup = structuredClone(set); dup.rounds[1].answers[1].text = dup.rounds[1].answers[0].text;
  assert.throws(() => validateSet(dup), /twice/);
  const fm = structuredClone(set); fm.fastMoney = fm.fastMoney.slice(0, 3);
  assert.throws(() => validateSet(fm), /Fast Money needs exactly 5/);
  const noFm = structuredClone(set); delete noFm.fastMoney;
  assert.equal(validateSet(noFm), true);
});

test('matching a guess to a survey answer', () => {
  const a = ranked(set.rounds[0]);
  assert.equal(matchAnswer(a, 'brush my teeth'), 0);
  assert.equal(matchAnswer(a, 'Putting on SHOES'), 1);        // contained in the answer's words
  assert.equal(matchAnswer(a, 'keys!'), 2);
  assert.equal(matchAnswer(a, 'dance'), -1);
  assert.equal(matchAnswer(a, ''), -1);
  assert.equal(matchAnswer(a, 'a'), -1);
});

test('the room always plays Feud in two teams, and goes back when another game is picked', () => {
  const { room } = setup({ players: ['Ann'] });
  assert.equal(room.mode, 'teams');
  assert.equal(room.teams.length, 2);
  assert.throws(() => room.setMode('players'), /fixed/);
  assert.throws(() => room.setTeamCount(4), /fixed/);
  for (const n of ['Bo', 'Cy', 'Di', 'Ed', 'Fay', 'Gus']) room.join({ name: n });   // seven players would be four teams in Jeopardy... not here
  assert.equal(room.teams.length, 2);
  room.chooseGame('jeopardy');
  assert.equal(room.mode, 'teams');          // auto: more than five players
  room.removePlayer(room.players[0].id); room.removePlayer(room.players[0].id);
  room.removePlayer(room.players[0].id);
  assert.equal(room.mode, 'players');
});

test('start needs two teams with a player each', () => {
  const lone = setup({ players: ['Ann'] });
  lone.room.setPlayerTeam(lone.room.players[0].id, lone.red.id);
  assert.throws(() => lone.g.startGame(), /at least one player/);
  const { g } = setup();
  g.startGame();
  assert.equal(g.run.status, 'round');
  assert.equal(g.run.step, 'faceoff');
  assert.throws(() => g.startGame(), /already/);
});

test('face-off: only the two players stepping up can buzz, first press wins the turn', () => {
  const { g, room, red, blue, ps } = setup();
  g.startGame();
  const reps = g.run.faceoff.reps;
  const [redRep, blueRep] = [reps[red.id], reps[blue.id]];
  assert.ok(redRep && blueRep);
  assert.equal(g.buzz(redRep).ok, false, 'buzzers are closed until the host opens them');
  g.openBuzzers();
  const bystander = room.players.find((p) => p.id !== redRep && p.id !== blueRep);
  assert.equal(g.buzz(bystander.id).ok, false);
  assert.equal(g.buzz(blueRep).ok, true);
  assert.equal(g.run.faceoff.turn, blue.id);
  assert.equal(g.buzz(redRep).ok, false, 'second press is too late');
  assert.ok(ps.length);
});

test('face-off: the top answer wins outright', () => {
  const { g, red } = setup();
  g.startGame(); g.awardBuzz(red.id); g.answer(0);
  assert.equal(g.run.faceoff.winner, red.id);
  assert.equal(g.run.step, 'choose');
});

test('face-off: otherwise the other team gets a go, and the better answer wins', () => {
  const { g, red, blue } = setup();
  g.startGame(); g.awardBuzz(red.id);
  g.answer(3);                                   // a low answer
  assert.equal(g.run.faceoff.turn, blue.id);
  g.answer(1);                                   // better
  assert.equal(g.run.faceoff.winner, blue.id);
  // and the other way round: second does worse
  const r2 = setup(); r2.g.startGame(); r2.g.awardBuzz(r2.red.id); r2.g.answer(1);
  r2.g.answer(4);
  assert.equal(r2.g.run.faceoff.winner, r2.red.id);
});

test('face-off: a miss hands over, and two misses mean a replay', () => {
  const { g, red, blue } = setup();
  g.startGame(); g.awardBuzz(red.id); g.miss();
  assert.equal(g.run.faceoff.turn, blue.id);
  g.answer(2);
  assert.equal(g.run.faceoff.winner, blue.id);
  const two = setup(); two.g.startGame(); two.g.awardBuzz(two.red.id); two.g.miss(); two.g.miss();
  assert.equal(two.g.run.step, 'faceoff');
  assert.equal(two.g.run.faceoff.winner, null);
  two.g.replayFaceoff();
  assert.equal(two.g.run.faceoff.open, true);
  two.g.faceoffWin(two.blue.id);                 // the host can always just decide
  assert.equal(two.g.run.step, 'choose');
});

test('the face-off winner can pass the board to the other team', () => {
  const { g, red, blue } = setup();
  startAndWinFaceoff(g, red, false);
  assert.equal(g.run.control, blue.id);
  assert.equal(g.run.step, 'play');
});

test('three strikes hand the steal to the other team; a good steal takes the pot', () => {
  const { g, red, blue } = setup();
  startAndWinFaceoff(g, red);
  g.answer(1);                                   // answers 0 and 1 are up
  const pot = g.pot();
  g.miss(); g.miss();
  assert.equal(g.run.step, 'play');
  g.miss();
  assert.equal(g.run.step, 'steal');
  assert.equal(g.run.control, blue.id);
  g.answer(2);
  assert.equal(g.run.step, 'roundEnd');
  assert.equal(g.run.winner, blue.id);
  assert.equal(blue.score, pot + ranked(set.rounds[0])[2].points);
  assert.equal(red.score, 0);
});

test('a failed steal leaves the pot with the team that struck out', () => {
  const { g, red, blue } = setup();
  startAndWinFaceoff(g, red);
  const pot = g.pot();
  g.miss(); g.miss(); g.miss();
  g.miss();
  assert.equal(g.run.winner, red.id);
  assert.equal(red.score, pot);
  assert.equal(blue.score, 0);
});

test('clearing the board wins the round for the team playing', () => {
  const { g, red } = setup();
  startAndWinFaceoff(g, red);
  const n = answersOf(g).length;
  for (let i = 1; i < n; i++) g.answer(i);
  assert.equal(g.run.step, 'roundEnd');
  assert.equal(g.run.winner, red.id);
  assert.equal(red.score, answersOf(g).reduce((s, a) => s + a.points, 0));
});

test('an answer cannot be revealed twice, and "answer" needs a turn in the face-off', () => {
  const { g, red } = setup();
  g.startGame();
  assert.throws(() => g.answer(0), /Open the buzzers/);
  g.awardBuzz(red.id); g.answer(0);
  g.choose(true);
  assert.throws(() => g.answer(0), /already up/);
  assert.throws(() => g.answer(99), /no such answer/);
});

test('round multipliers: x1, x1, x1, x2, x3 (and off when switched off)', () => {
  const { g } = setup();
  g.startGame();
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => g.multiplier(i)), [1, 1, 1, 2, 3]);
  g.setSettings({ multipliers: false });
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => g.multiplier(i)), [1, 1, 1, 1, 1]);
});

test('a double round banks double', () => {
  const { g, red } = setup();
  g.setSettings({ targetScore: 5000 });
  g.startGame();
  for (let r = 0; r < 3; r++) { g.run.step = 'roundEnd'; g.nextRound(); }
  assert.equal(g.run.round, 3);
  g.awardBuzz(red.id); g.answer(0); g.choose(true);
  const n = answersOf(g).length;
  for (let i = 1; i < n; i++) g.answer(i);
  const total = answersOf(g).reduce((s, a) => s + a.points, 0);
  assert.equal(red.score, total * 2);
  assert.equal(g.run.awarded, total * 2);
});

test('undo takes back a mis-tap, including the points', () => {
  const { g, red } = setup();
  startAndWinFaceoff(g, red);
  g.answer(1);
  g.undo();
  assert.deepEqual(g.run.revealed, [0]);
  g.miss();
  assert.equal(g.run.strikes, 1);
  g.undo();
  assert.equal(g.run.strikes, 0);
  const n = answersOf(g).length;
  for (let i = 1; i < n; i++) g.answer(i);
  assert.ok(red.score > 0);
  g.undo();                                      // un-clear the board
  assert.equal(red.score, 0);
  assert.equal(g.run.step, 'play');
  const empty = setup(); assert.throws(() => empty.g.undo(), /Nothing to undo/);
});

test('after the last round a leader goes to Fast Money; with it switched off the game just ends', () => {
  const a = setup();
  a.g.startGame(); a.red.score = 120; a.blue.score = 80;
  a.g.run.round = 4; a.g.run.step = 'roundEnd';
  a.g.nextRound();
  assert.equal(a.g.run.status, 'fastmoney');
  assert.equal(a.g.run.fm.team, a.red.id);
  assert.equal(a.g.run.fm.step, 'pick');

  const b = setup();
  b.g.setSettings({ fastMoney: false });
  b.g.startGame(); b.g.run.round = 4; b.g.run.step = 'roundEnd';
  b.g.nextRound();
  assert.equal(b.g.run.status, 'done');
});

test('reaching the winning score ends the rounds early; a tie lets the host pick the Fast Money team', () => {
  const { g, red, blue } = setup();
  g.setSettings({ targetScore: 100 });
  g.startGame(); red.score = 100; blue.score = 100;
  g.run.step = 'roundEnd';
  g.nextRound();
  assert.equal(g.run.status, 'fastmoney');
  assert.equal(g.run.fm.step, 'team');
  assert.throws(() => g.fmStart(), /Choose the two players|Fast Money has already/);
  g.fmTeam(blue.id);
  assert.equal(g.run.fm.step, 'pick');
  assert.equal(g.run.fm.team, blue.id);
});

function toFastMoney(ctx) {
  const { g, red, blue } = ctx;
  g.startGame(); red.score = 150; blue.score = 50;
  g.run.round = 4; g.run.step = 'roundEnd';
  g.nextRound();
  return g.run.fm;
}

test('Fast Money: two players on the leading team, answers from their phones, scored by the host', () => {
  const ctx = setup({ players: ['Ann', 'Bo', 'Cy', 'Di', 'Ed', 'Fay'] });
  const { g, room, red } = ctx;
  const fm = toFastMoney(ctx);
  const members = room.players.filter((p) => p.teamId === red.id);
  assert.equal(members.length, 3);
  assert.deepEqual(fm.players, [members[0].id, members[1].id]);
  g.fmPlayers([members[2].id, members[0].id]);
  assert.deepEqual(fm.players, [members[2].id, members[0].id]);
  assert.throws(() => g.fmPlayers([members[0].id, room.players.find((p) => p.teamId !== red.id).id]), /on the team/);
  g.fmStart();
  assert.equal(fm.step, 'p1');
  assert.ok(g.publicView().fm.timer.leftMs > 0);

  const [first, second] = [members[2], members[0]];
  assert.throws(() => g.fmAnswersFrom(second.id, ['x']), /not your turn/);
  g.fmAnswersFrom(first.id, ['apple', 'dog', 'sneakers', 'kitchen', 'nap']);
  assert.equal(g.publicView().fm.submitted.p1, true);
  // The phone's answers are private until the host scores them.
  assert.equal(g.publicView().fm.rows[0].p1.typed, null);
  assert.equal(g.hostView().fm.rows[0].p1.typed, 'apple');
  g.fmNext();
  assert.equal(fm.step, 'p2');
  g.fmAnswersFrom(second.id, ['Apple', 'cat', 'shoes', 'garage', 'bake']);
  g.fmNext();
  assert.equal(fm.step, 'reveal');

  const h = g.hostView().fm.rows;
  assert.equal(h[0].p1.suggest.index, 0);                 // apple
  assert.equal(h[0].p2.suggest.dup, true, 'player 2 repeated player 1');
  assert.equal(h[0].p2.suggest.points, 0);
  assert.equal(h[1].p2.suggest.label, 'Cat');

  for (let q = 0; q < 5; q++) for (const s of ['p1', 'p2']) {
    g.fmShowAnswer(s, q);                                // what they said
    g.fmShowPoints(s, q);                                // "survey says": the suggestion's points
  }
  assert.equal(fm.step, 'results');
  const v = g.publicView().fm;
  assert.equal(v.rows[0].p1.typed, 'apple');              // shown once the host shows it
  const t = g.fmTotals();
  assert.equal(t.total, t.p1 + t.p2);
  assert.equal(v.won, t.total >= 200);
  assert.ok(t.p1 > 0 && t.p2 > 0);
  g.finishGame();
  assert.equal(g.publicView().result.fastMoney.total, t.total);
});

test('Fast Money: the host can type answers that were said out loud, and judge by hand', () => {
  const ctx = setup(); const { g } = ctx;
  toFastMoney(ctx);
  g.fmStart();
  g.fmSetAnswers('p1', ['grapes', 'hamster', 'boots', 'bathroom', 'read']);
  g.fmNext();
  g.fmSetAnswers('p2', ['pear', '', '', '', '']);
  g.fmNext();
  assert.throws(() => g.fmShowPoints('p1', 0, 16, 'Grapes'), /Show what they said first/);
  g.fmShowAnswer('p1', 0);
  g.fmShowPoints('p1', 0, 16, 'Grapes');
  assert.equal(g.publicView().fm.rows[0].p1.points, 16);
  assert.throws(() => g.fmShowPoints('p1', 0, 500), /0 to 100/);
  assert.throws(() => g.fmShowAnswer('p3', 0), /Unknown/);
  assert.throws(() => g.fmShowAnswer('p1', 0), /already up/);
  assert.equal(g.run.fm.step, 'reveal');
  g.fmShowPoints('p1', 0, 12, 'Orange');            // the host can still correct a score
  assert.equal(g.publicView().fm.rows[0].p1.points, 12);
});

test('Fast Money: an answer nobody gave is a 0 that needs just one tap to show', () => {
  const ctx = setup(); const { g } = ctx;
  toFastMoney(ctx);
  g.fmStart();
  g.fmSetAnswers('p1', ['apple', '', 'socks', '   ', 'nap']);
  g.fmNext();                                       // player 2 never answers anything
  g.fmNext();
  const rows = () => g.publicView().fm.rows;
  assert.equal(rows()[1].p1.shown, 0, 'nothing is shown until the host reveals it');
  assert.equal(rows()[1].p1.judged, false);
  g.fmShowAnswer('p1', 1);                          // a blank goes straight to its 0
  assert.equal(rows()[1].p1.shown, 2);
  assert.equal(rows()[1].p1.points, 0);
  assert.equal(rows()[1].p1.label, 'No answer');
  assert.equal(rows()[1].p1.typed, '');
  assert.equal(rows()[0].p1.shown, 0, 'a real answer waits for the host');
  assert.equal(g.run.fm.step, 'reveal');
  assert.equal(g.hostView().fm.rows[0].p1.suggest.rank, 1);
  assert.equal(g.hostView().fm.rows[1].p1.blank, true);
  for (const [s, q] of [['p1', 0], ['p1', 2], ['p1', 3], ['p1', 4]]) { g.fmShowAnswer(s, q); if (rows()[q][s].shown === 1) g.fmShowPoints(s, q); }
  for (let q = 0; q < 5; q++) g.fmShowAnswer('p2', q);   // every one of player 2's is blank
  assert.equal(g.run.fm.step, 'results');
});

test('Fast Money: the TV only gets what has been revealed, and the total counts only shown points', () => {
  const ctx = setup(); const { g } = ctx;
  toFastMoney(ctx);
  g.fmStart();
  g.fmSetAnswers('p1', ['apple', 'dog', 'socks', 'kitchen', 'nap']); g.fmNext();
  g.fmSetAnswers('p2', ['banana', 'cat', 'shoes', 'garage', 'read']); g.fmNext();
  const cell = () => g.publicView().fm.rows[0].p1;
  assert.deepEqual([cell().shown, cell().typed, cell().points, cell().label], [0, null, null, null]);
  g.fmShowAnswer('p1', 0);
  assert.deepEqual([cell().shown, cell().typed, cell().points, cell().label, cell().judged], [1, 'apple', null, null, false]);
  assert.equal(g.publicView().fm.totals.total, 0, 'points that are not shown yet do not count');
  g.fmShowPoints('p1', 0);
  assert.deepEqual([cell().shown, cell().points, cell().label, cell().judged], [2, 34, 'Apple', true]);
  assert.equal(g.publicView().fm.totals.total, 34);
  // The host's own view has everything all along.
  assert.equal(g.hostView().fm.rows[1].p1.typed, 'dog');
  assert.equal(g.hostView().fm.rows[1].p1.shown, 0);
});

test('Fast Money: if nobody typed anything at all, the host still reveals the zeros one by one', () => {
  const ctx = setup(); const { g } = ctx;
  toFastMoney(ctx);
  g.fmStart(); g.fmNext(); g.fmNext();
  assert.equal(g.run.fm.step, 'reveal');
  for (let q = 0; q < 5; q++) for (const s of ['p1', 'p2']) g.fmShowAnswer(s, q);
  assert.equal(g.run.fm.step, 'results');
  assert.equal(g.fmTotals().total, 0);
  assert.equal(g.publicView().fm.won, false);
});

test('Fast Money gives more time by default, since answers are typed', () => {
  const { g } = setup();
  assert.equal(g.settings.fastMoneySeconds1, 40);
  assert.equal(g.settings.fastMoneySeconds2, 45);
  g.setSettings({ fastMoneySeconds1: 60 });
  assert.equal(g.settings.fastMoneySeconds1, 60);
  assert.throws(() => g.setSettings({ fastMoneySeconds1: 500 }), /5 to 180/);
});

test('Fast Money wins at the goal', () => {
  const ctx = setup(); const { g } = ctx;
  toFastMoney(ctx);
  g.setSettings({ fastMoneyGoal: 50 });
  g.fmStart();
  g.fmSetAnswers('p1', ['a', 'b', 'c', 'd', 'e']); g.fmNext();
  g.fmSetAnswers('p2', ['f', 'g', 'h', 'i', 'j']); g.fmNext();
  for (let q = 0; q < 5; q++) { g.fmShowAnswer('p1', q); g.fmShowPoints('p1', q, 10, 'x'); g.fmShowAnswer('p2', q); g.fmShowPoints('p2', q, 0, null); }
  assert.equal(g.publicView().fm.totals.total, 50);
  assert.equal(g.publicView().fm.won, true);
});

test('the Fast Money timer expires on tick, and phones may still send answers until the host moves on', () => {
  const ctx = setup(); const { g, room, clock } = ctx;
  const fm = toFastMoney(ctx);
  g.fmStart();
  clock.advance(41000); g.tick();
  assert.equal(g.publicView().fm.timer.timedOut, true);
  g.fmAnswersFrom(fm.players[0], ['a', 'b', 'c', 'd', 'e']);
  assert.equal(g.publicView().fm.submitted.p1, true);
  g.fmRestartTimer();
  assert.equal(g.publicView().fm.timer.timedOut, false);
  assert.ok(room);
});

test('the public view hides unrevealed answers; the host sees them all', () => {
  const { g, red } = setup();
  g.startGame(); g.awardBuzz(red.id); g.answer(0);
  const pub = g.publicView().round;
  assert.equal(pub.answers[0].text, 'Brush teeth');
  assert.equal(pub.answers[1].text, null);
  assert.equal(pub.answers[1].points, null);
  assert.equal(pub.answers.length, 6);
  const host = g.hostView().round;
  assert.equal(host.answers[1].text, 'Put on shoes');
  assert.equal(pub.question, set.rounds[0].question);
});

test('"show the rest" reveals the board after the round without scoring it', () => {
  const { g, red } = setup();
  startAndWinFaceoff(g, red);
  g.miss(); g.miss(); g.miss(); g.miss();
  const before = red.score;
  g.revealRest();
  const a = g.publicView().round.answers;
  assert.ok(a.every((x) => x.text));
  assert.ok(a.some((x) => x.late));
  assert.equal(red.score, before);
});

test('saved and restored in the middle of a round', () => {
  const ctx = setup(); const { g, room, red } = ctx;
  startAndWinFaceoff(g, red);
  g.answer(2);
  const saved = JSON.parse(JSON.stringify(room));
  const again = new Room({ games: GAMES, loadContent: () => set });
  assert.equal(again.restore(saved), true);
  assert.equal(again.gameId, 'feud');
  assert.deepEqual(again.game.run.revealed, g.run.revealed);
  assert.equal(again.game.pot(), g.pot());
  assert.equal(again.teams[0].score, red.score);
});

test('ending the game clears scores and returns to setup', () => {
  const { g, red } = setup();
  startAndWinFaceoff(g, red);
  red.score = 99;
  g.endGame();
  assert.equal(g.run.status, 'lobby');
  assert.equal(red.score, 0);
});

test('host actions that make no sense now are refused, not ignored', () => {
  const { g } = setup();
  assert.throws(() => g.answer(0), /No round/);
  assert.throws(() => g.nextRound(), /No round/);
  g.startGame();
  assert.throws(() => g.nextRound(), /Not possible/);
  assert.throws(() => g.fmStart(), /not being played/);
  assert.throws(() => g.act('bogus'), /Unknown action/);
  assert.throws(() => g.setSettings({ targetScore: 5 }), /50 to 5000/);
});

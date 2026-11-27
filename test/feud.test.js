import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { Room } from '../room.js';
import { GAMES } from '../games/index.js';
import { GameError } from '../lib.js';
import { validateSet, matchAnswer, ranked } from '../games/feud/game.js';

const dir = new URL('../data/feud/', import.meta.url);
const set = JSON.parse(readFileSync(new URL('family-night-basics.json', dir)));

function setup({ players = ['Ann', 'Bo', 'Cy', 'Di'], content = set, suddenDeath = false } = {}) {
  let t = 1000;
  const room = new Room({ games: GAMES, now: () => t, loadContent: () => content });
  room.chooseGame('feud');
  const ps = players.map((n) => room.join({ name: n }));
  const g = room.game;
  g.chooseSet('x');
  g.setSettings({ suddenDeath });   // most tests end the rounds below the winning score; the sudden-death tests turn it on
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
  assert.equal(room.mode, 'players');        // Jeopardy is always played by individuals, however many there are (up to eight)
  assert.throws(() => room.setMode('teams'), /fixed/);
  room.chooseGame('feud');
  assert.equal(room.mode, 'teams');
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
  assert.equal(g.publicView().round.stealMissed, false, 'no X yet: the steal has not been tried');
  g.miss();
  assert.equal(g.run.winner, red.id);
  assert.equal(red.score, pot);
  assert.equal(blue.score, 0);
  assert.equal(g.publicView().round.stealMissed, true, 'the TV is told to put the big X up for the failed steal');
  g.undo();
  assert.equal(g.publicView().round.stealMissed, false, 'undoing the miss takes it away');
});

test('a good steal does not show the failed-steal X', () => {
  const { g, red, blue } = setup();
  startAndWinFaceoff(g, red);
  g.miss(); g.miss(); g.miss();
  g.answer(answersOf(g).length - 1);
  assert.equal(g.run.step, 'roundEnd');
  assert.equal(g.run.winner, blue.id);
  assert.equal(g.publicView().round.stealMissed, false);
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

test('the leader has won once the rounds end: Fast Money is a bonus that cannot change the winner', () => {
  const ctx = setup();
  const { g, red, blue } = ctx;
  g.startGame(); red.score = 150; blue.score = 50;
  assert.equal(g.publicView().champion, null, 'no champion while the rounds are being played');
  g.run.round = 4; g.run.step = 'roundEnd';
  g.nextRound();
  assert.equal(g.publicView().champion, red.id, 'the champion is known before Fast Money starts');
  assert.equal(g.publicView().fm.stakes, 'bonus');
  g.fmStart(); g.fmNext(); revealPart(g); g.fmNext(); g.fmNext();
  for (let i = 0; i < 20 && g.run.fm.step !== 'results'; i++) g.fmRevealNext();
  assert.equal(g.publicView().fm.won, false, 'nothing typed scores nothing');
  g.finishGame();
  const r = g.publicView().result;
  assert.equal(r.champion, red.id, 'missing the Fast Money goal does not take the win away');
  assert.equal(r.fastMoney.stakes, 'bonus');
  assert.equal(r.fastMoney.won, false);
});

test('the champions can skip the bonus round', () => {
  const ctx = setup();
  const { g, red } = ctx;
  toFastMoney(ctx);
  g.finishGame();
  assert.equal(g.run.status, 'done');
  assert.equal(g.publicView().result.champion, red.id);
  assert.equal(g.publicView().result.fastMoney.played, false);
});

test('a tie: Fast Money decides it (reach the goal and win, fall short and the other team wins)', () => {
  for (const reach of [true, false]) {
    const { g, red, blue, room } = setup();
    g.setSettings({ fastMoneyGoal: 50 });
    g.startGame(); red.score = 100; blue.score = 100;
    g.run.round = 4; g.run.step = 'roundEnd';
    g.nextRound();
    assert.equal(g.publicView().champion, null);
    assert.equal(g.publicView().fm.stakes, 'tiebreak');
    g.fmTeam(blue.id);
    g.fmStart();
    const [p1] = g.run.fm.players;
    g.fmAnswersFrom(p1, reach ? ['apple', 'dog', 'sneakers', 'kitchen', 'nap'] : ['zzz', 'zzz', 'zzz', 'zzz', 'zzz']);
    g.fmNext(); revealPart(g);
    if (g.run.fm.step !== 'results') { g.fmNext(); g.fmNext(); }   // (reaching the goal ends it right there)
    for (let i = 0; i < 20 && g.run.fm.step !== 'results'; i++) g.fmRevealNext();
    assert.equal(g.publicView().fm.won, reach);
    assert.equal(g.publicView().champion, reach ? blue.id : red.id);
    g.finishGame();
    assert.equal(g.publicView().result.champion, reach ? blue.id : red.id);
    assert.ok(room.publicView());
  }
});

test('a tie with Fast Money switched off ends as a tie', () => {
  const { g, red, blue } = setup();
  g.setSettings({ fastMoney: false });
  g.startGame(); red.score = 80; blue.score = 80;
  g.run.round = 4; g.run.step = 'roundEnd';
  g.nextRound();
  assert.equal(g.run.status, 'done');
  assert.equal(g.publicView().result.champion, null);
});

/** Reveal what is left of the part being revealed (Player 1's answers, then Player 2's), one tap at a time. */
const revealPart = (g) => { for (let i = 0; i < 20 && g.run.fm.step === 'reveal' && !g.publicView().fm.partDone; i++) g.fmRevealNext(); };

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
  // Player 1 is done: their answers are revealed first, with Player 2 still out of the room.
  assert.equal(fm.step, 'reveal');
  assert.equal(fm.part, 'p1');
  assert.throws(() => g.fmShowAnswer('p2', 0), /Player 2 has not played yet/);
  assert.throws(() => g.fmNext(), /Reveal all of Player 1/);
  revealPart(g);
  const p1Total = g.fmTotals().p1;
  assert.ok(p1Total > 0);
  g.fmNext();
  // Then they are hidden, and Player 2 comes in with Player 1's score still up.
  assert.equal(fm.step, 'p2');
  const hiddenView = g.publicView().fm;
  assert.equal(hiddenView.hidden, true);
  assert.deepEqual([hiddenView.rows[0].p1.typed, hiddenView.rows[0].p1.points, hiddenView.rows[0].p1.label, hiddenView.rows[0].p1.hidden], [null, null, null, true]);
  assert.equal(hiddenView.totals.p1, p1Total, 'Player 1’s total stays on the screen');
  assert.equal(g.hostView().fm.rows[0].p1.typed, 'apple', 'the host still sees the answers');
  assert.deepEqual(g.fmAnswersFrom(second.id, ['Apple', 'cat', 'shoes', 'garage', 'bake']), [0, 2], 'player 2 cannot type what player 1 said ("shoes" is the same survey answer as "sneakers")');
  assert.deepEqual(g.publicView().fm.rejected, [0, 2]);
  assert.equal(g.publicView().fm.dupBuzz, 1, 'the TV sounds the buzzer once');
  g.fmAnswersFrom(second.id, ['zzz1', 'cat', 'zzz2', 'garage', 'bake']);
  assert.deepEqual(g.publicView().fm.rejected, []);
  g.fmNext();
  assert.equal(fm.step, 'reveal');
  assert.equal(fm.part, 'p2');
  assert.equal(g.publicView().fm.hidden, false, 'Player 1’s answers are back for the final reveal');
  g.fmSetAnswers('p2', ['Apple', 'cat', 'shoes', 'garage', 'bake']);   // at the reveal the host can still put one in, and it scores 0 as a repeat

  const h = g.hostView().fm.rows;
  assert.equal(h[0].p1.suggest.index, 0);                 // apple
  assert.equal(h[0].p2.suggest.dup, true, 'player 2 repeated player 1');
  assert.equal(h[0].p2.suggest.points, 0);
  assert.equal(h[1].p2.suggest.label, 'Cat');

  for (let q = 0; q < 5; q++) {
    g.fmShowAnswer('p2', q);                             // what they said
    g.fmShowPoints('p2', q);                             // "survey says": the suggestion's points
  }
  assert.equal(fm.step, 'results');
  const v = g.publicView().fm;
  assert.equal(v.rows[0].p1.typed, 'apple');              // shown once the host shows it
  const t = g.fmTotals();
  assert.equal(t.total, t.p1 + t.p2);
  assert.equal(v.won, t.total >= 200);
  assert.equal(t.p1, p1Total);
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
  g.fmNext();                                       // player 1 is done; player 2 will never answer anything
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
  g.fmNext(); g.fmNext();                           // player 1's are hidden; player 2 plays (and says nothing)
  for (let q = 0; q < 5; q++) g.fmShowAnswer('p2', q);   // every one of player 2's is blank
  assert.equal(g.run.fm.step, 'results');
});

test('Fast Money: the TV only gets what has been revealed, and the total counts only shown points', () => {
  const ctx = setup(); const { g } = ctx;
  toFastMoney(ctx);
  g.fmStart();
  g.fmSetAnswers('p1', ['apple', 'dog', 'socks', 'kitchen', 'nap']); g.fmNext();
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
  g.fmStart(); g.fmNext();
  assert.equal(g.run.fm.step, 'reveal');
  for (let q = 0; q < 5; q++) g.fmShowAnswer('p1', q);
  g.fmNext(); g.fmNext();
  for (let q = 0; q < 5; q++) g.fmShowAnswer('p2', q);
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
  for (let q = 0; q < 5; q++) { g.fmShowAnswer('p1', q); g.fmShowPoints('p1', q, 10, 'x'); }
  assert.equal(g.publicView().fm.totals.total, 50);
  assert.equal(g.publicView().fm.won, true);
  assert.equal(g.run.fm.step, 'results', 'the goal is reached: they win right there');
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

test('with nobody hosting, phones type the guesses and the survey judges them', () => {
  const ctx = setup(); const { g, room, red, blue } = ctx;
  g.setSettings({ typed: true });
  g.startGame();
  const a = answersOf(g);
  const f = g.run.faceoff;
  assert.equal(f.open, true);                                     // the buzzers open by themselves
  const redRep = room.player(f.reps[red.id]); const blueRep = room.player(f.reps[blue.id]);
  const redOther = room.players.find((p) => p.teamId === red.id && p.id !== redRep.id);
  assert.throws(() => g.guess(redRep, 'teeth'), /not your turn/);
  g.buzz(blueRep.id);
  assert.equal(g.playerView(blueRep).me.canGuess, true);
  assert.equal(g.playerView(redRep).me.canGuess, false);
  const r = g.guess(blueRep, 'dance party');                     // not on the board: red gets a go
  assert.deepEqual([r.ok, r.hit], [true, false]);
  assert.equal(g.run.faceoff.turn, red.id);
  assert.equal(g.publicView().round.said.text, 'dance party');
  g.guess(redRep, a[2].text);
  assert.equal(g.run.step, 'choose');
  assert.equal(g.run.faceoff.winner, red.id);
  // The winning team plays or passes from a phone; the other team cannot.
  assert.equal(g.playerView(redOther).me.canChoose, true);
  assert.throws(() => room.playerMessage(blueRep.id, { t: 'choose', play: true }), /won the face-off/);
  room.playerMessage(redOther.id, { t: 'choose', play: true });
  assert.equal(g.run.control, red.id);
  // Anyone on the playing team types; a repeat of an answer already up is not a strike.
  assert.equal(g.guess(redOther, a[2].text).reason, 'already-up');
  assert.equal(g.run.strikes, 0);
  g.guess(redOther, 'zzz'); g.guess(redRep, 'qqq'); g.guess(redOther, 'xxx');
  assert.equal(g.run.step, 'steal');
  g.guess(blueRep, a[0].text);                                     // blue steals the pot
  assert.equal(g.run.step, 'roundEnd');
  assert.equal(g.run.winner, blue.id);
  assert.ok(blue.score > 0);
});

test('with nobody hosting, a double miss in the face-off replays by itself', () => {
  const ctx = setup(); const { g, room, red, blue, clock } = ctx;
  g.setSettings({ typed: true });
  g.startGame();
  const f = g.run.faceoff;
  g.buzz(f.reps[red.id]); g.guess(room.player(f.reps[red.id]), 'zzz'); g.guess(room.player(f.reps[blue.id]), 'qqq');
  // Both missed: the next players in line answer, red (who buzzed first) leading off, then blue.
  assert.equal(g.run.faceoff.turn, red.id);
  assert.equal(g.run.faceoff.followup, true);
  const next = (unit) => room.players.filter((p) => p.teamId === unit.id).map((p) => p.id).find((id) => id !== f.reps[unit.id]);
  assert.equal(g.canGuess(room.player(next(red))), true);
  assert.equal(g.canGuess(room.player(f.reps[red.id])), false);
  g.guess(room.player(next(red)), 'zzz'); g.guess(room.player(next(blue)), 'qqq');
  // Everybody has had a go and nobody had an answer: the face-off starts again by itself.
  assert.equal(g.run.faceoff.open, false);
  clock.advance(3000); g.tick();
  assert.equal(g.run.faceoff.open, true);
  assert.deepEqual(g.run.faceoff.attempts, []);
});

test('with nobody hosting, Fast Money moves on when time is up and reveals itself', () => {
  const ctx = setup(); const { g, clock } = ctx;
  const fm = toFastMoney(ctx);
  g.setSettings({ typed: true });
  g.fmStart();
  g.fmAnswersFrom(fm.players[0], fm.players[0] && ['brush teeth', '', '', '', '']);
  clock.advance(41000); g.tick();
  assert.equal(fm.step, 'p1');                                      // a moment for the last answers to arrive
  clock.advance(2000); g.tick();
  assert.equal(fm.step, 'reveal');                                  // Player 1's answers are revealed...
  assert.equal(fm.part, 'p1');
  for (let i = 0; i < 40 && fm.step === 'reveal'; i++) { clock.advance(2500); g.tick(); }
  assert.equal(fm.step, 'p2');                                      // ...then hidden, and Player 2 comes in
  assert.ok(fm.shown.p1.every((v) => v === 2));
  clock.advance(46000); g.tick(); clock.advance(2000); g.tick();
  assert.equal(fm.step, 'reveal');
  assert.equal(fm.part, 'p2');
  for (let i = 0; i < 40 && fm.step === 'reveal'; i++) { clock.advance(2500); g.tick(); }
  assert.equal(fm.step, 'results');
  assert.ok(fm.shown.p1.every((v) => v === 2) && fm.shown.p2.every((v) => v === 2));
});

test('the captain runs the game from a phone; guesses are refused while a host judges', () => {
  const ctx = setup(); const { g, room, ps } = ctx;
  room.setConnected(ps[0].id, true); room.setConnected(ps[1].id, true);
  assert.equal(g.captain(), ps[0].id);
  assert.equal(g.playerView(room.player(ps[0].id)).me.captain, true);
  assert.throws(() => room.playerMessage(ps[1].id, { t: 'cap', action: 'startGame' }), /captain/);
  assert.throws(() => room.playerMessage(ps[0].id, { t: 'cap', action: 'answer', args: { index: 0 } }), /Not allowed/);
  room.playerMessage(ps[0].id, { t: 'cap', action: 'setSettings', args: { typed: true } });
  room.playerMessage(ps[0].id, { t: 'cap', action: 'setSettings', args: { typed: false } });
  room.playerMessage(ps[0].id, { t: 'cap', action: 'startGame' });
  assert.equal(g.run.status, 'round');
  assert.equal(g.run.faceoff.open, false);                          // a host opens the buzzers after reading the question
  const rep = room.player(g.run.faceoff.reps[room.teams[0].id]);
  assert.throws(() => g.guess(rep, 'teeth'), /out loud/);
  assert.ok(g.publicView().sets === undefined);                     // the set list is only for the lobby
  room.setConnected(ps[0].id, false);
  assert.equal(g.captain(), ps[1].id);                               // someone else takes over when the captain leaves
});

test('with a host connected there is no captain, and the captain comes back when the host goes', () => {
  const { room, g, ps } = setup();
  assert.equal(g.captain(), ps[0].id);
  room.setHosts(1);
  assert.equal(g.captain(), null);
  assert.equal(g.publicView().captainId, null);
  assert.equal(g.publicView().hosted, true);
  assert.equal(g.playerView(room.player(ps[0].id)).me.captain, false);
  assert.throws(() => room.playerMessage(ps[0].id, { t: 'cap', action: 'startGame' }), /captain/, 'the first player can no longer run the game from a phone');
  room.setHosts(0);
  assert.equal(g.captain(), ps[0].id);
  assert.equal(g.publicView().hosted, false);
  assert.equal(g.playerView(room.player(ps[0].id)).me.captain, true);
});

test('face-off buzz times are kept to the millisecond, fastest first, and the late presser is listed too', () => {
  const { room, g, clock } = setup();
  g.startGame();
  g.openBuzzers();
  const reps = Object.values(g.run.faceoff.reps);
  clock.advance(412);
  assert.equal(room.playerMessage(reps[1], { t: 'buzz' }).ok, true);          // the second team's player is first
  clock.advance(130);
  assert.equal(room.playerMessage(reps[0], { t: 'buzz' }).ok, false);         // too late: the turn is given
  const times = g.publicView().round.faceoff.buzzes;
  assert.deepEqual(times.map((b) => [b.pid, b.ms, b.won]), [[reps[1], 412, true], [reps[0], 542, false]]);
  assert.ok(times.every((b) => typeof b.name === 'string'));
  g.openBuzzers();                                                            // opening again times everyone afresh
  assert.deepEqual(g.publicView().round.faceoff.buzzes, []);
  clock.advance(3500);
  room.playerMessage(reps[0], { t: 'buzz' });
  clock.advance(5000);
  room.playerMessage(reps[1], { t: 'buzz' });                                 // far too late to count
  assert.deepEqual(g.publicView().round.faceoff.buzzes.map((b) => b.pid), [reps[0]]);
});

test('the host can see which player on the team is up, and it moves on after each guess', () => {
  const { g, red, blue, room } = setup({ players: ['Ann', 'Bo', 'Cy', 'Di', 'Ed', 'Fay'] });
  g.startGame();
  g.openBuzzers(); g.awardBuzz(red.id);
  g.answer(0);                                                                // red's player gets the top answer: red wins the face-off
  g.choose(true);
  const redPlayers = room.players.filter((p) => p.teamId === red.id).map((p) => p.id);
  const rep = g.run.faceoff.reps[red.id];
  const first = g.publicView().round.up;
  assert.equal(first.unitId, red.id);
  assert.notEqual(first.playerId, rep, 'the face-off player just answered: the next in line is up');
  assert.ok(redPlayers.includes(first.playerId));
  g.answer(1);
  const second = g.publicView().round.up.playerId;
  assert.notEqual(second, first.playerId, 'a right guess moves it on');
  g.miss();
  assert.notEqual(g.publicView().round.up.playerId, second, 'so does a strike');
  g.miss(); g.miss();                                                         // three strikes: the other team steals
  assert.equal(g.run.step, 'steal');
  const stealer = g.publicView().round.up;
  assert.equal(stealer.unitId, blue.id);
  assert.ok(room.players.find((p) => p.id === stealer.playerId).teamId === blue.id);
  g.undo();
  assert.equal(g.publicView().round.up.unitId, red.id, 'undo puts it back');
});

test('the host starts a 10 second answer clock for the team that is playing; it runs out by itself and a guess clears it', () => {
  const { g, red, clock } = setup();
  startAndWinFaceoff(g, red);
  assert.equal(g.publicView().round.timer, null, 'nothing runs until the host starts it');
  g.startAnswerTimer();
  let t = g.publicView().round.timer;
  assert.equal(t.totalMs, 10000);
  assert.equal(t.timedOut, false);
  clock.advance(4000); g.tick();
  assert.equal(g.publicView().round.timer.leftMs, 6000);
  clock.advance(6100); g.tick();
  t = g.publicView().round.timer;
  assert.equal(t.timedOut, true);
  assert.equal(g.run.strikes, 0, 'it does not strike by itself: the host decides');
  g.startAnswerTimer();                                                       // the next player: a fresh clock
  assert.equal(g.publicView().round.timer.timedOut, false);
  g.answer(1);
  assert.equal(g.publicView().round.timer, null, 'a guess stops the clock');
  g.setSettings({ answerSeconds: 15 });
  g.startAnswerTimer();
  assert.equal(g.publicView().round.timer.totalMs, 15000);
  assert.throws(() => g.setSettings({ answerSeconds: 1 }), /Answer timer/);
});

test('Fast Money: the second player cannot repeat the first player’s answer, and the phone is told which', () => {
  const ctx = setup({ players: ['Ann', 'Bo', 'Cy', 'Di'] });
  const { g, room, red } = ctx;
  toFastMoney(ctx);
  assert.equal(g.run.status, 'fastmoney');
  const [p1, p2] = g.run.fm.players;
  g.fmStart();
  g.fmSetAnswers('p1', ['one', 'two', 'three', 'four', 'five']);
  g.fmNext();
  for (let q = 0; q < 5; q++) { g.fmShowAnswer('p1', q); g.fmShowPoints('p1', q); }
  g.fmNext();
  assert.equal(g.run.fm.step, 'p2');
  const r = room.playerMessage(p2, { t: 'fm-answers', answers: ['ONE', 'different', 'three!', 'x', 'y'] });
  assert.deepEqual(r.rejected, [0, 2], 'the same words (any case or punctuation) are not taken');
  assert.deepEqual(g.run.fm.answers.p2.slice(0, 3), ['', 'different', '']);
  const ok = room.playerMessage(p2, { t: 'fm-answers', answers: ['uno', 'different', 'tres', 'x', 'y'] });
  assert.deepEqual(ok.rejected, []);
  // Nor can the host enter it: it is turned away like a phone's, the rest are kept, and the host is told which question.
  g.fmSetAnswers('p2', ['one', 'kept', '', '', '']);
  assert.deepEqual(g.run.fm.answers.p2.slice(0, 2), ['', 'kept']);
  assert.deepEqual(g.hostView().fm.rejected, [0]);
  assert.ok(p1 && red);
});

test('Fast Money: the host picks two different players, can swap them, and can change the one who is up', () => {
  const ctx = setup({ players: ['Ann', 'Bo', 'Cy', 'Di'] });
  const { g, room, red } = ctx;
  toFastMoney(ctx);
  const team = room.players.filter((p) => p.teamId === red.id).map((p) => p.id);
  const [a, b] = team;
  assert.throws(() => g.fmPlayers([a, a]), /two different players/);
  assert.throws(() => g.fmPlayers([a, room.players.find((p) => p.teamId !== red.id).id]), /on the team/);
  g.fmPlayers([b, a]);
  assert.deepEqual(g.run.fm.players, [b, a]);
  g.fmStart();
  g.fmPlayers([b, a]);                                  // still allowed while Player 1 is answering
  g.fmNext();
  for (let q = 0; q < 5; q++) g.fmShowAnswer('p1', q);
  g.fmNext();
  g.fmPlayers([b, a]);                                  // Player 2 can be changed while they are up
  assert.throws(() => g.fmPlayers([a, b]), /Player 1 has already answered/);
});

// ---------- face-off: when both players miss, the players behind them answer ----------

test('face-off: if both players miss, the next players in line answer, the team that buzzed first leading off', () => {
  const { g, room, red, blue } = setup({ players: ['Ann', 'Bo', 'Cy', 'Di', 'Ed', 'Fay'] });
  g.startGame();
  const line = (unit) => room.players.filter((p) => p.teamId === unit.id).map((p) => p.id);
  const redLine = line(red); const blueLine = line(blue);
  assert.equal(redLine.length, 3);
  const f = g.run.faceoff;
  const repIndex = (unit, l) => l.indexOf(f.reps[unit.id]);
  const who = () => g.publicView().round.faceoff.reps.find((r) => r.unitId === g.run.faceoff.turn)?.playerId;

  g.awardBuzz(blue.id);                                   // blue buzzed in first
  assert.equal(who(), f.reps[blue.id]);
  g.miss();                                               // blue's player is wrong
  assert.equal(g.run.faceoff.turn, red.id);
  assert.equal(who(), f.reps[red.id]);
  g.miss();                                               // so is red's
  // Both missed: now blue's next player, then red's next player, and so on down the lines.
  assert.equal(g.run.faceoff.turn, blue.id);
  assert.equal(g.run.faceoff.followup, true);
  assert.equal(g.publicView().round.faceoff.followup, true);
  assert.equal(who(), blueLine[(repIndex(blue, blueLine) + 1) % 3]);
  g.miss();
  assert.equal(g.run.faceoff.turn, red.id);
  assert.equal(who(), redLine[(repIndex(red, redLine) + 1) % 3]);
  g.miss();
  assert.equal(g.run.faceoff.turn, blue.id);
  assert.equal(who(), blueLine[(repIndex(blue, blueLine) + 2) % 3]);
  const winner = who();
  g.answer(2);                                            // the first answer on the board wins it, whatever its rank
  assert.equal(g.run.step, 'choose');
  assert.equal(g.run.faceoff.winner, blue.id);
  assert.equal(g.run.faceoff.reps[blue.id], winner, 'the player who won it is the one the turns count on from');
  g.choose(true);
  assert.equal(g.publicView().round.up.playerId, blueLine[(blueLine.indexOf(winner) + 1) % 3], 'the next player after them is up');
});

test('face-off: once everybody on both teams has missed, the face-off starts again', () => {
  const { g, red, blue } = setup();                       // two players a side
  g.startGame();
  g.awardBuzz(red.id);
  for (let i = 0; i < 4; i++) g.miss();                   // red, blue, then red's and blue's second players
  assert.equal(g.run.faceoff.turn, null);
  assert.equal(g.run.faceoff.winner, null);
  assert.equal(g.run.step, 'faceoff');
  g.replayFaceoff();
  assert.equal(g.run.faceoff.open, true);
  assert.deepEqual(g.run.faceoff.attempts, []);
  assert.ok(blue);
});

test('face-off: the top answer still wins at once, and the better of two answers still wins', () => {
  const a = setup(); a.g.startGame(); a.g.awardBuzz(a.red.id); a.g.answer(0);
  assert.equal(a.g.run.faceoff.winner, a.red.id);
  const b = setup(); b.g.startGame(); b.g.awardBuzz(b.red.id); b.g.answer(3); b.g.answer(1);
  assert.equal(b.g.run.faceoff.winner, b.blue.id);
  const c = setup(); c.g.startGame(); c.g.awardBuzz(c.red.id); c.g.miss(); c.g.answer(4);
  assert.equal(c.g.run.faceoff.winner, c.blue.id);
});

// ---------- sudden death ----------

/** The last round has just ended with these scores. */
function afterLastRound(ctx, red, blue) {
  const { g } = ctx;
  g.startGame(); ctx.red.score = red; ctx.blue.score = blue;
  g.run.round = g.set.rounds.length - 1; g.run.step = 'roundEnd';
  g.nextRound();
}

test('sudden death: after the last round, if nobody has the winning score, one face-off is worth five or ten times', () => {
  const ctx = setup({ suddenDeath: true });
  const { g, red, blue } = ctx;
  afterLastRound(ctx, 120, 100);
  assert.equal(g.run.status, 'round', 'not over: nobody reached 300');
  const r = g.publicView().round;
  assert.ok(r.sudden && [5, 10].includes(r.sudden.mult));
  assert.equal(r.sudden.n, 1);
  assert.equal(r.multiplier, r.sudden.mult);
  assert.ok(!set.rounds.some((q) => q.question === r.question), 'a question nobody has played');
  assert.equal(r.step, 'faceoff');
  const top = Math.max(...g.hostView().round.answers.map((a) => a.points));
  assert.equal(r.sudden.mult, 300 - 120 <= top * 5 ? 5 : 10, 'ten times when five is not enough to get there');
  g.awardBuzz(blue.id); g.answer(0);                       // the top answer wins it outright
  assert.equal(g.run.step, 'roundEnd');
  assert.equal(g.run.winner, blue.id);
  assert.equal(g.run.awarded, top * r.sudden.mult);
  assert.equal(blue.score, 100 + top * r.sudden.mult);
  assert.ok(red);
});

test('sudden death: it goes on until somebody reaches the winning score, then the usual end (Fast Money for the winners)', () => {
  const ctx = setup({ suddenDeath: true });
  const { g, red, blue } = ctx;
  g.setSettings({ targetScore: 1000 });
  afterLastRound(ctx, 100, 90);
  assert.equal(g.run.sudden.n, 1);
  const firstQuestion = g.run.sudden.question.question;
  g.awardBuzz(red.id); g.answer(0);
  assert.ok(red.score < 1000, 'one sudden death round is not enough this time');
  g.nextRound();
  assert.equal(g.run.status, 'round');
  assert.equal(g.run.sudden.n, 2, 'another one');
  assert.ok(g.run.faceoff.attempts.length === 0 && g.run.revealed.length === 0);
  g.setSettings({ targetScore: 100 });                     // somebody is over it now
  g.awardBuzz(blue.id); g.answer(0);
  g.nextRound();
  assert.equal(g.run.status, 'fastmoney');
  assert.equal(g.publicView().champion, red.score > blue.score ? red.id : blue.id);
  assert.ok(firstQuestion);
});

test('sudden death: the first answer on the board wins it even when the first players missed; the host cannot pick a winner with no answer', () => {
  const ctx = setup({ suddenDeath: true, players: ['Ann', 'Bo', 'Cy', 'Di', 'Ed', 'Fay'] });
  const { g, red, blue } = ctx;
  afterLastRound(ctx, 100, 100);
  g.awardBuzz(red.id);
  g.miss(); g.miss();                                       // both missed
  assert.equal(g.run.faceoff.followup, true);
  assert.throws(() => g.faceoffWin(blue.id), /tap the one they gave/);
  g.answer(2);                                              // red's next player
  assert.equal(g.run.step, 'roundEnd');
  assert.equal(g.run.winner, red.id);
  assert.equal(g.run.awarded, g.run.sudden.pts * g.run.sudden.mult);
  assert.ok(red.score > 100);
  g.undo();
  assert.equal(g.run.step, 'faceoff');
  assert.equal(red.score, 100);
});

test('sudden death can be switched off: the game then ends after the last round, as it used to', () => {
  const ctx = setup({ suddenDeath: false });
  const { g } = ctx;
  afterLastRound(ctx, 120, 100);
  assert.equal(g.run.status, 'fastmoney');
  const on = setup();
  on.g.setSettings({ suddenDeath: true });
  assert.equal(on.g.settings.suddenDeath, true);
});

test('sudden death: the public view shows it, and a saved game comes back as it was', () => {
  const ctx = setup({ suddenDeath: true });
  const { g, room } = ctx;
  afterLastRound(ctx, 100, 100);
  const saved = JSON.parse(JSON.stringify(g.toJSON()));
  const g2 = room.game;
  g2.restore(saved);
  assert.equal(g2.publicView().round.sudden.n, 1);
  assert.equal(g2.publicView().round.question, g.run.sudden.question.question);
});

// ---------- turning the answers over one at a time ----------

test('after a round the host turns the unguessed answers over one at a time, without scoring', () => {
  const { g, red } = setup();
  startAndWinFaceoff(g, red);
  g.miss(); g.miss(); g.miss(); g.miss();                   // three strikes, the steal fails
  assert.equal(g.run.step, 'roundEnd');
  const score = red.score;
  const answers = () => g.publicView().round.answers;
  assert.ok(answers().filter((a) => !a.revealed && !a.late).every((a) => a.text === null), 'hidden until turned');
  g.showAnswer(3);
  assert.equal(answers()[3].late, true);
  assert.equal(answers()[3].text, g.hostView().round.answers[3].text);
  assert.equal(answers()[1].text === null || answers()[1].revealed, true, 'only that one turned');
  assert.throws(() => g.showAnswer(3), /already up/);
  assert.throws(() => g.showAnswer(99), /no such answer/);
  g.showAnswer();                                           // no index: the best one left
  const turned = answers().filter((a) => a.late).length;
  assert.equal(turned, 2);
  assert.equal(red.score, score, 'turning answers over does not score');
  while (answers().some((a) => !a.revealed && !a.late)) g.showAnswer();
  assert.throws(() => g.showAnswer(), /already up/);
  assert.throws(() => setup().g.showAnswer(), /No round/);
});

// ---------- Fast Money: corrections, and winning at the goal ----------

test('Fast Money: reaching the goal wins right there, then the winners; the host still has every answer', () => {
  const ctx = setup(); const { g, red, clock } = ctx;
  toFastMoney(ctx);
  g.setSettings({ fastMoneyGoal: 60 });
  g.fmStart();
  g.fmSetAnswers('p1', ['apple', 'dog', 'sneakers', 'kitchen', 'nap']);
  g.fmNext();
  g.fmShowAnswer('p1', 0); g.fmShowPoints('p1', 0, 30, 'Apple');
  assert.equal(g.run.fm.step, 'reveal', 'not there yet');
  g.fmShowAnswer('p1', 1); g.fmShowPoints('p1', 1, 31, 'Dog');   // 61 of 60
  assert.equal(g.run.fm.step, 'results');
  assert.equal(g.publicView().fm.won, true);
  assert.equal(g.publicView().fm.reached, true);
  clock.advance(1000); g.tick();
  assert.equal(g.run.status, 'fastmoney', 'a moment for the jackpot');
  clock.advance(5000); g.tick();
  assert.equal(g.run.status, 'done', 'then the winners of the Feud');
  assert.equal(g.publicView().result.fastMoney.won, true);
  assert.equal(g.publicView().result.champion, red.id);
  assert.equal(g.publicView().fm, null, 'the TV and phones only get the result');
  // The host still sees every question, answer and what was said, including what was never turned over.
  const fm = g.hostView().fm;
  assert.equal(fm.rows.length, 5);
  assert.equal(fm.rows[4].p1.typed, 'nap');
  assert.equal(fm.rows[4].p1.shown, 0, 'never turned over on the TV');
  assert.ok(fm.rows[4].p1.choices.length >= 3 && fm.rows[4].p1.choices[0].points >= fm.rows[4].p1.choices[1].points, 'the survey answers, #1 first');
});

test('Fast Money: the host can put a mistake right at any time, even after the game is over', () => {
  const ctx = setup(); const { g, clock } = ctx;
  toFastMoney(ctx);
  g.setSettings({ fastMoneyGoal: 100 });
  g.fmStart();
  g.fmSetAnswers('p1', ['aple', 'dog', '', '', '']);
  g.fmNext();
  g.fmShowAnswer('p1', 0); g.fmShowPoints('p1', 0, 0, null);             // "aple" was scored 0: a typo
  g.fmEdit('p1', 0, { text: 'apple', points: 34, label: 'Apple' });       // fix the answer and its points
  assert.equal(g.publicView().fm.rows[0].p1.typed, 'apple');
  assert.equal(g.publicView().fm.rows[0].p1.points, 34);
  assert.equal(g.fmTotals().p1, 34);
  g.fmEdit('p1', 1, { text: 'puppy' });                                    // not up yet: only the words change
  assert.equal(g.hostView().fm.rows[1].p1.typed, 'puppy');
  assert.throws(() => g.fmEdit('p1', 1, { points: 10 }), /Show the points first/);
  assert.throws(() => g.fmEdit('p1', 0, { points: 500 }), /0 to 100/);
  assert.throws(() => g.fmEdit('p9', 0, { text: 'x' }), /Unknown/);
  // After the result, and after the game is over, a score can still be corrected, and the winner follows.
  g.setSettings({ fastMoneyGoal: 30 });
  g.fmEdit('p1', 0, { points: 36, label: 'Apple' });
  assert.equal(g.run.fm.step, 'results', 'a correction that reaches the goal wins it');
  g.finishGame();
  assert.equal(g.publicView().result.fastMoney.won, true);
  g.fmEdit('p1', 0, { points: 10, label: 'Apple' });
  assert.equal(g.publicView().result.fastMoney.won, false, 'taking points away takes the jackpot away');
  assert.equal(g.hostView().fm.rows[0].p1.points, 10);
  assert.ok(clock);
});

test('Fast Money: Player 2 still cannot be given Player 1’s answer while they are answering, even by an edit', () => {
  const ctx = setup(); const { g } = ctx;
  toFastMoney(ctx);
  g.fmStart();
  g.fmSetAnswers('p1', ['one', 'two', 'three', 'four', 'five']);
  g.fmNext();
  for (let q = 0; q < 5; q++) { g.fmShowAnswer('p1', q); g.fmShowPoints('p1', q, 0, null); }
  g.fmNext();
  assert.throws(() => g.fmEdit('p2', 0, { text: 'ONE' }), /already said that/);
  g.fmEdit('p2', 0, { text: 'uno' });
  assert.equal(g.run.fm.answers.p2[0], 'uno');
});

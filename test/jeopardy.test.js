import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Room } from '../room.js';
import { GAMES } from '../games/index.js';
import { GameError } from '../lib.js';
import { validateSet, T, readingTime, FINAL_FLOOR } from '../games/jeopardy/game.js';
import { judge, asksForPerson } from '../games/jeopardy/judge.js';
import { createHub } from '../engine/hub.js';

const own = JSON.parse(readFileSync(new URL('../data/jeopardy/family-night.json', import.meta.url)));
const own2 = JSON.parse(readFileSync(new URL('../data/jeopardy/science-lab.json', import.meta.url)));
const sets = { 'family-night': own, 'science-lab': own2 };

function setup({ players = ['Ann', 'Bo', 'Cy'] } = {}) {
  let t = 1000;
  const room = new Room({
    games: GAMES, now: () => t, random: () => 0.42,
    loadContent: (g, id) => sets[id] ?? null,
    listContent: () => Object.entries(sets).map(([id, s]) => ({ id, title: s.title })),
  });
  const clock = { advance: (ms) => { t += ms; room.tick(); } };
  room.chooseGame('jeopardy');
  const ps = players.map((n) => room.join({ name: n }));
  ps.forEach((p) => room.setConnected(p.id, true));
  return { room, g: room.game, ps, clock };
}
/** Start, and skip the round's opening titles. */
const begin = (g) => { g.start(); assert.equal(g.phase, 'round-intro'); g.advance(); return g; };
/** Wait out the moment the ruling is shown, before the clue moves on. */
const rule = (clock) => clock.advance(T.ruling + 10);
/** Pick the first unused clue that is not a Daily Double, and wait out the reading time. */
function openClue(g, clock, { dd = false } = {}) {
  const b = g.board();
  for (let ci = 0; ci < 6; ci++) for (let ri = 0; ri < 5; ri++) {
    if (!b[ci].clues[ri].used && b[ci].clues[ri].dd === dd) {
      g.pick(ci, ri);
      if (!dd) { clock.advance(readingTime(b[ci].clues[ri].q) + 10); assert.equal(g.phase, 'open'); }
      return b[ci].clues[ri];
    }
  }
  throw new Error('no clue');
}

test('judge is lenient about case, articles, punctuation and small typos', () => {
  assert.ok(judge('the Eiffel tower', ['Eiffel Tower']));
  assert.ok(judge('what is paris?', ['Paris']));
  assert.ok(judge('Missisippi', ['Mississippi']));
  assert.ok(judge('Teddy', ['Theodore Roosevelt', 'Teddy Roosevelt', 'Teddy']));
  assert.ok(!judge('London', ['Paris']));
  assert.ok(!judge('', ['Paris']));
});

test('judge reads short forms, lets a place drop "Ocean" or "Mount", takes a last name for a person, and is strict on short words', () => {
  assert.ok(judge('mt everst', ['Mount Everest']));
  assert.ok(judge('st louis', ['Saint Louis']) && judge('saint louis', ['St. Louis']));
  assert.ok(judge('pacific', ['Pacific Ocean']) && judge('superior', ['Lake Superior']));
  assert.ok(!judge('ocean', ['Pacific Ocean']) && !judge('red', ['Red Sea']));
  assert.ok(judge('lincoln', ['Abraham Lincoln'], { person: true }));
  assert.ok(!judge('lincoln', ['Abraham Lincoln']), 'not when the clue is not about a person');
  assert.ok(!judge('way', ['Milky Way'], { person: true }), 'too short to stand alone');
  assert.ok(!judge('plato', ['Pluto']) && !judge('pairs', ['Paris']));
  assert.ok(asksForPerson('This president freed the slaves.') && asksForPerson('He wrote Hamlet.'));
  assert.ok(!asksForPerson('The largest planet in our solar system.'));
});

test('own boards: validateSet accepts the sample sets and an optional "alt"', () => {
  assert.ok(validateSet(own));
  const withAlt = structuredClone(own); withAlt.categories[0].clues[0].alt = ['Other'];
  assert.ok(validateSet(withAlt));
  withAlt.categories[0].clues[0].alt = 'no';
  assert.throws(() => validateSet(withAlt), GameError);
  const bad = structuredClone(own); bad.categories[2].clues[1].answer = '';
  assert.throws(() => validateSet(bad), /answer/);
});

test('Jeopardy is individuals only and tops out at ten players', () => {
  const { room } = setup({ players: ['A', 'B', 'C', 'D', 'E', 'F'] });
  assert.equal(room.mode, 'players');           // six would be teams in Family Feud's auto mode
  assert.throws(() => room.setMode('teams'), /individuals/);
  for (const name of ['G', 'H', 'I', 'J']) room.join({ name });
  assert.throws(() => room.join({ name: 'K' }), /full/);
  assert.equal(room.publicView().room.maxPlayers, 10);
});

test('the lobby lists packs: house packs, your own boards, and the real-show archive request', () => {
  const { g } = setup();
  const v = g.publicView();
  assert.equal(v.phase, 'lobby');
  const ids = v.packs.map((p) => p.id);
  assert.ok(ids.includes('own-family-night') && ids.includes('house-classic'));
  assert.equal(v.packs.find((p) => p.id === 'own-family-night').own, true);
  assert.equal(v.packs.find((p) => p.id === 'house-classic').selected, true);
  const first = g.takeArchiveRequest();
  assert.deepEqual({ id: first.id, era: first.era }, { id: 1, era: 'any' });
  assert.ok(first.season >= 3 && first.season <= 42);    // init asked the app for a season
  assert.equal(g.takeArchiveRequest(), null);
});

test('a downloaded season becomes topic packs; failures are reported', () => {
  const { g } = setup();
  const req = g.takeArchiveRequest();
  const header = 'round\tclue_value\tdaily_double_value\tcategory\tcomments\tanswer\tquestion\tair_date\tnotes';
  const rows = [];
  for (let c = 0; c < 14; c++) for (let r = 0; r < 5; r++) rows.push(['1', String((r + 1) * 200), '0', `Mixed bag ${c}`, '', `Clue ${c}-${r}`, `Answer ${c}-${r}`, '2005-01-01', ''].join('\t'));
  g.archiveLoaded([header, ...rows].join('\n'), 20, req.id);
  const v = g.publicView();
  assert.ok(v.packs.some((p) => p.archive), 'archive packs present');
  g.archiveLoaded('garbage', 20, 999);          // an answer to a request nobody is waiting for is ignored
  g.setEra('classic');
  const second = g.takeArchiveRequest();
  assert.deepEqual({ id: second.id, era: second.era }, { id: 2, era: 'classic' });
  assert.ok(second.season >= 3 && second.season <= 16);
  g.archiveFailed(2);
  assert.equal(g.publicView().archiveError, true);
});

test('starting needs players and enough categories', () => {
  const { g } = setup({ players: [] });
  assert.throws(() => g.start(), /players/);
  const s = setup();
  for (const p of s.g.publicView().packs) if (p.selected) s.g.togglePack(p.id);
  s.g.togglePack('own-family-night');            // one board of six categories: enough as written, not enough to shuffle
  s.g.setAsWritten(false);
  assert.throws(() => s.g.start(), /12 categories/);
});

test('a game starts on a 6x5 board with a Daily Double in round 1 and two in round 2', () => {
  const { g } = setup();
  begin(g);
  assert.equal(g.phase, 'board');
  assert.equal(g.round, 1);
  const count = (r) => g.rounds[r].reduce((n, c) => n + c.clues.filter((cl) => cl.dd).length, 0);
  assert.equal(g.rounds[0].length, 6);
  assert.equal(count(0), 1);
  assert.equal(count(1), 2);
  assert.deepEqual(g.rounds[0][0].clues.map((c) => c.value), [200, 400, 600, 800, 1000]);
  assert.deepEqual(g.rounds[1][0].clues.map((c) => c.value), [400, 800, 1200, 1600, 2000]);
});

test('a clue is read, then the buzzers open with a countdown', () => {
  const { g, clock } = setup();
  begin(g);
  const cl = g.board()[0].clues.find((c) => !c.dd);
  g.pick(0, g.board()[0].clues.indexOf(cl));
  assert.equal(g.phase, 'reading');
  assert.equal(g.publicView().clue.q, cl.q);
  clock.advance(readingTime(cl.q) + 10);
  assert.equal(g.phase, 'open');
  const timer = g.publicView().timer;
  assert.equal(timer.kind, 'buzz');
  assert.equal(timer.totalMs, T.buzzWindow);
  clock.advance(2000);
  assert.ok(Math.abs(g.publicView().timer.leftMs - (T.buzzWindow - 2010)) < 30);
});

test('nobody buzzing ends the clue and shows the answer', () => {
  const { g, clock } = setup();
  begin(g);
  const cl = openClue(g, clock);
  clock.advance(T.buzzWindow + 10);
  assert.equal(g.phase, 'reveal');
  assert.equal(g.publicView().clue.answer, cl.a);
  clock.advance(T.reveal + 10);
  assert.equal(g.phase, 'board');
});

test('first buzz wins, is timed, and others are shown late', () => {
  const { g, ps, clock } = setup();
  begin(g); openClue(g, clock);
  clock.advance(250);
  const a = g.onPlayer(ps[1], { t: 'buzz' });
  assert.equal(a.result, 'won');
  assert.ok(a.ms >= 240 && a.ms <= 270);
  clock.advance(40);
  const b = g.onPlayer(ps[0], { t: 'buzz' });
  assert.equal(b.result, 'late');
  assert.ok(b.ms > a.ms);
  assert.equal(g.phase, 'answering');
  assert.equal(g.publicView().clue.buzzedId, ps[1].id);
  assert.deepEqual(g.publicView().clue.buzzes.map((x) => x.pid), [ps[1].id, ps[0].id]);
});

test('buzzing while the clue is still being read costs a short lockout', () => {
  const { g, ps, clock } = setup();
  begin(g);
  const cl = g.board()[0].clues.find((c) => !c.dd);
  g.pick(0, g.board()[0].clues.indexOf(cl));
  assert.equal(g.buzz(ps[0].id).result, 'early');
  clock.advance(readingTime(cl.q) + 10);          // the lockout (400ms) is shorter than the reading time? no: wait it out
  clock.advance(T.earlyPenalty);
  assert.equal(g.buzz(ps[0].id).result, 'won');
});

test('a right typed answer scores, takes control and reveals', () => {
  const { g, ps, clock } = setup();
  begin(g);
  const cl = openClue(g, clock);
  g.onPlayer(ps[2], { t: 'buzz' });
  g.onPlayer(ps[2], { t: 'answer', text: cl.a });
  assert.equal(g.phase, 'ruling');                        // their answer and the ruling, on screen for a moment
  assert.equal(ps[2].score, cl.value);
  rule(clock);
  assert.equal(g.phase, 'reveal');
  assert.equal(ps[2].score, cl.value);
  assert.equal(g.controllerId, ps[2].id);
  assert.equal(g.publicView().lastResult.correct, true);
  assert.equal(g.publicView().players.find((p) => p.id === ps[2].id).streak, 1);
});

test('a wrong answer costs points and reopens the buzzers for everyone else; the player who missed cannot buzz again', () => {
  const { g, ps, clock } = setup();
  begin(g);
  const cl = openClue(g, clock);
  g.buzz(ps[0].id);
  g.answer(ps[0].id, 'zzzzzzzz');
  assert.equal(ps[0].score, -cl.value);
  rule(clock);
  assert.equal(g.phase, 'open');
  assert.equal(g.publicView().timer.totalMs, T.rebuzzWindow);
  assert.equal(g.buzz(ps[0].id).result, 'tried');
  g.buzz(ps[1].id);
  g.answer(ps[1].id, cl.a);
  assert.equal(ps[1].score, cl.value);
  rule(clock);
  assert.equal(g.phase, 'reveal');
});

test('everyone missing ends the clue; running out of answer time counts as a miss', () => {
  const { g, ps, clock } = setup({ players: ['Ann', 'Bo'] });
  begin(g);
  openClue(g, clock);
  g.buzz(ps[0].id);
  clock.advance(T.answer + 10);                   // Ann never typed anything
  rule(clock);
  assert.equal(g.phase, 'open');
  g.buzz(ps[1].id);
  g.answer(ps[1].id, 'nope');
  rule(clock);
  assert.equal(g.phase, 'reveal');
  assert.ok(ps[0].score < 0 && ps[1].score < 0);
});

test('the answer clock is visible to everyone while someone is answering', () => {
  const { g, ps, clock } = setup();
  begin(g); openClue(g, clock);
  g.buzz(ps[0].id);
  const t = g.publicView().timer;
  assert.equal(t.kind, 'answer');
  assert.equal(t.totalMs, T.answer);
});

test('the controller picks; others may not, and a phone can only pick when it is in control', () => {
  const { g, ps } = setup();
  begin(g);
  const other = ps.find((p) => p.id !== g.controllerId);
  assert.throws(() => g.onPlayer(other, { t: 'pick', ci: 0, ri: 0 }), /not your pick/);
  const ctl = ps.find((p) => p.id === g.controllerId);
  g.onPlayer(ctl, { t: 'pick', ci: 0, ri: 0 });
  assert.notEqual(g.phase, 'board');
});

test('Daily Double: only the player in control wagers, bounded by their score or the round maximum', () => {
  const { g, ps, clock } = setup();
  begin(g);
  const cl = openClue(g, clock, { dd: true });
  assert.equal(g.phase, 'dd-wager');
  assert.equal(g.publicView().clue.q, null);                // the clue stays hidden until the bet
  const ctl = ps.find((p) => p.id === g.controllerId);
  assert.equal(g.playerView(ctl).me.maxDD, 1000);
  g.ddWager(ps.find((p) => p.id !== g.controllerId).id, 500);   // ignored
  assert.equal(g.phase, 'dd-wager');
  g.ddWager(ctl.id, 99999);
  assert.equal(g.clue.wager, 1000);
  assert.equal(g.phase, 'dd-answer');
  g.answer(ctl.id, cl.a);
  assert.equal(ctl.score, 1000);
  rule(clock);
  assert.equal(g.phase, 'reveal');
});

test('Daily Double wrong answer loses the wager', () => {
  const { g, ps, clock } = setup();
  begin(g);
  openClue(g, clock, { dd: true });
  const ctl = ps.find((p) => p.id === g.controllerId);
  g.ddWager(ctl.id, 400);
  g.answer(ctl.id, 'wrong');
  assert.equal(ctl.score, -400);
});

test('override flips the last ruling', () => {
  const { g, ps, clock } = setup();
  begin(g);
  const cl = openClue(g, clock);
  g.buzz(ps[0].id); g.answer(ps[0].id, 'banana'); rule(clock);
  g.buzz(ps[1].id); g.answer(ps[1].id, 'apple');          // two misses
  g.override();                                           // the host decides Bo was right after all
  assert.equal(ps[1].score, cl.value);
  assert.equal(g.controllerId, ps[1].id);
  g.override();
  assert.equal(ps[1].score, -cl.value);
});

test('host judges mode: players say the answer out loud and the host rules', () => {
  const { g, ps, clock } = setup();
  g.setHostJudges(true);
  g.setAnswerTime(10);
  begin(g);
  const b = g.board();
  g.pick(0, b[0].clues.findIndex((c) => !c.dd));
  assert.equal(g.phase, 'reading');
  g.openNow();                                            // the host finished reading
  assert.equal(g.phase, 'open');
  g.buzz(ps[0].id);
  assert.equal(g.publicView().timer.totalMs, 10000);
  assert.throws(() => g.answer(ps[0].id, 'typed'), /host/);
  g.act('judge', { correct: true });
  rule(clock);
  assert.equal(g.phase, 'reveal');
  assert.ok(ps[0].score > 0);
  assert.throws(() => g.onPlayer(ps[0], { t: 'pick', ci: 0, ri: 1 }), /host/);
});

test('host mode answer clock runs out, then the host still has a few seconds to rule', () => {
  const { g, ps, clock } = setup();
  g.setHostJudges(true);
  g.setAnswerTime(5);
  begin(g); g.pick(0, g.board()[0].clues.findIndex((c) => !c.dd)); g.openNow();
  g.buzz(ps[0].id);
  clock.advance(5100);
  assert.equal(g.publicView().timer.leftMs, 0);
  assert.equal(g.phase, 'answering');                      // still ruling
  g.act('judge', { correct: true });
  rule(clock);
  assert.equal(g.phase, 'reveal');
});

test('the captain can drive; other players cannot', () => {
  const { g, ps } = setup();
  assert.equal(g.captain(), ps[0].id);
  assert.throws(() => g.onPlayer(ps[1], { t: 'cap', action: 'start' }), /captain/);
  g.onPlayer(ps[0], { t: 'cap', action: 'start' });
  assert.equal(g.phase, 'round-intro');
  g.onPlayer(ps[0], { t: 'cap', action: 'advance' });     // skip the opening titles
  assert.equal(g.phase, 'board');
  assert.throws(() => g.onPlayer(ps[0], { t: 'cap', action: 'judge' }), /Not allowed/);
});

test('the captain can end the game part way: back to the lobby, players kept, scores reset', () => {
  const { room, g, ps, clock } = setup();
  begin(g);
  openClue(g, clock);
  g.buzz(ps[1].id); g.answer(ps[1].id, 'nope');
  assert.notEqual(ps[1].score, 0);
  assert.throws(() => g.onPlayer(ps[1], { t: 'cap', action: 'endGame' }), /captain/);
  g.onPlayer(ps[0], { t: 'cap', action: 'endGame' });
  assert.equal(g.phase, 'lobby');
  assert.equal(room.inProgress(), false);
  assert.equal(room.players.length, 3);
  assert.ok(room.players.every((p) => p.score === 0));
  begin(g);   // and a new game can start straight away
  assert.equal(g.phase, 'board');
});

test('reactions are rate limited and fade away', () => {
  const { g, ps, clock } = setup();
  g.react(ps[0].id, 0); g.react(ps[0].id, 1);
  assert.equal(g.publicView().reactions.length, 1);
  clock.advance(1300);
  g.react(ps[0].id, 1);
  assert.equal(g.publicView().reactions.length, 2);
  clock.advance(5000);
  assert.equal(g.publicView().reactions.length, 0);
});

function playRound(g, ps, clock) {
  // Play every clue: the first player always answers correctly.
  while (g.phase === 'board') {
    const b = g.board();
    let done = false;
    for (let ci = 0; ci < 6 && !done; ci++) for (let ri = 0; ri < 5 && !done; ri++) {
      if (b[ci].clues[ri].used) continue;
      const cl = b[ci].clues[ri];
      g.pick(ci, ri);
      if (cl.dd) { g.ddWager(g.controllerId, 5); g.answer(g.controllerId, cl.a); } else {
        clock.advance(readingTime(cl.q) + 10);
        g.buzz(ps[0].id); g.answer(ps[0].id, cl.a);
      }
      clock.advance(T.ruling + 10);
      clock.advance(T.reveal + 10);
      done = true;
    }
  }
}

test('a full game: two rounds, then Final Jeopardy with wagers, answers and a reveal (show rules: only players with money)', () => {
  const { g, ps, clock } = setup({ players: ['Ann', 'Bo'] });
  g.setFinalForAll(false);
  begin(g);
  playRound(g, ps, clock);
  assert.equal(g.phase, 'round-end');
  g.advance();
  assert.equal(g.phase, 'round-intro');
  clock.advance(T.roundIntro + 10);
  assert.equal(g.phase, 'board');
  assert.equal(g.round, 2);
  assert.equal(g.controllerId, ps[1].id);                // lowest score picks first
  playRound(g, ps, clock);
  g.advance();
  assert.equal(g.phase, 'final-wager');
  assert.deepEqual(g.final.eligible, [ps[0].id]);        // only players with a positive score play
  assert.equal(g.publicView().final.q, null);
  const before = ps[0].score;
  g.finalWager(ps[0].id, 999999);
  assert.equal(g.final.wagers[ps[0].id], before);        // capped at their score
  assert.equal(g.phase, 'final-answer');
  assert.equal(g.publicView().timer.kind, 'final');
  g.finalAnswer(ps[0].id, g.finalClue.a);
  clock.advance(2000);
  assert.equal(g.phase, 'final-reveal');
  // One player at a time: first what they wrote, with right or wrong still hidden, and no correct answer yet.
  let fv = g.publicView().final;
  assert.equal(fv.stage, 'answer');
  assert.equal(fv.answer, null);
  assert.deepEqual(fv.reveals.map((r) => [r.id, r.pending, r.wager]), [[ps[0].id, true, 0]]);
  assert.equal(ps[0].score, before);
  clock.advance(T.finalBeat + 10);
  fv = g.publicView().final;
  assert.equal(fv.stage, 'verdict');
  assert.equal(fv.reveals[0].correct, true);
  assert.equal(fv.reveals[0].wager, before);
  assert.equal(ps[0].score, before * 2);
  assert.equal(fv.answer, null);
  clock.advance(T.finalStep + 10);
  fv = g.publicView().final;                              // the correct answer comes last
  assert.equal(fv.stage, 'done');
  assert.equal(fv.answer, g.finalClue.a);
  clock.advance(T.finalAnswerShow + 10);
  assert.equal(g.phase, 'gameover');
  assert.equal(ps[0].score, before * 2);
  const awards = g.publicView().awards;
  assert.ok(awards.some((a) => a.id === 'brain' && a.pid === ps[0].id));
  g.playAgain();
  assert.equal(g.phase, 'lobby');
  assert.equal(ps[0].score, 0);
});

test('by default everyone plays Final Jeopardy, and a player with no money may bet up to $1,000', () => {
  const { g, ps, clock } = setup({ players: ['Ann', 'Bo'] });
  begin(g);
  playRound(g, ps, clock); g.advance(); g.advance();
  playRound(g, ps, clock); g.advance();
  assert.equal(g.phase, 'final-wager');
  assert.deepEqual(g.final.eligible.slice().sort(), [ps[0].id, ps[1].id].sort(), 'Bo plays too');
  assert.ok(ps[1].score <= 0);
  assert.equal(g.playerView(ps[1]).me.maxFinal, FINAL_FLOOR);
  g.finalWager(ps[1].id, 999999);
  assert.equal(g.final.wagers[ps[1].id], FINAL_FLOOR);
  assert.equal(g.playerView(ps[0]).me.maxFinal, Math.max(ps[0].score, FINAL_FLOOR));
  assert.throws(() => g.setFinalForAll(false), /started/);
});

test('the same categories are not dealt again right after a game', () => {
  const { g } = setup();
  begin(g);
  const first = new Set(g.rounds.flat().map((c) => c.name));
  g.endGame();
  g.togglePack('house-movies'); g.togglePack('house-sports');
  g.start();
  const second = g.rounds.flat().map((c) => c.name);
  assert.ok(second.filter((n) => first.has(n)).length < 6);
});

test('your own board played as written: its categories, values and your Daily Double', () => {
  const { g } = setup();
  const marked = structuredClone(own); marked.categories[3].clues[2].dailyDouble = true;
  sets['family-night'] = marked;
  g.contentChanged();
  for (const p of g.publicView().packs) if (p.selected) g.togglePack(p.id);
  g.togglePack('own-family-night');
  assert.equal(g.publicView().asWritten, true);
  g.start();
  assert.deepEqual(g.rounds[0].map((c) => c.name), own.categories.map((c) => c.name));
  assert.equal(g.rounds[0][3].clues[2].dd, true);
  assert.equal(g.rounds.length, 1);                       // one board, then Final
  assert.equal(g.finalClue.q, own.final.clue);
  sets['family-night'] = own;
});

test('two boards of your own are played as round 1 and round 2', () => {
  const { g } = setup();
  for (const p of g.publicView().packs) if (p.selected) g.togglePack(p.id);
  g.togglePack('own-family-night'); g.togglePack('own-science-lab');
  g.start();
  assert.equal(g.rounds.length, 2);
  assert.equal(g.rounds[1][0].name, own2.categories[0].name);
  assert.equal(g.rounds[1][0].clues[0].value, own2.categories[0].clues[0].value);   // values from the board, not doubled
});

test('"also accept" answers on your own clues count', () => {
  const { g, ps, clock } = setup();
  const alt = structuredClone(own); alt.categories[0].clues[0].alt = ['Zebra Crossing'];
  sets['family-night'] = alt;
  g.contentChanged();
  for (const p of g.publicView().packs) if (p.selected) g.togglePack(p.id);
  g.togglePack('own-family-night');
  begin(g);
  g.pick(0, 0);
  if (g.phase === 'dd-wager') { g.ddWager(g.controllerId, 5); g.answer(g.controllerId, 'zebra crossing'); assert.equal(g.lastResult.correct, true); } else {
    clock.advance(readingTime(g.clue.q) + 10);
    g.buzz(ps[0].id); g.answer(ps[0].id, 'zebra crossing');
    assert.equal(g.lastResult.correct, true);
  }
  sets['family-night'] = own;
});

test('board builder: preview, swap one category, then the game uses that board', () => {
  const { g } = setup();
  g.previewBoard();
  const v = g.publicView();
  assert.equal(v.draft.length, 2);
  assert.equal(v.draft[0].length, 6);
  const before = v.draft[1][4];
  g.swapCategory(2, 4);
  assert.notEqual(g.publicView().draft[1][4], before);
  const planned = g.publicView().draft.map((r) => r.slice());
  g.start();
  assert.deepEqual(g.rounds.map((r) => r.map((c) => c.name)), planned);
  assert.equal(g.draft, null);
});

test('easy mode keeps only the easy packs and restores the old choice when switched off', () => {
  const { g } = setup();
  const before = g.publicView().packs.filter((p) => p.selected).map((p) => p.id);
  g.toggleEasy();
  assert.equal(g.publicView().easyMode, true);
  assert.deepEqual(g.publicView().packs.filter((p) => p.selected).map((p) => p.id), ['house-easy']);
  g.toggleEasy();
  assert.deepEqual(g.publicView().packs.filter((p) => p.selected).map((p) => p.id), before);
});

test('what a phone sees never includes the answer to a live clue', () => {
  const { g, ps, clock } = setup();
  begin(g);
  const cl = openClue(g, clock);
  const seen = JSON.stringify(g.playerView(ps[0]));
  assert.ok(!seen.includes(JSON.stringify(cl.a)));
  assert.ok(JSON.stringify(g.hostView()).includes(JSON.stringify(cl.a)));
});

test('saving mid-game: a clue under way is settled and play carries on', () => {
  const { room, g, ps, clock } = setup();
  begin(g); openClue(g, clock);
  g.buzz(ps[0].id);
  const saved = JSON.parse(JSON.stringify(room));
  let t = 5000;
  const again = new Room({ games: GAMES, now: () => t, loadContent: (g2, id) => sets[id] ?? null, listContent: () => [] });
  assert.ok(again.restore(saved));
  assert.equal(again.game.phase, 'reveal');
  t += T.reveal + 10; again.tick();
  assert.equal(again.game.phase, 'board');
  assert.equal(again.game.rounds.length, 2);
});

test('hub: the TV itself may act; a browser claiming to be the TV may not', () => {
  const { room } = setup();
  const sent = [];
  const hub = createHub({ room, pinOk: () => false, send: (id, m) => sent.push([id, m]), trustedTv: (id) => id === 'tv' });
  hub.receive('tv', { t: 'hello', role: 'tv' });
  hub.receive('imposter', { t: 'hello', role: 'tv' });
  hub.receive('imposter', { t: 'act', action: 'start' });
  assert.equal(room.game.phase, 'lobby');
  hub.receive('tv', { t: 'act', action: 'start' });
  assert.equal(room.game.phase, 'round-intro');
});

test('hub: a phone gets its own view with "me" and the buzz result comes back to it', () => {
  const { room, g, ps, clock } = setup();
  const sent = [];
  const hub = createHub({ room, pinOk: () => false, send: (id, m) => sent.push([id, m]) });
  hub.receive('ph', { t: 'hello', role: 'player', token: ps[0].token });
  const state = sent.filter(([, m]) => m.t === 'state').at(-1)[1].view;
  assert.equal(state.game.me.id, ps[0].id);
  assert.equal(state.room.me.id, ps[0].id);
  begin(g); openClue(g, clock);
  hub.receive('ph', { t: 'buzz' });
  assert.equal(sent.filter(([, m]) => m.t === 'buzz-result').at(-1)[1].result, 'won');
});

test('show beats: each round opens with its titles, and a ruling stays up a moment before play moves on', () => {
  const { g, ps, clock } = setup();
  g.start();
  assert.equal(g.phase, 'round-intro');
  assert.equal(g.publicView().timer.kind, 'intro');
  clock.advance(T.roundIntro + 10);
  assert.equal(g.phase, 'board');
  const cl = openClue(g, clock);
  g.buzz(ps[0].id); g.answer(ps[0].id, 'zzzzzzzz');
  assert.equal(g.phase, 'ruling');
  assert.equal(g.publicView().lastResult.answer, 'zzzzzzzz');
  assert.equal(g.publicView().clue.answer, null, 'the answer stays hidden: others may still buzz');
  rule(clock);
  assert.equal(g.phase, 'open');
  assert.equal(g.publicView().clue.open, 2);
  assert.ok(cl);
});

test('a press meant for the first opening never wins the second one, and does not count as Fastest Finger', () => {
  const { g, ps, clock } = setup();
  begin(g); openClue(g, clock);
  clock.advance(300);
  g.buzz(ps[0].id, 1);
  assert.equal(g.buzz(ps[1].id, 1).result, 'late');      // Bo pressed a moment after Ann
  g.answer(ps[0].id, 'zzzzzzzz'); rule(clock);
  assert.equal(g.phase, 'open');
  assert.equal(g.buzz(ps[2].id, 1).result, 'early');     // Cy's press was sent before the buzzers reopened
  clock.advance(T.earlyPenalty + 10);
  const r = g.buzz(ps[2].id, 2);
  assert.equal(r.result, 'won');
  const fast = g.publicView().clue.buzzes;
  assert.deepEqual(fast.map((b) => b.open), [1, 1, 2]);
});

test('skipping a clue never charges the player who was answering', () => {
  const { g, ps, clock } = setup();
  begin(g); openClue(g, clock);
  g.buzz(ps[0].id);
  g.skipClue();
  assert.equal(ps[0].score, 0);
  assert.equal(g.phase, 'reveal');
});

test('an answer typed but not sent when the clock runs out still counts', () => {
  const { g, ps, clock } = setup();
  begin(g);
  const cl = openClue(g, clock);
  g.buzz(ps[0].id);
  g.onPlayer(ps[0], { t: 'draft', text: cl.a });
  clock.advance(T.answer + 10);
  assert.equal(g.lastResult.correct, true);
  assert.equal(ps[0].score, cl.value);
});

test('removing a player during Final Jeopardy does not leave the game waiting for them', () => {
  const { room, g, ps, clock } = setup({ players: ['Ann', 'Bo'] });
  begin(g);
  playRound(g, ps, clock); g.advance(); g.advance();
  playRound(g, ps, clock); g.advance();
  assert.equal(g.phase, 'final-wager');
  g.finalWager(ps[0].id, 5);
  assert.equal(g.phase, 'final-wager');                  // still waiting for Bo
  room.removePlayer(ps[1].id);
  assert.equal(g.phase, 'final-answer');
});

test('judge reads number words and will not take a list of guesses', () => {
  assert.ok(judge('twenty one', ['21']));
  assert.ok(judge('nineteen eighty four', ['1984']));
  assert.ok(judge('one hundred', ['100']));
  assert.ok(judge('the planet mars', ['Mars']));
  assert.ok(!judge('paris or london', ['Paris']));
  assert.ok(!judge('not mars', ['Mars']));
});

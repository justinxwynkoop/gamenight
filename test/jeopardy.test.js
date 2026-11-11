import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Room } from '../room.js';
import { GAMES } from '../games/index.js';
import { GameError } from '../lib.js';
import { validateSet } from '../games/jeopardy/game.js';

const set = JSON.parse(readFileSync(new URL('../data/jeopardy/family-night.json', import.meta.url)));

function setup({ players = ['Ann', 'Bo', 'Cy'], teams = false } = {}) {
  let t = 1000;
  const room = new Room({ games: GAMES, now: () => t, loadContent: () => set });
  const clock = { advance: (ms) => { t += ms; } };
  room.chooseGame('jeopardy');
  if (teams) room.setMode('teams');
  const ps = players.map((n, i) => room.join({ name: n, teamId: teams ? room.teams[i % room.teams.length].id : undefined }));
  const g = room.game;
  g.chooseSet('x');
  g.run.dd = []; // no daily doubles unless a test adds one
  return { room, g, ps, clock };
}
const start = (g) => { const dd = g.run.dd; g.startGame(); g.run.dd = dd.length ? dd : []; };

test('sample set is valid', () => assert.ok(validateSet(set)));

test('validateSet rejects malformed sets', () => {
  assert.throws(() => validateSet({ title: 'x', categories: [] }), GameError);
  const bad = structuredClone(set); bad.categories[2].clues[1].answer = '';
  assert.throws(() => validateSet(bad), /answer/);
});

test('first buzz wins and locks everyone else out', () => {
  const { g, ps } = setup();
  start(g); g.select(0, 0); g.openBuzzers();
  assert.equal(g.buzz(ps[1].id).ok, true);
  assert.equal(g.buzz(ps[0].id).ok, false);
  assert.equal(g.run.clue.buzzedBy, ps[1].id);
});

test('buzzing before buzzers open penalises that player only', () => {
  const { g, ps, clock } = setup();
  start(g); g.select(0, 0);
  assert.equal(g.buzz(ps[0].id).reason, 'early');
  g.openBuzzers();
  const r = g.buzz(ps[0].id);
  assert.equal(r.reason, 'penalty');
  assert.ok(r.retryMs > 0 && r.retryMs <= 500);
  clock.advance(501);
  assert.equal(g.buzz(ps[0].id).ok, true);
});

test('early penalty can be switched off', () => {
  const { g, ps } = setup();
  g.setSettings({ earlyPenalty: false });
  start(g); g.select(0, 0);
  assert.equal(g.buzz(ps[0].id).ok, false);
  g.openBuzzers();
  assert.equal(g.buzz(ps[0].id).ok, true);
});

test('correct answer scores, gives control and marks the square used', () => {
  const { g, ps } = setup();
  start(g); g.select(1, 2); g.openBuzzers(); g.buzz(ps[0].id); g.correct();
  assert.equal(ps[0].score, 600);
  assert.equal(g.run.control, ps[0].id);
  assert.equal(g.publicView().clue.answer, 'Rice vinegar');
  g.closeClue();
  assert.equal(g.run.status, 'board');
  assert.throws(() => g.select(1, 2), /already used/);
});

test('wrong answer deducts and reopens for the others; all locked out reveals', () => {
  const { g, ps } = setup({ players: ['Ann', 'Bo'] });
  start(g); g.select(0, 1); g.openBuzzers(); g.buzz(ps[0].id); g.wrong();
  assert.equal(ps[0].score, -400);
  assert.equal(g.run.clue.step, 'open');
  assert.equal(g.buzz(ps[0].id).reason, 'locked-out');
  g.buzz(ps[1].id); g.wrong();
  assert.equal(g.run.clue.step, 'revealed');
  assert.ok(g.run.used.includes('0,1'));
});

test('answers stay hidden from the public view until revealed, but host sees them', () => {
  const { room, g, ps } = setup();
  start(g); g.select(0, 0);
  assert.equal(g.publicView().clue.answer, null);
  assert.equal(room.playerView(ps[0].id).game.clue.answer, null);
  assert.equal(g.hostView().clue.answer, 'The Pacific Ocean');
  assert.ok(!JSON.stringify(room.publicView()).includes('Pacific Ocean'));
});

test('daily double: wager capped, scored, and clue hidden until wager', () => {
  const { g, ps } = setup();
  start(g);
  g.run.dd = ['2,3']; g.run.control = ps[1].id;
  g.select(2, 3);
  assert.equal(g.run.clue.step, 'wager');
  assert.equal(g.publicView().clue.text, null);
  assert.equal(g.run.clue.ddUnit, ps[1].id);
  assert.throws(() => g.setDailyDoubleWager(1001), /between/);
  g.setDailyDoubleWager(700);
  assert.equal(g.run.clue.step, 'answering');
  assert.ok(g.publicView().clue.text);
  g.wrong();
  assert.equal(ps[1].score, -700);
  assert.equal(g.run.clue.step, 'revealed');
});

test('team mode: team score, team lockout after a teammate buzzes', () => {
  const { room, g, ps } = setup({ players: ['Ann', 'Bo', 'Cy', 'Di'], teams: true });
  start(g); g.select(0, 0); g.openBuzzers();
  assert.equal(g.buzz(ps[0].id).ok, true);        // Team 1
  assert.equal(g.buzz(ps[2].id).ok, false);       // teammate of team 1
  g.correct();
  assert.equal(room.teams[0].score, 200);
  assert.equal(ps[0].score, 0);
  assert.equal(g.run.control, room.teams[0].id);
});

test('host can adjust and set scores', () => {
  const { room, ps } = setup();
  room.act('adjustScore', { id: ps[0].id, delta: 300 });
  room.act('adjustScore', { id: ps[0].id, delta: -100 });
  assert.equal(ps[0].score, 200);
  room.act('adjustScore', { id: ps[0].id, set: 50 });
  assert.equal(ps[0].score, 50);
});

test('final jeopardy: wagers capped, only positive scores play, judging scores', () => {
  const { g, ps } = setup();
  start(g);
  ps[0].score = 1000; ps[1].score = 400; ps[2].score = -200;
  g.startFinal();
  assert.deepEqual(g.finalists().map((u) => u.name), ['Ann', 'Bo']);
  assert.throws(() => g.finalWagerFrom(ps[2].id, 0), /not in Final/);
  assert.throws(() => g.finalWagerFrom(ps[1].id, 401), /between/);
  g.finalWagerFrom(ps[0].id, 600); g.finalWagerFrom(ps[1].id, 400);
  g.finalNext();
  g.finalAnswerFrom(ps[0].id, 'John Adams'); g.finalAnswerFrom(ps[1].id, 'Washington');
  // Answers and wagers stay off the public view until judged.
  const pub = g.publicView().final;
  assert.equal(pub.finalists[0].answer, null);
  assert.equal(pub.finalists[0].wager, null);
  g.finalNext();
  g.finalJudge(ps[0].id, true); g.finalJudge(ps[1].id, false);
  assert.equal(ps[0].score, 1600);
  assert.equal(ps[1].score, 0);
  // Bo bet everything and lost: still listed, and the round only ends once both are judged.
  assert.deepEqual(g.publicView().final.finalists.map((f) => f.id), [ps[0].id, ps[1].id]);
  assert.equal(g.run.final.step, 'results');
  assert.equal(g.publicView().final.answer, 'John Adams');
});

test('a game in progress survives a save and restore, minus live connections', () => {
  const { room, g, ps } = setup();
  start(g); g.select(0, 0); g.openBuzzers(); g.buzz(ps[0].id); g.correct();
  room.setConnected(ps[0].id, true);
  const copy = new Room({ games: GAMES, loadContent: () => set });
  assert.equal(copy.restore(JSON.parse(JSON.stringify(room))), true);
  assert.equal(copy.players[0].score, 200);
  assert.equal(copy.game.run.control, ps[0].id);
  assert.equal(copy.game.run.status, 'clue');
  assert.equal(copy.game.run.clue.step, 'revealed');
  assert.equal(copy.playerByToken(ps[0].token).name, 'Ann');
  assert.equal(copy.connected.size, 0);
  assert.equal(copy.inProgress(), true);
});

test('host actions reach the game through the room, and unknown ones are refused', () => {
  const { room, g } = setup();
  room.act('startGame');
  assert.equal(g.run.status, 'board');
  assert.throws(() => room.act('doesNotExist'), /Unknown action/);
});

test('buzz and final messages from phones are routed to the game', () => {
  const { room, g, ps } = setup();
  start(g); g.select(0, 0); g.openBuzzers();
  assert.deepEqual(room.playerMessage(ps[0].id, { t: 'buzz' }), { t: 'buzz-result', ok: true, unitId: ps[0].id, playerId: ps[0].id });
  assert.equal(room.playerMessage(ps[0].id, { t: 'nonsense' }), undefined);
});

// ---------- timers ----------
const buzzIn = (g, ps, i = 0) => { g.select(0, 0); g.openBuzzers(); return g.buzz(ps[i].id); };

test('a buzz-in starts the answer timer; a correct answer clears it', () => {
  const { g, ps, clock } = setup();
  start(g);
  g.select(0, 0); g.openBuzzers();
  assert.equal(g.publicView().clue.timer.kind, 'buzz');   // opening buzzers starts the buzz-in window
  g.buzz(ps[0].id);
  let tm = g.publicView().clue.timer;
  assert.equal(tm.kind, 'answer');                        // ...which becomes the answer timer
  assert.equal(tm.totalMs, 10000);
  assert.equal(tm.leftMs, 10000);
  assert.equal(tm.timedOut, false);
  clock.advance(4000);
  assert.equal(g.publicView().clue.timer.leftMs, 6000);
  g.correct();
  assert.equal(g.publicView().clue.timer, null);
});

test('tick expires the timer once and leaves the decision to the host', () => {
  const { g, ps, clock } = setup();
  start(g); buzzIn(g, ps);
  let changes = 0; const real = g.room.onChange; g.room.onChange = () => { changes++; real(); };
  clock.advance(9999); g.tick();
  assert.equal(g.publicView().clue.timer.timedOut, false);
  assert.equal(changes, 0);
  clock.advance(2); g.tick(); g.tick(); g.tick();
  assert.equal(g.publicView().clue.timer.timedOut, true);
  assert.equal(g.publicView().clue.timer.leftMs, 0);
  assert.equal(changes, 1);                               // announced once, not every tick
  assert.equal(g.run.clue.step, 'answering');             // nothing is scored automatically
  assert.equal(ps[0].score, 0);
});

test('with auto-wrong on, a time-out counts as a wrong answer and reopens buzzing', () => {
  const { g, ps, clock } = setup();
  g.setSettings({ autoWrong: true });
  start(g); buzzIn(g, ps);
  clock.advance(10001); g.tick();
  assert.equal(ps[0].score, -200);
  assert.equal(g.run.clue.step, 'open');
  assert.equal(g.publicView().clue.timer.kind, 'buzz');   // the others get a fresh buzz-in window
  assert.equal(g.buzz(ps[0].id).reason, 'locked-out');
  assert.equal(g.buzz(ps[1].id).ok, true);                // the next buzz gets a fresh timer
  assert.equal(g.publicView().clue.timer.leftMs, 10000);
});

test('the host can restart the timer, and change or switch off the time', () => {
  const { g, ps, clock } = setup();
  start(g); buzzIn(g, ps);
  clock.advance(9000);
  g.restartTimer();
  assert.equal(g.publicView().clue.timer.leftMs, 10000);
  clock.advance(10001); g.tick();
  g.restartTimer();                                       // restarting after time-out gives time again
  assert.equal(g.publicView().clue.timer.timedOut, false);
  g.reveal();
  assert.throws(() => g.restartTimer(), /nothing to time/);

  const b = setup(); b.g.setSettings({ answerSeconds: 0 }); start(b.g); buzzIn(b.g, b.ps);
  assert.equal(b.g.publicView().clue.timer, null);        // 0 = no timer
  b.clock.advance(60000); b.g.tick();
  assert.equal(b.g.run.clue.step, 'answering');

  const c = setup(); c.g.setSettings({ answerSeconds: 3 }); start(c.g); buzzIn(c.g, c.ps);
  assert.equal(c.g.publicView().clue.timer.totalMs, 3000);
});

test('timer settings are validated', () => {
  const { g } = setup();
  assert.throws(() => g.setSettings({ answerSeconds: -1 }), /Answer time/);
  assert.throws(() => g.setSettings({ answerSeconds: 121 }), /Answer time/);
  assert.throws(() => g.setSettings({ finalSeconds: 301 }), /Final/);
  assert.throws(() => g.setSettings({ answerSeconds: 'soon' }), /Answer time/);
  g.setSettings({ answerSeconds: 15, finalSeconds: 45 });
  assert.equal(g.settings.answerSeconds, 15);
  assert.equal(g.settings.finalSeconds, 45);
});

test('a Daily Double answer is timed too, and awarding a buzz by hand starts the timer', () => {
  const { g, ps } = setup();
  start(g); g.run.dd = ['2,3']; g.run.control = ps[0].id;
  g.select(2, 3); g.setDailyDoubleWager(400);
  assert.equal(g.publicView().clue.timer.totalMs, 20000);   // double the 10 seconds a buzz gets
  g.wrong(); g.closeClue();
  g.select(0, 0); g.awardBuzz(ps[1].id);
  assert.equal(g.publicView().clue.timer.totalMs, 10000);
});

test('a Daily Double gives double the answer time that was set', () => {
  const { g, ps, clock } = setup();
  g.setSettings({ answerSeconds: 5 });
  start(g); g.run.dd = ['2,3']; g.run.control = ps[0].id;
  g.select(2, 3); g.setDailyDoubleWager(400);
  const timer = g.publicView().clue.timer;
  assert.equal(timer.kind, 'answer');
  assert.equal(timer.totalMs, 10000);                       // 5 seconds set, so 10 here
  clock.advance(6000); g.tick();
  assert.equal(g.publicView().clue.timer.timedOut, false);  // still running past the normal 5
  clock.advance(5000); g.tick();
  assert.equal(g.publicView().clue.timer.timedOut, true);   // out of time at 10
});

test('restarting a Daily Double timer gives the doubled time again; ordinary clues keep the set time', () => {
  const { g, ps, clock } = setup();
  g.setSettings({ answerSeconds: 5 });
  start(g); g.run.dd = ['2,3']; g.run.control = ps[0].id;
  g.select(2, 3); g.setDailyDoubleWager(200);
  clock.advance(12000); g.tick();
  assert.equal(g.publicView().clue.timer.timedOut, true);
  g.restartTimer();
  assert.equal(g.publicView().clue.timer.totalMs, 10000);
  assert.equal(g.publicView().clue.timer.timedOut, false);
  g.wrong(); g.closeClue();
  g.select(0, 0); g.awardBuzz(ps[1].id);                    // not a Daily Double
  assert.equal(g.publicView().clue.timer.totalMs, 5000);
});

test('no answer timer means no Daily Double timer either', () => {
  const { g, ps } = setup();
  g.setSettings({ answerSeconds: 0 });
  start(g); g.run.dd = ['2,3']; g.run.control = ps[0].id;
  g.select(2, 3); g.setDailyDoubleWager(300);
  assert.equal(g.publicView().clue.timer, null);
});

test('during Final Jeopardy wagers every player or team can see every score, finalists or not', () => {
  const { room, g, ps } = setup({ players: ['Ann', 'Bo', 'Cy'] });
  start(g);
  ps[0].score = 1200; ps[1].score = 300; ps[2].score = -100;       // Cy cannot play the final round
  g.run.status = 'board';
  g.startFinal();
  const pub = room.publicView();
  assert.deepEqual(pub.game.final.finalists.map((f) => f.id), [ps[0].id, ps[1].id]);
  assert.deepEqual(pub.room.units.map((u) => [u.name, u.score]), [['Ann', 1200], ['Bo', 300], ['Cy', -100]]);
  // a phone gets the same list, so it can show the scores while the player decides a wager
  assert.deepEqual(room.playerView(ps[2].id).room.units.map((u) => u.score), [1200, 300, -100]);
});

test('Final Jeopardy has a countdown that starts with the clue', () => {
  const { g, ps, clock } = setup();
  start(g); ps[0].score = 500;
  g.startFinal();
  assert.equal(g.publicView().final.timer, null);         // wagering is untimed
  g.finalNext();
  assert.equal(g.publicView().final.timer.totalMs, 30000);
  clock.advance(30001); g.tick();
  assert.equal(g.publicView().final.timer.timedOut, true);
  assert.equal(g.run.final.step, 'clue');                 // the host still moves on
  g.restartTimer();
  assert.equal(g.publicView().final.timer.timedOut, false);
  g.finalNext();
  assert.equal(g.publicView().final.timer, null);
});

test('after a restart the clock-based values are reset so nobody stays locked out', () => {
  const { room, g, ps } = setup();
  start(g);
  g.select(0, 0);
  g.buzz(ps[2].id);                                       // too early: recorded for a penalty
  room.clock = () => 9_000_000;                           // the old process ran for a long time
  g.openBuzzers();                                        // penalty runs until 9_000_500
  const saved = JSON.parse(JSON.stringify(room));
  const copy = new Room({ games: GAMES, now: () => 500, loadContent: () => set }); // new process, clock restarts
  copy.restore(saved);
  const cg = copy.game;
  assert.deepEqual(cg.run.clue.penaltyUntil, {});
  assert.equal(cg.buzz(ps[2].id).ok, true);
  assert.equal(cg.publicView().clue.timer.leftMs, 10000); // a timer that was running gets its full time back
});

test('room settings: sound and volume are validated and shown to the TV', () => {
  const { room } = setup();
  assert.deepEqual({ ...room.publicView().room.settings }, { sound: true, volume: 70, ping: 0 });
  room.act('setRoomSettings', { sound: false, volume: 25 });
  assert.equal(room.publicView().room.settings.sound, false);
  assert.equal(room.publicView().room.settings.volume, 25);
  assert.throws(() => room.act('setRoomSettings', { volume: 101 }), /Volume/);
  room.act('testSound');
  assert.equal(room.publicView().room.settings.ping, 1);
});

// ---------- the buzz-in window ----------
test('opening buzzers starts a 10 second buzz-in window; 0 switches it off', () => {
  const { g } = setup();
  start(g); g.select(0, 0);
  assert.equal(g.publicView().clue.timer, null);          // still reading the clue: no timer
  g.openBuzzers();
  const tm = g.publicView().clue.timer;
  assert.deepEqual({ kind: tm.kind, totalMs: tm.totalMs, leftMs: tm.leftMs, timedOut: tm.timedOut }, { kind: 'buzz', totalMs: 10000, leftMs: 10000, timedOut: false });

  const b = setup(); b.g.setSettings({ buzzSeconds: 0 }); start(b.g); b.g.select(0, 0); b.g.openBuzzers();
  assert.equal(b.g.publicView().clue.timer, null);
  b.clock.advance(60000); b.g.tick();
  assert.equal(b.g.buzz(b.ps[0].id).ok, true);            // no window, so buzzing never closes
});

test('if nobody buzzes in time, it is time\'s up: buzzing locks and the host reveals the answer', () => {
  const { g, ps, clock } = setup();
  start(g); g.select(0, 0); g.openBuzzers();
  clock.advance(9000); g.tick();
  assert.equal(g.publicView().clue.timer.timedOut, false);
  assert.equal(g.buzz(ps[0].id).ok, true);                // 9 seconds in, still inside the window
  g.reveal(); g.closeClue();

  g.select(1, 0); g.openBuzzers();
  clock.advance(10001); g.tick();
  assert.equal(g.publicView().clue.timer.timedOut, true);
  assert.equal(g.run.clue.step, 'open');                  // nothing happens by itself
  assert.equal(g.buzz(ps[1].id).reason, 'timeup');        // buzzers are locked
  assert.equal(ps.every((p) => p.score === 0), true);
  g.reveal();                                             // the host reveals the answer
  assert.equal(g.publicView().clue.answer, set.categories[1].clues[0].answer);
  assert.equal(g.run.clue.step, 'revealed');
  assert.equal(g.publicView().clue.timer, null);
});

test('a buzz right at the deadline is refused even before the next tick notices', () => {
  const { g, ps, clock } = setup();
  start(g); g.select(0, 0); g.openBuzzers();
  clock.advance(10000);                                   // exactly at the deadline, tick() has not run yet
  assert.equal(g.buzz(ps[0].id).reason, 'timeup');
});

test('the host can restart the buzz-in window after time is up', () => {
  const { g, ps, clock } = setup();
  start(g); g.select(0, 0); g.openBuzzers();
  clock.advance(10001); g.tick();
  assert.equal(g.buzz(ps[0].id).ok, false);
  g.restartTimer();
  assert.equal(g.publicView().clue.timer.timedOut, false);
  assert.equal(g.publicView().clue.timer.leftMs, 10000);
  assert.equal(g.buzz(ps[0].id).ok, true);
  assert.equal(g.publicView().clue.timer.kind, 'answer');
});

test('re-opening buzzers gives a fresh window; auto-wrong never fires on a buzz-in window', () => {
  const { g, ps, clock } = setup();
  g.setSettings({ autoWrong: true });
  start(g); g.select(0, 0); g.openBuzzers(); g.buzz(ps[0].id);
  clock.advance(5000);
  g.reopen();
  assert.equal(g.publicView().clue.timer.kind, 'buzz');
  assert.equal(g.publicView().clue.timer.leftMs, 10000);
  clock.advance(10001); g.tick();
  assert.equal(ps.every((p) => p.score === 0), true);     // nobody is penalised for not buzzing
  assert.equal(g.run.clue.step, 'open');
});

test('buzz-in time is validated and a Daily Double has no buzz window', () => {
  const { g, ps } = setup();
  assert.throws(() => g.setSettings({ buzzSeconds: 121 }), /Buzz-in time/);
  assert.throws(() => g.setSettings({ buzzSeconds: -5 }), /Buzz-in time/);
  g.setSettings({ buzzSeconds: 7 });
  assert.equal(g.settings.buzzSeconds, 7);
  start(g); g.run.dd = ['2,3']; g.run.control = ps[0].id;
  g.select(2, 3);
  assert.equal(g.publicView().clue.timer, null);          // wagering: no timer at all
});

// ---------- two rounds before Final Jeopardy ----------
const set2 = (() => {
  const b = structuredClone(set);
  b.title = 'Second board';
  b.categories.forEach((c, i) => { c.name = `Round two ${i + 1}`; });
  b.final = { category: 'The Last Word', clue: 'Second set final clue', answer: 'Second set answer' };
  return b;
})();

function twoRounds({ players = ['Ann', 'Bo', 'Cy'], random = Math.random } = {}) {
  let t = 1000;
  const room = new Room({ games: GAMES, now: () => t, random, loadContent: (game, id) => (id === 'y' ? set2 : set) });
  const clock = { advance: (ms) => { t += ms; } };
  room.chooseGame('jeopardy');
  const ps = players.map((n) => room.join({ name: n }));
  const g = room.game;
  g.setSettings({ rounds: 2 });
  g.chooseSet('x', 1);
  g.chooseSet('y', 2);
  return { room, g, ps, clock };
}
/** Clear the board in play by marking every square used. */
const clearBoard = (g) => { g.run.used = []; for (let c = 0; c < 6; c++) for (let r = 0; r < 5; r++) g.run.used.push(`${c},${r}`); };

test('one round is the default; the number of rounds is 1 or 2 and is chosen in the lobby', () => {
  const { g } = setup();
  assert.equal(g.settings.rounds, 1);
  assert.throws(() => g.setSettings({ rounds: 3 }), /1 or 2/);
  assert.throws(() => g.setSettings({ rounds: 0 }), /1 or 2/);
  g.setSettings({ rounds: 2 });
  assert.equal(g.publicView().rounds, 2);
  g.setSettings({ rounds: 1 });
  g.chooseSet('x'); start(g);
  assert.throws(() => g.setSettings({ rounds: 2 }), /before the game starts/);
});

test('each round has its own question set, and they must differ', () => {
  const { g } = twoRounds();
  assert.equal(g.setId, 'x');
  assert.equal(g.setId2, 'y');
  assert.throws(() => g.chooseSet('x', 2), /already used for round 1/);
  assert.throws(() => g.chooseSet('y', 1), /already used for round 2/);
  assert.throws(() => g.chooseSet('z', 3), /round 1 or 2/);
  assert.equal(g.hostView().setId2, 'y');
});

test('a two-round game cannot start without a second set', () => {
  const { room, g } = twoRounds();
  g.setId2 = null; g.set2 = null;
  assert.throws(() => g.startGame(), /Double Jeopardy/);
  g.setSettings({ rounds: 1 });
  assert.doesNotThrow(() => g.startGame());                    // one round needs only the first set
  assert.equal(room.inProgress(), true);
});

test('round 1 is played from the first set, with one Daily Double', () => {
  for (let i = 0; i < 40; i++) {
    const { g } = twoRounds();
    g.startGame();
    const v = g.publicView();
    assert.equal(v.round, 1);
    assert.equal(v.roundTitle, 'Jeopardy!');
    assert.equal(v.categories[0], set.categories[0].name);
    assert.equal(v.board[0].map((c) => c.value).join(), '200,400,600,800,1000');
    assert.equal(g.run.dd.length, 1);
    assert.ok(Number(g.run.dd[0].split(',')[1]) >= 1, 'never the top row');
  }
});

test('starting round 2: new board from the second set, values doubled, scores carry, lowest score picks', () => {
  const { room, g, ps } = twoRounds();
  start(g);
  g.select(0, 0); g.openBuzzers(); g.awardBuzz(ps[0].id); g.correct(); g.closeClue();   // Ann +200
  g.select(0, 1); g.openBuzzers(); g.awardBuzz(ps[1].id); g.correct(); g.closeClue();   // Bo +400
  assert.deepEqual(ps.map((p) => p.score), [200, 400, 0]);
  assert.equal(g.run.control, ps[1].id);
  g.startRound2();
  const v = g.publicView();
  assert.equal(v.round, 2);
  assert.equal(v.roundTitle, 'Double Jeopardy!');
  assert.deepEqual(v.categories, set2.categories.map((c) => c.name));
  assert.equal(v.board[0].map((c) => c.value).join(), '400,800,1200,1600,2000');
  assert.ok(v.board.flat().every((c) => !c.used), 'a fresh board');
  assert.deepEqual(ps.map((p) => p.score), [200, 400, 0], 'scores carry over');
  assert.equal(g.run.control, ps[2].id, 'Cy has the lowest score, so Cy picks first');
  assert.equal(room.publicView().game.status, 'board');
});

test('round 2 has two Daily Doubles in different columns; a set can flag its own', () => {
  for (let i = 0; i < 40; i++) {
    const { g } = twoRounds();
    start(g); g.startRound2();
    assert.equal(g.run.dd.length, 2);
    const cols = g.run.dd.map((k) => k.split(',')[0]);
    assert.notEqual(cols[0], cols[1]);
    assert.ok(g.run.dd.every((k) => Number(k.split(',')[1]) >= 1));
  }
  const { g } = twoRounds();
  const flagged = structuredClone(set2);
  flagged.categories[1].clues[2].dailyDouble = true;
  g.room.loadContent = (game, id) => (id === 'y' ? flagged : set);
  g.chooseSet('y', 2);
  start(g); g.startRound2();
  assert.deepEqual(g.run.dd, ['1,2']);
});

test('round 2 clues are worth double, and a Daily Double can be wagered up to $2,000', () => {
  const { g, ps } = twoRounds();
  start(g); g.startRound2();
  g.run.dd = ['2,3']; g.run.control = ps[0].id;
  g.select(0, 0);                                              // a $400 clue now
  assert.equal(g.run.clue.value, 400);
  g.openBuzzers(); g.awardBuzz(ps[0].id); g.correct();
  assert.equal(ps[0].score, 400);
  g.closeClue();
  g.select(2, 3);                                              // the Daily Double
  assert.throws(() => g.setDailyDoubleWager(2001), /between 0 and 2000/);
  g.setDailyDoubleWager(2000);
  assert.equal(g.run.clue.value, 2000);
  g.correct();
  assert.equal(ps[0].score, 2400);
  // a rich player can wager their whole score, as before
  const { g: g2, ps: p2 } = twoRounds();
  start(g2); g2.startRound2();
  p2[0].score = 5000; g2.run.dd = ['0,1']; g2.run.control = p2[0].id;
  g2.select(0, 1);
  assert.doesNotThrow(() => g2.setDailyDoubleWager(5000));
});

test('round 1 Daily Doubles are still capped at $1,000 (or your score)', () => {
  const { g, ps } = twoRounds();
  start(g);
  g.run.dd = ['0,1']; g.run.control = ps[0].id;
  g.select(0, 1);
  assert.throws(() => g.setDailyDoubleWager(1001), /between 0 and 1000/);
});

test('the lowest score picks first in round 2, and ties are broken at random', () => {
  const lowRng = twoRounds({ random: () => 0 });
  start(lowRng.g); lowRng.g.startRound2();
  assert.equal(lowRng.g.run.control, lowRng.ps[0].id);          // all tied at 0: the random draw picks the first
  const highRng = twoRounds({ random: () => 0.99 });
  start(highRng.g); highRng.g.startRound2();
  assert.equal(highRng.g.run.control, highRng.ps[2].id);
});

test('round 2 can only be started from the board, once, and only in a two-round game', () => {
  const { g, ps } = twoRounds();
  assert.throws(() => g.startRound2(), /Return to the board/);   // not started
  start(g);
  g.select(0, 0);
  assert.throws(() => g.startRound2(), /Return to the board/);   // a clue is open
  g.reveal(); g.closeClue();
  g.startRound2();
  assert.throws(() => g.startRound2(), /no second round/);       // already in round 2
  const one = setup();
  start(one.g);
  assert.throws(() => one.g.startRound2(), /no second round/);
  assert.ok(ps.length);
});

test('Final Jeopardy uses the last round’s set, and can follow round 1 if the host skips round 2', () => {
  const { g, ps } = twoRounds();
  start(g); ps[0].score = 500;
  g.startRound2();
  g.startFinal();
  const v = g.publicView();
  assert.equal(v.final.category, 'The Last Word');
  assert.equal(g.hostView().final.answer, 'Second set answer');
  const skip = twoRounds();
  start(skip.g); skip.ps[0].score = 500;
  skip.g.startFinal();                                          // skipping round 2 is allowed
  assert.equal(skip.g.publicView().final.category, 'The Last Word');
  const single = setup();
  start(single.g); single.ps[0].score = 500; single.g.startFinal();
  assert.equal(single.g.publicView().final.category, set.final.category);
});

test('rounds and the second set survive a restart; an old save without them loads as one round', () => {
  const { room, g, ps } = twoRounds();
  start(g); ps[0].score = 300; g.startRound2();
  const copy = new Room({ games: GAMES, loadContent: (game, id) => (id === 'y' ? set2 : set) });
  assert.equal(copy.restore(JSON.parse(JSON.stringify(room))), true);
  const cg = copy.game;
  assert.equal(cg.settings.rounds, 2);
  assert.equal(cg.setId2, 'y');
  assert.equal(cg.run.round, 2);
  assert.equal(cg.publicView().roundTitle, 'Double Jeopardy!');
  assert.equal(cg.publicView().board[0][0].value, 400);
  const old = JSON.parse(JSON.stringify(room));
  delete old.game.setId2; delete old.game.settings.rounds; delete old.game.run.round;
  const o = new Room({ games: GAMES, loadContent: () => set });
  assert.equal(o.restore(old), true);
  assert.equal(o.game.settings.rounds, 1);
  assert.equal(o.game.run.round, 1);
});

test('the editor cannot delete a set that either round is using; end game keeps the sets', () => {
  const { g } = twoRounds();
  assert.equal(g.usesContent('x'), true);
  assert.equal(g.usesContent('y'), true);
  assert.equal(g.usesContent('z'), false);
  start(g); g.endGame();
  assert.equal(g.setId, 'x'); assert.equal(g.setId2, 'y'); assert.equal(g.run.round, 1);
});

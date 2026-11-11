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

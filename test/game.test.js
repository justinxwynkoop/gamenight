import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game, GameError, validateSet } from '../game.js';

const set = JSON.parse(readFileSync(new URL('../data/sets/family-night.json', import.meta.url)));

function setup({ players = ['Ann', 'Bo', 'Cy'], teams = false } = {}) {
  let t = 1000;
  const g = new Game({ now: () => t, loadSet: () => set });
  const clock = { advance: (ms) => { t += ms; } };
  if (teams) { g.setMode('teams'); }
  const ps = players.map((n, i) => g.join({ name: n, teamId: teams ? g.teams[i % g.teams.length].id : undefined }));
  g.chooseSet('x');
  g.run.dd = []; // no daily doubles unless a test adds one
  return { g, ps, clock };
}
const start = (g) => { const dd = g.run.dd; g.startGame(); g.run.dd = dd.length ? dd : []; };

test('sample set is valid', () => assert.ok(validateSet(set)));

test('validateSet rejects malformed sets', () => {
  assert.throws(() => validateSet({ title: 'x', categories: [] }), GameError);
  const bad = structuredClone(set); bad.categories[2].clues[1].answer = '';
  assert.throws(() => validateSet(bad), /answer/);
});

test('join rules: names unique, team required in team mode', () => {
  const g = new Game({ loadSet: () => set });
  g.join({ name: 'Ann' });
  assert.throws(() => g.join({ name: 'ann' }), /taken/);
  assert.throws(() => g.join({ name: '  ' }), /name/i);
  g.setMode('teams');
  assert.throws(() => g.join({ name: 'Bo' }), /team/i);
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
  const { g, ps } = setup();
  start(g); g.select(0, 0);
  assert.equal(g.publicView().clue.answer, null);
  assert.equal(g.playerView(ps[0].id).clue.answer, null);
  assert.equal(g.hostView().clue.answer, 'The Pacific Ocean');
  assert.ok(!JSON.stringify(g.publicView()).includes('Pacific Ocean'));
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
  const { g, ps } = setup({ players: ['Ann', 'Bo', 'Cy', 'Di'], teams: true });
  start(g); g.select(0, 0); g.openBuzzers();
  assert.equal(g.buzz(ps[0].id).ok, true);        // Team 1
  assert.equal(g.buzz(ps[2].id).ok, false);       // teammate of team 1
  g.correct();
  assert.equal(g.teams[0].score, 200);
  assert.equal(ps[0].score, 0);
  assert.equal(g.run.control, g.teams[0].id);
});

test('host can adjust and set scores', () => {
  const { g, ps } = setup();
  g.adjustScore(ps[0].id, { delta: 300 });
  g.adjustScore(ps[0].id, { delta: -100 });
  assert.equal(ps[0].score, 200);
  g.adjustScore(ps[0].id, { set: 50 });
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

test('state survives a save and restore, minus live connections', () => {
  const { g, ps } = setup();
  start(g); g.select(0, 0); g.openBuzzers(); g.buzz(ps[0].id); g.correct();
  g.setConnected(ps[0].id, true);
  const copy = new Game({ loadSet: () => set });
  copy.restore(JSON.parse(JSON.stringify(g)));
  assert.equal(copy.players[0].score, 200);
  assert.equal(copy.run.control, ps[0].id);
  assert.equal(copy.playerByToken(ps[0].token).name, 'Ann');
  assert.equal(copy.connected.size, 0);
});

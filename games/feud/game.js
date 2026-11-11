// Family Feud rules. No network, no files, no real timers: time-outs are driven by tick().
// Two teams play survey questions. The room supplies players, teams and scores; this class owns the
// face-off, the board of survey answers, strikes, the steal, the round multipliers and Fast Money.
//
// The host is the judge: the families answer out loud, and the host taps the matching survey answer
// (or "not on the board"). Only the face-off buzz and Fast Money answers come from the phones.

import { GameError, fail, cleanName, int } from '../../lib.js';

export { GameError };
export const MAX_STRIKES = 3;
export const FAST_MONEY_QUESTIONS = 5;
const GAME = 'feud';
const SLOTS = ['p1', 'p2'];

const unique = (list) => new Set(list.map((x) => x.toLowerCase())).size === list.length;

/** Checks a question set. Throws a GameError with a message the editor can show. */
export function validateSet(set) {
  if (!set || typeof set !== 'object') fail('Question set must be an object');
  if (!cleanName(set.title, 80)) fail('Question set needs a title');
  const checkQuestion = (q, label) => {
    if (!String(q?.question ?? '').trim()) fail(`${label} needs a question`);
    if (String(q.question).length > 200) fail(`${label}: the question is too long`);
    if (!Array.isArray(q.answers) || q.answers.length < 3 || q.answers.length > 8) fail(`${label} needs 3 to 8 answers`);
    q.answers.forEach((a, i) => {
      if (!cleanName(a?.text, 40)) fail(`${label}, answer ${i + 1} needs text`);
      const pts = int(a.points);
      if (!(pts >= 1 && pts <= 100)) fail(`${label}, answer ${i + 1} needs points from 1 to 100`);
      if (a.aliases !== undefined && (!Array.isArray(a.aliases) || a.aliases.some((x) => typeof x !== 'string'))) fail(`${label}, answer ${i + 1}: aliases must be a list of words`);
    });
    if (!unique(q.answers.map((a) => cleanName(a.text, 40)))) fail(`${label} has the same answer twice`);
  };
  if (!Array.isArray(set.rounds) || set.rounds.length < 3 || set.rounds.length > 8) fail('Need 3 to 8 rounds');
  set.rounds.forEach((q, i) => checkQuestion(q, `Round ${i + 1}`));
  if (set.fastMoney !== undefined && set.fastMoney !== null) {
    if (!Array.isArray(set.fastMoney) || set.fastMoney.length !== FAST_MONEY_QUESTIONS) fail(`Fast Money needs exactly ${FAST_MONEY_QUESTIONS} questions (or leave it out)`);
    set.fastMoney.forEach((q, i) => checkQuestion(q, `Fast Money ${i + 1}`));
  }
  return true;
}

/** A question's answers best first (the board lists them by rank). */
export const ranked = (q) => q.answers.map((a) => ({ text: cleanName(a.text, 40), points: int(a.points), aliases: a.aliases ?? [] })).sort((a, b) => b.points - a.points);

const normalize = (s) => String(s ?? '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\b(a|an|the|my|your|their|his|her)\b/g, ' ').replace(/\s+/g, ' ').trim()
  .split(' ').map((w) => (w.length > 3 ? w.replace(/(ies)$/, 'y').replace(/(es|s)$/, '') : w)).join(' ');

/** Which of a question's answers a typed or spoken guess most likely means, as an index into ranked(), or -1. */
export function matchAnswer(answers, typed) {
  const t = normalize(typed);
  if (t.length < 2) return -1;
  let best = -1;
  answers.forEach((a, i) => {
    for (const form of [a.text, ...(a.aliases ?? [])]) {
      const f = normalize(form);
      if (!f) continue;
      if (f === t) { best = i; return; }
      if (best === -1 && t.length >= 3 && (f.includes(t) || (f.length >= 3 && t.includes(f)))) best = i;
    }
  });
  return best;
}

export class FeudGame {
  constructor(room) {
    this.room = room;
    this.settings = { targetScore: 300, multipliers: true, fastMoney: true, fastMoneyGoal: 200, fastMoneySeconds1: 40, fastMoneySeconds2: 45 };   // typing five answers on a phone takes longer than saying them
    this.setId = null;
    this.set = null;
    this.run = this.#blankRun('lobby');
    this.history = [];   // for undo; not saved
  }

  #blankRun(status) {
    return {
      status, round: 0, step: 'faceoff', revealed: [], strikes: 0, control: null, stealFrom: null, showAll: false,
      faceoff: this.#blankFaceoff(), winner: null, awarded: 0, fm: null,
    };
  }
  #blankFaceoff() { return { reps: {}, open: false, turn: null, attempts: [], winner: null }; }
  #changed() { this.room.changed(); }

  init() {
    const first = this.room.listContent(GAME)[0];
    if (first) { try { this.chooseSet(first.id); } catch { /* leave it to the host */ } }
  }
  inProgress() { return this.run.status !== 'lobby'; }
  usesContent(id) { return this.setId === id; }

  // ---------- persistence ----------
  toJSON() { return { settings: this.settings, setId: this.setId, run: this.run }; }
  restore(data) {
    this.settings = { ...this.settings, ...data.settings };
    this.setId = data.setId ?? null;
    this.set = this.setId ? this.room.loadContent(GAME, this.setId) : null;
    this.run = { ...this.#blankRun('lobby'), ...data.run };
    if (this.run.status !== 'lobby' && !this.set) this.run = this.#blankRun('lobby');
    const fm0 = this.run.fm;
    if (fm0 && !fm0.shown) fm0.shown = { p1: fm0.points.p1.map((v) => (v === null ? 0 : 2)), p2: fm0.points.p2.map((v) => (v === null ? 0 : 2)) };
    const tm = this.run.fm?.timer;
    if (tm && !tm.timedOut) tm.deadline = this.room.now() + tm.totalMs;   // the clock restarted with the server
  }

  // ---------- host actions & phone messages ----------
  act(action, a = {}) {
    switch (action) {
      case 'setSettings': return this.setSettings(a);
      case 'chooseSet': return this.chooseSet(a.id);
      case 'startGame': return this.startGame();
      case 'endGame': return this.endGame();
      case 'undo': return this.undo();
      // face-off
      case 'openBuzzers': return this.openBuzzers();
      case 'awardBuzz': return this.awardBuzz(a.id);
      case 'setRep': return this.setRep(a.unitId, a.playerId);
      case 'faceoffWin': return this.faceoffWin(a.id);
      case 'replayFaceoff': return this.replayFaceoff();
      case 'choose': return this.choose(!!a.play);
      // the board
      case 'answer': return this.answer(int(a.index));
      case 'miss': return this.miss();
      case 'revealRest': return this.revealRest();
      case 'nextRound': return this.nextRound();
      case 'endRounds': return this.finishRounds();
      // Fast Money
      case 'fmTeam': return this.fmTeam(a.id);
      case 'fmPlayers': return this.fmPlayers(a.ids);
      case 'fmStart': return this.fmStart();
      case 'fmSetAnswers': return this.fmSetAnswers(a.slot, a.answers);
      case 'fmNext': return this.fmNext();
      case 'fmShowAnswer': return this.fmShowAnswer(a.slot, int(a.q));
      case 'fmShowPoints': return this.fmShowPoints(a.slot, int(a.q), a.points, a.label);
      case 'fmRestartTimer': return this.fmRestartTimer();
      case 'finishGame': return this.finishGame();
      default: throw new GameError(`Unknown action ${action}`);
    }
  }
  onPlayer(player, msg) {
    switch (msg.t) {
      case 'buzz': return { t: 'buzz-result', ...this.buzz(player.id) };
      case 'fm-answers': this.fmAnswersFrom(player.id, msg.answers); return { t: 'ack', what: 'fm-answers' };
      default: return undefined;
    }
  }

  // ---------- setup ----------
  setSettings({ targetScore, multipliers, fastMoney, fastMoneyGoal, fastMoneySeconds1, fastMoneySeconds2 }) {
    const inRange = (v, lo, hi, what) => {
      const n = int(v);
      if (!(n >= lo && n <= hi)) fail(`${what} must be ${lo} to ${hi}`);
      return n;
    };
    if (targetScore !== undefined) this.settings.targetScore = inRange(targetScore, 50, 5000, 'Winning score');
    if (typeof multipliers === 'boolean') this.settings.multipliers = multipliers;
    if (typeof fastMoney === 'boolean') this.settings.fastMoney = fastMoney;
    if (fastMoneyGoal !== undefined) this.settings.fastMoneyGoal = inRange(fastMoneyGoal, 10, 1000, 'Fast Money goal');
    if (fastMoneySeconds1 !== undefined) this.settings.fastMoneySeconds1 = inRange(fastMoneySeconds1, 5, 180, 'First player\'s time');
    if (fastMoneySeconds2 !== undefined) this.settings.fastMoneySeconds2 = inRange(fastMoneySeconds2, 5, 180, 'Second player\'s time');
    this.#changed();
  }
  chooseSet(id) {
    if (this.run.status !== 'lobby') fail('Pick the question set before the game starts');
    const set = this.room.loadContent(GAME, id) ?? fail('No such question set');
    validateSet(set);
    this.setId = id; this.set = set;
    this.#changed();
  }
  contentChanged(id) {
    if (this.run.status === 'lobby' && this.setId === id) {
      this.set = this.room.loadContent(GAME, id);
      if (!this.set) this.setId = null;
    }
    this.#changed();
  }

  #teams() { return this.room.teams; }
  #members(unitId) { return this.room.players.filter((p) => p.teamId === unitId); }
  #other(unitId) { return this.#teams().find((t) => t.id !== unitId) ?? null; }
  #unit(id) { return this.#teams().find((t) => t.id === id) ?? fail('No such team'); }

  startGame() {
    if (this.run.status !== 'lobby') fail('Game already started');
    if (!this.set) fail('Choose a question set first');
    if (this.room.mode !== 'teams' || this.#teams().length !== 2) fail('Family Feud is played by two teams');
    if (this.#teams().some((t) => this.#members(t.id).length < 1)) fail('Each team needs at least one player');
    this.room.resetScores();
    this.history = [];
    this.run = this.#blankRun('round');
    this.#beginRound(0);
    this.#changed();
  }
  endGame() {
    this.room.resetScores();
    this.history = [];
    this.run = this.#blankRun('lobby');
    this.#changed();
  }

  // ---------- undo (a mis-tap on a phone is easy) ----------
  #remember() {
    this.history.push({ run: structuredClone(this.run), scores: Object.fromEntries(this.#teams().map((t) => [t.id, t.score])) });
    if (this.history.length > 30) this.history.shift();
  }
  undo() {
    const last = this.history.pop() ?? fail('Nothing to undo');
    this.run = last.run;
    for (const t of this.#teams()) if (last.scores[t.id] !== undefined) t.score = last.scores[t.id];
    this.#changed();
  }

  // ---------- rounds ----------
  #question() { return this.set.rounds[this.run.round]; }
  #answers() { return ranked(this.#question()); }
  multiplier(i = this.run.round) {
    if (!this.settings.multipliers) return 1;
    return i < 3 ? 1 : i === 3 ? 2 : 3;
  }
  pot() {
    const answers = this.#answers();
    return this.run.revealed.reduce((sum, i) => sum + (answers[i]?.points ?? 0), 0);
  }
  #beginRound(i) {
    const run = this.run;
    run.status = 'round'; run.round = i; run.step = 'faceoff';
    run.revealed = []; run.strikes = 0; run.control = null; run.stealFrom = null; run.showAll = false;
    run.winner = null; run.awarded = 0;
    run.faceoff = this.#blankFaceoff();
    for (const t of this.#teams()) {
      const members = this.#members(t.id);
      run.faceoff.reps[t.id] = members.length ? members[i % members.length].id : null;   // a different player steps up each round
    }
  }
  #inRound(...steps) {
    if (this.run.status !== 'round') fail('No round is being played');
    if (steps.length && !steps.includes(this.run.step)) fail('Not possible at this point in the round');
    return this.run;
  }

  // ---------- the face-off ----------
  setRep(unitId, playerId) {
    const run = this.#inRound('faceoff');
    this.#unit(unitId);
    const p = this.room.player(playerId);
    if (p.teamId !== unitId) fail('That player is not on that team');
    run.faceoff.reps[unitId] = playerId;
    this.#changed();
  }
  openBuzzers() {
    const f = this.#inRound('faceoff').faceoff;
    if (f.winner) fail('The face-off is already decided');
    f.open = true; f.turn = null; f.attempts = [];
    this.#changed();
  }
  /** A press from a phone or a physical buzzer. Only the two face-off players count. */
  buzz(playerId) {
    const run = this.run;
    const f = run.faceoff;
    if (run.status !== 'round' || run.step !== 'faceoff' || !f.open) return { ok: false, reason: 'closed' };
    const unitId = Object.keys(f.reps).find((u) => f.reps[u] === playerId);
    if (!unitId) return { ok: false, reason: 'not-your-turn' };
    f.open = false; f.turn = unitId;
    this.#changed();
    return { ok: true, unitId, playerId };
  }
  /** Host: give the face-off turn to a team directly (a dead phone, or no buzz at all). */
  awardBuzz(id) {
    const f = this.#inRound('faceoff').faceoff;
    this.#unit(id);
    f.open = false; f.turn = id; f.attempts = [];
    this.#remember();
    this.#changed();
  }
  replayFaceoff() {
    const f = this.#inRound('faceoff').faceoff;
    f.open = true; f.turn = null; f.attempts = []; f.winner = null;
    this.#changed();
  }
  faceoffWin(id) {
    const run = this.#inRound('faceoff');
    this.#unit(id);
    this.#remember();
    run.faceoff.winner = id; run.faceoff.open = false; run.faceoff.turn = null;
    run.step = 'choose';
    this.#changed();
  }
  /** The winning team plays, or passes the board to the other team. */
  choose(play) {
    const run = this.#inRound('choose');
    this.#remember();
    const winner = run.faceoff.winner;
    run.control = play ? winner : this.#other(winner).id;
    run.step = 'play';
    run.strikes = 0;
    if (this.#allRevealed()) this.#endRound(run.control);
    this.#changed();
  }

  #allRevealed() { return this.run.revealed.length >= this.#answers().length; }
  #reveal(i) {
    const answers = this.#answers();
    if (!(i >= 0 && i < answers.length)) fail('There is no such answer');
    if (this.run.revealed.includes(i)) fail('That answer is already up');
    this.run.revealed.push(i);
  }

  /** The host taps a survey answer: the team guessed it. */
  answer(i) {
    const run = this.#inRound('faceoff', 'play', 'steal');
    if (run.step === 'faceoff') return this.#faceoffAnswer(i);
    this.#remember();
    this.#reveal(i);
    if (run.step === 'steal') this.#endRound(run.control);                      // a good steal takes the pot
    else if (this.#allRevealed()) this.#endRound(run.control);                  // cleared the board
    this.#changed();
  }
  /** The team's guess is not on the board: a face-off miss, a strike, or a failed steal. */
  miss() {
    const run = this.#inRound('faceoff', 'play', 'steal');
    if (run.step === 'faceoff') return this.#faceoffMiss();
    this.#remember();
    if (run.step === 'steal') {
      this.#endRound(run.stealFrom);                                            // the steal failed: the pot stays with them
    } else {
      run.strikes += 1;
      if (run.strikes >= MAX_STRIKES) {
        run.step = 'steal';
        run.stealFrom = run.control;
        run.control = this.#other(run.control).id;
      }
    }
    this.#changed();
  }
  #faceoffAnswer(i) {
    const f = this.run.faceoff;
    if (!f.turn) fail('Open the buzzers (or give the turn to a team) first');
    this.#remember();
    this.#reveal(i);
    f.attempts.push({ unitId: f.turn, rank: i });
    this.#judgeFaceoff();
    this.#changed();
  }
  #faceoffMiss() {
    const f = this.run.faceoff;
    if (!f.turn) fail('Open the buzzers (or give the turn to a team) first');
    this.#remember();
    f.attempts.push({ unitId: f.turn, rank: null });
    this.#judgeFaceoff();
    this.#changed();
  }
  /** The face-off rules: the top answer wins at once; otherwise the other player gets a go, and the better answer wins. */
  #judgeFaceoff() {
    const run = this.run;
    const f = run.faceoff;
    const [first, second] = f.attempts;
    const finish = (unitId) => { f.winner = unitId; f.turn = null; run.step = 'choose'; };
    if (!second) {
      if (first.rank === 0) finish(first.unitId); else f.turn = this.#other(first.unitId).id;
      return;
    }
    if (first.rank === null && second.rank === null) { f.turn = null; f.open = false; return; }   // both missed: replay or award
    if (first.rank === null) return finish(second.unitId);
    if (second.rank === null) return finish(first.unitId);
    finish(second.rank < first.rank ? second.unitId : first.unitId);
  }

  #endRound(winnerId) {
    const run = this.run;
    const unit = this.#unit(winnerId);
    run.winner = winnerId;
    run.awarded = this.pot() * this.multiplier();
    unit.score += run.awarded;
    run.step = 'roundEnd';
  }
  revealRest() {
    const run = this.#inRound('roundEnd');
    run.showAll = true;
    this.#changed();
  }
  nextRound() {
    const run = this.#inRound('roundEnd');
    const top = Math.max(...this.#teams().map((t) => t.score));
    const last = run.round >= this.set.rounds.length - 1;
    if (last || top >= this.settings.targetScore) return this.finishRounds();
    this.history = [];
    this.#beginRound(run.round + 1);
    this.#changed();
  }
  /** The regular rounds are over (a team reached the target, the questions ran out, or the host ended them). */
  finishRounds() {
    const run = this.run;
    if (run.status !== 'round') fail('No round is being played');
    this.history = [];
    const [a, b] = this.#teams();
    const leader = a.score === b.score ? null : (a.score > b.score ? a : b);
    if (this.settings.fastMoney && this.set.fastMoney?.length === FAST_MONEY_QUESTIONS) {
      run.status = 'fastmoney';
      run.fm = { team: leader?.id ?? null, step: leader ? 'pick' : 'team', players: [], answers: { p1: null, p2: null }, points: { p1: Array(FAST_MONEY_QUESTIONS).fill(null), p2: Array(FAST_MONEY_QUESTIONS).fill(null) }, labels: { p1: Array(FAST_MONEY_QUESTIONS).fill(null), p2: Array(FAST_MONEY_QUESTIONS).fill(null) },
        // How much of each answer the TV has shown: 0 nothing, 1 what was said, 2 the points too ("survey says").
        shown: { p1: Array(FAST_MONEY_QUESTIONS).fill(0), p2: Array(FAST_MONEY_QUESTIONS).fill(0) }, timer: null };
      if (leader) this.#defaultFmPlayers();
    } else {
      run.status = 'done';
    }
    this.#changed();
  }

  // ---------- Fast Money ----------
  #fm() { if (this.run.status !== 'fastmoney') fail('Fast Money is not being played'); return this.run.fm; }
  #defaultFmPlayers() {
    const fm = this.run.fm;
    const m = this.#members(fm.team);
    fm.players = [m[0]?.id ?? null, (m[1] ?? m[0])?.id ?? null];
  }
  fmTeam(id) {
    const fm = this.#fm();
    if (fm.step !== 'team') fail('The team is already chosen');
    this.#unit(id);
    fm.team = id; fm.step = 'pick';
    this.#defaultFmPlayers();
    this.#changed();
  }
  fmPlayers(ids) {
    const fm = this.#fm();
    if (fm.step !== 'pick') fail('Choose the players before Fast Money starts');
    if (!Array.isArray(ids) || ids.length !== 2) fail('Choose two players');
    for (const id of ids) if (this.room.player(id).teamId !== fm.team) fail('Both players must be on the team playing Fast Money');
    fm.players = [...ids];
    this.#changed();
  }
  #fmSlot(slot) { if (!SLOTS.includes(slot)) fail('Unknown player slot'); return slot; }
  fmStart() {
    const fm = this.#fm();
    if (fm.step !== 'pick') fail('Fast Money has already started');
    if (!fm.players[0] || !fm.players[1]) fail('Choose the two players first');
    fm.step = 'p1';
    this.#startTimer(fm, this.settings.fastMoneySeconds1);
    this.#changed();
  }
  fmRestartTimer() {
    const fm = this.#fm();
    if (fm.step === 'p1') this.#startTimer(fm, this.settings.fastMoneySeconds1);
    else if (fm.step === 'p2') this.#startTimer(fm, this.settings.fastMoneySeconds2);
    else fail('There is nothing to time right now');
    this.#changed();
  }
  fmNext() {
    const fm = this.#fm();
    if (fm.step === 'p1') { fm.step = 'p2'; this.#startTimer(fm, this.settings.fastMoneySeconds2); } else if (fm.step === 'p2') { fm.step = 'reveal'; fm.timer = null; this.#zeroBlanks(); } else fail('Nothing further');
    this.#changed();
  }
  /** An answer nobody gave scores 0 without the host having to say so (the host can still change it). */
  #zeroBlanks() {
    const fm = this.run.fm;
    for (const s of SLOTS) {
      for (let q = 0; q < FAST_MONEY_QUESTIONS; q++) {
        if (fm.points[s][q] === null && !(fm.answers[s]?.[q] ?? '').trim()) { fm.points[s][q] = 0; fm.labels[s][q] = 'No answer'; }
      }
    }
  }
  #cleanAnswers(list) {
    return Array.from({ length: FAST_MONEY_QUESTIONS }, (_, i) => cleanName(Array.isArray(list) ? list[i] : '', 40));
  }
  /** The host types answers that were given out loud (or fixes a phone's). */
  fmSetAnswers(slot, answers) {
    const fm = this.#fm();
    this.#fmSlot(slot);
    if (!['p1', 'p2', 'reveal'].includes(fm.step)) fail('Answers can be entered once Fast Money has started');
    fm.answers[slot] = this.#cleanAnswers(answers);
    this.#changed();
  }
  fmAnswersFrom(playerId, answers) {
    const fm = this.run.status === 'fastmoney' ? this.run.fm : null;
    if (!fm || !['p1', 'p2'].includes(fm.step)) fail('Fast Money is not taking answers right now');
    if (fm.players[SLOTS.indexOf(fm.step)] !== playerId) fail('It is not your turn');
    fm.answers[fm.step] = this.#cleanAnswers(answers);
    this.#changed();
  }
  #fmQuestion(q) { return this.set.fastMoney[q] ?? fail('There is no such question'); }
  /** What a typed answer probably means, for the host to confirm: { index, rank (1 is the top answer), points, label, dup }. */
  fmSuggest(slot, q) {
    const fm = this.run.fm;
    const typed = fm?.answers[slot]?.[q] ?? '';
    const answers = ranked(this.#fmQuestion(q));
    const index = matchAnswer(answers, typed);
    let dup = false;
    if (slot === 'p2') {
      const other = fm.answers.p1?.[q] ?? '';
      const otherIndex = matchAnswer(answers, other);
      dup = !!typed && ((index !== -1 && index === otherIndex) || (normalize(typed) !== '' && normalize(typed) === normalize(other)));
    }
    return { index, rank: index === -1 ? null : index + 1, points: index === -1 || dup ? 0 : answers[index].points, label: index === -1 ? null : answers[index].text, dup };
  }
  #isBlank(fm, slot, q) { return !(fm.answers[slot]?.[q] ?? '').trim(); }
  #fmReveal() {
    const fm = this.#fm();
    if (!['reveal', 'results'].includes(fm.step)) fail('Reveal the answers once both players are done');
    return fm;
  }
  /** First tap: the TV types out what the player said. An answer nobody gave goes straight to its 0. */
  fmShowAnswer(slot, q) {
    const fm = this.#fmReveal();
    this.#fmSlot(slot);
    this.#fmQuestion(q);
    if (fm.shown[slot][q] >= 1) fail('That answer is already up');
    if (this.#isBlank(fm, slot, q)) { fm.points[slot][q] = 0; fm.labels[slot][q] = 'No answer'; fm.shown[slot][q] = 2; } else fm.shown[slot][q] = 1;
    this.#afterReveal(fm);
    this.#changed();
  }
  /** Second tap ("survey says"): the TV shows the points. The host can give the points and the matching answer, or leave them to the suggestion. Can be used again to correct a score. */
  fmShowPoints(slot, q, points, label) {
    const fm = this.#fmReveal();
    this.#fmSlot(slot);
    this.#fmQuestion(q);
    if (fm.shown[slot][q] < 1) fail('Show what they said first');
    let pts; let name;
    if (points === undefined || points === null || points === '') {
      const sg = this.fmSuggest(slot, q);
      pts = sg.points; name = sg.dup ? 'Repeated answer' : sg.label;
    } else { pts = int(points); name = label; }
    if (!(pts >= 0 && pts <= 100)) fail('Points must be 0 to 100');
    fm.points[slot][q] = pts;
    fm.labels[slot][q] = cleanName(name, 40) || null;
    fm.shown[slot][q] = 2;
    this.#afterReveal(fm);
    this.#changed();
  }
  #afterReveal(fm) {
    if (fm.step === 'reveal' && SLOTS.every((s) => fm.shown[s].every((v) => v === 2))) fm.step = 'results';
  }
  fmTotals() {
    const fm = this.run.fm;
    const sum = (s) => fm.points[s].reduce((t, v, q) => t + (fm.shown[s][q] === 2 ? v ?? 0 : 0), 0);
    return { p1: sum('p1'), p2: sum('p2'), total: sum('p1') + sum('p2') };
  }
  finishGame() {
    if (!['round', 'fastmoney'].includes(this.run.status)) fail('The game is not running');
    this.run.status = 'done';
    this.#changed();
  }

  #startTimer(holder, seconds) {
    if (!(seconds > 0)) { holder.timer = null; return; }
    const totalMs = seconds * 1000;
    holder.timer = { kind: 'fastmoney', totalMs, deadline: this.room.now() + totalMs, timedOut: false };
  }
  #timerView(holder) {
    const tm = holder?.timer;
    return tm ? { kind: tm.kind, totalMs: tm.totalMs, leftMs: tm.timedOut ? 0 : Math.max(0, Math.round(tm.deadline - this.room.now())), timedOut: tm.timedOut } : null;
  }
  tick() {
    const fm = this.run.status === 'fastmoney' ? this.run.fm : null;
    if (fm?.timer && !fm.timer.timedOut && this.room.now() >= fm.timer.deadline) { fm.timer.timedOut = true; this.#changed(); }
  }

  // ---------- views ----------
  #playerName(id) { return this.room.players.find((p) => p.id === id)?.name ?? null; }

  publicView() { return this.#view(false); }
  hostView() {
    const v = this.#view(true);
    v.setId = this.setId;
    if (this.run.status === 'round') v.canUndo = this.history.length > 0;
    return v;
  }
  #view(host) {
    const run = this.run;
    const set = this.set;
    const view = {
      game: GAME, scoreFormat: 'points', lobbyTitle: set?.title ?? 'Family Feud', settings: this.settings, status: run.status,
      title: set?.title ?? null, rounds: set?.rounds.length ?? 0, hasFastMoney: !!set?.fastMoney?.length,
      round: null, fm: null,
    };
    if (run.status === 'round') view.round = this.#roundView(host);
    if (run.status === 'fastmoney') view.fm = this.#fmView(host);
    if (run.status === 'done') view.result = this.#doneView();
    return view;
  }
  #roundView(host) {
    const run = this.run;
    const q = this.#question();
    const answers = this.#answers();
    const f = run.faceoff;
    const mult = this.multiplier();
    return {
      number: run.round + 1, multiplier: mult, question: q.question, step: run.step,
      strikes: run.strikes, maxStrikes: MAX_STRIKES, pot: this.pot(), control: run.control, stealFrom: run.stealFrom,
      answers: answers.map((a, i) => {
        const up = run.revealed.includes(i);
        const shown = up || run.showAll;
        return { n: i + 1, revealed: up, late: shown && !up, text: shown || host ? a.text : null, points: shown || host ? a.points : null };
      }),
      faceoff: {
        open: f.open, turn: f.turn, winner: f.winner, attempts: f.attempts,
        reps: Object.entries(f.reps).map(([unitId, playerId]) => ({ unitId, playerId, name: this.#playerName(playerId) })),
      },
      result: run.step === 'roundEnd' ? { winner: run.winner, awarded: run.awarded } : null,
      target: this.settings.targetScore,
    };
  }
  #fmView(host) {
    const fm = this.run.fm;
    const rows = Array.from({ length: FAST_MONEY_QUESTIONS }, (_, q) => {
      const row = { q, question: fm.step === 'pick' || fm.step === 'team' ? null : this.set.fastMoney[q].question };
      for (const s of SLOTS) {
        const shown = fm.shown[s][q];
        const judged = shown === 2;
        row[s] = {
          shown, judged, points: judged ? fm.points[s][q] : null, label: judged ? fm.labels[s][q] : null,
          // What was said stays private until the host shows it (the host sees it all along).
          typed: shown >= 1 || host ? fm.answers[s]?.[q] ?? '' : null,
          ...(host && fm.answers[s] ? { suggest: this.fmSuggest(s, q), blank: this.#isBlank(fm, s, q) } : {}),
          ...(host ? { choices: ranked(this.set.fastMoney[q]).map((a) => ({ text: a.text, points: a.points })) } : {}),
        };
      }
      return row;
    });
    const totals = this.fmTotals();
    const finished = fm.step === 'results';
    return {
      team: fm.team, step: fm.step, timer: this.#timerView(fm), goal: this.settings.fastMoneyGoal,
      players: SLOTS.map((s, i) => ({ slot: s, id: fm.players[i] ?? null, name: this.#playerName(fm.players[i]) })),
      submitted: { p1: !!fm.answers.p1, p2: !!fm.answers.p2 },
      rows, totals, won: finished ? totals.total >= this.settings.fastMoneyGoal : null,
    };
  }
  #doneView() {
    const run = this.run;
    const out = { fastMoney: null };
    if (run.fm) { const t = this.fmTotals(); out.fastMoney = { team: run.fm.team, total: t.total, goal: this.settings.fastMoneyGoal, won: t.total >= this.settings.fastMoneyGoal, played: run.fm.step === 'results' }; }
    return out;
  }
}

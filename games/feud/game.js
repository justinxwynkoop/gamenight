// Family Feud rules. No network, no files, no real timers: time-outs are driven by tick().
// Two teams play survey questions. The room supplies players, teams and scores; this class owns the
// face-off, the board of survey answers, strikes, the steal, the round multipliers and Fast Money.
//
// Two ways to judge. With a host (the default), the families answer out loud and the host taps the matching
// survey answer (or "not on the board"). With settings.typed on, nobody has to host: the player whose turn it
// is types the guess on their phone and it is matched against the survey, the buzzers open by themselves, and
// Fast Money moves on and reveals itself. Either way the face-off winner's team can play or pass from a phone,
// and the captain (the first player) can start the game and move it along from theirs.

import { GameError, fail, cleanName, int } from '../../lib.js';

export { GameError };
export const MAX_STRIKES = 3;
export const FAST_MONEY_QUESTIONS = 5;
/** How long things wait when nobody is hosting (settings.typed). */
export const AUTO = { faceoffReplay: 2500, fmGrace: 1500, fmReveal: 2200, fmHold: 4500, fmWin: 5000 };
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

/** One word with its plural or "-ie" ending folded, so "cookies" is "cookie" and "horses" is "horse". */
const stemWord = (w) => {
  if (w.length <= 3) return w;
  if (/ies$/.test(w) && w.length > 4) return `${w.slice(0, -3)}y`;
  if (/(ss|x|ch|sh|z)es$/.test(w)) return w.slice(0, -2);
  if (/s$/.test(w) && !/(ss|us|is)$/.test(w)) w = w.slice(0, -1);
  return /ie$/.test(w) && w.length > 4 ? `${w.slice(0, -2)}y` : w;
};
const normalize = (s) => String(s ?? '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\b(a|an|the|my|your|their|his|her)\b/g, ' ').replace(/\s+/g, ' ').trim()
  .split(' ').map(stemWord).join(' ');
/** `part` is a run of whole words inside `whole` ("chicken" in "fried chicken", never "ant" in "restaurant"). */
const wholeWords = (whole, part) => ` ${whole} `.includes(` ${part} `);

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
      if (best === -1 && t.length >= 3 && (wholeWords(f, t) || (f.length >= 3 && wholeWords(t, f)))) best = i;
    }
  });
  return best;
}

export class FeudGame {
  constructor(room) {
    this.room = room;
    this.settings = { targetScore: 300, multipliers: true, fastMoney: true, fastMoneyGoal: 200, fastMoneySeconds1: 40, fastMoneySeconds2: 45, typed: false, answerSeconds: 10, suddenDeath: true };   // typing five answers on a phone takes longer than saying them
    this.setId = null;
    this.set = null;
    this.run = this.#blankRun('lobby');
    this.history = [];   // for undo; not saved
  }

  #blankRun(status) {
    return {
      status, round: 0, step: 'faceoff', revealed: [], strikes: 0, control: null, stealFrom: null, showAll: false,
      faceoff: this.#blankFaceoff(), winner: null, awarded: 0, fm: null, shownLate: [],
      sudden: null, // sudden death (after the last round, nobody at the winning score): { n, mult, question, pts }
      said: null,   // the last typed guess: { unitId, name, text, index } (index -1 when it was not on the board)
      autoAt: null, // typed mode: when the next automatic step happens (a face-off replay, Fast Money moving on)
    };
  }
  #blankFaceoff() { return { reps: {}, open: false, turn: null, attempts: [], winner: null, buzzes: [], openedAt: null, followup: false }; }
  /** Opens the face-off buzzers and starts the clock: each press is timed against this moment. */
  #openFaceoff(f) { f.open = true; f.turn = null; f.attempts = []; f.followup = false; f.openedAt = this.room.now(); f.buzzes = []; }
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
    if (fm0 && fm0.part === undefined) { fm0.part = ['reveal', 'results'].includes(fm0.step) ? 'all' : null; fm0.hidden = { p1: false }; }   // a game saved before the two-part reveal
    if (this.run.answerTimer) this.run.answerTimer = null;   // an answer clock does not carry over a restart
    if (this.run.fmWinAt != null) this.run.fmWinAt = this.room.now() + 1000;   // the jackpot moment carries on after a restart
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
      case 'showAnswer': return this.showAnswer(a.index === undefined ? undefined : int(a.index));
      case 'nextRound': return this.nextRound();
      case 'endRounds': return this.finishRounds(a.bank === true);
      // Fast Money
      case 'fmTeam': return this.fmTeam(a.id);
      case 'fmPlayers': return this.fmPlayers(a.ids);
      case 'fmStart': return this.fmStart();
      case 'fmSetAnswers': return this.fmSetAnswers(a.slot, a.answers);
      case 'fmNext': return this.fmNext();
      case 'fmShowAnswer': return this.fmShowAnswer(a.slot, int(a.q));
      case 'fmShowPoints': return this.fmShowPoints(a.slot, int(a.q), a.points, a.label);
      case 'fmEdit': return this.fmEdit(a.slot, int(a.q), a);
      case 'startAnswerTimer': return this.startAnswerTimer();
      case 'fmRestartTimer': return this.fmRestartTimer();
      case 'finishGame': return this.finishGame();
      case 'fmRevealNext': return this.fmRevealNext();
      default: throw new GameError(`Unknown action ${action}`);
    }
  }
  /** What the captain's phone may do: run the game when nobody is hosting. Judging stays with the host or the survey. */
  static CAPTAIN_ACTIONS = new Set(['setSettings', 'chooseSet', 'startGame', 'endGame', 'nextRound', 'revealRest', 'showAnswer', 'endRounds',
    'openBuzzers', 'replayFaceoff', 'startAnswerTimer', 'fmTeam', 'fmPlayers', 'fmStart', 'fmNext', 'fmRestartTimer', 'fmRevealNext', 'finishGame']);

  onPlayer(player, msg) {
    switch (msg.t) {
      case 'buzz': return { t: 'buzz-result', ...this.buzz(player.id) };
      case 'fm-answers': return { t: 'ack', what: 'fm-answers', rejected: this.fmAnswersFrom(player.id, msg.answers) };
      case 'choose': {
        const run = this.#inRound('choose');
        if (player.teamId !== run.faceoff.winner) fail('The team that won the face-off decides');
        this.choose(!!msg.play);
        return undefined;
      }
      case 'guess': return { t: 'guess-result', ...this.guess(player, msg.text) };
      case 'cap': {
        if (this.captain() !== player.id) fail('Only the captain can do that');
        if (!FeudGame.CAPTAIN_ACTIONS.has(msg.action)) fail('Not allowed');
        return this.act(msg.action, msg.args ?? {}) ?? undefined;
      }
      default: return undefined;
    }
  }

  /** A host page is connected: the host runs the game, so nobody is captain. */
  hosted() { return (this.room.hosts ?? 0) > 0; }
  /** The first player who is here (the one who joined first, unless they left). With a host connected there is no captain. */
  captain() {
    if (this.hosted()) return null;
    const here = this.room.players.find((p) => this.room.connected?.has(p.id));
    return (here ?? this.room.players[0])?.id ?? null;
  }
  typed() { return !!this.settings.typed; }

  /** A player was removed from the room: whoever stood in for them (face-off player, Fast Money player) is replaced. */
  playerRemoved(id, gone) {
    const run = this.run;
    if (run.status === 'round' && run.faceoff) {
      for (const unitId of Object.keys(run.faceoff.reps)) {
        if (run.faceoff.reps[unitId] === id) run.faceoff.reps[unitId] = this.#members(unitId)[0]?.id ?? null;
      }
    }
    const fm = run.fm;
    if (fm && Array.isArray(fm.players) && fm.players.includes(id)) {
      // A player who has already had their go stays on the board under their own name; anyone still to play is replaced.
      const finished = (slot) => (slot === 'p1' ? !['team', 'pick', 'p1'].includes(fm.step) : fm.step === 'results' || (fm.step === 'reveal' && fm.part === 'p2'));
      SLOTS.forEach((slot, i) => {
        if (fm.players[i] !== id) return;
        if (finished(slot)) { fm.gone = { ...(fm.gone ?? {}), [id]: gone?.name ?? null }; return; }
        const other = fm.players[1 - i];
        const m = this.#members(fm.team).filter((p) => p.id !== id);
        fm.players[i] = (m.find((p) => p.id !== other) ?? m[0])?.id ?? null;
      });
    }
    this.#changed();
  }

  /** Whose phone may type a guess right now: the face-off player whose turn it is, or anyone on the team playing or stealing. */
  canGuess(player) {
    const run = this.run;
    if (!this.typed() || run.status !== 'round' || !player) return false;
    if (run.step === 'faceoff') {
      const f = run.faceoff;
      return !!f.turn && this.#faceoffPlayer(f.turn)?.id === player.id;
    }
    if (run.step === 'play' || run.step === 'steal') return player.teamId === run.control;
    return false;
  }
  /** A typed guess (no host): matched against the survey, then scored as if the host had tapped it. */
  guess(player, text) {
    if (!this.typed()) fail('Say your answer out loud to the host');
    if (!this.canGuess(player)) fail('It is not your turn to answer');
    const typed = cleanName(text, 40);
    if (!typed) fail('Type an answer first');
    const answers = this.#answers();
    const index = matchAnswer(answers, typed);
    if (index !== -1 && this.run.revealed.includes(index)) return { ok: false, reason: 'already-up', label: answers[index].text };
    const unitId = this.run.step === 'faceoff' ? this.run.faceoff.turn : this.run.control;
    if (index === -1) this.miss(); else this.answer(index);
    this.run.said = { unitId, name: player.name, text: typed, index };
    this.#changed();
    return { ok: true, hit: index !== -1, label: index === -1 ? null : answers[index].text };
  }

  // ---------- setup ----------
  setSettings({ targetScore, multipliers, fastMoney, suddenDeath, fastMoneyGoal, fastMoneySeconds1, fastMoneySeconds2, typed, answerSeconds }) {
    const inRange = (v, lo, hi, what) => {
      const n = int(v);
      if (!(n >= lo && n <= hi)) fail(`${what} must be ${lo} to ${hi}`);
      return n;
    };
    if (targetScore !== undefined) this.settings.targetScore = inRange(targetScore, 50, 5000, 'Winning score');
    if (typeof multipliers === 'boolean') this.settings.multipliers = multipliers;
    if (typeof fastMoney === 'boolean') this.settings.fastMoney = fastMoney;
    if (typeof suddenDeath === 'boolean') this.settings.suddenDeath = suddenDeath;
    if (typeof typed === 'boolean') {
      this.settings.typed = typed;
      const f = this.run.status === 'round' && this.run.step === 'faceoff' ? this.run.faceoff : null;
      if (typed && f && !f.open && !f.turn && !f.winner && !f.attempts.length) this.#openFaceoff(f);
    }
    if (answerSeconds !== undefined) this.settings.answerSeconds = inRange(answerSeconds, 3, 120, 'Answer timer');
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
  #question() { return this.run.sudden?.question ?? this.set.rounds[this.run.round]; }
  #answers() { return ranked(this.#question()); }
  multiplier(i = this.run.round) {
    if (this.run.sudden) return this.run.sudden.mult;   // sudden death is worth five or ten times, whatever the settings
    if (!this.settings.multipliers) return 1;
    return i < 3 ? 1 : i === 3 ? 2 : 3;
  }
  pot() {
    // Sudden death: once it is decided, the pot is the winning answer.
    if (this.run.sudden?.pts != null) return this.run.sudden.pts;
    const answers = this.#answers();
    return this.run.revealed.reduce((sum, i) => sum + (answers[i]?.points ?? 0), 0);
  }
  #beginRound(i) {
    const run = this.run;
    run.status = 'round'; run.round = i; run.step = 'faceoff'; run.sudden = null;
    run.revealed = []; run.strikes = 0; run.control = null; run.stealFrom = null; run.showAll = false; run.shownLate = [];
    run.winner = null; run.awarded = 0; run.said = null; run.autoAt = null; run.stealMissed = false; run.answerTimer = null;
    run.faceoff = this.#blankFaceoff();
    if (this.typed()) this.#openFaceoff(run.faceoff);   // nobody is hosting: the face-off buzzers open at once
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
    this.#openFaceoff(f);
    this.#changed();
  }
  /** A press from a phone or a physical buzzer. Only the two face-off players count. */
  buzz(playerId) {
    const run = this.run;
    const f = run.faceoff;
    if (run.status !== 'round' || run.step !== 'faceoff') return { ok: false, reason: 'closed' };
    const unitId = Object.keys(f.reps).find((u) => f.reps[u] === playerId);
    const now = this.room.now();
    if (!f.open) {
      // The other face-off player pressed a moment after the first: the turn is already given, but their time is listed too.
      const first = f.buzzes?.[0];
      if (unitId && f.turn && first && f.openedAt != null && !f.buzzes.some((b) => b.unitId === unitId) && now - f.openedAt - first.ms <= 3000) {
        f.buzzes.push({ unitId, pid: playerId, ms: Math.max(0, Math.round(now - f.openedAt)), won: false });
        this.#changed();
      }
      return { ok: false, reason: 'closed' };
    }
    if (!unitId) return { ok: false, reason: 'not-your-turn' };
    // How fast they were, to the millisecond, from when the buzzers opened.
    f.buzzes = [...(f.buzzes ?? []), { unitId, pid: playerId, ms: Math.max(0, Math.round(now - (f.openedAt ?? now))), won: true }];
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
    this.run.autoAt = null;
    const f = this.#inRound('faceoff').faceoff;
    this.#openFaceoff(f); f.winner = null;
    this.#changed();
  }
  faceoffWin(id) {
    const run = this.#inRound('faceoff');
    this.#unit(id);
    if (run.sudden && !run.faceoff.attempts.some((a) => a.unitId === id && a.rank !== null)) fail('Sudden death is decided by an answer on the board: tap the one they gave');
    this.#remember();
    run.faceoff.open = false;
    this.#faceoffDecided(id);
    this.#changed();
  }
  /** The host starts the answer clock (10 seconds by default) when it is a player's turn on the team that is playing or stealing.
   *  It only counts down and says "time's up": the host decides what to do about it. */
  startAnswerTimer() {
    const run = this.#inRound('play', 'steal');
    const totalMs = Math.round(this.settings.answerSeconds * 1000);
    run.answerTimer = { kind: 'answer', totalMs, deadline: this.room.now() + totalMs, timedOut: false };
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
    run.turns = 0;
    run.answerTimer = null;
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
    run.turns = (run.turns ?? 0) + 1;                                           // the next player on the team is up
    run.answerTimer = null;
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
      run.stealMissed = true;                                                   // the TV shows the big X for it
      run.answerTimer = null;
      this.#endRound(run.stealFrom);                                            // the steal failed: the pot stays with them
    } else {
      run.strikes += 1;
      run.answerTimer = null;
      run.turns = (run.turns ?? 0) + 1;                                         // the next player on the team is up
      if (run.strikes >= MAX_STRIKES) {
        run.step = 'steal';
        run.stealFrom = run.control;
        run.control = this.#other(run.control).id;
        run.turns = 0;
      }
    }
    this.#changed();
  }
  /** Who answers for a team in the face-off: its face-off player first and, when both of those have missed, the next
   *  players in line behind them (the team's players in order, wrapping round). */
  #faceoffPlayer(unitId, f = this.run.faceoff) {
    const members = this.#members(unitId);
    if (!members.length) return null;
    const rep = Math.max(0, members.findIndex((p) => p.id === f.reps[unitId]));
    const went = f.attempts.filter((a) => a.unitId === unitId).length;
    return members[(rep + went) % members.length];
  }
  #faceoffAnswer(i) {
    const f = this.run.faceoff;
    if (!f.turn) fail('Open the buzzers (or give the turn to a team) first');
    this.#remember();
    this.#reveal(i);
    f.attempts.push({ unitId: f.turn, rank: i, playerId: this.#faceoffPlayer(f.turn)?.id ?? null });
    this.#judgeFaceoff();
    this.#changed();
  }
  #faceoffMiss() {
    const f = this.run.faceoff;
    if (!f.turn) fail('Open the buzzers (or give the turn to a team) first');
    this.#remember();
    f.attempts.push({ unitId: f.turn, rank: null, playerId: this.#faceoffPlayer(f.turn)?.id ?? null });
    this.#judgeFaceoff();
    this.#changed();
  }
  /** The face-off rules: the top answer wins at once; otherwise the other player gets a go, and the better answer wins.
   *  If both miss, the next players in line answer, the team that buzzed first leading off, then the other team, and so on
   *  down both lines: the first answer on the board wins it. */
  #judgeFaceoff() {
    const run = this.run;
    const f = run.faceoff;
    const n = f.attempts.length;
    const last = f.attempts[n - 1];
    if (n === 1) {
      if (last.rank === 0) this.#faceoffDecided(last.unitId); else f.turn = this.#other(last.unitId).id;
      return;
    }
    if (n === 2) {
      const [first, second] = f.attempts;
      if (first.rank === null && second.rank === null) return this.#faceoffFollowup();
      if (first.rank === null) return this.#faceoffDecided(second.unitId);
      if (second.rank === null) return this.#faceoffDecided(first.unitId);
      return this.#faceoffDecided(second.rank < first.rank ? second.unitId : first.unitId);
    }
    if (last.rank !== null) return this.#faceoffDecided(last.unitId);
    this.#faceoffFollowup();
  }
  /** Both face-off players missed: on to the next player in line, alternating teams, the first buzz leading off. */
  #faceoffFollowup() {
    const run = this.run;
    const f = run.faceoff;
    const first = f.attempts[0].unitId;
    const second = this.#other(first).id;
    const order = f.attempts.length % 2 === 0 ? [first, second] : [second, first];
    for (const unitId of order) {
      if (f.attempts.filter((a) => a.unitId === unitId).length < this.#members(unitId).length) { f.turn = unitId; f.followup = true; return; }
    }
    // Everybody has had a go and nobody had an answer: the face-off starts again (with nobody hosting, by itself).
    f.turn = null; f.open = false; f.followup = false;
    if (this.typed()) run.autoAt = this.room.now() + AUTO.faceoffReplay;
  }
  /** The face-off has a winner. In a normal round they choose to play or pass; in sudden death it is all over. */
  #faceoffDecided(unitId) {
    const run = this.run;
    const f = run.faceoff;
    f.winner = unitId; f.turn = null; f.followup = false;
    // The player who won it is the one the team's turns count on from.
    const win = f.attempts.filter((a) => a.unitId === unitId && a.rank !== null).sort((x, y) => x.rank - y.rank)[0];
    if (win?.playerId) f.reps[unitId] = win.playerId;
    if (run.sudden) {
      if (!win) fail('Tap the answer they gave first');
      run.sudden.pts = this.#answers()[win.rank].points;
      this.#endRound(unitId);
      return;
    }
    run.step = 'choose';
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
  /** After the round, turn over one answer that was not guessed (as on the show), without scoring it. With no index, the best one left. */
  showAnswer(i) {
    const run = this.#inRound('roundEnd');
    const total = this.#answers().length;
    const hidden = (n) => !run.revealed.includes(n) && !(run.shownLate ?? []).includes(n) && !run.showAll;
    const index = i === undefined ? Array.from({ length: total }, (_, n) => n).find(hidden) : i;
    if (index === undefined) fail('Every answer is already up');
    if (!(index >= 0 && index < total)) fail('There is no such answer');
    if (!hidden(index)) fail('That answer is already up');
    (run.shownLate ??= []).push(index);
    this.#changed();
  }
  nextRound() {
    const run = this.#inRound('roundEnd');
    const top = Math.max(...this.#teams().map((t) => t.score));
    const last = run.round >= this.set.rounds.length - 1;
    if (top >= this.settings.targetScore) return this.finishRounds();
    if (run.sudden || last) {
      // The questions have run out and nobody has reached the winning score: sudden death, if it is on, until somebody does.
      if (this.settings.suddenDeath === false) return this.finishRounds();
      return this.#beginSuddenDeath(top);
    }
    this.history = [];
    this.#beginRound(run.round + 1);
    this.#changed();
  }
  /** One face-off question, worth five times its answer (ten when the gap to the winning score is too big for five). */
  #beginSuddenDeath(top) {
    const run = this.run;
    const used = run.suddenUsed ?? [];
    const question = this.#suddenQuestion(used);
    used.push(question.question);
    const best = Math.max(...question.answers.map((a) => int(a.points)));
    const need = this.settings.targetScore - top;
    const mult = need <= best * 5 ? 5 : 10;
    const n = (run.sudden?.n ?? 0) + 1;
    this.history = [];
    this.#beginRound(run.round + 1);
    run.suddenUsed = used;
    run.sudden = { n, mult, question, pts: null };
    this.#changed();
  }
  /** A question nobody has seen this game: from the other question sets, else this set's Fast Money questions or its rounds. */
  #suddenQuestion(used) {
    const asked = new Set([...this.set.rounds.map((q) => q.question), ...used]);
    let pool = [];
    for (const meta of this.room.listContent(GAME)) {
      if (meta.id === this.setId) continue;
      try { pool.push(...(this.room.loadContent(GAME, meta.id)?.rounds ?? [])); } catch { /* an unreadable set is skipped */ }
    }
    pool = pool.filter((q) => !asked.has(q.question));
    if (!pool.length) pool = (this.set.fastMoney ?? []).filter((q) => !used.includes(q.question));
    if (!pool.length) pool = [...this.set.rounds, ...(this.set.fastMoney ?? [])];
    const q = pool[Math.floor((this.room.rng ?? Math.random)() * pool.length)];
    return { question: q.question, answers: q.answers.map((a) => ({ text: a.text, points: a.points, aliases: a.aliases ?? [] })) };
  }
  /** The regular rounds are over (a team reached the target, the questions ran out, or the host ended them). */
  finishRounds(bank = false) {
    const run = this.run;
    if (run.status !== 'round') fail('No round is being played');
    // Ending in the middle of a round: the points on the board have not been won by anyone. They are lost, unless the host
    // gives them to the team that has the board (bank).
    if (bank && run.step !== 'roundEnd' && run.control && this.pot() > 0) {
      this.#unit(run.control).score += this.pot() * this.multiplier();
    }
    this.history = [];
    // Whoever leads now has won the game. Fast Money is then a bonus round for them: it cannot change the result,
    // it is played for the jackpot. Only a tie leaves the winner open, and then Fast Money decides it: the team that
    // plays wins by reaching the goal, and the other team wins if they fall short.
    const leader = this.#leader();
    run.champion = leader?.id ?? null;
    if (this.settings.fastMoney && this.set.fastMoney?.length === FAST_MONEY_QUESTIONS) {
      run.status = 'fastmoney';
      run.fm = { team: leader?.id ?? null, step: leader ? 'pick' : 'team', stakes: leader ? 'bonus' : 'tiebreak', players: [], part: null, hidden: { p1: false }, rejected: [], dupBuzz: 0, answers: { p1: null, p2: null }, points: { p1: Array(FAST_MONEY_QUESTIONS).fill(null), p2: Array(FAST_MONEY_QUESTIONS).fill(null) }, labels: { p1: Array(FAST_MONEY_QUESTIONS).fill(null), p2: Array(FAST_MONEY_QUESTIONS).fill(null) },
        // How much of each answer the TV has shown: 0 nothing, 1 what was said, 2 the points too ("survey says").
        shown: { p1: Array(FAST_MONEY_QUESTIONS).fill(0), p2: Array(FAST_MONEY_QUESTIONS).fill(0) }, timer: null };
      if (leader) this.#defaultFmPlayers();
    } else {
      run.status = 'done';
    }
    this.#changed();
  }

  #leader() {
    const [a, b] = this.#teams();
    return !a || !b || a.score === b.score ? null : (a.score > b.score ? a : b);
  }
  /** What Fast Money is played for: 'bonus' (the team already won the game) or 'tiebreak' (it decides the winner). */
  #stakes(fm = this.run.fm) {
    if (fm?.stakes) return fm.stakes;
    const leader = this.run.champion === undefined ? this.#leader()?.id : this.run.champion;
    return leader ? 'bonus' : 'tiebreak';
  }
  /** The team that won the game, or null for a tie (or before the rounds are over). */
  champion() {
    const run = this.run;
    if (!['fastmoney', 'done'].includes(run.status)) return null;
    // A game saved before champions were kept: the leader when the rounds ended is the best guess.
    const leader = run.champion === undefined ? this.#leader()?.id ?? null : run.champion;
    if (leader) return leader;
    const fm = run.fm;
    if (fm?.team && fm.step === 'results' && this.#stakes(fm) === 'tiebreak') {
      return this.fmTotals().total >= this.settings.fastMoneyGoal ? fm.team : this.#other(fm.team)?.id ?? null;
    }
    return null;
  }

  // ---------- Fast Money ----------
  #fm() { if (this.run.status !== 'fastmoney') fail('Fast Money is not being played'); return this.run.fm; }
  /** Fast Money's answers, also after the game is over (the host can still put a mistake right). */
  #fmOrDone() {
    if (!['fastmoney', 'done'].includes(this.run.status) || !this.run.fm) fail('Fast Money was not played');
    return this.run.fm;
  }
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
  /** The host picks the two players (any time before the answers are revealed; Player 1 cannot be changed once they have gone). */
  fmPlayers(ids) {
    const fm = this.#fm();
    if (!['pick', 'p1', 'p2'].includes(fm.step)) fail('The players can only be changed before the answers are revealed');
    if (!Array.isArray(ids) || ids.length !== 2) fail('Choose two players');
    for (const id of ids) if (this.room.player(id).teamId !== fm.team) fail('Both players must be on the team playing Fast Money');
    if (ids[0] === ids[1] && this.#members(fm.team).length >= 2) fail('Choose two different players');
    if (fm.step === 'p2' && ids[0] !== fm.players[0]) fail('Player 1 has already answered');
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
  /** Moves Fast Money on: Player 1 is done, so their answers are revealed; once they have been (and the host says so) they are
   *  hidden and Player 2 comes in with Player 1's score still up; Player 2 is done, so theirs are revealed. */
  fmNext() {
    this.run.autoAt = null;
    const fm = this.#fm();
    if (fm.step === 'p1') {
      this.#zeroBlanks('p1');
      fm.step = 'reveal'; fm.part = 'p1'; fm.timer = null; fm.rejected = [];
      if (this.typed()) this.run.autoAt = this.room.now() + AUTO.fmReveal;
    } else if (fm.step === 'reveal' && fm.part === 'p1') {
      if (!fm.shown.p1.every((v) => v === 2)) fail('Reveal all of Player 1’s answers first');
      fm.step = 'p2'; fm.hidden.p1 = true; fm.rejected = [];
      this.#startTimer(fm, this.settings.fastMoneySeconds2);
    } else if (fm.step === 'p2') {
      this.#zeroBlanks('p2');
      fm.step = 'reveal'; fm.part = 'p2'; fm.hidden.p1 = false; fm.timer = null; fm.rejected = [];
      if (this.typed()) this.run.autoAt = this.room.now() + AUTO.fmReveal;
    } else fail('Nothing further');
    this.#changed();
  }
  /** An answer nobody gave scores 0 without the host having to say so (the host can still change it). */
  #zeroBlanks(slot) {
    const fm = this.run.fm;
    for (let q = 0; q < FAST_MONEY_QUESTIONS; q++) {
      if (fm.points[slot][q] === null && !(fm.answers[slot]?.[q] ?? '').trim()) { fm.points[slot][q] = 0; fm.labels[slot][q] = 'No answer'; }
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
    const clean = this.#cleanAnswers(answers);
    // Player 2 may not repeat Player 1: an answer that does is not taken (it is blanked, the TV gives the buzzer and the host is
    // told which question), and the rest are kept. At the reveal the host can still put anything in; a repeat then scores 0.
    if (slot === 'p2' && fm.step === 'p2') {
      const dup = this.#repeatsOfPlayer1(clean);
      for (const q of dup) clean[q] = '';
      this.#noteDup(fm, dup);
    }
    fm.answers[slot] = clean;
    this.#changed();
  }
  /** Remembers which of Player 2's answers were turned away, and counts the buzzer so the TV can sound it. */
  #noteDup(fm, list) {
    fm.rejected = [...list];
    if (list.length) fm.dupBuzz = (fm.dupBuzz ?? 0) + 1;
  }
  /** Which of Player 2's answers repeat Player 1's (the same words, or the same survey answer): the questions' numbers, from 0. */
  #repeatsOfPlayer1(answersP2) {
    const fm = this.run.fm;
    const out = [];
    for (let q = 0; q < FAST_MONEY_QUESTIONS; q++) {
      const typed = answersP2[q] ?? '';
      const other = fm.answers.p1?.[q] ?? '';
      if (!typed.trim() || !other.trim()) continue;
      const ranked_ = ranked(this.#fmQuestion(q));
      const i = matchAnswer(ranked_, typed);
      const j = matchAnswer(ranked_, other);
      if ((i !== -1 && i === j) || (normalize(typed) !== '' && normalize(typed) === normalize(other))) out.push(q);
    }
    return out;
  }
  fmAnswersFrom(playerId, answers) {
    const fm = this.run.status === 'fastmoney' ? this.run.fm : null;
    if (!fm || !['p1', 'p2'].includes(fm.step)) fail('Fast Money is not taking answers right now');
    if (fm.players[SLOTS.indexOf(fm.step)] !== playerId) fail('It is not your turn');
    const clean = this.#cleanAnswers(answers);
    // The second player may not say what the first player said: such an answer is not taken, and the phone is told which.
    let rejected = [];
    if (fm.step === 'p2') {
      rejected = this.#repeatsOfPlayer1(clean);
      for (const q of rejected) clean[q] = '';
      this.#noteDup(fm, rejected);
    }
    fm.answers[fm.step] = clean;
    this.#changed();
    return rejected;
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
  #fmReveal(slot) {
    const fm = this.#fm();
    if (!['reveal', 'results'].includes(fm.step)) fail('Reveal the answers once a player is done');
    // While Player 1's answers are being revealed, Player 2 has not played yet (and the other way round: never before the end).
    if (fm.step === 'reveal' && slot && fm.part !== 'all' && fm.part !== slot) fail(`${slot === 'p2' ? 'Player 2 has not played yet' : 'Player 1’s answers are hidden now'}`);
    return fm;
  }
  /** First tap: the TV types out what the player said. An answer nobody gave goes straight to its 0. */
  fmShowAnswer(slot, q) {
    this.#fmSlot(slot);
    const fm = this.#fmReveal(slot);
    this.#fmQuestion(q);
    if (fm.shown[slot][q] >= 1) fail('That answer is already up');
    if (this.#isBlank(fm, slot, q)) { fm.points[slot][q] = 0; fm.labels[slot][q] = 'No answer'; fm.shown[slot][q] = 2; } else fm.shown[slot][q] = 1;
    this.#afterReveal(fm);
    this.#changed();
  }
  /** Second tap ("survey says"): the TV shows the points. The host can give the points and the matching answer, or leave them to the suggestion. Can be used again to correct a score. */
  fmShowPoints(slot, q, points, label) {
    this.#fmSlot(slot);
    const fm = this.#fmReveal(slot);
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
    // After Player 1 the host moves on (fmNext) to hide the answers and bring in Player 2; after Player 2 it is the result.
    if (fm.step === 'reveal' && fm.part !== 'p1' && SLOTS.every((s) => fm.shown[s].every((v) => v === 2))) fm.step = 'results';
    this.#goalReached(fm);
  }
  /** The goal is reached the moment the points are up (even with answers still hidden): the team wins right there. The TV
   *  shows the jackpot for a moment and then the winners of the Feud; the host still has every answer on their screen. */
  #goalReached(fm) {
    if (this.run.status !== 'fastmoney' || fm.reached || !['reveal', 'results'].includes(fm.step)) return;
    if (this.fmTotals().total < this.settings.fastMoneyGoal) return;
    fm.reached = true;
    fm.step = 'results';
    this.run.autoAt = null;
    this.run.fmWinAt = this.room.now() + AUTO.fmWin;
  }
  /** Whether every answer of the part being revealed is up with its points. */
  #partRevealed(fm) {
    const slots = fm.part === 'all' ? SLOTS : [fm.part];
    return slots.every((s) => fm.shown[s].every((v) => v === 2));
  }
  /** The host puts a mistake right, at any point (also after the result and after the game is over): what the player said
   *  (`text`) and, for an answer whose points are up, its points (`points` 0 to 100) and the survey answer it matched (`label`). */
  fmEdit(slot, q, { text, points, label } = {}) {
    const fm = this.#fmOrDone();
    this.#fmSlot(slot);
    this.#fmQuestion(q);
    if (['team', 'pick'].includes(fm.step)) fail('Answers can be changed once Fast Money has started');
    if (text !== undefined) {
      const clean = cleanName(text, 40);
      const list = fm.answers[slot] ?? Array(FAST_MONEY_QUESTIONS).fill('');
      if (slot === 'p2' && fm.step === 'p2' && clean) {
        const probe = list.slice(); probe[q] = clean;
        if (this.#repeatsOfPlayer1(probe).includes(q)) { this.#noteDup(fm, [q]); this.#changed(); fail('Player 1 already said that. Ask for a different answer.'); }
      }
      list[q] = clean;
      fm.answers[slot] = list;
    }
    if (points !== undefined && points !== null && points !== '') {
      if (fm.shown[slot][q] < 2) fail('Show the points first');
      const pts = int(points);
      if (!(pts >= 0 && pts <= 100)) fail('Points must be 0 to 100');
      fm.points[slot][q] = pts;
      fm.labels[slot][q] = cleanName(label, 40) || null;
    }
    this.#goalReached(fm);
    this.#changed();
  }
  /** The next step of the reveal, in the show's order (player 1's five answers, then player 2's): what was said, then the points the survey gives. */
  fmRevealNext() {
    const fm = this.#fmReveal();
    for (const s of fm.step === 'results' || fm.part === 'all' ? SLOTS : [fm.part]) {
      for (let q = 0; q < FAST_MONEY_QUESTIONS; q++) {
        if (fm.shown[s][q] === 0) return this.fmShowAnswer(s, q);
        if (fm.shown[s][q] === 1) return this.fmShowPoints(s, q);
      }
    }
    fail('Everything is revealed');
  }
  fmTotals() {
    const fm = this.run.fm;
    const sum = (s) => fm.points[s].reduce((t, v, q) => t + (fm.shown[s][q] === 2 ? v ?? 0 : 0), 0);
    return { p1: sum('p1'), p2: sum('p2'), total: sum('p1') + sum('p2') };
  }
  finishGame() {
    if (!['round', 'fastmoney'].includes(this.run.status)) fail('The game is not running');
    this.run.status = 'done';
    this.run.fmWinAt = null;
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
    const run = this.run;
    const now = this.room.now();
    const fm = run.status === 'fastmoney' ? run.fm : null;
    if (run.answerTimer && !run.answerTimer.timedOut && now >= run.answerTimer.deadline) { run.answerTimer.timedOut = true; this.#changed(); }
    if (fm?.timer && !fm.timer.timedOut && now >= fm.timer.deadline) {
      fm.timer.timedOut = true;
      if (this.typed()) run.autoAt = now + AUTO.fmGrace;   // a moment for the phone's last answers to arrive
      this.#changed();
    }
    // The goal was reached: after a moment for the jackpot, the TV goes to the winners of the Feud.
    if (run.fmWinAt != null && now >= run.fmWinAt) {
      run.fmWinAt = null;
      if (run.status === 'fastmoney') this.finishGame();
    }
    if (!this.typed() || run.autoAt === null || now < run.autoAt) return;
    run.autoAt = null;
    try {
      if (run.status === 'round' && run.step === 'faceoff' && !run.faceoff.open && !run.faceoff.turn && !run.faceoff.winner) this.replayFaceoff();
      else if (fm && (fm.step === 'p1' || fm.step === 'p2') && fm.timer?.timedOut) this.fmNext();
      else if (fm && fm.step === 'reveal') {
        // Reveal one answer at a time; once Player 1's are all up, a moment to read the score, then Player 2 comes in.
        if (this.#partRevealed(fm)) { if (fm.part === 'p1') this.fmNext(); } else this.fmRevealNext();
        if (fm.step === 'reveal') run.autoAt = now + (this.#partRevealed(fm) ? AUTO.fmHold : AUTO.fmReveal);
      }
    } catch { /* the host moved things on first */ }
  }

  /** Whose turn it is to answer on the team that is playing or stealing: the players take turns, starting with whoever
   *  comes after the team's face-off player. The host sees it, so nobody has to guess. */
  #up() {
    const run = this.run;
    if (!['play', 'steal'].includes(run.step) || !run.control) return null;
    const members = this.room.players.filter((p) => p.teamId === run.control);
    if (!members.length) return null;
    const start = Math.max(-1, members.findIndex((p) => p.id === run.faceoff?.reps?.[run.control])) + 1;
    const p = members[(start + (run.turns ?? 0)) % members.length];
    return { unitId: run.control, playerId: p.id, name: p.name };
  }

  // ---------- views ----------
  #playerName(id) { return this.room.players.find((p) => p.id === id)?.name ?? this.run.fm?.gone?.[id] ?? null; }

  publicView() { return this.#view(false); }
  /** A phone also learns what it may do now. */
  playerView(player) {
    const v = this.#view(false);
    const run = this.run;
    v.me = {
      captain: this.captain() === player.id,
      canGuess: this.canGuess(player),
      canChoose: run.status === 'round' && run.step === 'choose' && player.teamId === run.faceoff.winner,
    };
    // A Fast Money player's own saved answers, so a phone that reloads does not start from a blank form.
    if (v.fm && run.fm && run.status === 'fastmoney' && ['p1', 'p2'].includes(run.fm.step) && run.fm.players[SLOTS.indexOf(run.fm.step)] === player.id) {
      v.fm.mine = (run.fm.answers[run.fm.step] ?? []).slice();
    }
    return v;
  }
  hostView() {
    const v = this.#view(true);
    v.setId = this.setId;
    if (this.run.status === 'round') v.canUndo = this.history.length > 0;
    // After the game is over the host still has every Fast Money question, answer and #1 answer (to read out what was left, or put a mistake right).
    if (this.run.status === 'done' && this.run.fm && !['team', 'pick'].includes(this.run.fm.step)) v.fm = this.#fmView(true);
    return v;
  }
  #view(host) {
    const run = this.run;
    const set = this.set;
    const view = {
      game: GAME, scoreFormat: 'points', lobbyTitle: set?.title ?? 'Family Feud', settings: this.settings, status: run.status,
      title: set?.title ?? null, rounds: set?.rounds.length ?? 0, hasFastMoney: !!set?.fastMoney?.length,
      round: null, fm: null, captainId: this.captain(), hosted: this.hosted(),
      champion: this.champion(),   // the team that won the game, once the rounds are over (null for a tie)
    };
    if (run.status === 'lobby') view.sets = this.room.listContent(GAME).map((x) => ({ id: x.id, title: x.title })).slice(0, 40);
    if (run.status === 'lobby') view.setId = this.setId;
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
      // Sudden death: one face-off, worth the winning answer times five or ten.
      sudden: run.sudden ? { n: run.sudden.n, mult: run.sudden.mult } : null,
      strikes: run.strikes, maxStrikes: MAX_STRIKES, pot: this.pot(),
      // Once the round is over the team that won the points is the one lit up (after a failed steal that is not the stealer).
      control: run.step === 'roundEnd' ? run.winner : run.control, stealFrom: run.stealFrom,
      answers: answers.map((a, i) => {
        const up = run.revealed.includes(i);
        const shown = up || run.showAll || (run.shownLate ?? []).includes(i);
        return { n: i + 1, revealed: up, late: shown && !up, text: shown || host ? a.text : null, points: shown || host ? a.points : null };
      }),
      // The player whose turn it is on the team playing or stealing (the host and the phones show it).
      up: this.#up(),
      // The answer clock the host started for the team that is playing or stealing.
      timer: this.#timerView({ timer: run.answerTimer }),
      faceoff: {
        open: f.open, turn: f.turn, winner: f.winner, attempts: f.attempts, followup: !!f.followup,
        // Everyone who buzzed in the face-off, fastest first, with how long after the buzzers opened (ms).
        buzzes: (f.buzzes ?? []).slice().sort((a, b) => a.ms - b.ms).map((b) => ({ unitId: b.unitId, pid: b.pid, name: this.#playerName(b.pid), ms: b.ms, won: !!b.won })),
        // Whoever answers next for each team: its face-off player, then (when both have missed) the players in line behind them.
        reps: Object.keys(f.reps).map((unitId) => { const p = f.winner ? { id: f.reps[unitId] } : this.#faceoffPlayer(unitId) ?? { id: f.reps[unitId] }; return { unitId, playerId: p.id, name: this.#playerName(p.id) }; }),
      },
      // The steal was tried and failed: the TV puts the big X up (the pot stays with the team that was stolen from).
      stealMissed: run.step === 'roundEnd' && !!run.stealMissed,
      result: run.step === 'roundEnd' ? { winner: run.winner, awarded: run.awarded } : null,
      target: this.settings.targetScore,
      said: run.said,
    };
  }
  #fmView(host) {
    const fm = this.run.fm;
    const rows = Array.from({ length: FAST_MONEY_QUESTIONS }, (_, q) => {
      const row = { q, question: fm.step === 'pick' || fm.step === 'team' ? null : this.set.fastMoney[q].question };
      for (const s of SLOTS) {
        const shown = fm.shown[s][q];
        const judged = shown === 2;
        // Player 1's answers are hidden while Player 2 plays (the score stays up): only the host still sees them.
        const covered = !host && !!fm.hidden?.[s];
        row[s] = {
          shown, judged, hidden: covered, points: judged && !covered ? fm.points[s][q] : null, label: judged && !covered ? fm.labels[s][q] : null,
          // What was said stays private until the host shows it (the host sees it all along).
          typed: !covered && (shown >= 1 || host) ? fm.answers[s]?.[q] ?? '' : null,
          ...(host && fm.answers[s] ? { suggest: this.fmSuggest(s, q), blank: this.#isBlank(fm, s, q) } : {}),
          ...(host ? { choices: ranked(this.set.fastMoney[q]).map((a) => ({ text: a.text, points: a.points })) } : {}),
        };
      }
      return row;
    });
    const totals = this.fmTotals();
    const finished = fm.step === 'results';
    return {
      team: fm.team, step: fm.step, stakes: this.#stakes(fm), timer: this.#timerView(fm), goal: this.settings.fastMoneyGoal,
      // Which player's answers are being revealed ('p1', 'p2', or 'all' in a game saved before the two-part reveal), and whether
      // all of them are up. Player 2's answers that were turned away as repeats (the TV sounds a buzzer each time: dupBuzz counts them).
      reached: !!fm.reached, part: fm.part ?? null, partDone: fm.step === 'reveal' ? this.#partRevealed(fm) : false, hidden: !!fm.hidden?.p1, rejected: [...(fm.rejected ?? [])], dupBuzz: fm.dupBuzz ?? 0,
      players: SLOTS.map((s, i) => ({ slot: s, id: fm.players[i] ?? null, name: this.#playerName(fm.players[i]) })),
      submitted: { p1: !!fm.answers.p1, p2: !!fm.answers.p2 },
      rows, totals, won: finished ? totals.total >= this.settings.fastMoneyGoal : null,
    };
  }
  #doneView() {
    const run = this.run;
    const out = { champion: this.champion(), fastMoney: null };
    if (run.fm) { const t = this.fmTotals(); out.fastMoney = { team: run.fm.team, total: t.total, goal: this.settings.fastMoneyGoal, won: t.total >= this.settings.fastMoneyGoal, played: run.fm.step === 'results', stakes: this.#stakes(run.fm) }; }
    return out;
  }
}

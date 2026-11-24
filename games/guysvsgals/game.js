// Guys vs Gals: the battle-of-the-sexes party trivia game. The Guys answer questions about the things gals are supposed to
// know, the Gals answer questions about guy stuff, and both race their token up a track to the finish.
//
// How it plays (see docs/PLAYING.md):
//  - Two teams, always: the Guys and the Gals. Everyone picks their side on their phone in the lobby.
//  - A coin toss decides who goes first; then the teams take turns.
//  - On a turn the team gets a multiple-choice question about the OTHER side's stuff. Everyone on the team votes on
//    their phone; once they have all voted (or the clock runs out) the team's most popular pick is locked in.
//    Right: the token moves forward two spaces. Wrong: it stays put. The other team sees the answer on their phones,
//    and has to keep a straight face.
//  - Lightning spaces: the first time a team reaches or passes one, it plays a Lightning Round straight away: a burst of
//    true-or-false statements against the clock, answered by whoever on the team is quickest. Each right one is a
//    space forward.
//  - The first team to the finish wins. Equal turns: when the team that went first gets there, the other team has
//    one last turn to get there too, and then it is a tie.
//
// No sockets, files or real timers: everything runs from tick() and room.now().
import { GameError, fail, int } from '../../lib.js';

const GAME = 'guysvsgals';
export const NAME = 'Guys vs Gals';
export const ALL_SETS = 'all';
export const DEFAULT_SET = 'family';

/** The two sides. `key` is the room's team that plays the side; `asks` is the half of a question set it answers. */
export const SIDES = {
  guys: { key: 'blue', name: 'Guys', color: '#3b8bff', asks: 'galStuff', other: 'gals' },
  gals: { key: 'red', name: 'Gals', color: '#ff4fa3', asks: 'guyStuff', other: 'guys' },
};
export const SIDE_ORDER = ['guys', 'gals'];

export const LENGTHS = { 15: 'Quick', 20: 'Standard', 30: 'Long' };
export const DEFAULT_LENGTH = 20;
export const STEP = 2;                 // spaces for a right answer
export const LIGHTNING_EVERY = 5;      // a lightning space every this many spaces
export const LIGHTNING_ITEMS = 5;      // statements in a Lightning Round
export const ANSWER_TIMES = [20, 30, 45, 0];   // seconds to answer (0: no clock)

export const T = {
  toss: 4200,          // the coin toss, before the first question
  lockPause: 1400,     // the answer is locked in: a moment of suspense before the reveal
  reveal: 4800,        // the right answer, before the next turn
  lightningIntro: 3800,
  lightning: 20000,    // the whole Lightning Round
  lightningFlash: 900, // right or wrong on one statement, before the next
  lightningDone: 4200,
  lightningPerItem: 6000, // with no clock at all, each statement still gives up after this long
};

const MAX_SEEN = 4000;
const REACTIONS = ['😂', '🔥', '😱', '👏', '🙄', '💪'];
const REACTION_MS = 4500;

/** Checks a question set: a title, and for each side multiple-choice questions (and, if any, lightning statements). */
export function validateSet(set) {
  if (!set || typeof set !== 'object') fail('A question set must be an object');
  if (!String(set.title ?? '').trim()) fail('Give the question set a title');
  for (const [part, label] of [['guyStuff', 'Guy stuff'], ['galStuff', 'Gal stuff']]) {
    const half = set[part];
    if (!half || typeof half !== 'object') fail(`${label}: add some questions`);
    if (!Array.isArray(half.questions) || !half.questions.length) fail(`${label} needs at least one question`);
    half.questions.forEach((q, n) => {
      if (!q || !String(q.q ?? '').trim()) fail(`${label}, question ${n + 1}: write the question`);
      if (!String(q.a ?? '').trim()) fail(`${label}, question ${n + 1}: write the right answer`);
      const wrong = Array.isArray(q.wrong) ? q.wrong.filter((w) => String(w ?? '').trim()) : [];
      if (!wrong.length) fail(`${label}, question ${n + 1}: give at least one wrong answer`);
      if (wrong.length > 3) fail(`${label}, question ${n + 1}: at most three wrong answers`);
    });
    if (half.lightning !== undefined) {
      if (!Array.isArray(half.lightning)) fail(`${label}: lightning statements must be a list`);
      half.lightning.forEach((s, n) => {
        if (!s || !String(s.q ?? '').trim()) fail(`${label}, lightning ${n + 1}: write the statement`);
        if (typeof s.a !== 'boolean') fail(`${label}, lightning ${n + 1}: say whether it is true or false`);
      });
    }
  }
  return true;
}

const keyOf = (text) => String(text).trim().toLowerCase().slice(0, 120);

export class GuysVsGalsGame {
  constructor(room) {
    this.room = room;
    this.settings = { setId: DEFAULT_SET, length: DEFAULT_LENGTH, answerSecs: 30, lightning: true };
    this.picked = {};   // player id -> true once they chose their side (kept across games)
    this.reactions = [];
    this.reactionN = 0;
    this.lastReact = {};
    this.#reset();
  }

  #reset() {
    this.phase = 'lobby';   // lobby | toss | question | reveal | lightning-intro | lightning | lightning-done | gameover
    this.order = [];        // the two sides, in turn order (the toss decides)
    this.turn = null;       // the side at play
    this.pos = { guys: 0, gals: 0 };
    this.used = { guys: [], gals: [] };   // lightning spaces each side has had (or passed during a Lightning Round)
    this.turns = { guys: 0, gals: 0 };    // finished turns
    this.question = null;   // { cat, about, q, choices, answer }
    this.votes = {};        // player id -> choice index
    this.voteOrder = [];    // player ids in the order they last voted
    this.locked = false;
    this.pick = null;       // the team's locked choice (null: no answer)
    this.result = null;     // { correct, moved, timeout }
    this.lightning = null;  // { side, items: [{q, a, said, correct}], i, rights, endsAt, flash }
    this.lastMove = null;   // { side, from, to, n }
    this.lastChance = false;
    this.winners = [];
    this.timer = null;      // { at, fire, kind, totalMs }
    this.deck = null;       // runtime only
    this.questionN = 0;
    this.log = [];
  }
  #changed() { this.room.changed(); }
  #now() { return this.room.now(); }
  #setTimer(ms, fire, kind = null) { this.timer = { at: this.#now() + ms, fire, kind, totalMs: ms }; }
  #note(text) { this.log.push(text); if (this.log.length > 6) this.log.shift(); }

  // ---------- the two sides and the room's teams ----------
  #team(side) { return this.room.teams.find((t) => t.key === SIDES[side]?.key) ?? null; }
  #sideOfTeam(teamId) {
    const t = this.room.teams.find((x) => x.id === teamId);
    return SIDE_ORDER.find((s) => SIDES[s].key === t?.key) ?? null;
  }
  #sideOf(player) { return this.#sideOfTeam(player?.teamId); }
  #members(side) { const t = this.#team(side); return t ? this.room.players.filter((p) => p.teamId === t.id) : []; }
  #here(side) { return this.#members(side).filter((p) => this.room.connected.has(p.id)); }
  #name(side) { return this.#team(side)?.name ?? SIDES[side]?.name ?? 'Someone'; }
  /** The room's two teams wear the sides' names and colours while this game is chosen. */
  #dress() {
    for (const side of SIDE_ORDER) {
      const t = this.#team(side);
      if (!t) continue;
      const plain = ['Red', 'Blue'].includes(t.name);
      if (plain) t.name = SIDES[side].name;
      t.color = SIDES[side].color;
    }
  }

  // ---------- the room's side of the contract ----------
  teamsReady() { this.#dress(); }
  /** Another game is being chosen: the teams get their usual names and colours back. */
  leave() {
    for (const side of SIDE_ORDER) {
      const t = this.#team(side);
      if (!t) continue;
      const def = { red: { name: 'Red', color: '#ef4444' }, blue: { name: 'Blue', color: '#3b82f6' } }[t.key];
      if (t.name === SIDES[side].name) t.name = def.name;
      t.color = def.color;
    }
  }
  inProgress() { return this.phase !== 'lobby'; }
  usesContent(id) { return this.settings.setId === id || this.settings.setId === ALL_SETS; }
  tick() {
    const t = this.timer;
    if (t && this.#now() >= t.at) { this.timer = null; t.fire(); return; }
    // Everyone on the team has voted (people who wandered off are not waited for).
    if (this.phase === 'question' && !this.locked) {
      const here = this.#here(this.turn);
      if (here.length && here.every((p) => p.id in this.votes)) this.#lock();
    }
    if (this.reactions.length && this.reactions[0].at + REACTION_MS < this.#now()) {
      this.reactions = this.reactions.filter((r) => r.at + REACTION_MS >= this.#now());
      this.#changed();
    }
  }
  playerRemoved(id) {
    delete this.votes[id];
    this.voteOrder = this.voteOrder.filter((x) => x !== id);
    delete this.picked[id];
  }
  contentChanged(id) {
    if (this.phase === 'lobby' && this.settings.setId === id && !this.room.loadContent(GAME, id)) this.settings.setId = ALL_SETS;
    if (this.phase === 'lobby') this.deck = null;
  }

  // ---------- questions ----------
  #sets() {
    const all = () => this.room.listContent(GAME).map((s) => this.room.loadContent(GAME, s.id)).filter(Boolean);
    if (this.settings.setId === ALL_SETS) return all();
    const one = this.room.loadContent(GAME, this.settings.setId);
    return one ? [one] : all();
  }
  #buildDeck() {
    const deck = { guyStuff: { questions: [], lightning: [] }, galStuff: { questions: [], lightning: [] } };
    const seen = new Set();
    for (const set of this.#sets()) {
      for (const part of ['guyStuff', 'galStuff']) {
        for (const q of set[part]?.questions ?? []) {
          const k = keyOf(q.q);
          if (!String(q.q ?? '').trim() || seen.has(k)) continue;
          seen.add(k);
          const wrong = (q.wrong ?? []).map((w) => String(w).trim()).filter(Boolean).slice(0, 3);
          deck[part].questions.push({ cat: String(q.cat ?? '').trim(), q: String(q.q).trim(), a: String(q.a).trim(), wrong });
        }
        for (const s of set[part]?.lightning ?? []) {
          const k = keyOf(s.q);
          if (!String(s.q ?? '').trim() || seen.has(k) || typeof s.a !== 'boolean') continue;
          seen.add(k);
          deck[part].lightning.push({ q: String(s.q).trim(), a: s.a });
        }
      }
    }
    this.deck = deck;
  }
  /** Some not yet asked on this TV (the oldest asked ones come back once a pile runs out). */
  #draw(pool, n = 1) {
    if (!pool.length) return [];
    const memory = this.room.memory.load(GAME) ?? {};
    const seen = new Set(memory.seen ?? []);
    let fresh = pool.filter((x) => !seen.has(keyOf(x.q)));
    if (fresh.length < n) {
      for (const x of pool) seen.delete(keyOf(x.q));
      fresh = pool.slice();
    }
    const picks = [];
    while (picks.length < n && fresh.length) {
      const i = Math.floor(this.room.rng() * fresh.length);
      picks.push(fresh.splice(i, 1)[0]);
    }
    this.room.memory.save(GAME, { ...memory, seen: [...seen, ...picks.map((x) => keyOf(x.q))].slice(-MAX_SEEN) });
    return picks;
  }
  #shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.room.rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ---------- the track ----------
  length() { return this.settings.length; }
  lightningSpaces() {
    if (!this.settings.lightning) return [];
    const out = [];
    for (let s = LIGHTNING_EVERY; s < this.length(); s += LIGHTNING_EVERY) out.push(s);
    return out;
  }
  #hasLightning(side) { return !!this.deck?.[SIDES[side].asks]?.lightning?.length; }

  // ---------- starting ----------
  /** Heads the Guys go first, tails the Gals (tests replace this). */
  coinToss() { return this.room.rng() < 0.5 ? ['guys', 'gals'] : ['gals', 'guys']; }
  start() {
    if (this.phase !== 'lobby') fail('The game is already under way');
    this.#dress();
    for (const side of SIDE_ORDER) if (!this.#members(side).length) fail(`The ${this.#name(side)} need at least one player`);
    this.#buildDeck();
    if (!this.deck.guyStuff.questions.length || !this.deck.galStuff.questions.length) fail('That question set needs questions for both sides');
    const keep = { ...this.settings };
    const deck = this.deck;
    this.#reset();
    this.settings = keep;
    this.deck = deck;
    this.room.resetScores();
    this.order = this.coinToss();
    this.turn = this.order[0];
    this.phase = 'toss';
    this.#note(`Coin toss: the ${this.#name(this.turn)} go first`);
    this.#setTimer(T.toss, () => this.#ask());
    this.#changed();
  }

  // ---------- a question ----------
  #ask() {
    const [q] = this.#draw(this.deck[SIDES[this.turn].asks].questions);
    const choices = this.#shuffle([q.a, ...q.wrong]);
    this.question = { cat: q.cat, about: SIDES[this.turn].other, q: q.q, choices, answer: choices.indexOf(q.a) };
    this.questionN += 1;
    this.votes = {}; this.voteOrder = []; this.locked = false; this.pick = null; this.result = null;
    this.phase = 'question';
    const secs = this.settings.answerSecs;
    if (secs > 0) this.#setTimer(secs * 1000, () => this.#lock(), 'answer'); else this.timer = null;
    this.#changed();
  }
  /** A player on the team at play votes (and can change their vote until the team's answer is locked). */
  vote(player, choice) {
    if (this.phase !== 'question' || this.locked) fail('No question to answer right now');
    const side = this.#sideOf(player);
    if (side !== this.turn) fail(`It is the ${this.#name(this.turn)}’ question. Keep a straight face!`);
    const c = int(choice);
    if (!(c >= 0 && c < this.question.choices.length)) fail('Pick one of the answers');
    this.votes[player.id] = c;
    this.voteOrder = [...this.voteOrder.filter((x) => x !== player.id), player.id];
    const here = this.#here(side);
    if (here.every((p) => p.id in this.votes)) this.#lock(); else this.#changed();
  }
  /** The team's answer: the most votes; a tie goes to whichever of the tied answers was picked first. */
  teamPick() {
    const counts = new Map();
    for (const c of Object.values(this.votes)) counts.set(c, (counts.get(c) ?? 0) + 1);
    if (!counts.size) return null;
    const best = Math.max(...counts.values());
    const tied = new Set([...counts].filter(([, n]) => n === best).map(([c]) => c));
    for (const id of this.voteOrder) if (tied.has(this.votes[id])) return this.votes[id];
    return [...tied][0];
  }
  #lock() {
    if (this.phase !== 'question' || this.locked) return;
    this.locked = true;
    this.pick = this.teamPick();
    // A moment of suspense, then the answer.
    this.#setTimer(this.pick === null ? 300 : T.lockPause, () => this.#reveal());
    this.#changed();
  }
  #reveal() {
    const side = this.turn;
    const correct = this.pick !== null && this.pick === this.question.answer;
    const from = this.pos[side];
    const to = correct ? Math.min(this.length(), from + STEP) : from;
    this.pos[side] = to;
    this.result = { correct, moved: to - from, timeout: this.pick === null };
    if (to !== from) this.lastMove = { side, from, to, n: (this.lastMove?.n ?? 0) + 1 };
    this.#score();
    this.phase = 'reveal';
    this.#note(correct ? `The ${this.#name(side)} got it right` : this.pick === null ? `The ${this.#name(side)} ran out of time` : `The ${this.#name(side)} got it wrong`);
    this.#setTimer(T.reveal, () => this.#afterMove(side, from, to));
    this.#changed();
  }
  /** After a token has moved: a Lightning Round if it reached one, the finish, or the other team's turn. */
  #afterMove(side, from, to) {
    if (to >= this.length()) { this.#finished(side); return; }
    const hit = this.lightningSpaces().filter((s) => s > from && s <= to && !this.used[side].includes(s));
    if (hit.length && this.#hasLightning(side)) {
      this.used[side].push(...hit);
      this.#startLightning(side, hit.at(-1));
      return;
    }
    this.used[side].push(...hit);
    this.#endTurn(side);
  }
  #endTurn(side) {
    this.turns[side] += 1;
    if (this.lastChance) { this.#end(); return; }
    this.turn = SIDES[side].other;
    this.#ask();
  }
  #finished(side) {
    this.turns[side] += 1;
    if (!this.winners.includes(side)) this.winners.push(side);
    const other = SIDES[side].other;
    // The team that went first got there: the other team has one last turn to catch up.
    if (!this.lastChance && this.turns[other] < this.turns[side]) {
      this.lastChance = true;
      this.turn = other;
      this.#note(`The ${this.#name(side)} reached the finish! One last chance for the ${this.#name(other)}`);
      this.#ask();
      return;
    }
    this.#end();
  }
  #end() {
    this.phase = 'gameover';
    this.timer = null;
    this.lightning = null;
    if (!this.winners.length) {
      // The last chance ran out: whoever is ahead (only the first finisher can be).
      const best = Math.max(this.pos.guys, this.pos.gals);
      this.winners = SIDE_ORDER.filter((s) => this.pos[s] === best);
    }
    this.#changed();
  }
  #score() {
    for (const side of SIDE_ORDER) { const t = this.#team(side); if (t) t.score = this.pos[side]; }
  }

  // ---------- the Lightning Round ----------
  #startLightning(side, at) {
    const items = this.#draw(this.deck[SIDES[side].asks].lightning, LIGHTNING_ITEMS).map((s) => ({ q: s.q, a: s.a, said: null, correct: null }));
    this.lightning = { side, at, items, i: 0, rights: 0, endsAt: null, flash: null, started: false };
    this.turn = side;
    this.question = null; this.result = null; this.pick = null;
    this.phase = 'lightning-intro';
    this.#note(`Lightning Round for the ${this.#name(side)}!`);
    this.#setTimer(T.lightningIntro, () => this.#runLightning());
    this.#changed();
  }
  #runLightning() {
    const L = this.lightning;
    this.phase = 'lightning';
    L.started = true;
    const ms = this.settings.answerSecs > 0 ? T.lightning : T.lightningPerItem * L.items.length;
    L.endsAt = this.#now() + ms;
    L.totalMs = ms;
    this.#setTimer(ms, () => this.#finishLightning(), 'lightning');
    this.#changed();
  }
  /** Anyone on the team at play answers the current statement: true or false. The first answer counts. */
  lightningAnswer(player, said) {
    const L = this.lightning;
    if (this.phase !== 'lightning' || !L) fail('No Lightning Round right now');
    if (this.#sideOf(player) !== L.side) fail(`It is the ${this.#name(L.side)}’ Lightning Round`);
    if (L.flash && this.#now() < L.flash.until) return;   // the last one is still showing
    this.#answerItem(!!said);
  }
  #answerItem(said) {
    const L = this.lightning;
    const item = L.items[L.i];
    if (!item) return;
    item.said = said;
    item.correct = said === item.a;
    if (item.correct) L.rights += 1;
    L.flash = { i: L.i, correct: item.correct, until: this.#now() + T.lightningFlash };
    L.i += 1;
    if (L.i >= L.items.length) {
      this.#finishLightning(T.lightningFlash);
      return;
    }
    this.#changed();
  }
  #finishLightning(delay = 0) {
    const L = this.lightning;
    if (!L || this.phase !== 'lightning') return;
    if (delay) {
      // Let the last answer show before the summary.
      this.timer = { at: this.#now() + delay, fire: () => this.#lightningDone(), kind: null, totalMs: delay };
      L.over = true;
      this.#changed();
      return;
    }
    this.#lightningDone();
  }
  #lightningDone() {
    const L = this.lightning;
    const side = L.side;
    const from = this.pos[side];
    const to = Math.min(this.length(), from + L.rights);
    this.pos[side] = to;
    // Lightning spaces passed during a Lightning Round don't start another one.
    for (const s of this.lightningSpaces()) if (s > from && s <= to && !this.used[side].includes(s)) this.used[side].push(s);
    if (to !== from) this.lastMove = { side, from, to, n: (this.lastMove?.n ?? 0) + 1 };
    this.#score();
    L.over = true;
    this.phase = 'lightning-done';
    this.#note(`Lightning Round: the ${this.#name(side)} got ${L.rights} of ${L.items.length}`);
    this.#setTimer(T.lightningDone, () => {
      this.lightning = null;
      if (to >= this.length()) this.#finished(side); else this.#endTurn(side);
    });
    this.#changed();
  }

  // ---------- the host and the TV ----------
  /** Moves things along: locks the answer in now, skips the wait after a reveal, or ends the Lightning Round. */
  advance() {
    switch (this.phase) {
      case 'toss': this.timer = null; this.#ask(); return;
      case 'question': if (!this.locked) this.#lock(); else { this.timer = null; this.#reveal(); } return;
      case 'reveal': { const t = this.timer; this.timer = null; t?.fire(); return; }
      case 'lightning-intro': this.timer = null; this.#runLightning(); return;
      case 'lightning': if (!this.lightning.over) { this.timer = null; this.#lightningDone(); } return;
      case 'lightning-done': { const t = this.timer; this.timer = null; t?.fire(); return; }
      default: return;
    }
  }
  /** The host throws out a question (a dud, or one nobody could know) and asks the same team another. */
  newQuestion() {
    if (this.phase !== 'question') fail('There is no question to change');
    this.#ask();
  }
  /** The host nudges a team's token (a judgement call, a mistake). */
  nudge(side, delta) {
    if (!SIDES[side]) fail('No such team');
    if (this.phase === 'lobby' || this.phase === 'gameover') fail('Only during a game');
    const d = int(delta);
    if (![-1, 1].includes(d)) fail('Move one space at a time');
    this.pos[side] = Math.max(0, Math.min(this.length() - 1, this.pos[side] + d));
    this.#score();
    this.#changed();
  }
  endGame() {
    const keep = { ...this.settings };
    this.#reset();
    this.settings = keep;
    this.room.resetScores();
    this.#changed();
  }

  // ---------- settings (lobby) ----------
  #lobby() { if (this.phase !== 'lobby') fail('Change this before the game starts'); }
  setSet(id) {
    this.#lobby();
    const want = String(id ?? '');
    if (want !== ALL_SETS && !this.room.loadContent(GAME, want)) fail('No such question set');
    this.settings.setId = want; this.deck = null;
    this.#changed();
  }
  setLength(n) {
    this.#lobby();
    const v = int(n);
    if (!LENGTHS[v]) fail('Pick a quick, standard or long game');
    this.settings.length = v;
    this.#changed();
  }
  setAnswerTime(s) {
    this.#lobby();
    const v = int(s);
    if (!ANSWER_TIMES.includes(v)) fail('Pick 20, 30 or 45 seconds, or no clock');
    this.settings.answerSecs = v;
    this.#changed();
  }
  setLightning(on) { this.#lobby(); this.settings.lightning = !!on; this.#changed(); }
  /** A player picks their side (in the lobby; the host can also move people between teams). */
  setSide(player, side) {
    if (!SIDES[side]) fail('Pick the Guys or the Gals');
    if (this.phase !== 'lobby' && this.#sideOf(player)) fail('Sides are fixed once the game starts');
    const t = this.#team(side) ?? fail('No such team');
    this.room.setPlayerTeam(player.id, t.id);
    this.picked[player.id] = true;
    this.#changed();
  }
  /** Emoji from any phone, floating up on the TV for a few seconds. */
  react(player, e) {
    const i = int(e);
    if (!(i >= 0 && i < REACTIONS.length)) return;
    const now = this.#now();
    if (this.lastReact[player.id] && now - this.lastReact[player.id] < 700) return;
    this.lastReact[player.id] = now;
    this.reactionN += 1;
    this.reactions.push({ id: this.reactionN, e: REACTIONS[i], side: this.#sideOf(player), name: player.name, at: now });
    if (this.reactions.length > 12) this.reactions.shift();
    this.#changed();
  }

  // ---------- who may do what ----------
  act(action, a = {}) {
    switch (action) {
      case 'start': return this.start();
      case 'advance': return this.advance();
      case 'newQuestion': return this.newQuestion();
      case 'nudge': return this.nudge(String(a.side ?? ''), a.delta);
      case 'endGame': case 'playAgain': return this.endGame();
      case 'setSet': return this.setSet(a.id);
      case 'setLength': return this.setLength(a.n);
      case 'setAnswerTime': return this.setAnswerTime(a.secs);
      case 'setLightning': return this.setLightning(a.on);
      case 'setSide': return this.setSide(this.room.player(String(a.pid ?? '')), String(a.side ?? ''));
      case 'kick':
        if (this.phase !== 'lobby') fail('Players can only be removed before the game starts');
        return this.room.removePlayer(String(a.pid ?? a.id ?? ''));
      default: throw new GameError(`Unknown action ${action}`);
    }
  }
  #starter(pid) { return !this.room.hosts && this.room.players[0]?.id === pid; }
  onPlayer(player, msg) {
    switch (msg.t) {
      case 'start': case 'advance': case 'play-again':
        if (!this.#starter(player.id)) fail('Only the host can do that');
        this.act({ start: 'start', advance: 'advance', 'play-again': 'playAgain' }[msg.t]);
        return undefined;
      case 'side': this.setSide(player, String(msg.side ?? '')); return undefined;
      case 'vote': this.vote(player, msg.choice); return { t: 'ack', what: 'vote' };
      case 'lightning': this.lightningAnswer(player, msg.said === true); return { t: 'ack', what: 'lightning' };
      case 'react': this.react(player, msg.e); return undefined;
      default: return undefined;
    }
  }

  // ---------- views ----------
  #timerView() {
    const t = this.timer;
    if (!t || !t.kind) return null;
    return { kind: t.kind, totalMs: t.totalMs, leftMs: Math.max(0, Math.round(t.at - this.#now())) };
  }
  #line() {
    const who = this.turn ? `The ${this.#name(this.turn)}` : '';
    const about = this.question ? (this.question.about === 'guys' ? 'Guy stuff' : 'Gal stuff') : '';
    switch (this.phase) {
      case 'lobby': return { text: 'Pick your side!', next: 'Guys on one team, Gals on the other' };
      case 'toss': return { text: `Coin toss: the ${this.#name(this.turn)} go first!`, next: 'Then the teams take turns' };
      case 'question': return this.locked
        ? { text: this.pick === null ? 'Time’s up!' : 'Final answer!', next: '' }
        : { text: `${who}: ${about}`, next: this.lastChance ? 'Last chance to catch up!' : 'Vote on your phones' };
      case 'reveal': return this.result.correct ? { text: 'Right!', next: `${who} move ${STEP} spaces` } : { text: this.result.timeout ? 'Out of time!' : 'Wrong!', next: `${who} stay put` };
      case 'lightning-intro': return { text: 'Lightning Round!', next: `${who}: true or false, as fast as you can` };
      case 'lightning': return { text: 'Lightning Round!', next: 'True or false?' };
      case 'lightning-done': return { text: `${this.lightning?.rights ?? 0} right!`, next: `${who} move ${this.lightning?.rights ?? 0} ${this.lightning?.rights === 1 ? 'space' : 'spaces'}` };
      default: return { text: this.winners.length > 1 ? 'It’s a tie!' : `The ${this.#name(this.winners[0])} win!`, next: '' };
    }
  }
  #teamsView() {
    return SIDE_ORDER.map((side) => {
      const t = this.#team(side);
      const members = this.#members(side);
      return {
        side, id: t?.id ?? null, name: this.#name(side), color: t?.color ?? SIDES[side].color,
        pos: this.pos[side], used: this.used[side].slice(),
        members: members.map((p) => ({ id: p.id, name: p.name, connected: this.room.connected.has(p.id), picked: !!this.picked[p.id] })),
        connected: members.some((p) => this.room.connected.has(p.id)),
      };
    });
  }
  publicView() {
    const v = {
      game: GAME, scoreFormat: 'none', lobbyTitle: NAME,
      phase: this.phase, status: this.phase, hosted: this.room.hosts > 0,
      length: this.length(), step: STEP, lightningAt: this.lightningSpaces(),
      teams: this.#teamsView(), turn: this.turn, order: this.order.slice(), lastChance: this.lastChance,
      settings: { ...this.settings },
      line: this.#line(),
      timer: this.#timerView(),
      reactions: this.reactions.map(({ id, e, side, name }) => ({ id, e, side, name })),
      lengths: Object.entries(LENGTHS).map(([n, label]) => ({ n: Number(n), label })),
      reactionList: REACTIONS,
      log: this.log.slice(),
    };
    if (this.lastMove) v.lastMove = { ...this.lastMove };
    if (this.phase === 'lobby') {
      v.sets = this.room.listContent(GAME).map((s) => ({ id: s.id, title: s.title })).slice(0, 40);
      v.setTitle = this.settings.setId === ALL_SETS ? 'All question sets' : (this.room.listContent(GAME).find((s) => s.id === this.settings.setId)?.title ?? '');
    }
    if ((this.phase === 'question' || this.phase === 'reveal') && this.question) {
      const q = this.question;
      const counts = q.choices.map(() => 0);
      for (const c of Object.values(this.votes)) counts[c] += 1;
      v.question = {
        n: this.questionN, cat: q.cat, about: q.about, text: q.q, choices: q.choices.slice(), counts,
        voters: Object.keys(this.votes), locked: this.locked, pick: this.locked ? this.pick : null,
      };
      if (this.phase === 'reveal') { v.question.answer = q.answer; v.result = { ...this.result }; }
    }
    if (this.lightning && this.phase.startsWith('lightning')) {
      const L = this.lightning;
      v.lightning = {
        side: L.side, at: L.at, total: L.items.length, i: L.i, rights: L.rights, over: !!L.over,
        current: !L.over && L.started && L.items[L.i] ? L.items[L.i].q : null,
        done: L.items.slice(0, L.i).map((x) => ({ text: x.q, a: x.a, said: x.said, correct: x.correct })),
        flash: L.flash && this.#now() < L.flash.until ? { i: L.flash.i, correct: L.flash.correct } : null,
      };
    }
    if (this.phase === 'gameover') v.winners = this.winners.slice();
    return v;
  }
  playerView(player) {
    const v = this.publicView();
    const side = this.#sideOf(player);
    v.me = { id: player.id, side, picked: !!this.picked[player.id], canStart: this.#starter(player.id), myTurn: !!side && side === this.turn };
    if (v.question) {
      if (player.id in this.votes) v.me.vote = this.votes[player.id];
      // The other team knows this stuff: their phones show the answer (behind a peek button).
      if (side && side !== this.turn && this.question) v.me.answer = this.question.answer;
    }
    if (v.lightning && side && side !== this.lightning.side && v.lightning.current) {
      v.me.lightningAnswer = this.lightning.items[this.lightning.i]?.a;
    }
    return v;
  }
  hostView() {
    const v = this.publicView();
    if (v.question) v.question.answer = this.question.answer;
    if (v.lightning && v.lightning.current) v.lightning.currentAnswer = this.lightning.items[this.lightning.i]?.a;
    return v;
  }

  // ---------- saving ----------
  toJSON() {
    return {
      settings: this.settings, picked: this.picked, phase: this.phase, order: this.order, turn: this.turn, pos: this.pos,
      used: this.used, turns: this.turns, question: this.question, votes: this.votes, voteOrder: this.voteOrder,
      locked: this.locked, pick: this.pick, result: this.result, lightning: this.lightning, lastMove: this.lastMove,
      lastChance: this.lastChance, winners: this.winners, questionN: this.questionN, log: this.log,
    };
  }
  restore(d) {
    this.#reset();
    this.settings = { setId: DEFAULT_SET, length: DEFAULT_LENGTH, answerSecs: 30, lightning: true, ...(d.settings ?? {}) };
    if (!LENGTHS[this.settings.length]) this.settings.length = DEFAULT_LENGTH;
    this.picked = d.picked ?? {};
    const valid = ['lobby', 'toss', 'question', 'reveal', 'lightning-intro', 'lightning', 'lightning-done', 'gameover'];
    this.phase = valid.includes(d.phase) ? d.phase : 'lobby';
    Object.assign(this, {
      order: d.order ?? [], turn: d.turn ?? null, pos: { guys: 0, gals: 0, ...(d.pos ?? {}) }, used: { guys: [], gals: [], ...(d.used ?? {}) },
      turns: { guys: 0, gals: 0, ...(d.turns ?? {}) }, question: d.question ?? null, votes: d.votes ?? {}, voteOrder: d.voteOrder ?? [],
      locked: !!d.locked, pick: d.pick ?? null, result: d.result ?? null, lightning: d.lightning ?? null, lastMove: d.lastMove ?? null,
      lastChance: !!d.lastChance, winners: d.winners ?? [], questionN: d.questionN ?? 0, log: d.log ?? [],
    });
    if (this.phase !== 'lobby' && this.phase !== 'gameover') {
      this.#buildDeck();
      // Timers do not survive a restart: pick up where things were, as near as we can.
      if (!this.turn || !SIDES[this.turn]) { this.phase = 'lobby'; return; }
      if (this.phase === 'toss') this.#setTimer(T.toss, () => this.#ask());
      else if (this.phase === 'question') { if (!this.question) this.#ask(); else if (this.locked) this.#setTimer(T.lockPause, () => this.#reveal()); else if (this.settings.answerSecs > 0) this.#setTimer(this.settings.answerSecs * 1000, () => this.#lock(), 'answer'); }
      else if (this.phase === 'reveal') { const side = this.turn; const to = this.pos[side]; const from = to - (this.result?.moved ?? 0); this.#setTimer(T.reveal, () => this.#afterMove(side, from, to)); }
      else if (this.lightning) {
        const L = this.lightning;
        if (this.phase === 'lightning-intro') this.#setTimer(T.lightningIntro, () => this.#runLightning());
        else if (this.phase === 'lightning') this.#runLightning();
        else { const side = L.side; this.#setTimer(T.lightningDone, () => { this.lightning = null; if (this.pos[side] >= this.length()) this.#finished(side); else this.#endTurn(side); }); }
      } else { this.phase = 'question'; this.#ask(); }
    }
  }
}

export { REACTIONS };

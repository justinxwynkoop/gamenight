// Pie Chase: the classic wedge-collecting trivia board game, for two to six players or teams.
//
// The rules are the classic board game's (see docs/PLAYING.md):
//  - Everyone starts in the hub. Each player rolls the die once; the highest roll goes first (a tie for highest rolls
//    again). Play then passes to the left (the order players joined in).
//  - On your turn you roll and move exactly that many spaces, in any direction you like, but never turning back on
//    yourself in one move. You may turn at a headquarters and cross the hub. Any number of tokens can share a space.
//  - Land on a category space and another player reads you a question in that category. Answer it right and you roll
//    again; answer it wrong and your turn is over.
//  - Land on a headquarters and answer right: you earn that category's wedge (if you do not have it already) and roll
//    again.
//  - Roll Again spaces: roll again, no question.
//  - The hub before you have every wedge: you pick the category.
//  - Once you have all six wedges, make your way to the hub and land on it by exact count. The other players choose
//    the category of the last question. Get it right and you win. Get it wrong and your turn ends: on your next turn
//    you leave the hub and come back again.
//  - Variants from the rule book, off unless the host turns them on: a shorter game (four or five wedges), and equal
//    turns (once someone wins, the players who have not yet had a turn in that round get theirs, and can tie).
//
// Who asks the question: the next player in turn (the one on the answerer's left) reads it out from their phone,
// which shows the answer too, and taps Right or Wrong. Any other opponent can judge as well, in case the reader is
// away. With a host on the host page, the host reads and judges instead.
//
// No sockets, files or real timers: the short pauses after an answer run from tick(), and every time comes from room.now().
import { GameError, fail, int } from '../../lib.js';
import { SPACES, HUB, space, destinations, CATEGORY_COUNT } from './board.js';

const GAME = 'piechase';
export const NAME = 'Pie Chase';
export const MIN_UNITS = 2;
export const MAX_UNITS = 6;
export const DIE = 6;
export const ALL_SETS = 'all';

/** The six categories, in order. A question set can name them its own way; the colours always stay the same. */
export const CATEGORIES = [
  { key: 'geography', name: 'Geography', color: '#3b82f6' },
  { key: 'entertainment', name: 'Entertainment', color: '#ec4899' },
  { key: 'history', name: 'History', color: '#facc15' },
  { key: 'arts', name: 'Arts & Literature', color: '#a855f7' },
  { key: 'science', name: 'Science & Nature', color: '#22c55e' },
  { key: 'sports', name: 'Sports & Leisure', color: '#f97316' },
];

export const T = {
  result: 3500,       // the answer, right or wrong, before the game moves on
  wedge: 5500,        // a wedge was won: a little longer, to enjoy it
  rolloffDone: 3000,  // who goes first, before their first turn
  autoMove: 1400,     // a roll with only one place to go moves there by itself after this
};

const MAX_SEEN = 3000;   // questions remembered per TV, so the next game asks new ones

/** Checks a question set. Exactly six categories, each with a name and at least one question with an answer. */
export function validateSet(set) {
  if (!set || typeof set !== 'object') fail('A question set must be an object');
  if (!String(set.title ?? '').trim()) fail('Give the question set a title');
  if (!Array.isArray(set.categories) || set.categories.length !== CATEGORY_COUNT) fail(`A Pie Chase set has exactly ${CATEGORY_COUNT} categories`);
  set.categories.forEach((c, i) => {
    if (!c || !String(c.name ?? '').trim()) fail(`Category ${i + 1} needs a name`);
    if (!Array.isArray(c.questions) || !c.questions.length) fail(`${c.name} needs at least one question`);
    c.questions.forEach((q, n) => {
      if (!q || !String(q.q ?? '').trim()) fail(`${c.name}, question ${n + 1}: write the question`);
      if (!String(q.a ?? '').trim()) fail(`${c.name}, question ${n + 1}: write the answer`);
    });
  });
  return true;
}

const keyOf = (q) => String(q.q).trim().toLowerCase().slice(0, 120);

export class PieChaseGame {
  constructor(room) {
    this.room = room;
    this.settings = { setId: ALL_SETS, wedgesToWin: CATEGORY_COUNT, equalTurns: false };
    this.#reset();
  }

  #reset() {
    this.phase = 'lobby';     // lobby | rolloff | roll | move | choose | question | result | gameover
    this.order = [];          // unit ids, in turn order (the order they joined; the first roll decides who starts)
    this.pos = {};            // unit id -> space id
    this.wedges = {};         // unit id -> [category indices], in the order they were won
    this.turn = null;         // whose turn it is
    this.rolloff = null;      // { rolls: {id: n}, contenders: [ids], round, starter }
    this.die = null;          // { value, n }: the last roll (n counts rolls, so the screens can tumble the die)
    this.rolls = 0;
    this.options = [];        // where the roll can take the token (move phase)
    this.paths = {};          // end space -> the spaces passed through to get there
    this.lastMove = null;     // { unit, from, to, path, n }
    this.again = null;        // why the player rolls again: 'correct' | 'space' | null
    this.chooser = null;      // in the choose phase: 'self' (the hub, any category) or 'opponents' (the winning question)
    this.question = null;     // { cat, q, a, final, hq, where }
    this.result = null;       // { correct, wedge, win, by }
    this.firstOfRound = null; // the unit that starts every round (for equal turns)
    this.lastRound = false;   // equal turns: someone has won, the round is being finished
    this.winners = [];
    this.finished = {};       // equal turns: unit id -> true once they have won (they get no more turns)
    this.timer = null;        // { at, fire }
    this.deck = null;         // runtime only: questions in play, by category
    this.log = [];            // the last few things that happened, newest last
  }
  #changed() { this.room.changed(); }
  #now() { return this.room.now(); }
  #setTimer(ms, fire) { this.timer = { at: this.#now() + ms, fire }; }
  #unit(id) { return this.room.units().find((u) => u.id === id) ?? null; }
  #name(id) { return this.#unit(id)?.name ?? 'Someone'; }
  /** One roll of the die (tests replace this to load the die). */
  rollDie() { return 1 + Math.floor(this.room.rng() * DIE); }
  #note(text) { this.log.push(text); if (this.log.length > 6) this.log.shift(); }

  /** Players who belong to a unit (a team's members, or the player themself). */
  #members(unitId) {
    return this.room.mode === 'teams' ? this.room.players.filter((p) => p.teamId === unitId) : this.room.players.filter((p) => p.id === unitId);
  }
  #connectedUnit(unitId) { return this.#members(unitId).some((p) => this.room.connected.has(p.id)); }
  #unitOf(player) { return this.room.unitOf(player)?.id ?? null; }

  // ---------- the room's side of the contract ----------
  inProgress() { return this.phase !== 'lobby'; }
  usesContent(id) { return this.settings.setId === id || this.settings.setId === ALL_SETS; }
  tick() {
    const t = this.timer;
    if (t && this.#now() >= t.at) { this.timer = null; t.fire(); }
  }
  playerRemoved() {
    if (this.phase === 'lobby') return;
    const ids = new Set(this.room.units().map((u) => u.id));
    this.order = this.order.filter((id) => ids.has(id));
    if (this.turn && !ids.has(this.turn)) { this.turn = this.order[0] ?? null; this.#startTurn(); }
  }
  contentChanged(id) {
    if (this.phase === 'lobby' && this.settings.setId === id && !this.room.loadContent(GAME, id)) this.settings.setId = ALL_SETS;
  }

  // ---------- questions ----------
  /** The question sets in play: one, or every set this TV has. */
  #sets() {
    const ids = this.settings.setId === ALL_SETS ? this.room.listContent(GAME).map((s) => s.id) : [this.settings.setId];
    return ids.map((id) => this.room.loadContent(GAME, id)).filter(Boolean);
  }
  /** Category names: the set's own, or the usual ones when several sets are mixed. */
  #categoryNames() {
    const sets = this.#sets();
    if (sets.length === 1) return sets[0].categories.map((c, i) => String(c.name).trim() || CATEGORIES[i].name);
    return CATEGORIES.map((c) => c.name);
  }
  #buildDeck() {
    const sets = this.#sets();
    const pools = Array.from({ length: CATEGORY_COUNT }, () => []);
    const seenKeys = new Set();
    for (const set of sets) {
      set.categories.forEach((c, i) => {
        for (const q of c.questions) {
          const k = keyOf(q);
          if (seenKeys.has(k)) continue;
          seenKeys.add(k);
          pools[i].push({ q: String(q.q).trim(), a: String(q.a).trim() });
        }
      });
    }
    this.deck = { names: this.#categoryNames(), pools };
  }
  /** The next question in a category: one this TV has not asked before, if there is one left. */
  #draw(cat) {
    if (!this.deck) this.#buildDeck();
    const pool = this.deck.pools[cat] ?? [];
    if (!pool.length) return { q: `No ${this.deck.names[cat]} questions in this set. Answer anything!`, a: '(no question)' };
    const memory = this.room.memory.load(GAME) ?? {};
    const seen = new Set(memory.seen ?? []);
    let fresh = pool.filter((q) => !seen.has(keyOf(q)));
    if (!fresh.length) {
      // Every question in this category has been asked on this TV: forget them and start the category over.
      const mine = new Set(pool.map(keyOf));
      for (const k of mine) seen.delete(k);
      fresh = pool;
    }
    const pick = fresh[Math.floor(this.room.rng() * fresh.length)];
    const list = [...seen, keyOf(pick)].slice(-MAX_SEEN);
    this.room.memory.save(GAME, { ...memory, seen: list });
    return pick;
  }

  // ---------- starting ----------
  #units() { return this.room.eligibleUnits(); }
  start() {
    if (this.phase !== 'lobby') fail('The game is already under way');
    const units = this.#units();
    if (units.length < MIN_UNITS) fail(`${NAME} needs at least ${MIN_UNITS} ${this.room.mode === 'teams' ? 'teams' : 'players'}`);
    if (units.length > MAX_UNITS) fail(`${NAME} takes at most ${MAX_UNITS} players or teams. Play in teams.`);
    this.#buildDeck();
    if (this.deck.pools.some((p) => !p.length)) fail('That question set has an empty category');
    const keep = { ...this.settings };
    this.#reset();
    this.settings = keep;
    this.#buildDeck();
    this.order = units.map((u) => u.id);
    for (const id of this.order) { this.pos[id] = HUB; this.wedges[id] = []; }
    this.room.resetScores();
    this.phase = 'rolloff';
    this.rolloff = { rolls: {}, contenders: this.order.slice(), round: 1, starter: null };
    this.#note('Everyone rolls: the highest roll goes first');
    this.#changed();
  }

  // ---------- who goes first ----------
  #rolloffRoll(unitId) {
    const r = this.rolloff;
    if (this.phase !== 'rolloff' || !r || r.starter) return;
    if (!r.contenders.includes(unitId) || r.rolls[unitId]) return;
    r.rolls[unitId] = this.rollDie();
    this.rolls += 1;
    this.die = { value: r.rolls[unitId], n: this.rolls };
    if (r.contenders.every((id) => r.rolls[id])) this.#settleRolloff();
    this.#changed();
  }
  #settleRolloff() {
    const r = this.rolloff;
    const best = Math.max(...r.contenders.map((id) => r.rolls[id]));
    const top = r.contenders.filter((id) => r.rolls[id] === best);
    if (top.length === 1) {
      r.starter = top[0];
      this.#note(`${this.#name(top[0])} rolled highest and goes first`);
      this.#setTimer(T.rolloffDone, () => this.#beginPlay());
      return;
    }
    // A tie for the highest roll: just those players roll again.
    r.history = [...(r.history ?? []), { ...r.rolls }];
    r.contenders = top;
    r.rolls = {};
    r.round += 1;
    this.#note(`A tie: ${top.map((id) => this.#name(id)).join(' and ')} roll again`);
  }
  #beginPlay() {
    if (this.phase !== 'rolloff' || !this.rolloff?.starter) return;
    // Play goes round in the joining order, starting from whoever rolled highest.
    const i = this.order.indexOf(this.rolloff.starter);
    this.order = [...this.order.slice(i), ...this.order.slice(0, i)];
    this.firstOfRound = this.order[0];
    this.turn = this.order[0];
    this.#startTurn();
  }

  // ---------- a turn ----------
  #startTurn(again = null) {
    this.phase = 'roll';
    this.again = again;
    this.options = []; this.paths = {};
    this.question = null; this.result = null; this.chooser = null;
    this.#changed();
  }
  roll(unitId) {
    if (this.phase === 'rolloff') { this.#rolloffRoll(unitId); return; }
    if (this.phase !== 'roll') fail('It is not time to roll');
    if (unitId !== this.turn) fail(`It is ${this.#name(this.turn)}’s turn`);
    const value = this.rollDie();
    this.rolls += 1;
    this.die = { value, n: this.rolls };
    const found = destinations(this.pos[this.turn], value);
    this.options = [...found.keys()];
    this.paths = Object.fromEntries(found);
    this.phase = 'move';
    this.again = null;
    // Only one place to go: the token goes there by itself, once everyone has seen the die.
    if (this.options.length === 1) this.#setTimer(T.autoMove, () => this.move(this.turn, this.options[0]));
    this.#changed();
  }
  move(unitId, to) {
    if (this.phase !== 'move') fail('Roll first');
    if (unitId !== this.turn) fail(`It is ${this.#name(this.turn)}’s turn`);
    if (!this.options.includes(to)) fail('You cannot get there with this roll');
    this.timer = null;
    const from = this.pos[unitId];
    this.pos[unitId] = to;
    this.lastMove = { unit: unitId, from, to, path: this.paths[to] ?? [to], n: this.die?.value ?? 0 };
    this.options = []; this.paths = {};
    this.#land(unitId, to);
  }
  #hasAll(unitId) { return (this.wedges[unitId]?.length ?? 0) >= this.settings.wedgesToWin; }
  #land(unitId, at) {
    const s = space(at);
    if (s.kind === 'again') { this.#note(`${this.#name(unitId)} landed on Roll Again`); this.#startTurn('space'); return; }
    if (s.kind === 'hub') {
      this.phase = 'choose';
      this.chooser = this.#hasAll(unitId) ? 'opponents' : 'self';
      this.#changed();
      return;
    }
    this.#ask(s.cat, { hq: s.kind === 'hq', final: false, where: at });
  }
  /** In the hub: the player picks the category (before they have every wedge), or the others pick it (the last question). */
  choose(chooserUnit, cat, { trusted = false } = {}) {
    if (this.phase !== 'choose') fail('There is no category to pick');
    const c = int(cat);
    if (!(c >= 0 && c < CATEGORY_COUNT)) fail('Pick one of the six categories');
    if (!trusted) {
      if (this.chooser === 'self' && chooserUnit !== this.turn) fail(`${this.#name(this.turn)} picks the category`);
      if (this.chooser === 'opponents' && chooserUnit === this.turn) fail('The other players pick your last category');
    }
    this.#ask(c, { hq: false, final: this.chooser === 'opponents', where: HUB });
  }
  #ask(cat, { hq, final, where }) {
    const q = this.#draw(cat);
    this.question = { cat, q: q.q, a: q.a, hq, final, where };
    this.phase = 'question';
    this.chooser = null;
    this.#changed();
  }
  /** The reader (or the host) says whether the answer was right. */
  judge(byUnit, correct, { trusted = false } = {}) {
    if (this.phase !== 'question') fail('There is no question to judge');
    if (!trusted) {
      if (byUnit === this.turn) fail('Another player judges your answer');
      if (this.room.hosts > 0) fail('The host judges the answers');
    }
    const u = this.turn;
    const q = this.question;
    const result = { correct: !!correct, wedge: null, win: false };
    if (correct) {
      if (q.final) result.win = true;
      else if (q.hq && !this.wedges[u].includes(q.cat)) {
        this.wedges[u].push(q.cat);
        result.wedge = q.cat;
        const unit = this.#unit(u);
        if (unit) unit.score = this.wedges[u].length;
      }
    }
    this.result = result;
    this.phase = 'result';
    const name = this.#name(u);
    const cat = this.#catName(q.cat);
    if (result.win) this.#note(`${name} answered the winning question`);
    else if (result.wedge !== null) this.#note(`${name} won the ${cat} wedge`);
    else this.#note(correct ? `${name} got a ${cat} question right` : `${name} missed a ${cat} question`);
    this.#setTimer(result.wedge !== null || result.win ? T.wedge : T.result, () => this.#afterResult());
    this.#changed();
  }
  #afterResult() {
    if (this.phase !== 'result') return;
    const r = this.result;
    if (r.win) { this.#won(this.turn); return; }
    if (r.correct) { this.#startTurn('correct'); return; }
    this.#nextTurn();
  }
  #won(unitId) {
    this.winners.push(unitId);
    this.finished[unitId] = true;
    if (!this.settings.equalTurns) { this.#end(); return; }
    // Equal turns: everyone who has not had a turn in this round gets one, and can tie.
    this.lastRound = true;
    this.#nextTurn();
  }
  #nextTurn() {
    const n = this.order.length;
    let i = this.order.indexOf(this.turn);
    for (let step = 0; step < n; step++) {
      i = (i + 1) % n;
      const id = this.order[i];
      if (this.lastRound && id === this.firstOfRound) { this.#end(); return; }
      if (this.finished[id]) continue;
      this.turn = id;
      this.#startTurn();
      return;
    }
    this.#end();
  }
  #end() {
    this.phase = 'gameover';
    this.timer = null;
    this.options = []; this.paths = {};
    this.#changed();
  }
  #catName(cat) { return (this.deck?.names ?? CATEGORIES.map((c) => c.name))[cat] ?? CATEGORIES[cat]?.name ?? ''; }

  /** The host, the TV or the first player moves things along for someone who has gone away. */
  advance() {
    switch (this.phase) {
      case 'rolloff': {
        const r = this.rolloff;
        if (r.starter) { this.timer = null; this.#beginPlay(); return; }
        for (const id of r.contenders.filter((x) => !r.rolls[x])) this.#rolloffRoll(id);
        return;
      }
      case 'roll': this.roll(this.turn); return;
      case 'move': this.move(this.turn, this.options[0]); return;
      case 'choose': this.choose(null, Math.floor(this.room.rng() * CATEGORY_COUNT), { trusted: true }); return;
      case 'result': this.timer = null; this.#afterResult(); return;
      default: return;
    }
  }
  /** The host passes the turn on (someone has had to leave, say). */
  skipTurn() {
    if (!['roll', 'move', 'choose', 'question'].includes(this.phase)) fail('Nothing to skip right now');
    this.timer = null;
    this.#note(`${this.#name(this.turn)}’s turn was skipped`);
    this.#nextTurn();
  }
  endGame() {
    const keep = { ...this.settings };
    this.#reset();
    this.settings = keep;
    this.room.resetScores();
    this.#changed();
  }

  // ---------- settings (lobby) ----------
  setSet(id) {
    if (this.phase !== 'lobby') fail('Change the questions before the game starts');
    const want = String(id ?? '');
    if (want !== ALL_SETS && !this.room.loadContent(GAME, want)) fail('No such question set');
    this.settings.setId = want;
    this.deck = null;
    this.#changed();
  }
  setWedges(n) {
    if (this.phase !== 'lobby') fail('Change this before the game starts');
    const v = int(n);
    if (![4, 5, 6].includes(v)) fail('Play to 4, 5 or 6 wedges');
    this.settings.wedgesToWin = v;
    this.#changed();
  }
  setEqualTurns(on) {
    if (this.phase !== 'lobby') fail('Change this before the game starts');
    this.settings.equalTurns = !!on;
    this.#changed();
  }

  // ---------- who may do what ----------
  /** Host and TV actions (both trusted). */
  act(action, a = {}) {
    switch (action) {
      case 'start': return this.start();
      case 'roll': return this.roll(this.phase === 'rolloff' ? String(a.unit ?? '') : this.turn);
      case 'move': return this.move(this.turn, String(a.to ?? ''));
      case 'choose': return this.choose(null, a.cat, { trusted: true });
      case 'judge': return this.judge(null, a.correct === true, { trusted: true });
      case 'advance': return this.advance();
      case 'skipTurn': return this.skipTurn();
      case 'endGame': case 'playAgain': return this.endGame();
      case 'setSet': return this.setSet(a.id);
      case 'setWedges': return this.setWedges(a.n);
      case 'setEqualTurns': return this.setEqualTurns(a.on);
      case 'kick':
        if (this.phase !== 'lobby') fail('Players can only be removed before the game starts');
        return this.room.removePlayer(String(a.pid ?? a.id ?? ''));
      default: throw new GameError(`Unknown action ${action}`);
    }
  }
  /** With a host on the host page, the host starts and moves things along; without one, the first player to join does. */
  #starter(pid) { return !this.room.hosts && this.room.players[0]?.id === pid; }
  /** A message from a phone. */
  onPlayer(player, msg) {
    const unit = this.#unitOf(player);
    switch (msg.t) {
      case 'start': case 'advance': case 'skip': case 'play-again':
        if (!this.#starter(player.id)) fail('Only the host can do that');
        this.act({ start: 'start', advance: 'advance', skip: 'skipTurn', 'play-again': 'playAgain' }[msg.t]);
        return undefined;
      case 'roll': this.roll(unit); return { t: 'ack', what: 'roll' };
      case 'move': this.move(unit, String(msg.to ?? '')); return undefined;
      case 'choose': this.choose(unit, msg.cat); return undefined;
      case 'judge': this.judge(unit, msg.correct === true); return { t: 'ack', what: 'judge' };
      default: return undefined;
    }
  }

  // ---------- views ----------
  /** Who reads the question: the next player in turn (on the answerer's left) who is here. */
  #reader() {
    const n = this.order.length;
    let i = this.order.indexOf(this.turn);
    for (let step = 1; step < n; step++) {
      const id = this.order[(i + step) % n];
      if (this.#connectedUnit(id)) return id;
    }
    return n > 1 ? this.order[(i + 1) % n] : null;
  }
  #line() {
    const who = this.#name(this.turn);
    const cat = (c) => this.#catName(c);
    switch (this.phase) {
      case 'lobby': return { text: 'Waiting for players', next: `${MIN_UNITS} to ${MAX_UNITS} players or teams` };
      case 'rolloff': return this.rolloff?.starter
        ? { text: `${this.#name(this.rolloff.starter)} goes first`, next: 'Highest roll starts' }
        : { text: 'Everyone rolls the die', next: this.rolloff?.round > 1 ? 'A tie for highest: roll again' : 'The highest roll goes first' };
      case 'roll': return { text: this.again === 'correct' ? `Right! ${who} rolls again` : this.again === 'space' ? `Roll Again! ${who} rolls again` : `${who}’s turn: roll the die`, next: this.#hasAll(this.turn) ? 'Every wedge: head for the hub!' : 'Roll on your phone' };
      case 'move': return { text: `${who} rolled ${this.die?.value}`, next: this.options.length > 1 ? 'Pick where to move on your phone' : 'Moving…' };
      case 'choose': return this.chooser === 'opponents'
        ? { text: `${who} is in the hub with every wedge!`, next: 'The other players pick the category for the winning question' }
        : { text: `${who} is in the hub`, next: `${who} picks any category` };
      case 'question': return { text: `${cat(this.question.cat)}${this.question.final ? ': for the win!' : this.question.hq ? ': for the wedge!' : ''}`, next: `${who} answers out loud` };
      case 'result': return this.result.win ? { text: `${who} wins!`, next: '' }
        : this.result.wedge !== null ? { text: `${who} wins the ${cat(this.result.wedge)} wedge!`, next: 'and rolls again' }
          : this.result.correct ? { text: 'Right!', next: `${who} rolls again` } : { text: 'Not quite', next: `Over to ${this.#name(this.#peekNext())}` };
      default: return { text: this.winners.length > 1 ? 'A tie!' : `${this.#name(this.winners[0])} wins!`, next: '' };
    }
  }
  #peekNext() {
    const n = this.order.length;
    let i = this.order.indexOf(this.turn);
    for (let step = 1; step <= n; step++) {
      const id = this.order[(i + step) % n];
      if (!this.finished[id]) return id;
    }
    return this.turn;
  }
  #unitsView() {
    const ids = this.phase === 'lobby' ? this.#units().map((u) => u.id) : this.order;
    return ids.map((id) => {
      const u = this.#unit(id);
      return {
        id, name: u?.name ?? '?', color: u?.color ?? '#888888', connected: this.#connectedUnit(id),
        pos: this.pos[id] ?? HUB, wedges: (this.wedges[id] ?? []).slice(),
        ...(this.room.mode === 'teams' ? { members: this.#members(id).map((p) => p.name) } : {}),
        ...(this.finished[id] ? { won: true } : {}),
      };
    });
  }
  publicView() {
    const names = this.phase === 'lobby' ? this.#categoryNames() : (this.deck?.names ?? this.#categoryNames());
    const v = {
      game: GAME, scoreFormat: 'none', lobbyTitle: NAME,
      phase: this.phase, status: this.phase, hosted: this.room.hosts > 0,
      minUnits: MIN_UNITS, maxUnits: MAX_UNITS,
      categories: CATEGORIES.map((c, i) => ({ key: c.key, name: names[i] ?? c.name, color: c.color })),
      board: SPACES,
      units: this.#unitsView(),
      turn: this.turn,
      die: this.die,
      settings: { ...this.settings },
      line: this.#line(),
      log: this.log.slice(),
    };
    if (this.phase === 'lobby') {
      v.sets = this.room.listContent(GAME).map((s) => ({ id: s.id, title: s.title })).slice(0, 40);
      v.setTitle = this.settings.setId === ALL_SETS ? 'All question sets' : (this.room.listContent(GAME).find((s) => s.id === this.settings.setId)?.title ?? '');
    }
    if (this.phase === 'rolloff') {
      const r = this.rolloff;
      v.rolloff = { rolls: { ...r.rolls }, contenders: r.contenders.slice(), round: r.round, starter: r.starter, history: (r.history ?? []).map((x) => ({ ...x })) };
    }
    if (this.phase === 'roll') v.again = this.again;
    if (this.phase === 'move') v.options = this.options.slice();
    if (this.lastMove) v.lastMove = { ...this.lastMove, path: this.lastMove.path.slice() };
    if (this.phase === 'choose') v.chooser = this.chooser;
    if (this.phase === 'question' || this.phase === 'result') {
      const q = this.question;
      v.question = { cat: q.cat, text: q.q, hq: q.hq, final: q.final, where: q.where, hasWedge: (this.wedges[this.turn] ?? []).includes(q.cat) };
      v.readerId = this.room.hosts > 0 ? null : this.#reader();
    }
    if (this.phase === 'result') { v.question.answer = this.question.a; v.result = { ...this.result }; }
    if (this.phase === 'gameover') v.winners = this.winners.slice();
    return v;
  }
  /** A phone: the shared view, and the answer for an opponent's phone while there is no host to read it. */
  playerView(player) {
    const v = this.publicView();
    const unit = this.#unitOf(player);
    v.me = { id: player.id, unitId: unit, canStart: this.#starter(player.id), myTurn: !!unit && unit === this.turn };
    if (this.phase === 'question' && !v.hosted && unit && unit !== this.turn) {
      v.question.answer = this.question.a;
      v.me.canJudge = true;
      v.me.reader = unit === v.readerId;
    }
    if (this.phase === 'choose') v.me.canChoose = this.chooser === 'self' ? unit === this.turn : !!unit && unit !== this.turn;
    return v;
  }
  /** The host reads every question, so the host sees the answer. */
  hostView() {
    const v = this.publicView();
    if (this.question && (this.phase === 'question' || this.phase === 'result')) v.question.answer = this.question.a;
    return v;
  }

  // ---------- saving ----------
  toJSON() {
    return {
      settings: this.settings, phase: this.phase, order: this.order, pos: this.pos, wedges: this.wedges, turn: this.turn,
      rolloff: this.rolloff, die: this.die, rolls: this.rolls, options: this.options, paths: this.paths, lastMove: this.lastMove,
      again: this.again, chooser: this.chooser, question: this.question, result: this.result, firstOfRound: this.firstOfRound,
      lastRound: this.lastRound, winners: this.winners, finished: this.finished, log: this.log,
    };
  }
  restore(d) {
    this.#reset();
    this.settings = { setId: ALL_SETS, wedgesToWin: CATEGORY_COUNT, equalTurns: false, ...(d.settings ?? {}) };
    const valid = ['lobby', 'rolloff', 'roll', 'move', 'choose', 'question', 'result', 'gameover'];
    this.phase = valid.includes(d.phase) ? d.phase : 'lobby';
    Object.assign(this, {
      order: d.order ?? [], pos: d.pos ?? {}, wedges: d.wedges ?? {}, turn: d.turn ?? null, rolloff: d.rolloff ?? null,
      die: d.die ?? null, rolls: d.rolls ?? 0, options: d.options ?? [], paths: d.paths ?? {}, lastMove: d.lastMove ?? null,
      again: d.again ?? null, chooser: d.chooser ?? null, question: d.question ?? null, result: d.result ?? null,
      firstOfRound: d.firstOfRound ?? null, lastRound: !!d.lastRound, winners: d.winners ?? [], finished: d.finished ?? {}, log: d.log ?? [],
    });
    if (this.phase === 'question' && !this.question) this.phase = 'roll';
    // A pause that was running carries on (the timers do not survive a restart).
    if (this.phase === 'result') this.#setTimer(T.result, () => this.#afterResult());
    if (this.phase === 'rolloff' && this.rolloff?.starter) this.#setTimer(T.rolloffDone, () => this.#beginPlay());
    if (this.phase === 'move' && this.options.length === 1) this.#setTimer(T.autoMove, () => this.move(this.turn, this.options[0]));
  }
}

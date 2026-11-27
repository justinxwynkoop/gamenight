// Guys vs Gals: the battle-of-the-sexes party game, played by the classic trophy tug-of-war rules. The Guys answer
// questions about gal stuff, the Gals answer questions about guy stuff, and every right answer pulls the trophy one
// space closer to your end of the path.
//
// How it plays (see docs/PLAYING.md):
//  - Two teams, always: the Guys and the Gals. Everyone picks their side on their phone in the lobby.
//  - The trophy starts in the middle, on START. The Gals go first.
//  - A turn: a player on the OTHER team reads a card from their own side's deck (the Guys read guy stuff to the Gals)
//    and judges the answer on their phone. Readers take turns. The colour of the space the trophy is on picks the deck:
//      START  Our Facts   questions about the other side's world
//      1      Our Stuff   things they own, use and know
//      2      Our Pics    a picture on the TV, and a question about it
//      3      Our Lives   the reader secretly picks A, B or C about themselves; the team guesses on their phones
//      4      Our Moves   charades: the reader picks an actor on the answering team, both act the same thing at once,
//                         and whichever team shouts it first pulls the trophy their way
//      green  any deck but Moves (the last space before your winner's circle)
//  - Right: the trophy moves one space toward the answering team, and they get another card. Wrong: the other team's
//    turn, with the trophy where it is (on the other team's side of START the same spaces count for them).
//  - A right answer while the trophy is on your own green space wins it: one trophy for your team, and a new one goes on
//    START with the other team to play. First to three trophies wins.
//  - Challenge tokens: each team has three. On your turn (not on a Moves card) you can throw the card back: the other
//    team must answer it themselves, without the reader's help. If they miss, the trophy comes your way and you keep
//    playing; if they get it, the trophy goes their way and it is their turn.
//  - No dice and no clock, except one minute for a charade.
//
// Or the classic pawn race (settings.mode 'race'), picked in the lobby:
//  - A coin toss says who goes first. Each team has two pawns (one in a quick race): one starts on its START, the
//    other waits off the board. The Guys run left to right, the Gals right to left, along the same RACE_LEN spaces.
//  - A turn: a reader from the other team reads a card of three questions (Our Facts, Stuff and Pics). Every right
//    answer lets the team step its pawn onto a space of its choosing in the next column, picked on their phones (the
//    columns are staggered, so that is the space up or the space down; any space from START), and the next question
//    is asked; a miss, or three right, ends the turn.
//  - Wild spaces: land on your own side's wild space and you draw one of your wild cards at once; end your turn on
//    the other side's wild space and you draw one of theirs. Wild cards help the side they belong to.
//  - Prisoners: once a game, a team that ends its turn on the very space the other team's pawn stands on takes it
//    prisoner (only while the other team still has a pawn waiting). Their waiting pawn starts instead, and the prisoner is freed back to START
//    when that pawn gets across.
//  - A pawn that reaches the far START is across, and the team's next pawn starts. Both across wins.
//
// No sockets, files or real timers: everything runs from tick() and room.now().
import { GameError, fail, int } from '../../lib.js';

const GAME = 'guysvsgals';
export const NAME = 'Guys vs Gals';
export const ALL_SETS = 'all';
// New games start on the grown-up set (Jason's pick); Family is in the lobby's list for when the kids play.
export const DEFAULT_SET = 'grownups';

/** The two sides. `key` is the room's team that plays the side; `asks` is the half of a question set it answers;
 *  `dir` is the way a right answer pulls the trophy (the Guys' end of the path is on the left). */
export const SIDES = {
  guys: { key: 'blue', name: 'Guys', color: '#3b8bff', asks: 'galStuff', other: 'gals', dir: -1 },
  gals: { key: 'red', name: 'Gals', color: '#ff4fa3', asks: 'guyStuff', other: 'guys', dir: 1 },
};
export const SIDE_ORDER = ['guys', 'gals'];
export const FIRST = 'gals';

/** The five decks, in the order they come along the path. */
export const DECKS = {
  facts: { name: 'Our Facts', short: 'Facts', color: '#9b5cff' },
  stuff: { name: 'Our Stuff', short: 'Stuff', color: '#ffd23f' },
  pics: { name: 'Our Pics', short: 'Pics', color: '#ff8a3d' },
  lives: { name: 'Our Lives', short: 'Lives', color: '#2ec5ff' },
  moves: { name: 'Our Moves', short: 'Moves', color: '#ff3b5c' },
};
export const DECK_ORDER = ['facts', 'stuff', 'pics', 'lives', 'moves'];
/** The spaces from START out to one team's green space: the deck each one draws from ('any' on green). */
export const PATH = ['facts', 'stuff', 'pics', 'lives', 'moves', 'any'];
export const GREEN = PATH.length - 1;      // 5 spaces from START to each green space
export const GREEN_COLOR = '#3ddc84';
export const TARGETS = [1, 2, 3];          // trophies to win
export const DEFAULT_TARGET = 3;
export const CHALLENGES = 3;               // challenge tokens per team

/** The pawn race: the play modes, the track, and where the wild spaces are (counted from the Guys' START). */
export const MODES = ['trophy', 'race'];
export const RACE_LEN = 12;                // spaces between the two STARTs
// One wild column each, like the classic board: the Guys' in their own half (three in from their START), the Gals' the
// same distance in from theirs.
export const RACE_WILD = { guys: [3], gals: [RACE_LEN - 2] };
export const RACE_QUESTIONS = 3;           // questions on a card
export const RACE_ROWS = 6;                // spaces in each column of the board
export const PAWN_COUNTS = [1, 2];         // a quick race, or the standard two pawns each
/** Wild cards, original to this game. Each helps the side it belongs to ({O}) or holds up the other ({X}). */
export const WILD_CARDS = {
  guys: [
    { kind: 'ahead', n: 2, text: 'Tailgate party! The {O} move ahead 2 spaces.' },
    { kind: 'ahead', n: 1, text: 'Found the remote! The {O} move ahead 1 space.' },
    { kind: 'ahead', n: 1, text: 'Fixed it with duct tape. The {O} move ahead 1 space.' },
    { kind: 'ahead', n: 2, text: 'Grill master! The {O} move ahead 2 spaces.' },
    { kind: 'back', n: 2, text: 'The {X} stopped to take a photo of their lunch. Back 2 spaces.' },
    { kind: 'back', n: 1, text: 'The {X} are still deciding where to eat. Back 1 space.' },
    { kind: 'back', n: 3, text: 'Wrong turn at the mall! The {X} go back 3 spaces.' },
    { kind: 'skip', text: 'Game day! The {X} sit out their next turn.' },
  ],
  gals: [
    { kind: 'ahead', n: 2, text: 'Girls’ night out! The {O} move ahead 2 spaces.' },
    { kind: 'ahead', n: 1, text: 'Found the perfect outfit. The {O} move ahead 1 space.' },
    { kind: 'ahead', n: 1, text: 'Remembered everyone’s birthday. The {O} move ahead 1 space.' },
    { kind: 'ahead', n: 2, text: 'Spa day! The {O} move ahead 2 spaces.' },
    { kind: 'back', n: 2, text: 'The {X} won’t ask for directions. Back 2 spaces.' },
    { kind: 'back', n: 1, text: 'The {X} can’t find the ketchup in the fridge. Back 1 space.' },
    { kind: 'back', n: 3, text: 'Man cold! The {X} go back 3 spaces.' },
    { kind: 'skip', text: 'The {X} are watching the game. They sit out their next turn.' },
  ],
};

export const T = {
  // Jason (Nov 26): "sometimes the answer goes away too fast". The answer stays up long enough to read out loud.
  result: 7000,        // a miss (and the answer), before the other team's card
  right: 4500,         // a right answer on a spoken card: the answer, then the same team plays on
  wild: 8500,          // the same, with a wild card or a prisoner to read
  trophy: 5200,        // a trophy is won, before the next one goes on START
  moves: 60000,        // the clock on a charade
  move: 20000,         // the race: picking the space to step onto, before the pawn steps by itself
};

const MAX_SEEN = 4000;
const REACTIONS = ['😂', '🔥', '😱', '👏', '🙄', '💪'];
const REACTION_MS = 4500;

const text = (s) => String(s ?? '').trim();

/** Checks a question set: a title, and for each side some Facts or Stuff questions (the other decks are optional). */
export function validateSet(set) {
  if (!set || typeof set !== 'object') fail('A question set must be an object');
  if (!text(set.title)) fail('Give the question set a title');
  for (const [part, label] of [['guyStuff', 'Guy stuff'], ['galStuff', 'Gal stuff']]) {
    const half = set[part];
    if (!half || typeof half !== 'object') fail(`${label}: add some questions`);
    for (const deck of DECK_ORDER) {
      if (half[deck] !== undefined && !Array.isArray(half[deck])) fail(`${label}, ${DECKS[deck].name}: must be a list`);
    }
    if (!(half.facts?.length || half.stuff?.length)) fail(`${label} needs at least one Our Facts or Our Stuff question`);
    for (const deck of ['facts', 'stuff', 'pics']) {
      (half[deck] ?? []).forEach((q, n) => {
        const where = `${label}, ${DECKS[deck].name} ${n + 1}`;
        if (!q || !text(q.q)) fail(`${where}: write the question`);
        if (!text(q.a)) fail(`${where}: write the answer`);
        if (deck === 'pics' && !text(q.img)) fail(`${where}: choose a picture`);
        if (q.choices !== undefined) {
          const c = Array.isArray(q.choices) ? q.choices.map(text) : [];
          if (c.length !== 3 || c.some((x) => !x)) fail(`${where}: a multiple choice question needs three choices, A, B and C`);
          if (!c.includes(text(q.a))) fail(`${where}: the answer must be one of the three choices`);
        }
      });
    }
    (half.lives ?? []).forEach((q, n) => {
      const where = `${label}, ${DECKS.lives.name} ${n + 1}`;
      if (!q || !text(q.q)) fail(`${where}: write the question`);
      const c = Array.isArray(q.choices) ? q.choices : [];
      if (c.length !== 3 || c.some((x) => !text(x))) fail(`${where}: write all three choices, A, B and C`);
    });
    (half.moves ?? []).forEach((q, n) => {
      if (!q || !text(q.m)) fail(`${label}, ${DECKS.moves.name} ${n + 1}: write what to act out`);
    });
  }
  return true;
}

const keyOf = (s) => String(s).trim().toLowerCase().slice(0, 120);
const cardKey = (deck, x) => `${deck}:${keyOf(x.q ?? x.m ?? '')}`;

export class GuysVsGalsGame {
  constructor(room) {
    this.room = room;
    this.settings = { setId: DEFAULT_SET, target: DEFAULT_TARGET, challenges: true, mode: 'trophy', pawns: 2 };
    this.picked = {};   // player id -> true once they chose their side (kept across games)
    this.reactions = [];
    this.reactionN = 0;
    this.lastReact = {};
    this.#reset();
  }

  #reset() {
    this.phase = 'lobby';   // lobby | card | result | trophy | gameover
    this.turn = null;       // the side answering
    this.pos = 0;           // the trophy: -GREEN (the Guys' green) .. 0 (START) .. GREEN (the Gals' green)
    this.trophies = { guys: 0, gals: 0 };
    this.tokens = { guys: CHALLENGES, gals: CHALLENGES };
    this.readerN = { guys: 0, gals: 0 };
    this.card = null;       // see #deal()
    this.result = null;     // { right, moved, trophy, next, timeout, stolen, challenged, answer, secret, pick }
    this.trophyWon = null;  // the side that just won a trophy
    this.lastMove = null;   // { from, to, n, side, trophy }
    this.winners = [];
    this.timer = null;      // { at, fire, kind, totalMs }
    this.deck = null;       // runtime only
    this.cardN = 0;
    this.trophyN = 1;       // which trophy is in play
    this.log = [];
    this.race = null;       // the pawn race, see #newRace()
  }
  #isRace() { return this.settings.mode === 'race'; }
  #changed() { this.room.changed(); }
  #now() { return this.room.now(); }
  #setTimer(ms, fire, kind = null) { this.timer = { at: this.#now() + ms, fire, kind, totalMs: ms }; }
  #note(s) { this.log.push(s); if (this.log.length > 6) this.log.shift(); }

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
  #pname(id) { return this.room.players.find((p) => p.id === id)?.name ?? ''; }
  /** The room's two teams wear the sides' names and colours while this game is chosen. */
  #dress() {
    for (const side of SIDE_ORDER) {
      const t = this.#team(side);
      if (!t) continue;
      if (['Red', 'Blue'].includes(t.name)) t.name = SIDES[side].name;
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
    // Everyone guessing an Our Lives card has voted (people who wandered off are not waited for).
    const c = this.card;
    if (this.phase === 'card' && c?.stage === 'guess') {
      const here = this.#guessers().filter((id) => this.room.connected.has(id));
      if (here.length && here.every((id) => id in c.votes)) this.#lockGuess();
    }
    if (this.reactions.length && this.reactions[0].at + REACTION_MS < this.#now()) {
      this.reactions = this.reactions.filter((r) => r.at + REACTION_MS >= this.#now());
      this.#changed();
    }
  }
  /** The reader, the actor and the two teams are all dealt in, so nobody can be removed once the game has started. */
  removeBlocked() { return this.phase === 'lobby' ? null : 'Players can only be removed before the game starts (end the game first, or skip the card)'; }
  /** The card is waiting for someone who is not here (the reader and everyone who could stand in for them): then
   *  anyone who is here may throw the card out and deal another. */
  #stuck() {
    const c = this.card;
    if (this.phase !== 'card' || !c || !['read', 'secret', 'pick'].includes(c.stage)) return false;
    return !this.#judges().some((id) => this.room.connected.has(id));
  }
  playerRemoved(id) {
    delete this.picked[id];
    if (this.card) {
      delete this.card.votes[id];
      this.card.voteOrder = this.card.voteOrder.filter((x) => x !== id);
    }
  }
  contentChanged(id) {
    if (this.phase === 'lobby' && this.settings.setId === id && !this.room.loadContent(GAME, id)) this.settings.setId = ALL_SETS;
    if (this.phase === 'lobby') this.deck = null;
  }

  // ---------- the decks ----------
  #sets() {
    const all = () => this.room.listContent(GAME).map((s) => this.room.loadContent(GAME, s.id)).filter(Boolean);
    if (this.settings.setId === ALL_SETS) return all();
    const one = this.room.loadContent(GAME, this.settings.setId);
    return one ? [one] : all();
  }
  #buildDeck() {
    const empty = () => Object.fromEntries(DECK_ORDER.map((d) => [d, []]));
    const deck = { guyStuff: empty(), galStuff: empty() };
    const seen = new Set();
    for (const set of this.#sets()) {
      for (const part of ['guyStuff', 'galStuff']) {
        for (const d of DECK_ORDER) {
          for (const x of set[part]?.[d] ?? []) {
            let item = null;
            if (d === 'moves') { if (text(x?.m)) item = { m: text(x.m) }; }
            else if (d === 'lives') {
              const choices = (x?.choices ?? []).map(text);
              if (text(x?.q) && choices.length === 3 && choices.every(Boolean)) item = { q: text(x.q), choices };
            } else if (text(x?.q) && text(x?.a) && (d !== 'pics' || text(x?.img))) {
              item = { q: text(x.q), a: text(x.a) };
              if (text(x.cat)) item.cat = text(x.cat);
              if (d === 'pics') item.img = text(x.img);
              // Multiple choice: A, B and C go up on the TV, and the right one is marked with the answer.
              const choices = Array.isArray(x.choices) ? x.choices.map(text) : [];
              if (choices.length === 3 && choices.every(Boolean) && choices.includes(item.a)) item.choices = choices;
            }
            if (!item) continue;
            const k = `${part}:${cardKey(d, item)}`;
            if (seen.has(k)) continue;
            seen.add(k);
            deck[part][d].push(item);
          }
        }
      }
    }
    this.deck = deck;
  }
  /** One card not yet seen on this TV (the oldest come back once a pile runs out). */
  #draw(deckName, pool) {
    if (!pool.length) return null;
    const memory = this.room.memory.load(GAME) ?? {};
    const seen = new Set(memory.seen ?? []);
    let fresh = pool.filter((x) => !seen.has(cardKey(deckName, x)));
    if (!fresh.length) {
      for (const x of pool) seen.delete(cardKey(deckName, x));
      fresh = pool.slice();
    }
    const pick = fresh[Math.floor(this.room.rng() * fresh.length)];
    this.room.memory.save(GAME, { ...memory, seen: [...seen, cardKey(deckName, pick)].slice(-MAX_SEEN) });
    return pick;
  }
  /** Our Lives is not trivia (Jason: "It's trivia"), so the shipped sets carry none; a family's own set still can.
   *  With no Our Lives cards in play its space on the path is a second Our Facts space, and the deck is not listed. */
  #hasLives() {
    if (this.deck) return ['guyStuff', 'galStuff'].some((part) => this.deck[part].lives.length > 0);
    return this.#sets().some((set) => ['guyStuff', 'galStuff'].some((part) => (set?.[part]?.lives ?? []).length > 0));
  }
  #path() { return this.#hasLives() ? PATH.slice() : PATH.map((d) => (d === 'lives' ? 'facts' : d)); }
  /** The deck a space draws from, for the side answering: a missing deck falls back to Facts, then Stuff. */
  #deckFor(side, space) {
    const piles = this.deck[SIDES[side].asks];
    let want = this.#path()[Math.min(GREEN, Math.abs(space))];
    if (want === 'any') {
      const options = ['facts', 'stuff', 'pics', 'lives'].filter((d) => piles[d].length);
      want = options[Math.floor(this.room.rng() * options.length)] ?? 'facts';
    }
    for (const d of [want, 'facts', 'stuff']) if (piles[d]?.length) return d;
    return 'facts';
  }

  // ---------- the path ----------
  /** The space the trophy is on, counted from START toward the side's own green space (negative: the other way). */
  spaceFor(side) { return this.pos * SIDES[side].dir; }
  #score() { for (const side of SIDE_ORDER) { const t = this.#team(side); if (t) t.score = this.trophies[side]; } }

  // ---------- starting ----------
  start() {
    if (this.phase !== 'lobby') fail('The game is already under way');
    this.#dress();
    for (const side of SIDE_ORDER) if (!this.#members(side).length) fail(`The ${this.#name(side)} need at least one player`);
    this.#buildDeck();
    for (const part of ['guyStuff', 'galStuff']) {
      if (!this.deck[part].facts.length && !this.deck[part].stuff.length) fail('That question set needs questions for both sides');
    }
    const keep = { ...this.settings };
    const deck = this.deck;
    this.#reset();
    this.settings = keep;
    this.deck = deck;
    this.room.resetScores();
    if (this.#isRace()) {
      this.#newRace();
      this.turn = this.room.rng() < 0.5 ? 'gals' : 'guys';
      this.race.toss = this.turn;
      this.#note(`Coin toss: the ${this.#name(this.turn)} go first`);
    } else {
      this.turn = FIRST;
      this.#note(`The ${this.#name(FIRST)} go first`);
    }
    this.#deal();
  }

  // ---------- a card ----------
  /** The next reader on a team: they take turns (people who wandered off are skipped). */
  #nextReader(side) {
    const here = this.#here(side);
    const pool = here.length ? here : this.#members(side);
    if (!pool.length) return null;
    const p = pool[this.readerN[side] % pool.length];
    this.readerN[side] += 1;
    return p.id;
  }
  #deal() {
    if (this.#isRace()) { this.#dealRace(); return; }
    const side = this.turn;
    const reading = SIDES[side].other;
    const d = this.#deckFor(side, this.spaceFor(side));
    const item = this.#draw(d, this.deck[SIDES[side].asks][d]);
    this.cardN += 1;
    const c = {
      n: this.cardN, deck: d, about: reading, reader: this.#nextReader(reading),
      stage: 'read', challenged: false, votes: {}, voteOrder: [], secret: null, pick: null, actor: null,
    };
    if (d === 'moves') c.m = item.m;
    else { c.q = item.q; if (item.choices) c.choices = item.choices.slice(); if (d !== 'lives') c.a = item.a; }
    if (item.cat) c.cat = item.cat;
    if (item.img) c.img = item.img;
    this.card = c;
    this.result = null;
    this.trophyWon = null;
    this.timer = null;
    this.phase = 'card';
    if (d === 'lives') c.stage = 'secret';
    if (d === 'moves') {
      const actors = this.#here(side).length ? this.#here(side) : this.#members(side);
      if (actors.length === 1) this.#act(actors[0].id); else c.stage = 'pick';
    }
    this.#changed();
  }
  /** The two actors are set: both read what to act out on their phones, and the clock waits for them. */
  #act(actorId) {
    const c = this.card;
    c.actor = actorId;
    c.stage = 'ready';
    c.ready = {};
  }
  /** The two who act out the charade (the reader and the picked actor). */
  #actors() { const c = this.card; return [c.reader, c.actor].filter(Boolean); }
  /** An actor has read the card and is ready. The clock starts once both are (someone who wandered off is not waited for). */
  movesReady(by) {
    const c = this.card;
    if (this.phase !== 'card' || c?.stage !== 'ready') fail('No charade to start right now');
    if (by !== 'host') {
      if (!this.#actors().includes(by.id)) fail('Only the two actors can start the clock');
      c.ready = { ...(c.ready ?? {}), [by.id]: true };
    }
    const waiting = this.#actors().filter((id) => !c.ready?.[id] && this.room.connected.has(id));
    if (by === 'host' || !waiting.length) this.#startMoves();
    this.#changed();
  }
  #startMoves() {
    this.card.stage = 'act';
    this.#setTimer(T.moves, () => this.#movesDone(null, true), 'moves');
  }
  /** Who guesses an Our Lives card: the team at play, or, on a challenge, the reader's teammates. */
  #guessers() {
    const c = this.card;
    if (!c) return [];
    if (!c.challenged) return this.#members(this.turn).map((p) => p.id);
    return this.#members(c.about).map((p) => p.id).filter((id) => id !== c.reader);
  }
  /** Who holds the card and judges a spoken answer: only the reader, as with the real card, so nobody else on the
   *  readers' team knows the answer before a challenge throws it back at them. If the reader has wandered off, the
   *  rest of the readers' team can judge, or on a challenge the team that challenged. */
  #judges() {
    const c = this.card;
    if (!c) return [];
    if (c.reader && this.room.connected.has(c.reader)) return [c.reader];
    return this.#members(c.challenged ? this.turn : c.about).map((p) => p.id);
  }
  #judgeSide() { return this.card?.challenged && !this.room.connected.has(this.card.reader) ? this.turn : this.card?.about; }
  #mayJudge(by) { return by === 'host' || (!!by?.id && this.#judges().includes(by.id)); }

  /** Right or wrong, for an Our Facts, Stuff or Pics card (the reader's phone, or the host). */
  judge(by, right) {
    const c = this.card;
    if (this.phase !== 'card' || !c || c.stage !== 'read') fail('Nothing to judge right now');
    if (!this.#mayJudge(by)) fail(this.room.connected.has(c.reader) ? 'The reader judges this one' : `The ${this.#name(this.#judgeSide())} judge this one`);
    this.#answered(!!right);
  }
  /** The reader secretly picks the true answer about themselves on an Our Lives card. */
  secretPick(player, choice) {
    const c = this.card;
    if (this.phase !== 'card' || c?.stage !== 'secret') fail('Nothing to pick right now');
    const mine = player.id === c.reader || (!this.room.connected.has(c.reader) && this.#sideOf(player) === c.about);
    if (!mine) fail(`${this.#pname(c.reader)} picks this one`);
    const v = int(choice);
    if (!(v >= 0 && v < 3)) fail('Pick A, B or C');
    c.secret = v;
    c.reader = player.id;
    c.stage = 'guess';
    this.#changed();
  }
  /** A guess on an Our Lives card (people can change their mind until it locks). */
  vote(player, choice) {
    const c = this.card;
    if (this.phase !== 'card' || c?.stage !== 'guess') fail('Nothing to guess right now');
    if (!this.#guessers().includes(player.id)) fail(c.challenged ? `The ${this.#name(c.about)} are guessing this one` : `It is the ${this.#name(this.turn)}’ guess. Keep a straight face!`);
    const v = int(choice);
    if (!(v >= 0 && v < 3)) fail('Pick A, B or C');
    c.votes[player.id] = v;
    c.voteOrder = [...c.voteOrder.filter((x) => x !== player.id), player.id];
    const here = this.#guessers().filter((id) => this.room.connected.has(id));
    if (here.every((id) => id in c.votes)) this.#lockGuess(); else this.#changed();
  }
  /** The team's guess: the most votes; a tie goes to whichever of the tied answers was picked first. */
  teamPick() {
    const c = this.card;
    const counts = new Map();
    for (const v of Object.values(c?.votes ?? {})) counts.set(v, (counts.get(v) ?? 0) + 1);
    if (!counts.size) return null;
    const best = Math.max(...counts.values());
    const tied = new Set([...counts].filter(([, n]) => n === best).map(([v]) => v));
    for (const id of c.voteOrder) if (tied.has(c.votes[id])) return c.votes[id];
    return [...tied][0];
  }
  #lockGuess() {
    const c = this.card;
    if (this.phase !== 'card' || c?.stage !== 'guess') return;
    c.pick = this.teamPick();
    this.#answered(c.pick !== null && c.pick === c.secret);
  }
  /** The reader picks who on the answering team acts out the charade with them. */
  pickActor(by, pid) {
    const c = this.card;
    if (this.phase !== 'card' || c?.stage !== 'pick') fail('No actor to pick right now');
    if (by !== 'host' && this.#sideOf(by) !== c.about) fail(`${this.#pname(c.reader)} picks the actor`);
    const id = String(pid ?? '');
    if (!this.#members(this.turn).some((p) => p.id === id)) fail(`Pick someone on the ${this.#name(this.turn)}`);
    this.#act(id);
    this.#changed();
  }
  /** Who shouted the charade first: a side, or nobody. */
  movesWinner(by, side) {
    const c = this.card;
    if (this.phase !== 'card' || c?.stage !== 'act') fail('No charade right now');
    if (by !== 'host' && this.#sideOf(by) !== c.about) fail(`The ${this.#name(c.about)} call this one`);
    if (side && !SIDES[side]) fail('Pick the Guys, the Gals or nobody');
    this.#movesDone(side || null, false);
  }
  #movesDone(side, timeout) {
    const at = this.turn;
    if (side === at) this.#outcome({ right: true, moveSide: at, next: at, timeout });
    else if (side) this.#outcome({ right: false, moveSide: side, next: side, timeout, stolen: true });
    else this.#outcome({ right: false, moveSide: null, next: SIDES[at].other, timeout });
  }
  /** The team at play throws the card back at the readers' team. */
  challenge(player) {
    const c = this.card;
    const side = this.#sideOf(player);
    if (this.phase !== 'card' || !c) fail('No card to challenge');
    if (this.#isRace()) fail('There are no challenges in the race');
    if (!this.settings.challenges) fail('Challenges are turned off');
    if (side !== this.turn) fail('Only the team at play can challenge');
    if (c.challenged) fail('This card is already challenged');
    if (c.deck === 'moves') fail('Our Moves cards can’t be challenged');
    if (c.stage !== 'read' && c.stage !== 'guess') fail('Wait for the reader to pick first');
    if (this.tokens[side] <= 0) fail('No challenge tokens left');
    if (!this.#members(c.about).some((p) => p.id !== c.reader)) fail(`The ${this.#name(c.about)} need someone besides the reader to answer it`);
    this.tokens[side] -= 1;
    c.challenged = true;
    c.votes = {}; c.voteOrder = [];
    this.#note(`The ${this.#name(side)} challenge the ${this.#name(c.about)}!`);
    this.#changed();
  }
  /** A spoken answer or a guess was right or wrong: who it counts for depends on a challenge. */
  #answered(right) {
    if (this.#isRace()) { this.#raceAnswered(right); return; }
    const c = this.card;
    const at = this.turn;
    if (!c.challenged) {
      if (right) this.#outcome({ right: true, moveSide: at, next: at });
      else this.#outcome({ right: false, moveSide: null, next: SIDES[at].other });
    } else if (right) this.#outcome({ right: true, moveSide: c.about, next: c.about });   // the challenged team got it
    else this.#outcome({ right: false, moveSide: at, next: at });                           // they missed: it's ours
  }
  /** On a multiple choice trivia card, which of A, B and C is right (null on every other card). */
  #rightChoice(c) { const i = c.choices && c.deck !== 'lives' ? c.choices.indexOf(c.a) : -1; return i < 0 ? null : i; }
  /** The trophy moves (or a team wins it), the answer shows, and then the next card. */
  #outcome({ right, moveSide, next, timeout = false, stolen = false }) {
    const c = this.card;
    const from = this.pos;
    let trophy = null;
    if (moveSide) {
      if (this.spaceFor(moveSide) >= GREEN) trophy = moveSide;
      else this.pos += SIDES[moveSide].dir;
      this.lastMove = { from, to: this.pos, n: (this.lastMove?.n ?? 0) + 1, side: moveSide, trophy: !!trophy };
    }
    this.result = {
      right, moved: moveSide, trophy, next, timeout, stolen, challenged: !!c.challenged,
      answer: c.deck === 'moves' ? c.m : c.deck === 'lives' ? (c.secret === null ? null : c.choices[c.secret]) : c.a,
      secret: c.deck === 'lives' ? c.secret ?? null : this.#rightChoice(c), pick: c.pick ?? null,
    };
    c.stage = 'done';
    this.phase = 'result';
    const at = this.turn;
    if (c.deck === 'moves') this.#note(moveSide ? `The ${this.#name(moveSide)} got the charade` : 'Nobody got the charade');
    else if (c.challenged) this.#note(right ? `The ${this.#name(c.about)} beat the challenge` : `The ${this.#name(c.about)} missed the challenge`);
    else this.#note(right ? `The ${this.#name(at)} got it right` : `The ${this.#name(at)} missed`);
    // A right answer on a spoken card keeps the same team going, so it gets a quick beat (everyone just heard it was
    // right); a miss, a challenge, a charade, a secret or a trophy holds long enough to read the answer.
    const quick = right && !trophy && !c.challenged && ['facts', 'stuff', 'pics'].includes(c.deck);
    this.#setTimer(quick ? T.right : T.result, () => (trophy ? this.#winTrophy(trophy) : this.#next(next)));
    this.#changed();
  }
  #next(side) {
    this.turn = side;
    this.#deal();
  }
  #winTrophy(side) {
    this.trophies[side] += 1;
    this.#score();
    this.trophyWon = side;
    this.phase = 'trophy';
    this.card = null;
    this.result = null;
    this.#note(`The ${this.#name(side)} win trophy ${this.trophyN}!`);
    if (this.trophies[side] >= this.settings.target) {
      this.winners = [side];
      this.#setTimer(T.trophy, () => this.#end());
    } else {
      this.#setTimer(T.trophy, () => this.#newTrophy(side));
    }
    this.#changed();
  }
  /** A new trophy on START, and the team that didn't win the last one to play. */
  #newTrophy(lastWinner) {
    this.trophyN += 1;
    this.pos = 0;
    this.lastMove = null;
    this.#next(SIDES[lastWinner]?.other ?? FIRST);
  }
  #end() {
    this.phase = 'gameover';
    this.timer = null;
    this.card = null;
    this.#changed();
  }

  // ---------- the pawn race ----------
  #newRace() {
    const pawns = () => Array.from({ length: this.settings.pawns }, (_, i) => ({ at: 0, row: null, state: i ? 'wait' : 'board' }));
    this.race = { len: RACE_LEN, pawns: { guys: pawns(), gals: pawns() }, captured: { guys: false, gals: false }, skip: { guys: false, gals: false }, toss: null };
  }
  /** Where a side's pawn is on the track, counted from the Guys' START (0) to the Gals' (RACE_LEN + 1). */
  raceX(side, at) { return side === 'guys' ? at : RACE_LEN + 1 - at; }
  #pawn(side) { return this.race.pawns[side].find((p) => p.state === 'board') ?? null; }
  /**
   * The spaces a side's pawn can step onto next: the columns are staggered (odd ones, counted from the Guys' START, sit
   * half a space higher), so a space touches two in the next column, the one up and the one down. From START it is any
   * space in the first column. Empty when the next step is across. The TVs draw the same stagger: keep them in step.
   */
  #steps(side) {
    const p = this.#pawn(side);
    if (!p || p.at >= RACE_LEN) return [];
    const x = this.raceX(side, p.at + 1);
    const all = Array.from({ length: RACE_ROWS }, (_, i) => i);
    const rows = p.at === 0 || !Number.isInteger(p.row) ? all : (x % 2 ? [p.row, p.row + 1] : [p.row - 1, p.row]).filter((r) => r >= 0 && r < RACE_ROWS);
    const other = SIDES[side].other;
    const theirs = this.#pawn(other);
    const wild = SIDE_ORDER.find((s) => RACE_WILD[s].includes(x));
    return rows.map((row, i) => {
      const step = { k: 'ABCDEF'[i], x, row };
      if (wild) step.wild = wild;
      if (theirs && theirs.at > 0 && this.raceX(other, theirs.at) === x && theirs.row === row) step.pawn = true;
      return step;
    });
  }
  /** The step taken when nobody picks in time: toward the middle of the board. */
  #defaultStep(steps) {
    const mid = (RACE_ROWS - 1) / 2;
    return steps.reduce((best, s) => (Math.abs(s.row - mid) < Math.abs(best.row - mid) ? s : best), steps[0]);
  }
  /** The team at play (or the host) picks which space its pawn steps onto after a right answer. */
  pickSpace(by, k) {
    const c = this.card;
    if (this.phase !== 'card' || !this.#isRace() || c?.stage !== 'move') fail('There is no space to pick right now');
    if (by !== 'host' && this.#sideOf(by) !== this.turn) fail(`The ${this.#name(this.turn)} pick the space`);
    const step = (c.moves ?? []).find((s) => s.k === String(k ?? '').toUpperCase()) ?? fail('Pick one of the lit spaces');
    this.#raceResolve(true, step.row);
  }
  /** Three questions from the decks the answering side plays (Our Facts, Stuff and Pics), read by the other team. */
  #dealRace() {
    const side = this.turn;
    const reading = SIDES[side].other;
    const piles = this.deck[SIDES[side].asks];
    // The classic race cards are plain question cards: three questions and answers, no pictures.
    const decks = ['facts', 'stuff'].filter((d) => piles[d].length);
    const qs = [];
    for (let i = 0; i < RACE_QUESTIONS; i++) {
      const d = decks[Math.floor(this.room.rng() * decks.length)] ?? 'facts';
      const item = this.#draw(d, piles[d]);
      if (item) qs.push({ deck: d, ...item });
    }
    this.cardN += 1;
    this.card = { n: this.cardN, about: reading, reader: this.#nextReader(reading), stage: 'read', challenged: false, votes: {}, voteOrder: [], secret: null, pick: null, actor: null, qs, i: 0, right: 0 };
    this.#raceQuestion();
    this.result = null;
    this.timer = null;
    this.phase = 'card';
    this.#changed();
  }
  /** Puts the card's current question up (each one counts as a new card for the screens). */
  #raceQuestion() {
    const c = this.card;
    const q = c.qs[c.i];
    for (const k of ['q', 'a', 'cat', 'img', 'choices']) delete c[k];
    Object.assign(c, { deck: q.deck, q: q.q, a: q.a, stage: 'read' });
    if (q.cat) c.cat = q.cat;
    if (q.img) c.img = q.img;
    if (q.choices) c.choices = q.choices.slice();
  }
  /** Moves a side's pawn on the board (negative: back toward its START). Returns true if it got across. */
  #movePawn(side, n, row = null) {
    const p = this.#pawn(side);
    if (!p) return false;
    const from = p.at;
    p.at = Math.max(0, Math.min(RACE_LEN + 1, p.at + n));
    // Its space in the column: the one picked, else the row it was on (a wild card off START: a middle row).
    if (p.at === 0 || p.at > RACE_LEN) p.row = null;
    else if (Number.isInteger(row)) p.row = row;
    else if (!Number.isInteger(p.row)) p.row = side === 'guys' ? 2 : 3;
    if (p.at !== from) this.lastMove = { from: this.raceX(side, from), to: this.raceX(side, p.at), n: (this.lastMove?.n ?? 0) + 1, side, trophy: false };
    if (p.at < RACE_LEN + 1) return false;
    p.state = 'home';
    // The next pawn starts: a prisoner is freed back to START first, or the one waiting comes on.
    const next = this.race.pawns[side].find((x) => x.state === 'jail') ?? this.race.pawns[side].find((x) => x.state === 'wait');
    if (next) { next.state = 'board'; next.at = 0; next.row = null; }
    return true;
  }
  #raceWon(side) { return this.race.pawns[side].every((p) => p.state === 'home'); }
  /** A wild card from `owner`'s pile, used at once. */
  #wild(owner) {
    const cards = WILD_CARDS[owner];
    const card = cards[Math.floor(this.room.rng() * cards.length)];
    const other = SIDES[owner].other;
    const text = card.text.replaceAll('{O}', this.#name(owner)).replaceAll('{X}', this.#name(other));
    let crossed = null;
    if (card.kind === 'ahead' && this.#movePawn(owner, card.n)) crossed = owner;
    if (card.kind === 'back') this.#movePawn(other, -card.n);
    if (card.kind === 'skip') this.race.skip[other] = true;
    this.#note(text);
    return { owner, kind: card.kind, n: card.n ?? 0, text, crossed };
  }
  /** Ending a turn on the very space the other team's pawn stands on takes it prisoner, once a game, while they still have a pawn waiting. */
  #capture(side) {
    const other = SIDES[side].other;
    const mine = this.#pawn(side);
    const theirs = this.#pawn(other);
    if (!mine || !theirs || this.race.captured[side] || mine.at === 0 || theirs.at === 0) return null;
    if (this.raceX(side, mine.at) !== this.raceX(other, theirs.at) || mine.row !== theirs.row) return null;
    const waiting = this.race.pawns[other].find((p) => p.state === 'wait');
    if (!waiting) return null;
    theirs.state = 'jail';
    theirs.at = 0;
    theirs.row = null;
    waiting.state = 'board';
    waiting.at = 0;
    waiting.row = null;
    this.race.captured[side] = true;
    this.#note(`The ${this.#name(side)} take a ${this.#name(other)} pawn prisoner!`);
    return other;
  }
  #raceAnswered(right) {
    const c = this.card;
    const steps = right ? this.#steps(this.turn) : [];
    if (steps.length > 1) {
      // Right: the team picks where to step, on their phones (the lit spaces on the TV). Nobody picking is no hold-up.
      c.stage = 'move';
      c.moves = steps;
      this.#note(`The ${this.#name(this.turn)} got it right`);
      this.#setTimer(T.move, () => this.#raceResolve(true, this.#defaultStep(steps).row), 'move');
      this.#changed();
      return;
    }
    if (right) this.#note(`The ${this.#name(this.turn)} got it right`);
    this.#raceResolve(right, steps[0]?.row ?? null);
  }
  /** A judged question plays out: the pawn steps onto `row` of the next column, then wild cards, prisoners, the turn. */
  #raceResolve(right, row) {
    const c = this.card;
    const side = this.turn;
    delete c.moves;
    const r = { right, moved: null, trophy: null, next: side, timeout: false, stolen: false, challenged: false, answer: c.a, secret: this.#rightChoice(c), pick: null, more: false, q: c.i + 1 };
    let crossed = null;
    if (right) {
      c.right += 1;
      r.moved = side;
      if (this.#movePawn(side, 1, row)) crossed = side;
      else {
        // Your own side's wild space: draw at once, and keep answering.
        const p = this.#pawn(side);
        if (p && RACE_WILD[side].includes(this.raceX(side, p.at))) r.wild = this.#wild(side);
      }
    } else this.#note(`The ${this.#name(side)} missed`);
    crossed = crossed ?? r.wild?.crossed ?? null;
    r.more = right && !crossed && c.i + 1 < c.qs.length && !SIDE_ORDER.some((s) => this.#raceWon(s));
    if (!r.more && !SIDE_ORDER.some((s) => this.#raceWon(s))) {
      // The turn is over: the other side's wild space, then a prisoner.
      const p = this.#pawn(side);
      const other = SIDES[side].other;
      if (!r.wild && p && p.at > 0 && RACE_WILD[other].includes(this.raceX(side, p.at))) {
        r.wild = this.#wild(other);
        crossed = crossed ?? r.wild.crossed;
      }
      if (!SIDE_ORDER.some((s) => this.#raceWon(s))) r.captured = this.#capture(side);
      let next = other;
      if (this.race.skip[next]) { this.race.skip[next] = false; next = side; this.#note(`The ${this.#name(other)} sit this one out`); }
      r.next = next;
    }
    if (crossed) r.crossed = crossed;
    if (!r.captured) delete r.captured;
    if (!r.wild) delete r.wild;
    const won = SIDE_ORDER.find((s) => this.#raceWon(s));
    if (won) { this.winners = [won]; r.won = won; }
    this.result = r;
    c.stage = 'done';
    this.phase = 'result';
    // The next question on the same card follows quickly; a wild card or a prisoner needs reading time.
    this.#setTimer(r.wild || r.captured ? T.wild : r.more ? T.right : T.result, () => this.#raceAfter());
    this.#changed();
  }
  #raceAfter() {
    const r = this.result;
    if (this.winners.length) { this.#end(); return; }
    if (r?.more) {
      const c = this.card;
      c.i += 1;
      this.cardN += 1;
      c.n = this.cardN;
      this.#raceQuestion();
      this.result = null;
      this.phase = 'card';
      this.#changed();
      return;
    }
    this.#next(r?.next ?? SIDES[this.turn].other);
  }
  #raceView() {
    const r = this.race;
    return {
      len: r.len, wild: { guys: RACE_WILD.guys.slice(), gals: RACE_WILD.gals.slice() }, toss: r.toss,
      pawns: Object.fromEntries(SIDE_ORDER.map((s) => [s, r.pawns[s].map((p) => ({ at: p.at, x: this.raceX(s, p.at), row: Number.isInteger(p.row) ? p.row : null, state: p.state }))])),
      rows: RACE_ROWS,
      // Where the team at play can step if it gets this question right (lettered once it is picking).
      steps: this.phase === 'card' && this.turn ? this.#steps(this.turn) : [],
      captured: { ...r.captured }, skip: { ...r.skip },
    };
  }

  // ---------- the host and the TV ----------
  /** Moves things along: locks in the guesses now, or skips the wait after a result or a trophy. */
  advance() {
    if (this.phase === 'card' && this.card?.stage === 'guess') { this.#lockGuess(); return; }
    if (this.phase === 'card' && this.card?.stage === 'ready') { this.movesReady('host'); return; }
    if (this.phase === 'card' && this.card?.stage === 'move') { const t = this.timer; this.timer = null; t?.fire(); return; }
    if (this.phase === 'result' || this.phase === 'trophy') { const t = this.timer; this.timer = null; t?.fire(); }
  }
  /** The host throws out a card (a dud, or one nobody could know) and deals the same team another. */
  newCard() {
    if (this.phase !== 'card') fail('There is no card to change');
    if (this.#isRace()) {
      // A dud question: another from the same pile in its place.
      const c = this.card;
      if (c.stage === 'move') fail('That one is answered: pick a space first');
      const piles = this.deck[SIDES[this.turn].asks];
      const item = this.#draw(c.deck, piles[c.deck]);
      if (item) c.qs[c.i] = { deck: c.deck, ...item };
      this.cardN += 1;
      c.n = this.cardN;
      this.#raceQuestion();
      this.#changed();
      return;
    }
    if (this.card?.challenged) this.tokens[this.turn] = Math.min(CHALLENGES, this.tokens[this.turn] + 1);
    const reading = SIDES[this.turn].other;
    this.readerN[reading] = Math.max(0, this.readerN[reading] - 1);   // the same reader again
    this.#deal();
  }
  /** The host nudges the trophy one space (a judgement call, a mistake). */
  nudge(delta, side) {
    if (this.phase === 'lobby' || this.phase === 'gameover') fail('Only during a game');
    if (this.#isRace()) {
      const s = SIDES[side] ? side : this.turn;
      const d = int(delta);
      if (![-1, 1].includes(d)) fail('Move one space at a time');
      this.#movePawn(s, d);
      if (this.#raceWon(s)) { this.winners = [s]; this.#end(); return; }
      this.#changed();
      return;
    }
    const d = int(delta);
    if (![-1, 1].includes(d)) fail('Move one space at a time');
    const from = this.pos;
    this.pos = Math.max(-GREEN, Math.min(GREEN, this.pos + d));
    if (this.pos !== from) this.lastMove = { from, to: this.pos, n: (this.lastMove?.n ?? 0) + 1, side: d > 0 ? 'gals' : 'guys', trophy: false };
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
  setTarget(n) {
    this.#lobby();
    const v = int(n);
    if (!TARGETS.includes(v)) fail('Play to 1, 2 or 3 trophies');
    this.settings.target = v;
    this.#changed();
  }
  setChallenges(on) { this.#lobby(); this.settings.challenges = !!on; this.#changed(); }
  /** The tug of war for trophies, or the pawn race. */
  setMode(mode) {
    this.#lobby();
    if (!MODES.includes(mode)) fail('Pick the tug of war or the race');
    this.settings.mode = mode;
    this.#changed();
  }
  setPawns(n) {
    this.#lobby();
    const v = int(n);
    if (!PAWN_COUNTS.includes(v)) fail('One or two pawns each');
    this.settings.pawns = v;
    this.#changed();
  }
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
      case 'newCard': case 'newQuestion': return this.newCard();
      case 'judge': return this.judge('host', a.right === true);
      case 'moves': return this.movesWinner('host', a.side ? String(a.side) : null);
      case 'actor': return this.pickActor('host', a.pid);
      case 'movesReady': return this.movesReady('host');
      case 'space': return this.pickSpace('host', a.k);
      case 'nudge': return this.nudge(a.delta, a.side ? String(a.side) : null);
      case 'endGame': case 'playAgain': return this.endGame();
      case 'setSet': return this.setSet(a.id);
      case 'setTarget': return this.setTarget(a.n);
      case 'setChallenges': return this.setChallenges(a.on);
      case 'setRules': return this.setMode(String(a.mode ?? ''));
      case 'setPawns': return this.setPawns(a.n);
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
      case 'new-card':
        if (!this.#starter(player.id) && !this.#stuck()) fail('Only the host can do that');
        this.newCard();
        return undefined;
      case 'side': this.setSide(player, String(msg.side ?? '')); return undefined;
      case 'mode':
        if (!this.#starter(player.id)) fail('Only the host can do that');
        this.setMode(String(msg.mode ?? ''));
        return undefined;
      case 'set':
        if (!this.#starter(player.id)) fail('Only the host can do that');
        this.setSet(msg.id);
        return undefined;
      case 'judge': this.judge(player, msg.right === true); return undefined;
      case 'secret': this.secretPick(player, msg.choice); return undefined;
      case 'vote': this.vote(player, msg.choice); return { t: 'ack', what: 'vote' };
      case 'actor': this.pickActor(player, msg.pid); return undefined;
      case 'ready': this.movesReady(player); return undefined;
      case 'space': this.pickSpace(player, msg.k); return undefined;
      case 'moves': this.movesWinner(player, msg.side ? String(msg.side) : null); return undefined;
      case 'challenge': this.challenge(player); return undefined;
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
    const c = this.card;
    const who = this.turn ? `The ${this.#name(this.turn)}` : '';
    const reader = c ? this.#pname(c.reader) : '';
    switch (this.phase) {
      case 'lobby': return { text: 'Pick your side!', next: 'Guys on one team, Gals on the other' };
      case 'card': {
        if (this.#isRace() && c.stage === 'move') return { text: 'Right!', next: `${who} pick a space to step onto, on their phones` };
        if (this.#isRace()) return { text: `${who}: question ${c.i + 1} of ${c.qs.length}`, next: `${reader} reads. Say your answer out loud!` };
        if (c.deck === 'moves') {
          if (c.stage === 'pick') return { text: `${who}: Our Moves`, next: `${reader} picks someone on the ${this.#name(this.turn)} to act with` };
          if (c.stage === 'ready') return { text: 'Get ready!', next: `${reader} and ${this.#pname(c.actor)} read what to act out. The clock starts when both press Start` };
          return { text: 'Act it out!', next: `${reader} and ${this.#pname(c.actor)} act out the same thing. Shout it first!` };
        }
        if (c.challenged) {
          return c.deck === 'lives'
            ? { text: 'Challenge!', next: `The ${this.#name(c.about)} guess what ${reader} picked, on their phones` }
            : { text: 'Challenge!', next: `The ${this.#name(c.about)} answer it themselves, no help from ${reader}` };
        }
        if (c.stage === 'secret') return { text: `${who}: Our Lives`, next: `${reader} secretly picks the true answer` };
        if (c.stage === 'guess') return { text: `${who}: Our Lives`, next: `Guess what ${reader} picked, on your phones` };
        return { text: `${who}: ${DECKS[c.deck].name}`, next: `${reader} reads. Say your answer out loud!` };
      }
      case 'result': {
        const r = this.result;
        if (this.#isRace()) {
          if (r.won) return { text: `The ${this.#name(r.won)} win the race!`, next: '' };
          if (r.captured) return { text: 'Prisoner!', next: `A ${this.#name(r.captured)} pawn is taken prisoner` };
          if (r.wild) return { text: 'Wild card!', next: r.wild.text };
          if (r.crossed) return { text: 'Across!', next: `A ${this.#name(r.crossed)} pawn made it to the other side` };
          if (r.right) return { text: 'Right!', next: r.more ? `${who} keep going` : `Over to the ${this.#name(r.next)}` };
          return { text: 'Wrong!', next: `Over to the ${this.#name(r.next)}` };
        }
        if (r.trophy) return { text: 'Trophy!', next: `The ${this.#name(r.trophy)} pull it into their winner’s circle` };
        if (c?.deck === 'moves') {
          return r.moved
            ? { text: r.stolen ? 'Stolen!' : 'Got it!', next: `The trophy moves toward the ${this.#name(r.moved)}` }
            : { text: r.timeout ? 'Time’s up!' : 'Nobody got it', next: `Over to the ${this.#name(r.next)}` };
        }
        if (r.challenged) return { text: r.right ? 'Challenge beaten!' : 'Challenge won!', next: `The trophy moves toward the ${this.#name(r.moved)}` };
        return r.right ? { text: 'Right!', next: `${who} keep going` } : { text: 'Wrong!', next: `Over to the ${this.#name(r.next)}` };
      }
      case 'trophy': return { text: `The ${this.#name(this.trophyWon)} win a trophy!`, next: this.winners.length ? '' : 'A new trophy goes on START' };
      default: return { text: `The ${this.#name(this.winners[0])} win!`, next: '' };
    }
  }
  #teamsView() {
    return SIDE_ORDER.map((side) => {
      const t = this.#team(side);
      const members = this.#members(side);
      return {
        side, id: t?.id ?? null, name: this.#name(side), color: t?.color ?? SIDES[side].color,
        trophies: this.trophies[side], challenges: this.tokens[side],
        members: members.map((p) => ({ id: p.id, name: p.name, connected: this.room.connected.has(p.id), picked: !!this.picked[p.id] })),
        connected: members.some((p) => this.room.connected.has(p.id)),
      };
    });
  }
  #cardView() {
    const c = this.card;
    if (!c) return null;
    const v = {
      n: c.n, deck: c.deck, deckName: DECKS[c.deck].name, about: c.about, stage: c.stage, challenged: c.challenged,
      reader: { id: c.reader, name: this.#pname(c.reader) },
    };
    if (c.actor) v.actor = { id: c.actor, name: this.#pname(c.actor) };
    if (c.stage === 'ready') v.ready = Object.keys(c.ready ?? {});
    if (c.stage === 'move') { v.moves = (c.moves ?? []).map((s) => ({ ...s })); v.answer = c.a; }
    if (c.deck !== 'moves') v.text = c.q;
    if (c.cat) v.cat = c.cat;
    if (c.img) v.img = c.img;
    if (c.choices) v.choices = c.choices.slice();
    if (c.deck === 'lives') {
      v.guessers = this.#guessers();
      v.voters = Object.keys(c.votes);
    }
    if (this.phase === 'result' && this.result) v.answer = this.result.answer;
    if (c.qs) { v.q = c.i + 1; v.of = c.qs.length; }
    return v;
  }
  publicView() {
    const v = {
      game: GAME, scoreFormat: 'none', lobbyTitle: NAME,
      phase: this.phase, status: this.phase, hosted: this.room.hosts > 0,
      pos: this.pos, green: GREEN, path: this.#path(), greenColor: GREEN_COLOR, first: FIRST,
      decks: DECK_ORDER.filter((id) => id !== 'lives' || this.#hasLives()).map((id) => ({ id, ...DECKS[id] })),
      teams: this.#teamsView(), turn: this.turn, trophy: this.trophyN, target: this.settings.target,
      settings: { ...this.settings }, mode: this.settings.mode,
      line: this.#line(),
      timer: this.#timerView(),
      reactions: this.reactions.map(({ id, e, side, name }) => ({ id, e, side, name })),
      reactionList: REACTIONS,
      targets: TARGETS.slice(),
      log: this.log.slice(),
    };
    if (this.lastMove) v.lastMove = { ...this.lastMove };
    if (this.race && this.phase !== 'lobby') v.race = this.#raceView();
    if (this.phase === 'lobby') {
      v.sets = this.room.listContent(GAME).map((s) => ({ id: s.id, title: s.title })).slice(0, 40);
      v.setTitle = this.settings.setId === ALL_SETS ? 'All question sets' : (this.room.listContent(GAME).find((s) => s.id === this.settings.setId)?.title ?? '');
    }
    const card = this.#cardView();
    if (card && (this.phase === 'card' || this.phase === 'result')) v.card = card;
    if (this.phase === 'result' && this.result) v.result = { ...this.result };
    if (this.phase === 'trophy' || this.phase === 'gameover') v.trophyWon = this.trophyWon ?? this.winners[0] ?? null;
    if (this.phase === 'gameover') v.winners = this.winners.slice();
    return v;
  }
  playerView(player) {
    const v = this.publicView();
    const side = this.#sideOf(player);
    const c = this.card;
    const me = { id: player.id, side, picked: !!this.picked[player.id], canStart: this.#starter(player.id), stuck: this.#stuck(), myTurn: !!side && side === this.turn };
    if (c && this.phase === 'card') {
      const reading = c.about;
      me.reader = c.reader === player.id;
      me.actor = c.actor === player.id;
      if (c.stage === 'read') {
        me.canJudge = this.#judges().includes(player.id);
        if (me.canJudge) me.answer = c.a;
      }
      if (c.stage === 'secret') me.canPick = me.reader || (!this.room.connected.has(c.reader) && side === reading);
      if (c.stage === 'guess') {
        me.canGuess = this.#guessers().includes(player.id);
        if (player.id in c.votes) me.vote = c.votes[player.id];
        // Only the reader knows what they picked, so a challenge can throw it back at their own team.
        if (me.reader || (side === reading && !this.room.connected.has(c.reader) && !c.challenged)) me.secret = c.secret;
      }
      if (c.stage === 'pick') {
        me.canPickActor = side === reading;
        if (me.canPickActor) me.actors = this.#members(this.turn).map((p) => ({ id: p.id, name: p.name }));
      }
      if (c.stage === 'ready' && (me.reader || me.actor)) {
        me.move = c.m;
        me.canReady = true;
        me.ready = !!c.ready?.[player.id];
      }
      if (c.stage === 'move') me.canMove = side === this.turn;
      if (c.stage === 'act') {
        me.canCall = side === reading;
        if (me.reader || me.actor) me.move = c.m;
      }
      me.canChallenge = !!(!this.#isRace() && this.settings.challenges && side === this.turn && !c.challenged && c.deck !== 'moves'
        && (c.stage === 'read' || c.stage === 'guess') && this.tokens[side] > 0
        && this.#members(reading).some((p) => p.id !== c.reader));
    }
    v.me = me;
    return v;
  }
  hostView() {
    const v = this.publicView();
    const c = this.card;
    if (v.card && c) {
      if (c.a) v.card.answer = c.a;
      if (c.m) v.card.move = c.m;
      if (c.secret !== null) v.card.secret = c.secret;
      if (c.stage === 'pick') v.card.actors = this.#members(this.turn).map((p) => ({ id: p.id, name: p.name }));
    }
    return v;
  }

  // ---------- saving ----------
  toJSON() {
    return {
      settings: this.settings, picked: this.picked, phase: this.phase, turn: this.turn, pos: this.pos, trophies: this.trophies,
      tokens: this.tokens, readerN: this.readerN, card: this.card, result: this.result, trophyWon: this.trophyWon,
      lastMove: this.lastMove, winners: this.winners, cardN: this.cardN, trophyN: this.trophyN, log: this.log, race: this.race,
    };
  }
  restore(d) {
    this.#reset();
    this.settings = { setId: DEFAULT_SET, target: DEFAULT_TARGET, challenges: true, mode: 'trophy', pawns: 2, ...(d.settings ?? {}) };
    if (!TARGETS.includes(this.settings.target)) this.settings.target = DEFAULT_TARGET;
    if (!MODES.includes(this.settings.mode)) this.settings.mode = 'trophy';
    if (!PAWN_COUNTS.includes(this.settings.pawns)) this.settings.pawns = 2;
    this.picked = d.picked ?? {};
    const valid = ['lobby', 'card', 'result', 'trophy', 'gameover'];
    this.phase = valid.includes(d.phase) ? d.phase : 'lobby';
    Object.assign(this, {
      turn: SIDES[d.turn] ? d.turn : null, pos: Math.max(-GREEN, Math.min(GREEN, int(d.pos) || 0)),
      trophies: { guys: 0, gals: 0, ...(d.trophies ?? {}) }, tokens: { guys: CHALLENGES, gals: CHALLENGES, ...(d.tokens ?? {}) },
      readerN: { guys: 0, gals: 0, ...(d.readerN ?? {}) }, card: d.card ?? null, result: d.result ?? null,
      trophyWon: d.trophyWon ?? null, lastMove: d.lastMove ?? null, winners: d.winners ?? [], cardN: d.cardN ?? 0,
      trophyN: d.trophyN ?? 1, log: d.log ?? [], race: d.race ?? null,
    });
    if (this.#isRace() && this.phase !== 'lobby' && !this.race?.pawns) { this.phase = 'lobby'; return; }
    if (this.phase === 'lobby' || this.phase === 'gameover') return;
    if (!this.turn) { this.phase = 'lobby'; return; }
    this.#buildDeck();
    // Timers do not survive a restart: pick up where things were, as near as we can.
    if (this.#isRace() && this.phase === 'result') { this.#setTimer(T.result, () => this.#raceAfter()); return; }
    if (this.phase === 'card') {
      if (!this.card || !DECKS[this.card.deck]) this.#deal();
      else if (this.card.stage === 'act') this.#setTimer(T.moves, () => this.#movesDone(null, true), 'moves');
      else if (this.card.stage === 'move') {
        const steps = this.card.moves?.length ? this.card.moves : this.#steps(this.turn);
        this.card.moves = steps;
        if (steps.length) this.#setTimer(T.move, () => this.#raceResolve(true, this.#defaultStep(steps).row), 'move');
        else this.#raceResolve(true, null);
      }
    } else if (this.phase === 'result') {
      const r = this.result;
      if (!r || !this.card) this.#deal();
      else this.#setTimer(T.result, () => (r.trophy ? this.#winTrophy(r.trophy) : this.#next(r.next)));
    } else if (this.phase === 'trophy') {
      const side = this.trophyWon;
      if (this.winners.length) this.#setTimer(T.trophy, () => this.#end());
      else this.#setTimer(T.trophy, () => this.#newTrophy(side));
    }
  }
}

export { REACTIONS };

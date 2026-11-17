// Jeopardy rules, ported from the Buzzworthy game (github.com/JasonWynkoop1/buzzworthy) onto this room.
// No network, no files, no real timers: time-outs are driven by tick(), and every time comes from room.now().
//
// How a clue goes: the clue is shown ("reading"), then the buzzers open for a few seconds with a visible clock. The first
// press wins and has a few seconds to answer: typed on the phone and judged leniently by judge.js, or spoken, with the
// host ruling (host mode). A wrong answer opens the buzzers again for everyone who has not tried. Players buzz in as
// individuals (up to 8); the room is never split into teams for this game.
//
// Fairness: buzz() is called in the order messages arrive at the room and stamps the press with the room clock. Device
// clocks are never consulted. A press that loses by a hair is still timed, so everyone can see the buzz order.
import { GameError, fail, cleanName, int } from '../../lib.js';
import { judge, asksForPerson } from './judge.js';
import { parseArchive, pickSeason, ERAS } from './archive.js';
import { HOUSE_PACKS } from './packs/index.js';

export { GameError };
export const COLS = 6;
export const ROWS = 5;
const GAME = 'jeopardy';

/** Times, in milliseconds. */
export const T = {
  buzzWindow: 7000,     // time to buzz after the clue unlocks
  rebuzzWindow: 6000,   // time to buzz after someone misses
  answer: 15000,        // time to type an answer after buzzing
  ddAnswer: 20000,      // Daily Double answer time (after reading)
  reveal: 4500,         // how long the correct answer stays up
  earlyPenalty: 400,    // lockout for buzzing before the clue unlocks
  finalAnswer: 35000,
  finalStep: 6500,
  hostRead: 30000,      // host mode: fallback if the host forgets to open buzzers
  hostAnswer: 30000,    // host mode: Daily Double fallback for the host to judge a spoken answer
  hostGrace: 3000,      // host mode: after the answer clock hits zero, the host still has this long to rule
  captainGone: 15000,   // how long the captain may be away before someone else takes over
};

/** Answer clock choices (seconds) for spoken answers in host mode. 0 means no clock. */
export const ANSWER_TIMES = [5, 10, 15, 20, 30, 0];
export const REACTIONS = ['👏', '😂', '😱', '🔥', '🤯', '🎉'];
const REACT_GAP = 1200;    // ms between reactions from one player
const REACT_LIFE = 4000;   // ms a reaction stays in the view
export const STREAK_HOT = 3;      // correct answers in a row to be "on fire"
const MAX_ADJUST = 1000000;
export const MAX_PLAYERS = 8;

export const readingTime = (text) => Math.max(2500, Math.min(7000, 1200 + String(text).length * 45));

/** Checks one of our own boards (what the editor saves). A clue may list other words to accept in `alt`. */
export function validateSet(set) {
  if (!set || typeof set !== 'object') fail('Question set must be an object');
  if (!cleanName(set.title, 80)) fail('Question set needs a title');
  if (!Array.isArray(set.categories) || set.categories.length !== COLS) fail(`Need exactly ${COLS} categories`);
  const altOk = (alt, where) => {
    if (alt !== undefined && (!Array.isArray(alt) || alt.some((x) => typeof x !== 'string'))) fail(`${where}: the other accepted answers must be a list of words`);
  };
  set.categories.forEach((cat, c) => {
    if (!cleanName(cat?.name, 40)) fail(`Category ${c + 1} needs a name`);
    if (!Array.isArray(cat.clues) || cat.clues.length !== ROWS) fail(`Category ${c + 1} needs exactly ${ROWS} clues`);
    cat.clues.forEach((cl, r) => {
      if (!String(cl?.clue ?? '').trim()) fail(`Category ${c + 1}, clue ${r + 1} is missing its clue text`);
      if (!String(cl?.answer ?? '').trim()) fail(`Category ${c + 1}, clue ${r + 1} is missing its answer`);
      if (!(int(cl.value) > 0)) fail(`Category ${c + 1}, clue ${r + 1} needs a positive value`);
      altOk(cl.alt, `Category ${c + 1}, clue ${r + 1}`);
    });
  });
  const f = set.final;
  if (!f || !cleanName(f.category, 40) || !String(f.clue ?? '').trim() || !String(f.answer ?? '').trim()) {
    fail('Final Jeopardy needs a category, clue and answer');
  }
  altOk(f.alt, 'Final Jeopardy');
  return true;
}

/** A pack as the game uses it, from a pack file (house packs) or built from one of our boards or an archive season. */
export function normalizePack(id, data) {
  return {
    id,
    title: String(data.title || id),
    description: String(data.description || ''),
    selected: data.selected !== false,
    easy: data.easy === true,
    own: data.own === true,
    categories: (data.categories || []).filter((c) => c.name && Array.isArray(c.clues) && c.clues.length >= 5),
    finals: (data.finals || []).filter((fin) => fin.q && fin.a),
  };
}

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export class JeopardyGame {
  constructor(room) {
    this.room = room;
    this.houses = HOUSE_PACKS.map(({ id, data }) => normalizePack(id, data)).filter((p) => p.categories.length);
    this.archivePacks = [];
    this.ownPacks = [];
    this.packs = [];
    this.selected = new Set();
    this.settings = { answerTime: 10, hostJudges: false, asWritten: null };
    this.era = 'any';
    this.archiveSeason = null;
    this.archiveRequest = null;     // { id, era } while a new season is wanted; the app downloads it
    this.archiveReqId = 0;
    this.archiveLoading = false;
    this.archiveError = false;
    this.easyPrev = null;           // the selection to bring back when easy mode is switched off
    this.draft = null;              // the 12 categories chosen ahead of time ([round 1, round 2]), to look over and swap
    this.played = new Set();        // category names already played, so Play again deals a fresh board
    this.stats = new Map();         // per player: streak, best, right, wrong, fastest, bigWin, lockUntil, lastReact
    this.reactions = [];            // recent emoji reactions [{ id, pid, e, at }]
    this.reactSeq = 0;
    this.captainId = null;
    this.captainGoneAt = null;
    this.timer = null;              // { at, fire, kind, shownAt, shownMs }
    this.openedAt = 0;              // when the buzzers last opened, to time each press
    this.#resetRun();
    this.#refreshPacks();
  }

  #resetRun() {
    this.phase = 'lobby';
    this.round = 0;
    this.rounds = [];
    this.controllerId = null;
    this.clue = null;
    this.lastResult = null;
    this.final = null;
    this.finalClue = null;
    this.timer = null;
  }
  #changed() { this.room.changed(); }
  #now() { return this.room.now(); }
  #rng() { return this.room.rng(); }
  #shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.#rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  #player(id) { return this.room.players.find((p) => p.id === id) ?? null; }
  #order() { return this.room.players.map((p) => p.id); }
  #connected(id) { return this.room.connected.has(id); }
  #stat(id) {
    let s = this.stats.get(id);
    if (!s) { s = { streak: 0, best: 0, right: 0, wrong: 0, fastest: null, bigWin: 0, lockUntil: 0, lastReact: -Infinity }; this.stats.set(id, s); }
    return s;
  }
  #resetStats() { this.stats = new Map(); }

  // ---------- the room's side of the contract ----------
  /** The roster is locked once play begins. */
  inProgress() { return this.phase !== 'lobby'; }
  /** Called when Jeopardy is picked: look for boards, and ask the app for a season of real-show clues. */
  init() {
    this.#refreshPacks();
    if (!this.archivePacks.length && !this.archiveLoading) this.#requestArchive('any');
  }
  contentChanged() { if (this.phase === 'lobby') { this.#refreshPacks(); this.#changed(); } }

  /** The app (Apple TV) polls this after each change; a request means "download a season of this era". */
  takeArchiveRequest() { const r = this.archiveRequest; this.archiveRequest = null; return r; }

  tick() {
    const now = this.#now();
    const t = this.timer;
    if (t && now >= t.at) { this.timer = null; t.fire(); }
    // The captain may step away, but not for long.
    const cap = this.captainId && this.#player(this.captainId);
    if (cap && !this.#connected(cap.id)) {
      this.captainGoneAt ??= now;
      if (now - this.captainGoneAt > T.captainGone) {
        const next = this.#order().find((id) => this.#connected(id));
        if (next) { this.captainId = next; this.captainGoneAt = null; this.#changed(); }
      }
    } else this.captainGoneAt = null;
    // Old reactions fade out of the view.
    if (this.reactions.length && now - this.reactions[0].at > REACT_LIFE) {
      this.reactions = this.reactions.filter((r) => now - r.at < REACT_LIFE);
      this.#changed();
    }
  }

  #setTimer(ms, fire, kind = '') {
    const now = this.#now();
    // `shownEnd` is where the clock on screen reaches zero (the host-mode answer clock ends before the timer fires).
    this.timer = { at: now + ms, fire, kind, totalMs: ms, shownEnd: now + ms };
  }
  #clearTimer() { this.timer = null; }

  // ---------- packs: your boards, real-show topics, and the house packs ----------
  #refreshPacks() {
    const own = [];
    for (const { id } of this.room.listContent(GAME)) {
      const set = this.room.loadContent(GAME, id);
      if (!set) continue;
      try { validateSet(set); } catch { continue; }
      own.push(normalizePack(`own-${id}`, {
        title: set.title, description: 'A full board from the question editor (Questions on the host page)', selected: false, own: true,
        categories: set.categories.map((c) => ({
          name: c.name,
          clues: c.clues.map((cl) => ({ q: cl.clue, a: cl.answer, alt: cl.alt ?? [], v: cl.value, dd: !!cl.dailyDouble })),
        })),
        finals: [{ category: set.final.category, q: set.final.clue, a: set.final.answer, alt: set.final.alt ?? [] }],
      }));
    }
    this.ownPacks = own;
    this.#composePacks();
  }
  #composePacks() {
    const before = new Set(this.packs.map((p) => p.id));
    this.packs = [...this.ownPacks, ...this.archivePacks, ...this.houses];
    const ids = new Set(this.packs.map((p) => p.id));
    for (const id of [...this.selected]) if (!ids.has(id)) this.selected.delete(id);
    // Packs seen for the first time follow their own "selected" flag (the real-show topics start on, the house packs off).
    for (const p of this.packs) if (!before.has(p.id) && p.selected && (this.archivePacks.includes(p) || (!this.archivePacks.length && !p.own))) this.selected.add(p.id);
    if (!this.selected.size && this.packs.length) this.selected.add((this.ownPacks[0] ?? this.packs[0]).id);
    this.draft = null;
  }
  #bank() {
    const chosen = this.packs.filter((p) => this.selected.has(p.id));
    const seen = new Set();
    const categories = [];
    for (const p of chosen) for (const c of p.categories) {
      const k = c.name.toLowerCase();
      if (!seen.has(k)) { seen.add(k); categories.push(c); }
    }
    let finals = chosen.flatMap((p) => p.finals);
    if (!finals.length) finals = this.packs.flatMap((p) => p.finals);
    return { categories, finals };
  }
  /** Categories that have not been played in this room yet (all of them if that leaves too few). */
  #fresh(categories, need) {
    const unplayed = categories.filter((c) => !this.played.has(c.name.toLowerCase()));
    return unplayed.length >= need ? unplayed : categories;
  }
  /** Own boards picked to be played just as written: one board per round (the boards you wrote, not a shuffle). */
  #asWrittenPacks() {
    const chosen = this.packs.filter((p) => this.selected.has(p.id));
    const onlyOwn = chosen.length >= 1 && chosen.length <= 2 && chosen.every((p) => p.own && p.categories.length >= COLS);
    return onlyOwn && this.settings.asWritten !== false ? chosen : null;
  }

  // ---------- setup (host, captain or TV) ----------
  #lobbyOnly() { if (this.phase !== 'lobby') fail('Change this before the game starts'); }
  togglePack(id) {
    this.#lobbyOnly();
    if (!this.packs.some((p) => p.id === id)) return;
    if (this.selected.has(id)) this.selected.delete(id); else this.selected.add(id);
    this.draft = null;
    this.#changed();
  }
  easyPacks() { return this.packs.filter((p) => p.easy).map((p) => p.id); }
  easyOn() { return this.selected.size > 0 && [...this.selected].every((id) => this.packs.some((p) => p.id === id && p.easy)); }
  /** Easy mode: only the packs marked easy (casual questions). */
  toggleEasy() {
    this.#lobbyOnly();
    const easy = this.easyPacks();
    if (!easy.length) return;
    if (this.easyOn()) {
      const prev = this.easyPrev && [...this.easyPrev].filter((id) => !easy.includes(id));
      this.selected = new Set(prev && prev.length ? prev : this.packs.filter((p) => p.selected && !p.easy).map((p) => p.id));
      if (!this.selected.size) { const first = this.packs.find((p) => !p.easy); this.selected.add(first ? first.id : easy[0]); }
      this.easyPrev = null;
    } else {
      this.easyPrev = new Set(this.selected);
      this.selected = new Set(easy);
    }
    this.draft = null;
    this.#changed();
  }
  setHostJudges(on) { this.#lobbyOnly(); this.settings.hostJudges = !!on; this.#changed(); }
  setAsWritten(on) { this.#lobbyOnly(); this.settings.asWritten = on === null ? null : !!on; this.draft = null; this.#changed(); }
  setAnswerTime(sec) {
    sec = Number(sec);
    if (!ANSWER_TIMES.includes(sec)) fail('Choose one of the offered times');
    this.settings.answerTime = sec;
    this.#changed();
  }

  // The real-show archive: the app downloads a season and hands it back.
  hasArchive() { return this.archivePacks.length > 0 || this.archiveLoading || !!this.archiveRequest || this.archiveError; }
  #requestArchive(era) {
    this.era = era;
    this.archiveReqId += 1;
    // The engine picks the season; the app only downloads it (season N of the public clue dataset) and hands it back.
    this.archiveRequest = { id: this.archiveReqId, era, season: pickSeason(era, () => this.#rng()) };
    this.archiveLoading = true;
    this.archiveError = false;
  }
  setEra(era) {
    this.#lobbyOnly();
    if (!ERAS[era]) fail('No such era');
    this.#requestArchive(era);
    this.#changed();
  }
  /** A season arrived (raw TSV text). Keeps the same topics switched on. */
  archiveLoaded(tsv, season, id) {
    if (id !== this.archiveReqId || this.phase !== 'lobby') return;
    this.archiveLoading = false;
    let parsed = [];
    try { parsed = parseArchive(String(tsv), Number(season) || 0, () => this.#rng()); } catch { parsed = []; }
    const packs = parsed.map((p) => normalizePack(p.id, p)).filter((p) => p.categories.length);
    if (!packs.length) { this.archiveError = true; this.#changed(); return; }
    const wasOn = new Set([...this.selected].filter((pid) => pid.startsWith('archive-')));
    const hadOn = wasOn.size > 0;
    this.archivePacks = packs;
    this.archiveSeason = Number(season) || null;
    for (const pid of [...this.selected]) if (pid.startsWith('archive-')) this.selected.delete(pid);
    const first = !this.packs.some((p) => p.own && this.selected.has(p.id)) && !hadOn;
    this.packs = [...this.ownPacks, ...this.archivePacks, ...this.houses];
    for (const p of packs) if (hadOn ? wasOn.has(p.id) : first) this.selected.add(p.id);
    // The house packs that started on stay off now that real boards are here; keep whatever else was chosen.
    if (first) for (const p of this.houses) this.selected.delete(p.id);
    if (!this.selected.size) this.selected.add(packs[0].id);
    this.draft = null;
    this.#changed();
  }
  archiveFailed(id) {
    if (id !== this.archiveReqId) return;
    this.archiveLoading = false;
    this.archiveError = true;
    this.#changed();
  }

  // The board builder: look the 12 categories over and swap any before starting.
  previewBoard() {
    this.#lobbyOnly();
    if (this.#asWrittenPacks()) fail('Your boards are played as written; there is nothing to shuffle.');
    const all = this.#bank().categories.filter((c) => c.clues.length >= 5);
    if (all.length < 12) fail('Pick packs with at least 12 categories in total.');
    const cats = this.#shuffle(this.#fresh(all, 12));
    this.draft = [cats.slice(0, 6), cats.slice(6, 12)];
    this.#changed();
  }
  /** Swap one previewed category (round r = 1 or 2, column ci) for another one from the chosen packs. */
  swapCategory(r, ci) {
    this.#lobbyOnly();
    if (!this.draft) return;
    const row = this.draft[Number(r) - 1];
    if (!row || !row[Number(ci)]) return;
    const inUse = new Set(this.draft.flat().map((c) => c.name.toLowerCase()));
    const spareAll = this.#bank().categories.filter((c) => c.clues.length >= 5 && !inUse.has(c.name.toLowerCase()));
    if (!spareAll.length) fail('No other categories left. Switch on more topics.');
    const spare = this.#fresh(spareAll, 1);
    row[Number(ci)] = spare[Math.floor(this.#rng() * spare.length)];
    this.#changed();
  }
  clearPreview() { this.#lobbyOnly(); this.draft = null; this.#changed(); }

  // ---------- building and starting ----------
  /** Where the Daily Doubles go: a column and row each, favouring the harder rows, never two in one column. */
  #placeDailyDoubles(board, count) {
    const slots = [];
    board.forEach((c, ci) => c.clues.forEach((cl, ri) => { for (let k = 0; k < [0, 1, 3, 4, 3][ri]; k++) slots.push([ci, ri]); }));
    const usedCols = new Set();
    for (; count > 0; count--) {
      const open = slots.filter(([ci]) => !usedCols.has(ci));
      if (!open.length) break;
      const [ci, ri] = open[Math.floor(this.#rng() * open.length)];
      usedCols.add(ci);
      board[ci].clues[ri].dd = true;
    }
  }
  #makeRound(r, cats, ddCount) {
    const board = cats.map((c) => ({
      name: c.name,
      clues: c.clues.slice(0, 5).map((cl, i) => ({
        // A board you wrote keeps the values you gave it; the house and archive packs are 200..1000, doubled in round 2.
        value: Number(cl.v) > 0 ? Number(cl.v) : (i + 1) * 200 * r,
        q: cl.q, a: cl.a, alt: cl.alt || [], used: false, dd: !!cl.dd,
      })),
    }));
    // Daily Doubles you marked in a board you wrote are kept; otherwise they are placed at random.
    const flagged = board.reduce((n, c) => n + c.clues.filter((cl) => cl.dd).length, 0);
    if (!flagged) this.#placeDailyDoubles(board, ddCount);
    else if (flagged > ddCount) {
      let extra = flagged - ddCount;
      for (const c of board) for (const cl of c.clues) if (cl.dd && extra > 0) { cl.dd = false; extra--; }
    }
    return board;
  }
  #buildRounds() {
    const written = this.#asWrittenPacks();
    const bank = this.#bank();
    if (written) {
      this.rounds = written.map((p, i) => this.#makeRound(i + 1, p.categories.slice(0, COLS), i === 0 ? 1 : 2));
      const f = written[written.length - 1].finals[0];
      this.finalClue = f ? { category: f.category, q: f.q, a: f.a, alt: f.alt || [] } : null;
      this.draft = null;
      for (const row of this.rounds) for (const c of row) this.played.add(c.name.toLowerCase());
      return;
    }
    // Unplayed categories first, then the rest, so a replay only repeats when it has to.
    const cats = this.#shuffle(bank.categories.filter((c) => !this.played.has(c.name.toLowerCase())))
      .concat(this.#shuffle(bank.categories.filter((c) => this.played.has(c.name.toLowerCase()))));
    const used = new Set();
    const pick = () => {
      const out = [];
      for (const c of cats) {
        if (out.length === 6) break;
        if (used.has(c.name) || c.clues.length < 5) continue;
        used.add(c.name);
        out.push(c);
      }
      return out;
    };
    const chosen = this.draft && this.draft.every((row) => row.length === 6) ? this.draft : null;
    this.rounds = chosen ? [this.#makeRound(1, chosen[0], 1), this.#makeRound(2, chosen[1], 2)] : [this.#makeRound(1, pick(), 1), this.#makeRound(2, pick(), 2)];
    this.draft = null;
    for (const row of this.rounds) for (const c of row) this.played.add(c.name.toLowerCase());
    const freshFinals = bank.finals.filter((fin) => !this.played.has(`final:${fin.q}`));
    const f = this.#shuffle(freshFinals.length ? freshFinals : bank.finals)[0];
    if (f) this.played.add(`final:${f.q}`);
    this.finalClue = f ? { category: f.category, q: f.q, a: f.a, alt: f.alt || [] } : null;
  }

  start() {
    this.#lobbyOnly();
    if (!this.room.players.length) fail('Wait for players to join');
    if (!this.#asWrittenPacks() && !this.draft && this.#bank().categories.length < 12) fail('Pick packs with at least 12 categories in total.');
    this.#buildRounds();
    this.#resetStats();
    this.round = 1;
    const order = this.#order();
    this.controllerId = order[Math.floor(this.#rng() * order.length)];
    this.captainId ??= order[0];
    this.phase = 'board';
    this.#changed();
  }

  // ---------- the roster ----------
  kick(id) {
    this.#lobbyOnly();
    this.room.removePlayer(id);
    if (this.captainId === id) this.captainId = this.#order()[0] ?? null;
  }
  /** Who gets the captain controls: whoever joined first, and someone else if they stay away. */
  captain() {
    if (!this.captainId || !this.#player(this.captainId)) this.captainId = this.#order()[0] ?? null;
    return this.captainId;
  }
  hostJudges() { return !!this.settings.hostJudges; }

  // ---------- the clue ----------
  board() { return this.round >= 1 && this.round <= this.rounds.length ? this.rounds[this.round - 1] : null; }

  pick(ci, ri) {
    if (this.phase !== 'board') return;
    const b = this.board();
    const cl = b?.[ci]?.clues[ri];
    if (!cl || cl.used) return;
    cl.used = true;
    this.lastResult = null;
    this.clue = { ci, ri, cat: b[ci].name, value: cl.value, q: cl.q, a: cl.a, alt: cl.alt, dd: cl.dd, tried: [], buzzedId: null, wager: null, buzzes: [], buzzMs: null };
    if (cl.dd) {
      this.phase = 'dd-wager';
      this.#clearTimer();
    } else {
      this.phase = 'reading';
      // With a host judging, the buzzers open when the host finishes reading aloud.
      this.#setTimer(this.hostJudges() ? T.hostRead : readingTime(cl.q), () => this.#openBuzzers(T.buzzWindow), 'reading');
    }
    this.#changed();
  }
  openNow() { if (this.phase === 'reading') this.#openBuzzers(T.buzzWindow); }
  #openBuzzers(window) {
    this.phase = 'open';
    this.clue.buzzedId = null;
    this.openedAt = this.#now();
    this.#setTimer(window, () => this.#endClue(), 'buzz');
    this.#changed();
  }

  /** A buzz. Returns what to tell the phone: { result: 'won' | 'late' | 'early' | 'tried' | 'ignored', ms }. */
  buzz(pid) {
    const st = this.#stat(pid);
    if (!this.#player(pid) || !this.clue) return { result: 'ignored' };
    const now = this.#now();
    if (this.phase === 'reading') { st.lockUntil = now + T.earlyPenalty; return { result: 'early' }; }
    // Someone beat them to it: still time it, so everyone sees the buzz order.
    if (this.phase === 'answering' && this.openedAt) {
      if (this.clue.tried.includes(pid) || this.clue.buzzedId === pid || this.clue.buzzes.some((b) => b.pid === pid)) return { result: 'ignored' };
      const late = Math.max(0, now - this.openedAt);
      this.clue.buzzes.push({ pid, ms: late });
      if (st.fastest == null || late < st.fastest) st.fastest = late;
      this.#changed();
      return { result: 'late', ms: late };
    }
    if (this.phase !== 'open') return { result: 'ignored' };
    if (this.clue.tried.includes(pid)) return { result: 'tried' };
    if (now < st.lockUntil) return { result: 'early' };
    this.clue.buzzedId = pid;
    const ms = Math.max(0, now - this.openedAt);
    this.clue.buzzMs = ms;
    if (st.fastest == null || ms < st.fastest) st.fastest = ms;
    // One time per player per clue (a second chance after a miss counts as a new buzz).
    this.clue.buzzes = this.clue.buzzes.filter((b) => b.pid !== pid);
    this.clue.buzzes.push({ pid, ms, won: true });
    this.phase = 'answering';
    if (this.hostJudges()) this.#startAnswerClock(pid);
    else this.#setTimer(T.answer, () => this.submitAnswer(pid, '', true), 'answer');
    this.#changed();
    return { result: 'won', ms };
  }

  /** Host mode: the visible answer clock. At zero the TV says "Time's up" and the host has a short grace to rule. */
  #startAnswerClock(pid) {
    const sec = this.settings.answerTime;
    if (!sec) { this.#clearTimer(); return; }
    const ms = sec * 1000;
    this.#setTimer(ms + T.hostGrace, () => this.submitAnswer(pid, '', true), 'answer');
    this.timer.totalMs = ms;
    this.timer.shownEnd = this.#now() + ms;
  }
  /** The host's ruling on a spoken answer. */
  judgeNow(correct) {
    if (this.phase === 'answering') this.submitAnswer(this.clue.buzzedId, null, false, !!correct);
    else if (this.phase === 'dd-answer') this.submitAnswer(this.controllerId, null, false, !!correct);
  }

  /** Count a ruling for the streaks and awards. `undo` flips an earlier one. */
  #tally(id, correct, wager, undo) {
    const p = this.#stat(id);
    if (undo) {
      if (correct) { p.wrong = Math.max(0, p.wrong - 1); p.right++; p.streak++; p.best = Math.max(p.best, p.streak); if (wager) p.bigWin = Math.max(p.bigWin, wager); }
      else { p.right = Math.max(0, p.right - 1); p.wrong++; p.streak = 0; }
      return;
    }
    if (correct) { p.right++; p.streak++; p.best = Math.max(p.best, p.streak); if (wager) p.bigWin = Math.max(p.bigWin, wager); }
    else { p.wrong++; p.streak = 0; }
  }

  /** A typed answer (text), a time-out (timedOut), or the host's ruling on a spoken one (text null, verdict true/false). */
  submitAnswer(pid, text, timedOut, verdict) {
    const spoken = text === null;
    text = spoken ? null : String(text || '').slice(0, 80);
    const decide = () => (verdict !== undefined ? verdict : !timedOut && judge(text, [this.clue.a, ...this.clue.alt], { person: asksForPerson(this.clue.q) }));
    const shown = () => (spoken ? null : text || '(no answer)');
    if (this.phase === 'answering' && this.clue.buzzedId === pid) {
      const correct = decide();
      const p = this.#player(pid);
      const v = this.clue.value;
      if (p) p.score += correct ? v : -v;
      this.#tally(pid, correct, 0);
      this.clue.tried.push(pid);
      this.lastResult = { pid, answer: shown(), correct, delta: v, overridden: false, streak: this.#stat(pid).streak };
      if (correct) {
        this.controllerId = pid;
        this.#revealClue();
      } else {
        const remaining = this.#order().filter((id) => this.#connected(id) && !this.clue.tried.includes(id));
        if (remaining.length === 0) this.#revealClue();
        else this.#openBuzzers(T.rebuzzWindow);
      }
      this.#changed();
      return;
    }
    if (this.phase === 'dd-answer' && this.controllerId === pid) {
      const correct = decide();
      const p = this.#player(pid);
      const v = this.clue.wager;
      if (p) p.score += correct ? v : -v;
      this.#tally(pid, correct, v);
      this.lastResult = { pid, answer: shown(), correct, delta: v, overridden: false, dd: true, streak: this.#stat(pid).streak };
      this.#revealClue();
      this.#changed();
    }
  }
  /** What a player typed for their answer (phones). */
  answer(pid, text) {
    if (this.hostJudges()) fail('The host judges answers out loud.');
    this.submitAnswer(pid, text, false);
  }

  ddWager(pid, amount) {
    if (this.phase !== 'dd-wager' || pid !== this.controllerId) return;
    const max = this.maxDDWager(pid);
    let w = Math.round(Number(amount));
    if (!Number.isFinite(w)) fail('Enter a number');
    w = clamp(w, 5, max);
    this.clue.wager = w;
    this.phase = 'dd-answer';
    this.#setTimer(readingTime(this.clue.q) + (this.hostJudges() ? T.hostAnswer : T.ddAnswer), () => this.submitAnswer(pid, '', true), 'answer');
    this.#changed();
  }
  maxDDWager(pid) { return Math.max(this.#player(pid)?.score ?? 0, 1000 * this.round); }

  #endClue() {
    if (!this.clue) return;
    if (this.phase === 'answering') { this.submitAnswer(this.clue.buzzedId, '', true); return; }
    this.#revealClue();
  }
  #revealClue() {
    this.phase = 'reveal';
    this.#setTimer(T.reveal, () => this.#afterReveal(), 'reveal');
    this.#changed();
  }
  #afterReveal() {
    this.clue = null;
    const left = this.board().some((c) => c.clues.some((cl) => !cl.used));
    this.#clearTimer();
    if (!left) this.phase = 'round-end';
    else {
      this.phase = 'board';
      // If whoever is in control left, give control to someone who is here.
      if (!this.#connected(this.controllerId)) {
        const here = this.#order().filter((id) => this.#connected(id));
        if (here.length) this.controllerId = here[0];
      }
    }
    this.#changed();
  }

  /** Captain, host or TV moves things along. */
  advance() {
    if (this.phase === 'round-end') {
      if (this.round < this.rounds.length) {
        this.round += 1;
        // Lowest score picks first in the next round.
        const sorted = this.room.players.slice().sort((a, b) => a.score - b.score);
        this.controllerId = sorted[0].id;
        this.phase = 'board';
        this.#changed();
      } else this.#startFinal();
    } else if (this.phase === 'reveal') { this.#clearTimer(); this.#afterReveal(); }
    else if (this.phase === 'final-wager') this.#beginFinalClue();
    else if (this.phase === 'final-answer') { this.#clearTimer(); this.#beginFinalReveal(); }
    else if (this.phase === 'final-reveal') this.#finalStep();
  }
  skipClue() {
    if (['reading', 'open', 'answering'].includes(this.phase)) {
      if (this.phase === 'answering') {
        this.submitAnswer(this.clue.buzzedId, '', true);
        if (this.phase !== 'reveal') this.#revealClue();
      } else this.#revealClue();
    } else if (this.phase === 'dd-wager' || this.phase === 'dd-answer') {
      if (this.phase === 'dd-wager') this.clue.wager = 0;
      this.#revealClue();
    }
  }
  /** Skip to the end of the current round (handy for short games). */
  endRound() {
    const b = this.board();
    if (!b || this.phase !== 'board') return;
    b.forEach((c) => c.clues.forEach((cl) => { cl.used = true; }));
    this.phase = 'round-end';
    this.#clearTimer();
    this.#changed();
  }
  /** Flip the last automatic ruling (a typo or a generous call). */
  override() {
    const r = this.lastResult;
    if (!r || this.phase.startsWith('final')) return;
    const p = this.#player(r.pid);
    if (!p) return;
    p.score += (r.correct ? -1 : 1) * 2 * r.delta;
    r.correct = !r.correct;
    r.overridden = !r.overridden;
    this.#tally(r.pid, r.correct, r.dd ? r.delta : 0, true);
    r.streak = this.#stat(r.pid).streak;
    if (r.correct) {
      this.controllerId = r.pid;
      if (['open', 'reading', 'answering'].includes(this.phase)) this.#revealClue();
    }
    this.#changed();
  }

  // ---------- the final round ----------
  #startFinal() {
    this.round = this.rounds.length + 1;
    const eligible = this.#order().filter((id) => (this.#player(id)?.score ?? 0) > 0);
    if (!this.finalClue || eligible.length === 0) {
      this.phase = 'gameover';
      this.#clearTimer();
      this.#changed();
      return;
    }
    this.final = { category: this.finalClue.category, q: this.finalClue.q, a: this.finalClue.a, alt: this.finalClue.alt, eligible, wagers: {}, answers: {}, results: {}, revealOrder: [], revealIndex: -1 };
    this.phase = 'final-wager';
    this.#clearTimer();
    this.#changed();
  }
  finalWager(pid, amount) {
    if (this.phase !== 'final-wager' || !this.final.eligible.includes(pid)) return;
    const p = this.#player(pid);
    let w = Math.round(Number(amount));
    if (!Number.isFinite(w)) fail('Enter a number');
    w = clamp(w, 0, p.score);
    this.final.wagers[pid] = w;
    this.#changed();
    if (!this.final.eligible.some((id) => this.#connected(id) && !(id in this.final.wagers))) this.#beginFinalClue();
  }
  #beginFinalClue() {
    if (this.phase !== 'final-wager') return;
    for (const id of this.final.eligible) if (!(id in this.final.wagers)) this.final.wagers[id] = 0;
    this.phase = 'final-answer';
    this.#setTimer(T.finalAnswer, () => this.#beginFinalReveal(), 'final');
    this.#changed();
  }
  finalAnswer(pid, text) {
    if (this.phase !== 'final-answer' || !this.final.eligible.includes(pid)) return;
    if (pid in this.final.answers) return; // locked in already
    this.final.answers[pid] = String(text || '').slice(0, 80);
    this.#changed();
    if (!this.final.eligible.some((id) => this.#connected(id) && !(id in this.final.answers))) {
      // A short pause so the last player sees "locked in" before the reveal.
      this.#setTimer(1500, () => this.#beginFinalReveal(), 'final-wait');
    }
  }
  #beginFinalReveal() {
    if (this.phase !== 'final-answer') return;
    const f = this.final;
    for (const id of f.eligible) {
      const ans = f.answers[id] || '';
      f.results[id] = { answer: ans || '(no answer)', correct: judge(ans, [f.a, ...f.alt], { person: asksForPerson(f.q) }), shown: false, applied: false };
    }
    f.revealOrder = f.eligible.slice().sort((a, b) => this.#player(a).score - this.#player(b).score);
    f.revealIndex = -1;
    this.phase = 'final-reveal';
    this.#finalStep();
  }
  #finalStep() {
    const f = this.final;
    f.revealIndex++;
    if (f.revealIndex >= f.revealOrder.length) {
      this.phase = 'gameover';
      this.#clearTimer();
      this.#changed();
      return;
    }
    const id = f.revealOrder[f.revealIndex];
    const r = f.results[id];
    const p = this.#player(id);
    r.shown = true;
    if (p && !r.applied) {
      p.score += r.correct ? f.wagers[id] : -f.wagers[id];
      this.#tally(id, r.correct, f.wagers[id]);
      r.applied = true;
    }
    this.#setTimer(T.finalStep, () => this.#finalStep(), 'final-step');
    this.#changed();
  }
  /** Flip a final-round ruling for one player. */
  finalOverride(pid) {
    if (!this.final || !['final-reveal', 'gameover'].includes(this.phase)) return;
    const r = this.final.results[pid];
    const p = this.#player(pid);
    if (!r || !r.applied || !p) return;
    const w = this.final.wagers[pid];
    p.score += r.correct ? -2 * w : 2 * w;
    r.correct = !r.correct;
    r.overridden = !r.overridden;
    this.#tally(pid, r.correct, w, true);
    this.#changed();
  }
  playAgain() {
    if (this.phase !== 'gameover') return;
    this.room.resetScores();
    this.#resetStats();
    this.#resetRun();
    this.#refreshPacks();
    // A room brought back after the TV restarted has no real-show topics yet: fetch them again for the next game.
    if (!this.archivePacks.length && !this.archiveLoading) this.#requestArchive(this.era);
    this.#changed();
  }
  /** End a game that is under way, back to the lobby (the host's "end game"). */
  endGame() {
    this.room.resetScores();
    this.#resetStats();
    this.#resetRun();
    this.#refreshPacks();
    // A room brought back after the TV restarted has no real-show topics yet: fetch them again for the next game.
    if (!this.archivePacks.length && !this.archiveLoading) this.#requestArchive(this.era);
    this.#changed();
  }

  // ---------- reactions and awards ----------
  react(pid, idx) {
    const st = this.#stat(pid);
    const e = REACTIONS[Number(idx)];
    const now = this.#now();
    if (!this.#player(pid) || !e || now - st.lastReact < REACT_GAP) return;
    st.lastReact = now;
    this.reactions = this.reactions.filter((r) => now - r.at < REACT_LIFE);
    this.reactions.push({ id: ++this.reactSeq, pid, e, at: now });
    if (this.reactions.length > 12) this.reactions.shift();
    this.#changed();
  }
  awards() {
    const ps = this.room.players;
    const out = [];
    const best = (score, ok) => {
      let top = null;
      for (const p of ps) if (ok(p) && (!top || score(p) > score(top))) top = p;
      return top;
    };
    const s = (p) => this.#stat(p.id);
    const fast = best((p) => -s(p).fastest, (p) => s(p).fastest != null);
    if (fast) out.push({ id: 'fast', title: 'Fastest Finger', pid: fast.id, detail: `${(s(fast).fastest / 1000).toFixed(2)}s buzz` });
    const brain = best((p) => s(p).right, (p) => s(p).right > 0);
    if (brain) out.push({ id: 'brain', title: 'Big Brain', pid: brain.id, detail: `${s(brain).right} right` });
    const hot = best((p) => s(p).best, (p) => s(p).best >= STREAK_HOT);
    if (hot) out.push({ id: 'hot', title: 'On Fire', pid: hot.id, detail: `${s(hot).best} in a row` });
    const roller = best((p) => s(p).bigWin, (p) => s(p).bigWin > 0);
    if (roller) out.push({ id: 'roller', title: 'High Roller', pid: roller.id, detail: `won a $${s(roller).bigWin.toLocaleString('en-US')} bet` });
    const brave = best((p) => s(p).wrong, (p) => s(p).wrong >= 3);
    if (brave) out.push({ id: 'brave', title: 'Fearless', pid: brave.id, detail: `${s(brave).wrong} brave guesses` });
    return out;
  }

  // ---------- who may do what ----------
  /** Host and TV actions. */
  act(action, a = {}) {
    switch (action) {
      case 'togglePack': return this.togglePack(String(a.pack ?? a.id));
      case 'start': return this.start();
      case 'pick': return this.pick(Number(a.ci), Number(a.ri));
      case 'judge': return this.judgeNow(a.correct === true);
      case 'openNow': return this.openNow();
      case 'advance': return this.advance();
      case 'skip': return this.skipClue();
      case 'override': return this.override();
      case 'finalOverride': return this.finalOverride(String(a.pid ?? a.targetPid ?? ''));
      case 'endRound': return this.endRound();
      case 'playAgain': return this.playAgain();
      case 'endGame': return this.endGame();
      case 'kick': return this.kick(String(a.pid ?? a.targetPid ?? a.id ?? ''));
      case 'adjustScore': return this.room.adjustScore(String(a.id ?? a.targetPid ?? ''), { delta: a.delta, set: a.set });
      case 'toggleEasy': return this.toggleEasy();
      case 'setAnswerTime': return this.setAnswerTime(a.seconds);
      case 'setEra': return this.setEra(String(a.era ?? ''));
      case 'setHostJudges': return this.setHostJudges(a.on);
      case 'setAsWritten': return this.setAsWritten(a.on === null ? null : a.on);
      case 'previewBoard': return this.previewBoard();
      case 'swapCategory': return this.swapCategory(Number(a.r), Number(a.ci));
      case 'clearPreview': return this.clearPreview();
      default: throw new GameError(`Unknown action ${action}`);
    }
  }
  /** What the captain's phone may do (a subset of the host's powers; no host-judging ruling). */
  static CAPTAIN_ACTIONS = new Set(['kick', 'togglePack', 'start', 'advance', 'skip', 'override', 'finalOverride', 'endRound', 'playAgain', 'adjustScore', 'toggleEasy', 'setAnswerTime', 'setEra', 'previewBoard', 'swapCategory', 'clearPreview', 'setHostJudges', 'setAsWritten']);

  /** A message from a phone. */
  onPlayer(player, msg) {
    const pid = player.id;
    switch (msg.t) {
      case 'buzz': return { t: 'buzz-result', ...this.buzz(pid) };
      case 'answer': this.answer(pid, msg.text); return { t: 'ack', what: 'answer' };
      case 'pick': {
        // The player in control picks. With a host judging, the player says their pick aloud and the host taps it.
        if (this.hostJudges()) fail('Tell the host your pick.');
        const allowed = pid === this.controllerId || (pid === this.captain() && !this.#connected(this.controllerId));
        if (!allowed) fail('It is not your pick');
        this.pick(Number(msg.ci), Number(msg.ri));
        return undefined;
      }
      case 'dd-wager': this.ddWager(pid, msg.amount); return { t: 'ack', what: 'wager' };
      case 'final-wager': this.finalWager(pid, msg.amount); return { t: 'ack', what: 'wager' };
      case 'final-answer': this.finalAnswer(pid, msg.text); return { t: 'ack', what: 'answer' };
      case 'react': this.react(pid, msg.e); return undefined;
      case 'cap': {
        if (this.captain() !== pid) fail('Only the captain can do that');
        if (!JeopardyGame.CAPTAIN_ACTIONS.has(msg.action)) fail('Not allowed');
        return this.act(msg.action, msg.args ?? {}) ?? undefined;
      }
      default: return undefined;
    }
  }

  // ---------- views ----------
  #timerView() {
    const t = this.timer;
    if (!t || !['buzz', 'answer', 'final'].includes(t.kind)) return null;
    const left = Math.max(0, Math.round(t.shownEnd - this.#now()));
    return { kind: t.kind, totalMs: t.totalMs, leftMs: left };
  }
  #players() {
    return this.room.players.map((p) => ({ id: p.id, name: p.name, score: p.score, color: p.color, connected: this.#connected(p.id), streak: this.#stat(p.id).streak }));
  }
  /** What the TV and every phone may see. */
  publicView() {
    const showAnswer = this.phase === 'reveal';
    const now = this.#now();
    const b = this.board();
    const v = {
      game: GAME, lobbyTitle: 'Jeopardy',
      phase: this.phase,
      status: this.phase,
      round: this.round,
      rounds: this.rounds.length || (this.#asWrittenPacks()?.length ?? 2),
      captainId: this.captain(),
      hostJudges: this.hostJudges(),
      controllerId: this.controllerId,
      players: this.#players(),
      timer: this.#timerView(),
      board: b && b.map((c) => ({ name: c.name, clues: c.clues.map((cl) => ({ value: cl.value, used: cl.used })) })),
      clue: this.clue && {
        ci: this.clue.ci, ri: this.clue.ri, cat: this.clue.cat, value: this.clue.value, dd: this.clue.dd, wager: this.clue.wager,
        q: this.phase === 'dd-wager' ? null : this.clue.q,
        answer: showAnswer ? this.clue.a : null,
        buzzedId: this.clue.buzzedId,
        buzzMs: this.clue.buzzMs,
        // Everyone who buzzed on this clue, fastest first, with their time in ms.
        buzzes: this.clue.buzzes.slice().sort((x, y) => x.ms - y.ms).map((x) => ({ pid: x.pid, ms: x.ms, won: !!x.won })),
        tried: this.clue.tried,
      },
      lastResult: this.lastResult,
      answerTime: this.settings.answerTime,
      answerTimes: ANSWER_TIMES,
      hotStreak: STREAK_HOT,
      reactions: this.reactions.filter((r) => now - r.at < REACT_LIFE).map((r) => ({ id: r.id, pid: r.pid, e: r.e })),
      reactionChoices: REACTIONS,
    };
    if (this.phase === 'gameover') v.awards = this.awards();
    if (this.phase === 'lobby') {
      const written = this.#asWrittenPacks();
      v.packs = this.packs.map((p) => ({ id: p.id, title: p.title, description: p.description, count: p.categories.length, selected: this.selected.has(p.id), easy: p.easy, own: p.own, archive: p.id.startsWith('archive-') }));
      v.categoryCount = this.#bank().categories.length;
      v.easyAvailable = this.easyPacks().length > 0;
      v.easyMode = this.easyOn();
      v.hasArchive = this.hasArchive();
      v.era = this.era;
      v.eras = Object.keys(ERAS);
      v.archiveSeason = this.archiveSeason;
      v.archiveLoading = this.archiveLoading;
      v.archiveError = this.archiveError;
      v.draft = this.draft && this.draft.map((row) => row.map((c) => c.name));
      v.asWritten = !!written;
      v.asWrittenChoice = this.settings.asWritten;
      v.maxPlayers = MAX_PLAYERS;
    }
    if (this.final) {
      const f = this.final;
      const showQ = ['final-answer', 'final-reveal', 'gameover'].includes(this.phase);
      const done = ['final-reveal', 'gameover'].includes(this.phase);
      v.final = {
        category: f.category,
        q: showQ ? f.q : null,
        answer: done && (this.phase === 'gameover' || f.revealIndex >= 0) ? f.a : null,
        eligible: f.eligible,
        wagered: Object.keys(f.wagers),
        answered: Object.keys(f.answers),
        revealIndex: f.revealIndex,
        reveals: done ? f.revealOrder.slice(0, f.revealIndex + 1).map((id) => ({ id, ...f.results[id], wager: f.wagers[id] })) : [],
      };
    }
    return v;
  }
  /** What one player's phone sees: the shared view and their own state. */
  playerView(player) {
    const v = this.publicView();
    const p = this.#player(player.id);
    v.me = p ? {
      id: p.id, score: p.score, isCaptain: this.captain() === p.id,
      maxDD: this.phase === 'dd-wager' ? this.maxDDWager(p.id) : null,
      finalWager: this.final ? this.final.wagers[p.id] : undefined,
      finalAnswer: this.final ? this.final.answers[p.id] : undefined,
    } : null;
    return v;
  }
  /** The host also sees the answers, ahead of time. */
  hostView() {
    const v = this.publicView();
    const b = this.board();
    v.secret = {
      q: this.clue ? this.clue.q : null,
      answer: this.clue ? this.clue.a : null,
      alt: this.clue ? this.clue.alt : [],
      finalAnswer: this.final ? this.final.a : null,
      finalAnswers: this.final && this.phase === 'final-answer' ? this.final.answers : null,
      // Where the Daily Doubles hide on the current board.
      dd: b ? b.map((c) => c.clues.map((cl) => cl.dd)) : null,
    };
    return v;
  }

  // ---------- saving ----------
  /** The game is saved with the room. A clue under way is settled when it comes back (the timers do not survive a restart). */
  toJSON() {
    return {
      settings: this.settings, era: this.era, selected: [...this.selected], played: [...this.played],
      phase: this.phase, round: this.round, rounds: this.rounds, controllerId: this.controllerId, captainId: this.captainId,
      finalClue: this.finalClue, final: this.final, lastResult: this.lastResult, clue: this.clue,
      stats: [...this.stats.entries()],
    };
  }
  restore(data) {
    this.settings = { ...this.settings, ...(data.settings ?? {}) };
    this.era = data.era ?? 'any';
    this.played = new Set(data.played ?? []);
    this.selected = new Set(data.selected ?? []);
    this.phase = data.phase ?? 'lobby';
    this.round = data.round ?? 0;
    this.rounds = data.rounds ?? [];
    this.controllerId = data.controllerId ?? null;
    this.captainId = data.captainId ?? null;
    this.finalClue = data.finalClue ?? null;
    this.final = data.final ?? null;
    this.lastResult = data.lastResult ?? null;
    this.clue = data.clue ?? null;
    this.stats = new Map(data.stats ?? []);
    this.timer = null;
    this.#refreshPacks();
    for (const id of this.selected) if (!this.packs.some((p) => p.id === id)) this.selected.delete(id);
    if (!this.selected.size && this.packs.length) this.selected.add((this.ownPacks[0] ?? this.packs[0]).id);
    // A clue that was under way is settled, and the answer shown.
    if (this.clue && ['reading', 'open', 'answering', 'dd-wager', 'dd-answer'].includes(this.phase)) { this.phase = 'reveal'; this.#setTimer(T.reveal, () => this.#afterReveal(), 'reveal'); }
    else if (this.phase === 'reveal') this.#setTimer(T.reveal, () => this.#afterReveal(), 'reveal');
    else if (this.phase === 'final-answer') this.#beginFinalReveal();
    else if (this.phase === 'final-reveal') this.#setTimer(T.finalStep, () => this.#finalStep(), 'final-step');
    if (this.phase === 'lobby' && !this.archivePacks.length) this.#requestArchive(this.era);
  }
}

// Jeopardy rules, ported from the Buzzworthy game (github.com/JasonWynkoop1/buzzworthy) onto this room.
// No network, no files, no real timers: time-outs are driven by tick(), and every time comes from room.now().
//
// How a clue goes: the clue is shown ("reading"), then the buzzers open for a few seconds with a visible clock. The first
// press wins and has a few seconds to answer: typed on the phone and judged leniently by judge.js, or spoken, with the
// host ruling (host mode). A wrong answer opens the buzzers again for everyone who has not tried. Players buzz in as
// individuals (up to 8); the room is never split into teams for this game.
//
// Fairness: the fastest thumb wins, not the fastest Wi-Fi. Each phone keeps its clock in step with the room's (it
// asks the TV the time every few seconds and keeps the answer that came back quickest), so every phone turns gold at
// the instant the room opens the buzzers (clue.liveAt), and each press says when it happened on the room's clock
// (`at`). The first press to arrive does not win outright: the room waits just long enough for a press from a phone
// on slower Wi-Fi that may have happened earlier (at most T.maxWait), then the earliest press wins. A phone that cannot
// stamp its presses (an older page) is timed when its press arrives, less its usual delay. A press that loses by a
// hair is still timed, so everyone can see the buzz order.
import { GameError, fail, cleanName, int } from '../../lib.js';
import { judge, asksForPerson } from './judge.js';
import { parseArchive, pickSeason, ERAS } from './archive.js';
import { HOUSE_PACKS } from './packs/index.js';
import { cleanAbout, explainCategory } from './about.js';

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
  reveal: 5000,         // how long the correct answer stays up
  revealNobody: 3800,   // ...when nobody got it
  ruling: 2400,         // the ruling on an answer: their words and right or wrong, before anything else happens
  roundIntro: 7000,     // the round's title and categories before the first pick
  earlyPenalty: 250,    // lockout for buzzing before the clue unlocks (or while it is not open), as on the show
  maxWait: 350,         // the longest the room waits after the first press for an earlier one still on its way
  waitMargin: 30,       // added to the slowest phone's usual delay when deciding how long to wait
  syncSlack: 40,        // a phone's clock may be this far out; a press this close to the opening still counts
  trustAt: 2500,        // a press stamped longer ago than this (or in the future) is timed when it arrives instead
  ddWager: 45000,       // a Daily Double wager not placed by then is the minimum
  ddSplash: 2200,       // "Maya bets $1,000" on the TV before the clock starts counting
  finalWager: 60000,    // Final Jeopardy wagers not placed by then are $0
  buzzLinger: 10000,    // after a clue, its buzz times stay at the bottom of the board this long
  finalAnswer: 35000,
  finalBeat: 2800,      // final reveal: a player's response, before right or wrong
  finalStep: 5000,      // final reveal: right or wrong and the wager, before the next player
  finalAnswerShow: 5000, // final reveal: the correct answer, after everyone
  hostRead: 30000,      // host mode: fallback if the host forgets to open buzzers
  hostAnswer: 30000,    // host mode: Daily Double fallback for the host to judge a spoken answer
  hostGrace: 8000,      // host mode: after the answer clock hits zero ("Time's up" on the TV), the host still has this long to rule
  captainGone: 15000,   // how long the captain may be away before someone else takes over
};

/** Answer clock choices (seconds) for spoken answers in host mode. 0 means no clock. */
export const ANSWER_TIMES = [5, 10, 15, 20, 30, 0];
export const REACTIONS = ['👏', '😂', '😱', '🔥', '🤯', '🎉'];
const REACT_GAP = 1200;    // ms between reactions from one player
const REACT_LIFE = 4000;   // ms a reaction stays in the view
export const STREAK_HOT = 3;      // correct answers in a row to be "on fire"
const MAX_ADJUST = 1000000;
export const MAX_PLAYERS = 10;
export const FINAL_FLOOR = 1000;   // the most a player with little or no money may bet in Final Jeopardy when everyone plays

// Long enough for a child or a grandparent to read the clue to the end.
export const readingTime = (text) => Math.max(4000, Math.min(10000, 1500 + String(text).length * 55));
/** With the TV reading the clue out loud: the longest the voice may take. The TV says when it is done (readDone),
 * which opens the buzzers sooner; this is only the backstop for a TV whose voice never starts or never ends. */
export const speakingTime = (text) => Math.max(5000, Math.min(16000, 2000 + String(text).length * 70));
/** After the voice stops, the buzzers open this much later, a moment every phone is told in advance. */
export const AFTER_SPEECH = 600;
/**
 * A picture, sound or video that goes with a clue: { kind: 'image' | 'audio' | 'video', url, start?, end?, credit? }.
 * The url must be https and point straight at the file (a page such as YouTube cannot be played on the Apple TV).
 * start and end (seconds) play only part of a long recording. Returns null for nothing, and throws for a bad one.
 */
export const MEDIA_MAX_SECONDS = 30;
const MEDIA_EXT = { image: /\.(jpe?g|png|gif|webp)$/i, audio: /\.(mp3|m4a|aac|wav)$/i, video: /\.(mp4|m4v|mov)$/i };
export function cleanMedia(m) {
  if (m == null || m === '') return null;
  if (typeof m !== 'object') fail('A picture, sound or video needs a link');
  const url = String(m.url ?? '').trim();
  if (!url) return null;
  // No URL class here: the Apple TV runs this in JavaScriptCore, which has none.
  const parts = url.match(/^https:\/\/([a-z0-9.-]+\.[a-z]{2,})(\/[^?#\s]*)?(\?[^#\s]*)?$/i);
  if (!parts || url.length > 800) fail('Picture, sound and video links must be a full web address starting with https://');
  let path = parts[2] ?? '/';
  try { path = decodeURIComponent(path); } catch { /* keep it as it is */ }
  const kind = ['image', 'audio', 'video'].includes(m.kind) ? m.kind : Object.keys(MEDIA_EXT).find((k) => MEDIA_EXT[k].test(path));
  if (!kind) fail('Link straight to a picture (.jpg, .png), a sound (.mp3, .m4a) or a video (.mp4)');
  const out = { kind, url };
  const sec = (x) => (x === undefined || x === null || x === '' ? null : Number(x));
  const start = sec(m.start), end = sec(m.end);
  if (start !== null && (!Number.isFinite(start) || start < 0)) fail('The start time must be a number of seconds');
  if (end !== null && (!Number.isFinite(end) || end <= (start ?? 0))) fail('The end time must come after the start');
  if (kind !== 'image') { if (start) out.start = start; if (end !== null) out.end = end; }
  const credit = String(m.credit ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
  if (credit) out.credit = credit;
  return out;
}
/** How long the TV may take to play a clue's sound or video before the buzzers open anyway (it says when it is done). */
export function mediaTime(media) {
  if (!media) return 0;
  if (media.kind === 'image') return 1500;
  const span = media.end != null ? media.end - (media.start ?? 0) : MEDIA_MAX_SECONDS;
  return Math.round(Math.min(MEDIA_MAX_SECONDS, span) * 1000) + 3000;   // + time to load
}

/** The family scoreboard keeps this many players (those who played least are forgotten first). */
const HALL_MAX = 40;
const hallKey = (name) => String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
function cleanHall(h) {
  const out = { games: Number.isInteger(h?.games) && h.games >= 0 ? h.games : 0, last: Array.isArray(h?.last) ? h.last.filter((k) => typeof k === 'string') : [], players: {} };
  for (const [k, e] of Object.entries(h?.players && typeof h.players === 'object' ? h.players : {})) {
    if (!e || typeof e.name !== 'string') continue;
    const n = (x) => (Number.isFinite(x) ? x : 0);
    out.players[k] = { name: e.name, color: typeof e.color === 'string' ? e.color : '#FFC940', games: n(e.games), wins: n(e.wins), best: n(e.best), streak: n(e.streak), bestStreak: n(e.bestStreak) };
  }
  return out;
}

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
    if (cat.about !== undefined && typeof cat.about !== 'string') fail(`Category ${c + 1}: the note for the host must be text`);
    if (!Array.isArray(cat.clues) || cat.clues.length !== ROWS) fail(`Category ${c + 1} needs exactly ${ROWS} clues`);
    cat.clues.forEach((cl, r) => {
      if (!String(cl?.clue ?? '').trim()) fail(`Category ${c + 1}, clue ${r + 1} is missing its clue text`);
      if (!String(cl?.answer ?? '').trim()) fail(`Category ${c + 1}, clue ${r + 1} is missing its answer`);
      if (!(int(cl.value) > 0) || !Number.isInteger(Number(cl.value))) fail(`Category ${c + 1}, clue ${r + 1} needs a positive whole-dollar value`);
      altOk(cl.alt, `Category ${c + 1}, clue ${r + 1}`);
      try { cleanMedia(cl.media); } catch (e) { fail(`Category ${c + 1}, clue ${r + 1}: ${e.message}`); }
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
    categories: (data.categories || []).filter((c) => c.name && Array.isArray(c.clues) && c.clues.length >= 5)
      .map((c) => (c.clues.some((cl) => cl.media) ? { ...c, clues: c.clues.map((cl) => ({ ...cl, media: safeMedia(cl.media) })) } : c)),
    finals: (data.finals || []).filter((fin) => fin.q && fin.a),
  };
}
const safeMedia = (m) => { try { return cleanMedia(m); } catch { return null; } };

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/** How a clue is remembered once this TV has shown it: a short fingerprint of its text (not the text itself). */
export function clueKey(q) {
  const text = String(q ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(36) + h2.toString(36).slice(0, 3);
}
/** The most clues remembered; the oldest are forgotten first. */
export const MAX_SEEN = 15000;

export class JeopardyGame {
  constructor(room) {
    this.room = room;
    this.houses = HOUSE_PACKS.map(({ id, data }) => normalizePack(id, data)).filter((p) => p.categories.length);
    this.archivePacks = [];
    this.ownPacks = [];
    this.packs = [];
    this.selected = new Set();
    this.settings = { answerTime: 10, hostJudges: false, asWritten: null, finalForAll: true, readAloud: false };   // the TV does not read clues out loud (no text-to-speech); the option stays in the engine, off
    this.era = 'any';
    this.archiveSeason = null;
    this.archiveRequest = null;     // { id, era } while a new season is wanted; the app downloads it
    this.archiveReqId = 0;
    this.archiveLoading = false;
    this.archiveError = false;
    this.easyPrev = null;           // the selection to bring back when easy mode is switched off
    this.draft = null;              // the 12 categories chosen ahead of time ([round 1, round 2]), to look over and swap
    this.played = new Set();        // category names already played, so Play again deals a fresh board
    // Every clue this TV has shown (by clueKey), kept between rooms in room.memory. A clue is not dealt again until
    // every clue in its pack has been shown; then that pack starts over.
    this.seen = new Set();
    this.#loadSeen();
    this.stats = new Map();         // per player: streak, best, right, wrong, fastest, bigWin, lockUntil, lastReact
    this.reactions = [];            // recent emoji reactions [{ id, pid, e, at }]
    this.reactSeq = 0;
    this.captainId = null;
    this.captainGoneAt = null;
    this.timer = null;              // { at, fire, kind, shownAt, shownMs }
    this.openedAt = 0;              // when the buzzers last opened, to time each press
    this.collecting = null;         // presses for the current opening, while the room waits for any earlier one still on its way
    this.#resetRun();
    this.#refreshPacks();
  }

  #resetRun() {
    this.phase = 'lobby';
    this.round = 0;
    this.rounds = [];
    this.controllerId = null;
    this.clue = null;
    this.peeking = null;            // the clue the picker is looking at on their phone, shown on the TV: { ci, ri }
    this.recentBuzzes = null;       // the last clue's buzz times, kept on screen for a few seconds after it ends: { cat, value, buzzes, until }
    this.lastResult = null;
    this.final = null;
    this.finalClue = null;
    this.timer = null;
    this.collecting = null;
    this.hallSig = null;            // the finished game already on the scoreboard (its players and scores)
    this.hallBefore = null;         // the scoreboard before it went in
  }
  #changed() {
    if (this.phase === 'gameover') this.#recordGame();
    this.room.changed();
  }
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
    // The wait for a slower phone's press is over: the earliest press wins.
    if (this.collecting && now >= this.collecting.until) this.#settle();
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
    // Someone who had not wagered or answered went away: carry on with everyone who is here.
    if (this.phase === 'final-answer' && this.timer?.kind !== 'final-wait') this.#checkFinalReady();
    if (this.recentBuzzes && now >= this.recentBuzzes.until) { this.recentBuzzes = null; this.#changed(); }
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
  /** A timer that started at `from` (which may be a moment ago: timers are checked a few times a second). */
  #setTimerFrom(from, ms, fire, kind) { this.timer = { at: from + ms, fire, kind, totalMs: ms, shownEnd: from + ms }; }
  #clearTimer() { this.timer = null; }

  // ---------- clues already shown on this TV ----------
  #loadSeen() {
    let data = null;
    try { data = this.room.memory?.load(GAME); } catch { data = null; }
    this.seen = new Set(Array.isArray(data?.seen) ? data.seen.filter((k) => typeof k === 'string') : []);
    this.hall = cleanHall(data?.hall);
  }
  #saveSeen() {
    while (this.seen.size > MAX_SEEN) this.seen.delete(this.seen.values().next().value);
    try { this.room.memory?.save(GAME, { v: 1, seen: [...this.seen], hall: this.hall }); } catch { /* nowhere to keep it */ }
  }

  // ---------- the family scoreboard: every finished game on this TV, kept between nights ----------
  /**
   * Adds the finished game to the scoreboard, once. A Final Jeopardy ruling flipped after the game ended changes the
   * scores, so the game is taken back out (from the copy kept before it went in) and added again.
   */
  #recordGame() {
    // Who played is fixed when the game first ends; someone leaving afterwards is still counted, with their score.
    const now = new Map(this.room.players.filter((p) => cleanName(p.name, 40)).map((p) => [hallKey(p.name), p]));
    const ps = this.hallSig
      ? JSON.parse(this.hallSig).map((e) => ({ ...e, score: now.get(hallKey(e.name))?.score ?? e.score }))
      : [...now.values()].map((p) => ({ name: p.name, color: p.color, score: p.score }));
    if (!ps.length) return;
    const sig = JSON.stringify(ps);
    if (sig === this.hallSig) return;
    if (this.hallBefore) this.hall = cleanHall(this.hallBefore);
    this.hallBefore = JSON.parse(JSON.stringify(this.hall));
    this.hallSig = sig;
    const top = Math.max(...ps.map((p) => p.score));
    const champs = top > 0 ? ps.filter((p) => p.score === top).map((p) => hallKey(p.name)) : [];
    const h = this.hall;
    h.games += 1;
    for (const p of ps) {
      const k = hallKey(p.name);
      const e = h.players[k] ??= { name: p.name, color: p.color, games: 0, wins: 0, best: 0, streak: 0, bestStreak: 0 };
      e.name = p.name; e.color = p.color;
      e.games += 1;
      e.best = Math.max(e.best, p.score);
      if (champs.includes(k)) {
        e.wins += 1;
        e.streak = h.last.includes(k) ? e.streak + 1 : 1;
        e.bestStreak = Math.max(e.bestStreak, e.streak);
      } else e.streak = 0;
    }
    // Someone who did not play tonight keeps their wins but loses their run as champion.
    for (const [k, e] of Object.entries(h.players)) if (!ps.some((p) => hallKey(p.name) === k)) e.streak = 0;
    h.last = champs;
    const keys = Object.keys(h.players);
    if (keys.length > HALL_MAX) {
      keys.sort((a, b) => h.players[a].games - h.players[b].games || h.players[a].wins - h.players[b].wins);
      for (const k of keys.slice(0, keys.length - HALL_MAX)) delete h.players[k];
    }
    this.#saveSeen();
  }
  /** The scoreboard as the screens show it: most wins first. */
  #hallView() {
    const list = Object.values(this.hall.players)
      .sort((a, b) => b.wins - a.wins || b.best - a.best || a.name.localeCompare(b.name))
      .slice(0, 8)
      .map((e) => ({ name: e.name, color: e.color, wins: e.wins, games: e.games, best: e.best, streak: e.streak }));
    return { games: this.hall.games, players: list };
  }
  /** Forget the family scoreboard (the host's "clear the scoreboard"). */
  resetHall() {
    this.#lobbyOnly();
    this.hall = cleanHall(null);
    this.hallBefore = null;
    this.#saveSeen();
    this.#changed();
  }
  #seenClue(cl) { return this.seen.has(cl.k ??= clueKey(cl.q)); }
  /** The clues of a category that have not been shown yet (of the five that are dealt). */
  #freshIn(c) { let n = 0; for (const cl of c.clues.slice(0, ROWS)) if (!this.#seenClue(cl)) n++; return n; }
  #markSeen(q) {
    const k = clueKey(q);
    this.seen.delete(k);   // most recent last, so the oldest are forgotten first
    this.seen.add(k);
    this.#saveSeen();
  }
  /** Packs whose every clue has been shown start over: their clues count as new again. Finals the same way. */
  #renewUsedUp(packs) {
    let changed = false;
    for (const p of packs) {
      if (!p.categories.length || p.categories.some((c) => this.#freshIn(c) > 0)) continue;
      for (const c of p.categories) for (const cl of c.clues) changed = this.seen.delete(cl.k ??= clueKey(cl.q)) || changed;
    }
    const finals = packs.flatMap((p) => p.finals);
    if (finals.length && finals.every((f) => this.#seenClue(f))) for (const f of finals) changed = this.seen.delete(f.k) || changed;
    if (changed) this.#saveSeen();
  }
  /**
   * Categories in the order they should be dealt: those with no clue shown yet first, then those with the most new
   * clues, then (in a tie) those not played in this room yet. Shuffled within each group.
   */
  #ranked(categories) {
    return this.#shuffle(categories)
      .map((c, i) => ({ c, i, fresh: this.#freshIn(c), played: this.played.has(c.name.toLowerCase()) ? 1 : 0 }))
      .sort((x, y) => y.fresh - x.fresh || x.played - y.played || x.i - y.i)
      .map((x) => x.c);
  }
  /** Forget which clues this TV has shown (the host's "start fresh"). */
  resetHistory() {
    this.#lobbyOnly();
    this.seen.clear();
    this.played.clear();
    this.#saveSeen();
    this.draft = null;
    this.#changed();
  }

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
          name: c.name, about: c.about,
          clues: c.clues.map((cl) => ({ q: cl.clue, a: cl.answer, alt: cl.alt ?? [], v: cl.value, dd: !!cl.dailyDouble, media: cleanMedia(cl.media) })),
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
  #chosen() { return this.packs.filter((p) => this.selected.has(p.id)); }
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
    const pack = this.packs.find((p) => p.id === id);
    if (!pack) return;
    // Switching a topic on while one of your games is set to be played as written goes back to mixing topics.
    if (!pack.own && !this.selected.has(id) && this.#asWrittenPacks()) for (const p of this.ownPacks) this.selected.delete(p.id);
    if (this.selected.has(id)) this.selected.delete(id); else this.selected.add(id);
    this.draft = null;
    this.#changed();
  }
  /** Play one of your own games (a board from the question editor) just as it was written. `add` makes it round 2. */
  playBoard(id, add = false) {
    this.#lobbyOnly();
    const pack = this.ownPacks.find((p) => p.id === id);
    if (!pack) fail('That game is not here any more');
    const keep = add ? this.#chosen().filter((p) => p.own && p.id !== id).slice(0, 1).map((p) => p.id) : [];
    this.selected = new Set([...keep, id]);
    this.settings.asWritten = null;
    this.easyPrev = null;
    this.draft = null;
    this.#changed();
  }
  /** Switch on every topic of one kind ('archive' or 'house'), or off. */
  setAllPacks(kind, on) {
    this.#lobbyOnly();
    const of = this.packs.filter((p) => !p.own && (kind === 'archive' ? p.id.startsWith('archive-') : !p.id.startsWith('archive-')));
    if (!of.length) return;
    if (on && this.#asWrittenPacks()) for (const p of this.ownPacks) this.selected.delete(p.id);
    for (const p of of) if (on) this.selected.add(p.id); else this.selected.delete(p.id);
    if (!this.selected.size) this.selected.add(of[0].id);
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
  /** Everyone plays Final Jeopardy (on), or only players with money (the show's rule). Any time before the final. */
  setFinalForAll(on) {
    if (this.phase.startsWith('final') || this.phase === 'gameover') fail('Final Jeopardy has started');
    this.settings.finalForAll = !!on;
    this.#changed();
  }
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
    this.#renewUsedUp(this.#chosen());
    const cats = this.#ranked(all);   // shuffled, the ones with nothing shown yet first
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
    const ranked = this.#ranked(spareAll);
    const best = this.#freshIn(ranked[0]);
    const spare = ranked.filter((c) => this.#freshIn(c) === best);
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
      // What the category is asking for, for the host to read out: its own note, or one for a well-known kind of name.
      about: cleanAbout(c.about) || explainCategory(c.name),
      clues: c.clues.slice(0, 5).map((cl, i) => ({
        // A board you wrote keeps the values you gave it; the house and archive packs are 200..1000, doubled in round 2.
        value: Number(cl.v) > 0 ? Math.round(Number(cl.v)) : (i + 1) * 200 * r,
        q: cl.q, a: cl.a, alt: cl.alt || [], used: false, dd: !!cl.dd, ...(cl.media ? { media: cl.media } : {}),
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
    // Categories with no clue shown on this TV yet first, so a clue only comes back once its whole pack has been played.
    this.#renewUsedUp(this.#chosen());
    const cats = this.#ranked(bank.categories);
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
    const freshFinals = bank.finals.filter((fin) => !this.played.has(`final:${fin.q}`) && !this.#seenClue(fin));
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
    // Someone who is here picks first (a phone that dropped out of the room before the start would hold up the board).
    const here = order.filter((id) => this.#connected(id));
    const from = here.length ? here : order;
    this.controllerId = from[Math.floor(this.#rng() * from.length)];
    this.captainId ??= order[0];
    this.#roundIntro();
  }
  /** The round's title and its categories on the TV, then the first pick. */
  #roundIntro() {
    this.lastResult = null;
    this.peeking = null;
    this.phase = 'round-intro';
    this.#setTimer(T.roundIntro, () => { if (this.phase === 'round-intro') { this.phase = 'board'; this.#changed(); } }, 'intro');
    this.#changed();
  }

  // ---------- the roster ----------
  kick(id) {
    this.#lobbyOnly();
    this.room.removePlayer(id);
    if (this.captainId === id) this.captainId = this.#order()[0] ?? null;
  }
  /** A host page is connected (someone scanned the host code on the TV, or typed the PIN). */
  hosted() { return (this.room.hosts ?? 0) > 0; }
  /** Who gets the captain controls: whoever joined first, and someone else if they stay away. With a host page connected
   *  there is no captain: the host (and the TV's remote) run the game. With "a host judges out loud" on and no host page,
   *  the captain is the host: their phone gets Open buzzers, Correct and Wrong, so the game never waits on a judge nobody has. */
  captain() {
    if (this.hosted()) return null;
    if (!this.captainId || !this.#player(this.captainId)) this.captainId = this.#order()[0] ?? null;
    return this.captainId;
  }
  /** Hands the captain's controls to another player (the TV, the host or the captain themselves may do this). */
  setCaptain(id) {
    if (!this.#player(id)) fail('No such player');
    this.captainId = id;
    this.captainGoneAt = null;
    this.#changed();
  }
  hostJudges() { return !!this.settings.hostJudges; }

  // ---------- the clue ----------
  board() { return this.round >= 1 && this.round <= this.rounds.length ? this.rounds[this.round - 1] : null; }

  /** With a host (a host page, or a host judging out loud), players say their pick and the host taps it. */
  picksAloud() { return this.hostJudges() || this.hosted(); }
  /** The picker is looking at a clue on their phone (or the host at the one called out): the TV lights it up. */
  peek(ci, ri) {
    if (this.phase !== 'board') return;
    const cl = this.board()?.[ci]?.clues[ri];
    const next = cl && !cl.used ? { ci, ri } : null;
    if (JSON.stringify(next) === JSON.stringify(this.peeking)) return;
    this.peeking = next;
    this.#changed();
  }
  pick(ci, ri) {
    if (this.phase !== 'board') return;
    this.peeking = null;
    const b = this.board();
    const cl = b?.[ci]?.clues[ri];
    if (!cl || cl.used) return;
    cl.used = true;
    this.#markSeen(cl.q);
    this.lastResult = null;
    this.collecting = null;
    this.recentBuzzes = null;
    this.clue = { ci, ri, cat: b[ci].name, about: b[ci].about || '', value: cl.value, q: cl.q, a: cl.a, alt: cl.alt, dd: cl.dd, media: cl.media ?? null, tried: [], buzzedId: null, wager: null, buzzes: [], buzzMs: null, open: 0, drafts: {}, prevController: this.controllerId };
    if (cl.dd) {
      this.phase = 'dd-wager';
      // A wager nobody places (a phone that went to sleep) is $0, so the game never stalls.
      const who = this.controllerId;
      this.#setTimer(T.ddWager, () => this.ddWager(who, 0), 'wager');
    } else {
      this.phase = 'reading';
      // With a host judging, the buzzers open when the host finishes reading aloud. Otherwise they open at a moment
      // known in advance, which every phone is told, so they all turn gold together.
      // With the TV reading it out loud, they open once the voice stops (readDone), or at the latest after speakingTime.
      // A picture, sound or video plays first: the TV says when it is done (readDone), with mediaTime as the backstop.
      const ms = (this.hostJudges() ? T.hostRead : this.readsAloud() ? speakingTime(cl.q) : readingTime(cl.q)) + mediaTime(cl.media);
      const at = this.#now() + ms;
      this.#setTimer(ms, () => this.#openBuzzers(T.buzzWindow, at), 'reading');
    }
    this.#changed();
  }
  openNow() { if (this.phase === 'reading') this.#openBuzzers(T.buzzWindow); }
  /** The TV reads clues out loud (never with a host, who reads them). */
  readsAloud() { return !!this.settings.readAloud && !this.hostJudges(); }
  setReadAloud(on) { this.#lobbyOnly(); this.settings.readAloud = !!on; this.#changed(); }
  /**
   * The TV finished clue (ci, ri): its sound or video has played and its voice has read it. Open the buzzers a moment
   * from now, a time every phone is told.
   */
  readDone(ci, ri) {
    if (this.phase !== 'reading' || this.hostJudges() || !(this.readsAloud() || this.clue?.media) || this.clue?.ci !== ci || this.clue?.ri !== ri) return;
    const at = this.#now() + AFTER_SPEECH;
    if (this.#liveAt() != null && this.#liveAt() <= at) return;
    this.#setTimer(AFTER_SPEECH, () => this.#openBuzzers(T.buzzWindow, at), 'reading');
    this.#changed();
  }
  /** Opens the buzzers. `at` is when they were due to open (the timer may be checked a moment later). */
  #openBuzzers(window, at = this.#now()) {
    this.phase = 'open';
    this.clue.buzzedId = null;
    this.collecting = null;
    // Each opening has a number: a press the phone sent for an earlier one (mashing through someone's answer) is too early.
    this.clue.open = (this.clue.open ?? 0) + 1;
    this.openedAt = Math.min(at, this.#now());
    this.#setTimerFrom(this.openedAt, window, () => { if (this.collecting) this.#settle(); else this.#endClue(); }, 'buzz');
    this.#changed();
  }

  /** When the buzzers open next (or opened, while they are open), on the room's clock, or null if nobody knows yet. */
  #liveAt() {
    const t = this.timer;
    if (!this.clue) return null;
    if (this.phase === 'open') return this.openedAt;
    if (this.phase === 'reading' && t?.kind === 'reading' && !this.hostJudges()) return t.at;
    if (this.phase === 'ruling' && t?.kind === 'ruling' && this.#reopens()) return t.at;
    return null;
  }
  /** After this ruling, will the buzzers open again? */
  #reopens() {
    const r = this.lastResult;
    if (!r || r.dd || r.correct) return false;
    return this.#order().some((id) => this.#connected(id) && !this.clue.tried.includes(id));
  }
  /** When a press happened on the room's clock: the phone's own stamp when it is believable, else when it arrived. */
  #pressTime(pid, at, now) {
    const lag = this.room.lagOf?.(pid);
    const stamp = Number(at);
    if (at != null && Number.isFinite(stamp) && stamp <= now + T.syncSlack && stamp >= now - T.trustAt) {
      this.room.noteLag?.(pid, now - stamp);
      return Math.min(stamp, now);
    }
    return now - Math.min(lag ?? 0, T.maxWait);
  }
  /** How long after the earliest press the room waits for one still on its way: the slowest phone's usual delay. */
  #waitFor(except) {
    let slowest = null;
    for (const id of this.#order()) {
      if (id === except || !this.#connected(id) || this.clue.tried.includes(id)) continue;
      const lag = this.room.lagOf?.(id);
      if (lag != null) slowest = Math.max(slowest ?? 0, lag);
    }
    // Nobody else can stamp their presses (older pages): first come, first served.
    if (slowest == null) return 0;
    return Math.min(T.maxWait, slowest + T.waitMargin);
  }
  /** The wait is over: the earliest press wins, and the rest are timed as late. */
  #settle() {
    const c = this.collecting;
    this.collecting = null;
    if (!c || this.phase !== 'open' || !this.clue || this.clue.open !== c.open) return null;
    const order = c.presses.slice().sort((a, b) => a.at - b.at || a.n - b.n);
    const [first, ...rest] = order;
    this.#win(first.pid, first.ms);
    for (const p of rest) {
      this.clue.buzzes = this.clue.buzzes.filter((b) => b.pid !== p.pid);
      this.clue.buzzes.push({ pid: p.pid, ms: p.ms, open: c.open });
      if (c.open === 1) { const st = this.#stat(p.pid); if (st.fastest == null || p.ms < st.fastest) st.fastest = p.ms; }
    }
    this.#changed();
    return first.pid;
  }
  #win(pid, ms) {
    const st = this.#stat(pid);
    this.clue.buzzedId = pid;
    this.clue.buzzMs = ms;
    // Fastest Finger counts the first opening only: after a miss everyone is already poised over the button.
    if (this.clue.open === 1 && (st.fastest == null || ms < st.fastest)) st.fastest = ms;
    // One time per player per clue (a second chance after a miss counts as a new buzz).
    this.clue.buzzes = this.clue.buzzes.filter((b) => b.pid !== pid);
    this.clue.buzzes.push({ pid, ms, won: true, open: this.clue.open });
    this.phase = 'answering';
    if (this.hostJudges()) this.#startAnswerClock(pid);
    else this.#setTimer(T.answer, () => this.#timeUp(pid), 'answer');
  }

  /**
   * A buzz. Returns what to tell the phone: { result: 'won' | 'wait' | 'late' | 'early' | 'tried' | 'ignored', ms }.
   * `seq` is the opening the phone was pressing for (clue.open, or the next one once its button has turned gold for
   * it); a press for an earlier one is too early for this one. `at` is when it was pressed on the room's clock.
   * 'wait' means the press is in, and the room is waiting a split second for a faster one that may still be on its way.
   */
  buzz(pid, seq, at) {
    const st = this.#stat(pid);
    if (!this.#player(pid) || !this.clue) return { result: 'ignored' };
    const now = this.#now();
    const pressed = this.#pressTime(pid, at, now);
    // The buzzers were due to open by the time of this press (the room's timers are only checked a few times a
    // second, and the phone turned gold right on time): open them now, as of when they were due.
    const due = this.#liveAt();
    if (due != null && this.phase !== 'open' && this.timer && Math.max(now, pressed) >= due - T.syncSlack && (seq == null || Number(seq) > (this.clue.open ?? 0) || now >= due)) {
      const t = this.timer; this.timer = null; t.fire();
    }
    const tried = this.clue.tried.includes(pid);
    if (this.phase === 'reading' || (this.phase === 'ruling' && !tried)) { st.lockUntil = pressed + T.earlyPenalty; return { result: 'early' }; }
    // Someone beat them to it: still time it, so everyone sees the buzz order.
    if (this.phase === 'answering' && this.openedAt) {
      const opening = this.clue.open;
      if (tried || this.clue.buzzedId === pid || this.clue.buzzes.some((b) => b.pid === pid && b.open === opening)) return { result: 'ignored' };
      if (seq != null && Number(seq) < opening) { st.lockUntil = pressed + T.earlyPenalty; return { result: 'early' }; }
      const late = Math.max(0, pressed - this.openedAt);
      this.clue.buzzes = this.clue.buzzes.filter((b) => b.pid !== pid);
      this.clue.buzzes.push({ pid, ms: late, open: opening });
      // Pressing on through someone's answer earns a short lockout, so mashing can't win the next opening.
      st.lockUntil = pressed + T.earlyPenalty;
      if (opening === 1 && (st.fastest == null || late < st.fastest)) st.fastest = late;
      this.#changed();
      return { result: 'late', ms: late };
    }
    if (this.phase !== 'open') return { result: 'ignored' };
    if (tried) return { result: 'tried' };
    if (seq != null && Number(seq) < this.clue.open) { st.lockUntil = pressed + T.earlyPenalty; return { result: 'early' }; }
    if (pressed < st.lockUntil) return { result: 'early' };
    const when = Math.max(pressed, this.openedAt);
    const ms = when - this.openedAt;
    // Wait a split second for an earlier press from a phone on slower Wi-Fi, unless nobody else could have one.
    const c = (this.collecting ??= { open: this.clue.open, presses: [], until: Infinity, n: 0 });
    if (c.presses.some((p) => p.pid === pid)) return { result: 'wait', ms };
    c.presses.push({ pid, at: when, ms, n: c.n++ });
    const earliest = Math.min(...c.presses.map((p) => p.at));
    c.until = Math.min(c.until, earliest + this.#waitFor(c.presses.length === 1 ? pid : null));
    const waiting = this.#order().some((id) => this.#connected(id) && !this.clue.tried.includes(id) && !c.presses.some((p) => p.pid === id));
    if (!waiting || now >= c.until) {
      const winner = this.#settle();
      if (winner === pid) return { result: 'won', ms };
      return { result: 'late', ms };
    }
    return { result: 'wait', ms };
  }

  /** Host mode: the visible answer clock. At zero the TV says "Time's up" and the host has a short grace to rule. */
  #startAnswerClock(pid) {
    const sec = this.settings.answerTime;
    if (!sec) { this.#clearTimer(); return; }
    const ms = sec * 1000;
    this.#setTimer(ms + T.hostGrace, () => this.#timeUp(pid), 'answer');
    this.timer.totalMs = ms;
    this.timer.shownEnd = this.#now() + ms;
  }
  /** The answer clock ran out: whatever they had typed (and not sent) is their answer. */
  #timeUp(pid) {
    const typed = this.clue?.drafts?.[pid];
    if (typed && String(typed).trim() && !this.hostJudges()) this.submitAnswer(pid, typed, false);
    else this.submitAnswer(pid, '', true);
  }
  /** What a player has typed so far (sent as they type), kept in case the clock runs out before they send it. */
  typing(pid, text) {
    text = String(text ?? '').slice(0, 80);
    if (this.phase === 'answering' && this.clue?.buzzedId === pid) this.clue.drafts[pid] = text;
    else if (this.phase === 'dd-answer' && this.controllerId === pid) this.clue.drafts[pid] = text;
    else if (this.phase === 'final-answer' && this.final?.eligible.includes(pid) && !(pid in this.final.answers)) this.final.drafts[pid] = text;
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
      this.lastResult = { pid, answer: shown(), correct, delta: v, overridden: false, streak: this.#stat(pid).streak, timedOut: !!timedOut, prevController: this.clue.prevController };
      if (correct) this.controllerId = pid;
      this.#ruling();
      return;
    }
    if (this.phase === 'dd-answer' && this.controllerId === pid) {
      const correct = decide();
      const p = this.#player(pid);
      const v = this.clue.wager;
      if (p) p.score += correct ? v : -v;
      this.#tally(pid, correct, v);
      this.lastResult = { pid, answer: shown(), correct, delta: v, overridden: false, dd: true, streak: this.#stat(pid).streak, timedOut: !!timedOut, prevController: this.clue.prevController };
      this.#ruling();
    }
  }
  /** A short beat for the ruling (their answer, then right or wrong) before the buzzers reopen or the answer shows. */
  #ruling() {
    this.phase = 'ruling';
    this.clue.buzzedId = this.lastResult.pid;
    const at = this.#now() + T.ruling;
    this.#setTimer(T.ruling, () => this.#afterRuling(at), 'ruling');
    this.#changed();
  }
  #afterRuling(at) {
    if (this.phase !== 'ruling') return;
    const r = this.lastResult;
    // With a host judging, a right answer goes straight back to the board: the host said the answer, and the score count-up
    // carries on in the podiums along the bottom.
    if (r && r.correct && this.hostJudges()) { this.#afterReveal(); return; }
    if (!r || r.dd || r.correct) { this.#revealClue(); return; }
    const remaining = this.#order().filter((id) => this.#connected(id) && !this.clue.tried.includes(id));
    if (remaining.length === 0) this.#revealClue();
    else this.#openBuzzers(T.rebuzzWindow, at);
  }
  /** What a player typed for their answer (phones). */
  answer(pid, text) {
    if (this.hostJudges()) fail('The host judges answers out loud.');
    if (!String(text ?? '').trim()) return;   // an empty send is a slip of the thumb, not an answer
    this.submitAnswer(pid, text, false);
  }

  ddWager(pid, amount) {
    if (this.phase !== 'dd-wager' || pid !== this.controllerId) return;
    const max = this.maxDDWager(pid);
    let w = Math.round(Number(amount));
    if (!Number.isFinite(w)) fail('Enter a number');
    w = clamp(w, 0, max);   // from $0 up to the most they can bet
    this.clue.wager = w;
    this.phase = 'dd-answer';
    this.#setTimer(T.ddSplash + readingTime(this.clue.q) + mediaTime(this.clue.media) + (this.hostJudges() ? T.hostAnswer : T.ddAnswer), () => this.#timeUp(pid), 'answer');
    this.#changed();
  }
  /** Up to your score; with everyone playing, a player with little or no money may still bet up to $1,000. */
  maxFinalWager(pid) {
    const score = Math.max(0, this.#player(pid)?.score ?? 0);
    return this.settings.finalForAll ? Math.max(score, FINAL_FLOOR) : score;
  }
  maxDDWager(pid) { return Math.max(this.#player(pid)?.score ?? 0, 1000 * this.round); }

  #endClue() {
    if (!this.clue) return;
    if (this.phase === 'answering') { this.#timeUp(this.clue.buzzedId); return; }
    this.#revealClue();
  }
  #revealClue() {
    this.phase = 'reveal';
    this.#setTimer(this.lastResult ? T.reveal : T.revealNobody, () => this.#afterReveal(), 'reveal');
    this.#changed();
  }
  #afterReveal() {
    this.peeking = null;
    const done = this.clue;
    this.clue = null;
    const left = this.board().some((c) => c.clues.some((cl) => !cl.used));
    this.#clearTimer();
    if (!left) this.phase = 'round-end';
    else {
      this.phase = 'board';
      // Who buzzed, and how fast, stays up for a while: the board comes back quickly (at once after a right answer with a host).
      this.recentBuzzes = done?.buzzes?.length ? { cat: done.cat, value: done.value, buzzes: done.buzzes.slice(), until: this.#now() + T.buzzLinger } : null;
      // If whoever is in control left, give control to someone who is here.
      if (!this.#connected(this.controllerId) || !this.#player(this.controllerId)) {
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
        // Lowest score picks first in the next round (someone who is here).
        const here = this.room.players.filter((p) => this.#connected(p.id));
        const sorted = (here.length ? here : this.room.players).slice().sort((a, b) => a.score - b.score);
        if (sorted.length) this.controllerId = sorted[0].id;
        this.#roundIntro();
      } else this.#startFinal();
    } else if (this.phase === 'round-intro') { this.#clearTimer(); this.phase = 'board'; this.#changed(); }
    else if (this.phase === 'ruling') { this.#clearTimer(); this.#afterRuling(); }
    else if (this.phase === 'reveal') { this.#clearTimer(); this.#afterReveal(); }
    else if (this.phase === 'final-wager') this.#beginFinalClue();
    else if (this.phase === 'final-answer') { this.#clearTimer(); this.#beginFinalReveal(); }
    else if (this.phase === 'final-reveal') this.#finalStep();
  }
  /** Skip a clue (a broken or unfair one): show the answer, and nobody wins or loses anything for it. */
  skipClue() {
    if (['reading', 'open', 'answering', 'ruling'].includes(this.phase)) {
      if (this.phase !== 'ruling') this.lastResult = null;
      this.#clearTimer();
      this.#revealClue();
    } else if (this.phase === 'dd-wager' || this.phase === 'dd-answer') {
      if (this.phase === 'dd-wager') this.clue.wager = 0;
      this.lastResult = null;
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
      if (['open', 'reading', 'answering', 'ruling'].includes(this.phase)) this.#revealClue();
    } else if (!r.dd && this.controllerId === r.pid && r.prevController && this.#player(r.prevController)) {
      // Taking back a right answer also takes back the control it won.
      this.controllerId = r.prevController;
    }
    this.#changed();
  }

  // ---------- the final round ----------
  #startFinal() {
    this.round = this.rounds.length + 1;
    // On the show only players with money play the final. At home everyone does by default, so nobody just watches.
    const eligible = this.#order().filter((id) => this.settings.finalForAll ? !!this.#player(id) : (this.#player(id)?.score ?? 0) > 0);
    if (!this.finalClue || eligible.length === 0) {
      this.phase = 'gameover';
      this.#clearTimer();
      this.#changed();
      return;
    }
    this.final = { category: this.finalClue.category, q: this.finalClue.q, a: this.finalClue.a, alt: this.finalClue.alt, eligible, wagers: {}, answers: {}, drafts: {}, results: {}, revealOrder: [], revealIndex: -1, stage: null, answerShown: false };
    this.phase = 'final-wager';
    // Wagers have a clock too, so one sleeping phone can't hold up the final: when it runs out, anyone who has not
    // bet bets nothing. Even then the clue is not shown until the host (or the captain) starts it.
    this.#setTimer(T.finalWager, () => this.#lockFinalWagers(), 'wager');
    this.#changed();
  }
  /** The wager clock ran out: whoever has not bet bets $0, and the game waits for the host to show the clue. */
  #lockFinalWagers() {
    if (this.phase !== 'final-wager') return;
    for (const id of this.final.eligible) if (!(id in this.final.wagers)) this.final.wagers[id] = 0;
    this.#changed();
  }
  finalWager(pid, amount) {
    if (this.phase !== 'final-wager' || !this.final.eligible.includes(pid)) return;
    const p = this.#player(pid);
    let w = Math.round(Number(amount));
    if (!Number.isFinite(w)) fail('Enter a number');
    w = clamp(w, 0, this.maxFinalWager(pid));
    this.final.wagers[pid] = w;
    this.#changed();
    this.#checkFinalReady();
  }
  /** Everyone who is here has answered: go on to the reveal without waiting for the clock. (Wagers never start the clue by
   *  themselves: the host shows it when they have all locked in.) */
  #checkFinalReady() {
    const f = this.final;
    if (!f) return;
    const here = f.eligible.filter((id) => this.#connected(id));
    if (this.phase === 'final-answer' && here.length && here.every((id) => id in f.answers) && this.timer?.kind !== 'final-wait') {
      // A short pause so the last player sees "locked in" before the reveal.
      this.#setTimer(1500, () => this.#beginFinalReveal(), 'final-wait');
    }
  }
  #beginFinalClue() {
    if (this.phase !== 'final-wager') return;
    for (const id of this.final.eligible) if (!(id in this.final.wagers)) this.final.wagers[id] = 0;
    this.phase = 'final-answer';
    this.#markSeen(this.final.q);
    this.#setTimer(T.finalAnswer, () => this.#beginFinalReveal(), 'final');
    this.#changed();
  }
  finalAnswer(pid, text) {
    if (this.phase !== 'final-answer' || !this.final.eligible.includes(pid)) return;
    if (pid in this.final.answers) return; // locked in already
    this.final.answers[pid] = String(text || '').slice(0, 80);
    this.#changed();
    this.#checkFinalReady();
  }
  #beginFinalReveal() {
    if (this.phase !== 'final-answer') return;
    const f = this.final;
    f.drafts ??= {};
    for (const id of f.eligible) {
      // Typed but not locked in when the clock ran out still counts.
      const ans = f.answers[id] || f.drafts[id] || '';
      f.results[id] = { answer: ans.trim() ? ans : '(no answer)', correct: judge(ans, [f.a, ...f.alt], { person: asksForPerson(f.q) }), shown: false, applied: false };
    }
    // Lowest score first, so the leader's wager is the last thing revealed.
    const score = (id) => this.#player(id)?.score ?? 0;
    f.revealOrder = f.eligible.filter((id) => this.#player(id)).sort((a, b) => score(a) - score(b));
    f.revealIndex = -1;
    f.stage = null;
    f.answerShown = false;
    this.phase = 'final-reveal';
    this.#finalStep();
  }
  /**
   * One beat of the final reveal. Each player: their response ('answer'), then right or wrong with the wager
   * ('verdict'). After everyone: the correct answer, then the champion.
   */
  #finalStep() {
    const f = this.final;
    if (f.stage === 'answer' && f.revealIndex >= 0 && f.revealIndex < f.revealOrder.length) {
      const id = f.revealOrder[f.revealIndex];
      const r = f.results[id];
      const p = this.#player(id);
      if (p && !r.applied) {
        p.score += r.correct ? f.wagers[id] : -f.wagers[id];
        this.#tally(id, r.correct, f.wagers[id]);
        r.applied = true;
      }
      f.stage = 'verdict';
      this.#setTimer(T.finalStep, () => this.#finalStep(), 'final-step');
      this.#changed();
      return;
    }
    f.revealIndex++;
    if (f.revealIndex >= f.revealOrder.length) {
      f.revealIndex = f.revealOrder.length - 1;
      if (!f.answerShown) {
        f.answerShown = true;
        f.stage = 'done';
        this.#setTimer(T.finalAnswerShow, () => this.#finalStep(), 'final-step');
        this.#changed();
        return;
      }
      this.phase = 'gameover';
      this.#clearTimer();
      this.#changed();
      return;
    }
    f.results[f.revealOrder[f.revealIndex]].shown = true;
    f.stage = 'answer';
    this.#setTimer(T.finalBeat, () => this.#finalStep(), 'final-step');
    this.#changed();
  }
  /** A player left (the host removed them): forget them everywhere, so nothing waits for them. */
  playerRemoved(id) {
    const f = this.final;
    if (f) {
      f.eligible = f.eligible.filter((x) => x !== id);
      delete f.wagers[id]; delete f.answers[id]; if (f.drafts) delete f.drafts[id];
      const at = f.revealOrder.indexOf(id);
      if (at >= 0) {
        f.revealOrder.splice(at, 1);
        if (at <= f.revealIndex) { f.revealIndex -= 1; if (at === f.revealIndex + 1 && f.stage === 'answer') f.stage = 'verdict'; }
      }
      if (this.phase === 'final-wager' || this.phase === 'final-answer') {
        if (!f.eligible.length) { this.phase = 'gameover'; this.#clearTimer(); } else this.#checkFinalReady();
      }
    }
    if (this.clue && this.clue.buzzedId === id && this.phase === 'answering') { this.lastResult = null; this.#clearTimer(); this.#revealClue(); }
    if (this.controllerId === id) {
      const here = this.#order().filter((x) => this.#connected(x));
      this.controllerId = here[0] ?? this.#order()[0] ?? null;
      if (this.phase === 'dd-wager' || this.phase === 'dd-answer') { this.lastResult = null; this.#clearTimer(); this.#revealClue(); }
    }
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
      case 'setCaptain': return this.setCaptain(String(a.pid ?? a.id ?? ''));
      case 'pick': return this.pick(Number(a.ci), Number(a.ri));
      case 'peek': return this.peek(Number(a.ci), Number(a.ri));
      case 'judge': return this.judgeNow(a.correct === true);
      // The host types in the bet a player says out loud (or places it for a phone that is not answering).
      case 'ddWager': return this.ddWager(this.controllerId, a.amount);
      case 'openNow': return this.openNow();
      case 'readDone': return this.readDone(Number(a.ci), Number(a.ri));
      case 'setReadAloud': return this.setReadAloud(a.on);
      case 'advance': return this.advance();
      case 'skip': return this.skipClue();
      case 'override': return this.override();
      case 'finalOverride': return this.finalOverride(String(a.pid ?? a.targetPid ?? ''));
      case 'endRound': return this.endRound();
      case 'playAgain': return this.playAgain();
      case 'endGame': return this.endGame();
      case 'kick': return this.kick(String(a.pid ?? a.targetPid ?? a.id ?? ''));
      // After the game, a fixed score changes the family scoreboard too.
      case 'adjustScore': { const r = this.room.adjustScore(String(a.id ?? a.targetPid ?? ''), { delta: a.delta, set: a.set }); this.#changed(); return r; }
      case 'toggleEasy': return this.toggleEasy();
      case 'setAnswerTime': return this.setAnswerTime(a.seconds);
      case 'setFinalForAll': return this.setFinalForAll(a.on);
      case 'setEra': return this.setEra(String(a.era ?? ''));
      case 'setHostJudges': return this.setHostJudges(a.on);
      case 'setAsWritten': return this.setAsWritten(a.on === null ? null : a.on);
      case 'previewBoard': return this.previewBoard();
      case 'swapCategory': return this.swapCategory(Number(a.r), Number(a.ci));
      case 'clearPreview': return this.clearPreview();
      case 'playBoard': return this.playBoard(String(a.pack ?? a.id ?? ''), a.add === true);
      case 'setAllPacks': return this.setAllPacks(a.kind === 'archive' ? 'archive' : 'house', a.on !== false);
      case 'resetHistory': return this.resetHistory();
      case 'resetHall': return this.resetHall();
      default: throw new GameError(`Unknown action ${action}`);
    }
  }
  /** What the captain's phone may do (with a host page connected there is no captain; without one the captain is the host). */
  static CAPTAIN_ACTIONS = new Set(['judge', 'openNow', 'pick', 'peek', 'ddWager', 'kick', 'setCaptain', 'togglePack', 'start', 'advance', 'skip', 'override', 'finalOverride', 'endRound', 'playAgain', 'endGame', 'adjustScore', 'toggleEasy', 'setAnswerTime', 'setEra', 'previewBoard', 'swapCategory', 'clearPreview', 'setHostJudges', 'setAsWritten', 'setFinalForAll', 'setReadAloud', 'playBoard', 'setAllPacks', 'resetHistory', 'resetHall']);

  /** A message from a phone. */
  onPlayer(player, msg) {
    const pid = player.id;
    switch (msg.t) {
      case 'buzz': return { t: 'buzz-result', ...this.buzz(pid, msg.seq, msg.at), ...(msg.id != null ? { id: String(msg.id).slice(0, 20) } : {}) };
      case 'draft': this.typing(pid, msg.text); return undefined;
      case 'answer': this.answer(pid, msg.text); return { t: 'ack', what: 'answer' };
      case 'pick': {
        // The player in control picks. With a host, the player says their pick out loud and the host taps it.
        if (this.picksAloud()) fail('Tell the host your pick.');
        const allowed = pid === this.controllerId || (pid === this.captain() && !this.#connected(this.controllerId));
        if (!allowed) fail('It is not your pick');
        this.pick(Number(msg.ci), Number(msg.ri));
        return undefined;
      }
      case 'peek': {
        if (this.picksAloud()) return undefined;
        if (pid === this.controllerId || (pid === this.captain() && !this.#connected(this.controllerId))) this.peek(Number(msg.ci), Number(msg.ri));
        return undefined;
      }
      case 'dd-wager': this.ddWager(pid, msg.amount); return { t: 'ack', what: 'wager' };
      case 'final-wager': this.finalWager(pid, msg.amount); return { t: 'ack', what: 'wager' };
      case 'final-answer': this.finalAnswer(pid, msg.text); return { t: 'ack', what: 'answer' };
      case 'react': this.react(pid, msg.e); return undefined;
      case 'cap': {
        if (this.captain() !== pid) fail('Only the captain can do that');
        if (!JeopardyGame.CAPTAIN_ACTIONS.has(msg.action)) fail('Not allowed');
        // Ruling, opening the buzzers and picking for someone are the judge's: only when the captain is the host.
        if (['judge', 'openNow', 'ddWager'].includes(msg.action) && !this.hostJudges()) fail('The game checks typed answers');
        if ((msg.action === 'pick' || msg.action === 'peek') && !this.hostJudges() && pid !== this.controllerId && this.#connected(this.controllerId)) fail('It is not your pick');
        return this.act(msg.action, msg.args ?? {}) ?? undefined;
      }
      default: return undefined;
    }
  }

  // ---------- views ----------
  #timerView() {
    const t = this.timer;
    if (!t || !['buzz', 'answer', 'final', 'wager', 'reading', 'intro'].includes(t.kind)) return null;
    if (t.kind === 'reading' && this.hostJudges()) return null;   // the host reads aloud at their own pace
    const left = Math.max(0, Math.round(t.shownEnd - this.#now()));
    return { kind: t.kind, totalMs: t.totalMs, leftMs: left };
  }
  #players() {
    return this.room.players.map((p) => ({ id: p.id, name: p.name, score: p.score, color: p.color, connected: this.#connected(p.id), streak: this.#stat(p.id).streak }));
  }
  /**
   * One line for the TV that says what is going on and who has to do what next, so nobody has to guess:
   * { pid: whose moment it is (or null), text: what is happening, next: what happens next, or who moves things along }.
   * The Apple TV (JeoGuideStrip) and the browser TV (guideStrip() in public/games/jeopardy/tv.js) show it as it is.
   */
  #guide() {
    const name = (id) => this.#player(id)?.name ?? 'Someone';
    const signed = (n) => `${n < 0 ? '-' : '+'}$${Math.abs(n).toLocaleString('en-US')}`;
    const host = this.hostJudges();
    const hosted = this.hosted();
    const cap = this.captain();
    // Who moves things along when the game waits: the host, or the captain (the TV's own remote can too).
    const mover = hosted ? 'The host' : cap ? `${name(cap)} (captain)` : host ? 'The host' : 'The captain';
    // Who rules on spoken answers: the host page, or the captain's phone when there is none.
    const judge = !hosted && cap ? name(cap) : 'the host';
    const ctrl = this.controllerId;
    const r = this.lastResult;
    const c = this.clue;
    const f = this.final;
    const locked = (o) => `${Object.keys(o ?? {}).length} of ${f?.eligible.length ?? 0} locked in`;
    // Everyone who is here has locked in a wager: all that is left is for the host to show the clue.
    const allLocked = (ff) => !!ff && ff.eligible.filter((id) => this.#connected(id)).every((id) => id in ff.wagers);
    switch (this.phase) {
      case 'lobby':
        if (!this.room.players.length) return { pid: null, text: 'Scan the code with your phone to join', next: host || hosted ? 'The host starts the game when everyone is in' : 'The first to join is captain' };
        if (hosted) return { pid: null, text: 'A host is running this game', next: 'The host starts the game when everyone is in' };
        if (host) return { pid: cap, text: `${name(cap)} is the host`, next: `${name(cap)} starts the game and rules on every answer` };
        return { pid: cap, text: `${name(cap)} is captain`, next: host ? 'The host starts the game when everyone is in' : `${name(cap)} starts the game when everyone is in` };
      case 'round-intro':
        return { pid: ctrl, text: this.round === 2 ? 'Round 2: every value is doubled' : `Round ${this.round}: here are the categories`, next: `${name(ctrl)} picks first` };
      case 'board': {
        const pk = this.peeking && this.board()?.[this.peeking.ci];
        if (pk) return { pid: ctrl, text: `${name(ctrl)} is eyeing ${pk.name} for $${pk.clues[this.peeking.ri].value.toLocaleString('en-US')}`, next: host || hosted ? `${judge === 'the host' ? 'The host' : judge} opens it` : `${name(ctrl)} taps Open on their phone` };
        const text = r && r.pid === ctrl && r.correct ? `${name(ctrl)} got the last one, so it’s their pick` : `${name(ctrl)}’s pick`;
        const next = host || hosted ? `${name(ctrl)}, tell ${judge} a category and an amount`
          : this.#connected(ctrl) ? `${name(ctrl)} picks a clue on their phone`
            : `${name(ctrl)} is away, so ${hosted ? 'the host' : 'the captain'} picks for them`;
        return { pid: ctrl, text, next };
      }
      case 'reading':
        return { pid: null, text: host ? `${judge === 'the host' ? 'The host' : judge} reads the clue out loud` : 'Read the clue', next: host ? `Buzzers open when ${judge} says go` : 'Buzzers open when the bar fills. Buzz too early and you’re locked out a moment' };
      case 'open':
        return { pid: null, text: 'Buzzers are open!', next: r && !r.correct ? `${name(r.pid)} missed it. Anyone else?` : 'First to buzz on their phone answers' };
      case 'answering':
        return { pid: c?.buzzedId ?? null, text: `${name(c?.buzzedId)} buzzed in first`, next: host ? `${name(c?.buzzedId)}, say your answer. ${judge === 'the host' ? 'The host' : judge} rules Correct or Wrong` : `${name(c?.buzzedId)} is typing an answer on their phone` };
      case 'ruling':
        if (!r) return null;
        if (r.correct) return { pid: r.pid, text: `${name(r.pid)} is right! ${signed(r.delta)}`, next: r.dd ? 'Here’s the answer' : `${name(r.pid)} picks next` };
        return { pid: r.pid, text: `${name(r.pid)} ${r.timedOut ? 'ran out of time' : 'is wrong'}. ${signed(-r.delta)}`, next: r.dd ? 'Here’s the answer' : 'Everyone else can buzz in again' };
      case 'reveal':
        return { pid: ctrl, text: r?.correct ? `${name(r.pid)} got it! ${signed(r.delta)}` : 'Nobody got that one', next: `${name(ctrl)} picks next. The board is back in a moment` };
      case 'dd-wager':
        return { pid: ctrl, text: `Daily Double! Only ${name(ctrl)} plays this one`, next: host ? `${name(ctrl)} bets on their phone` : `${name(ctrl)} is placing a bet on their phone` };
      case 'dd-answer':
        return { pid: ctrl, text: `${name(ctrl)} bet $${(c?.wager ?? 0).toLocaleString('en-US')}`, next: host ? `${name(ctrl)}, say your answer. ${judge === 'the host' ? 'The host' : judge} rules Correct or Wrong` : `Only ${name(ctrl)} answers, on their phone` };
      case 'round-end':
        return { pid: hosted ? null : cap, text: `End of round ${this.round}`, next: `${mover} taps Continue for ${this.round >= this.rounds.length ? 'Final Jeopardy' : `round ${this.round + 1}`}` };
      case 'final-wager':
        return { pid: null, text: `Final Jeopardy: ${f?.category ?? ''}`, next: allLocked(f) ? `Everyone is locked in. ${mover} shows the clue` : `Everyone bets on their phone. ${locked(f?.wagers)}` };
      case 'final-answer':
        return { pid: null, text: 'Write your response on your phone', next: locked(f?.answers) };
      case 'final-reveal': {
        const id = f?.revealOrder?.[f.revealIndex];
        if (f?.stage === 'done' || !id) return { pid: null, text: 'And the correct response is…', next: 'Then we crown the champion' };
        return { pid: id, text: `${name(id)}’s response`, next: 'Lowest score goes first' };
      }
      case 'gameover':
        return { pid: hosted ? null : cap, text: 'Game over!', next: `${mover} can start a new game` };
      default:
        return null;
    }
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
      hosted: this.hosted(),
      hostJudges: this.hostJudges(),
      controllerId: this.controllerId,
      players: this.#players(),
      timer: this.#timerView(),
      guide: this.#guide(),
      board: b && b.map((c) => ({ name: c.name, about: c.about || '', clues: c.clues.map((cl) => ({ value: cl.value, used: cl.used })) })),
      // The clue the picker is looking at (the TV lights it up), and whether picks are said out loud to a host.
      peek: this.phase === 'board' ? this.peeking : null,
      picksAloud: this.picksAloud(),
      clue: this.clue && {
        ci: this.clue.ci, ri: this.clue.ri, cat: this.clue.cat, about: this.clue.about || '', value: this.clue.value, dd: this.clue.dd, wager: this.clue.wager,
        q: this.phase === 'dd-wager' ? null : this.clue.q,
        media: this.phase === 'dd-wager' ? null : this.clue.media ?? null,
        answer: showAnswer ? this.clue.a : null,
        buzzedId: this.clue.buzzedId,
        buzzMs: this.clue.buzzMs,
        // Everyone who buzzed on this clue, fastest first, with their time in ms.
        // Earlier openings first (after a wrong answer the buzzers open again), then fastest.
        buzzes: this.clue.buzzes.slice().sort((x, y) => (x.open ?? 1) - (y.open ?? 1) || x.ms - y.ms).map((x) => ({ pid: x.pid, ms: x.ms, won: !!x.won, open: x.open ?? 1 })),
        open: this.clue.open ?? 0,
        // When the buzzers open (or opened) on the room's clock, and which opening that is: each phone turns its
        // button gold at that instant by its own clock, which it keeps in step with the room's.
        liveAt: (() => { const at = this.#liveAt(); return at == null ? null : Math.round(at); })(),
        liveSeq: this.phase === 'open' ? (this.clue.open ?? 0) : (this.clue.open ?? 0) + 1,
        tried: this.clue.tried,
      },
      // The last clue's buzz times, for a few seconds after it, on the board (fastest first within each opening).
      recentBuzzes: this.phase === 'board' && this.recentBuzzes
        ? { cat: this.recentBuzzes.cat, value: this.recentBuzzes.value, buzzes: this.recentBuzzes.buzzes.slice().sort((x, y) => (x.open ?? 1) - (y.open ?? 1) || x.ms - y.ms).map((x) => ({ pid: x.pid, ms: x.ms, won: !!x.won, open: x.open ?? 1 })) }
        : null,
      lastResult: this.lastResult,
      answerTime: this.settings.answerTime,
      finalForAll: !!this.settings.finalForAll,
      readAloud: !!this.settings.readAloud,
      readsAloud: this.readsAloud(),
      answerTimes: ANSWER_TIMES,
      hotStreak: STREAK_HOT,
      reactions: this.reactions.filter((r) => now - r.at < REACT_LIFE).map((r) => ({ id: r.id, pid: r.pid, e: r.e })),
      reactionChoices: REACTIONS,
    };
    if (this.phase === 'gameover') v.awards = this.awards();
    if (this.phase === 'gameover' || this.phase === 'lobby') v.hall = this.#hallView();
    if (this.phase === 'lobby') {
      const written = this.#asWrittenPacks();
      // fresh: categories none of whose clues this TV has shown yet. cats: the category names of one of your games.
      v.packs = this.packs.map((p) => ({
        id: p.id, title: p.title, description: p.description, count: p.categories.length, selected: this.selected.has(p.id), easy: p.easy, own: p.own,
        archive: p.id.startsWith('archive-'), fresh: p.categories.filter((c) => this.#freshIn(c) === ROWS).length,
        ...(p.own ? { cats: p.categories.slice(0, COLS).map((c) => c.name) } : {}),
      }));
      const bankCats = this.#bank().categories;
      v.categoryCount = bankCats.length;
      v.freshCount = bankCats.filter((c) => this.#freshIn(c) === ROWS).length;
      v.seenCount = this.seen.size;
      v.easyAvailable = this.easyPacks().length > 0;
      v.easyMode = this.easyOn();
      v.hasArchive = this.hasArchive();
      v.era = this.era;
      v.eras = Object.keys(ERAS);
      v.archiveSeason = this.archiveSeason;
      v.archiveLoading = this.archiveLoading;
      v.archiveError = this.archiveError;
      v.draft = this.draft && this.draft.map((row) => row.map((c) => c.name));
      v.draftFresh = this.draft && this.draft.map((row) => row.map((c) => this.#freshIn(c) === ROWS));
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
        about: explainCategory(f.category),
        q: showQ ? f.q : null,
        // The correct answer comes last, after every player's response.
        answer: this.phase === 'gameover' || (this.phase === 'final-reveal' && f.answerShown) ? f.a : null,
        eligible: f.eligible,
        wagered: Object.keys(f.wagers),
        answered: Object.keys(f.answers),
        revealIndex: f.revealIndex,
        // 'answer' (their response is up), 'verdict' (right or wrong, and the wager), 'done' (the correct answer).
        stage: this.phase === 'final-reveal' ? (f.stage ?? null) : null,
        answerShown: this.phase === 'gameover' || !!f.answerShown,
        order: done ? (f.revealOrder ?? []).slice() : [],
        reveals: done ? (f.revealOrder ?? []).slice(0, f.revealIndex + 1).map((id, i) => {
          const r = f.results[id] ?? {};
          // While a response is up, right or wrong and the wager stay hidden.
          const pending = this.phase === 'final-reveal' && i === f.revealIndex && f.stage === 'answer';
          return { id, answer: r.answer, correct: pending ? false : !!r.correct, overridden: !!r.overridden, wager: pending ? 0 : (f.wagers[id] ?? 0), pending };
        }) : [],
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
      maxFinal: this.phase === 'final-wager' ? this.maxFinalWager(p.id) : null,
      finalAnswer: this.final ? this.final.answers[p.id] : undefined,
      // The captain who is also the host may peek at the answer while someone answers out loud.
      answer: this.hostJudges() && this.captain() === p.id && ['answering', 'dd-answer'].includes(this.phase) ? this.clue?.a ?? null : null,
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
      hallSig: this.hallSig, hallBefore: this.hallBefore,
      stats: [...this.stats.entries()],
    };
  }
  restore(data) {
    this.settings = { ...this.settings, ...(data.settings ?? {}), readAloud: false };   // a room saved while the voice was on does not bring it back
    this.era = data.era ?? 'any';
    this.played = new Set(data.played ?? []);
    this.selected = new Set(data.selected ?? []);
    this.phase = data.phase ?? 'lobby';
    this.round = data.round ?? 0;
    this.hallSig = data.hallSig ?? null;
    this.hallBefore = data.hallBefore ?? null;
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
    if (this.clue && ['reading', 'open', 'answering', 'ruling', 'dd-wager', 'dd-answer'].includes(this.phase)) { this.phase = 'reveal'; this.#setTimer(T.reveal, () => this.#afterReveal(), 'reveal'); }
    else if (this.phase === 'reveal') this.#setTimer(T.reveal, () => this.#afterReveal(), 'reveal');
    else if (this.phase === 'round-intro') this.phase = 'board';
    else if (this.phase === 'final-wager') this.#setTimer(T.finalWager, () => this.#lockFinalWagers(), 'wager');
    else if (this.phase === 'final-answer') this.#beginFinalReveal();
    else if (this.phase === 'final-reveal') this.#setTimer(T.finalStep, () => this.#finalStep(), 'final-step');
    if (this.phase === 'lobby' && !this.archivePacks.length) this.#requestArchive(this.era);
  }
}

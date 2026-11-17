// Singo Night on the phones: bingo cards of song titles. The music plays on the Apple TV (Singo Night there owns the
// round: the playlist, the clips and the reveals); this game only deals the cards, keeps what each player marked,
// and checks a "SINGO!" against the songs that have actually played.
//
// The Apple TV drives it with three actions:
//   deal { songs: [{ id, title, artist }], playlist }   a new round: everyone gets a fresh card from these songs
//   call { id }                                         a song's music started, so it counts from now on
//   endRound                                            the round is over (the cards stay up until the next deal)
// Phones send { t: 'mark', i } to mark or unmark a square, and { t: 'singo' } to claim a line.

import { GameError, fail, cleanName } from '../../lib.js';

export { GameError };
const GAME = 'singo';
export const FREE = 'free';

/** How big a card can be made from this many songs: 5×5 with a free middle needs 24, 4×4 needs 16, 3×3 needs 9. */
export function cardSize(songCount) {
  if (songCount >= 24) return 5;
  if (songCount >= 16) return 4;
  if (songCount >= 9) return 3;
  return 0;
}

/** Every row, column and the two diagonals of a size×size card, as lists of square indexes. */
export function lines(size) {
  const out = [];
  for (let r = 0; r < size; r++) out.push(Array.from({ length: size }, (_, c) => r * size + c));
  for (let c = 0; c < size; c++) out.push(Array.from({ length: size }, (_, r) => r * size + c));
  out.push(Array.from({ length: size }, (_, i) => i * size + i));
  out.push(Array.from({ length: size }, (_, i) => i * size + (size - 1 - i)));
  return out;
}

export class SingoGame {
  constructor(room) {
    this.room = room;
    this.round = null;     // { n, size, playlist, songs: {id: {title, artist}}, order: [id], called: [id], status: 'playing'|'over' }
    this.cards = {};       // playerId -> { round, squares: [id | FREE], marked: [bool] }
    this.claims = [];      // newest last: { n, playerId, name, ok, line: [titles], missing: [titles], at }
    this.nextClaim = 1;
  }

  init() {}
  /** Players come and go during a round (they get a card when they join), so the room never locks. */
  inProgress() { return false; }
  usesContent() { return false; }

  toJSON() { return { round: this.round, cards: this.cards, claims: this.claims, nextClaim: this.nextClaim }; }
  restore(data) {
    this.round = data.round ?? null;
    this.cards = data.cards ?? {};
    this.claims = data.claims ?? [];
    this.nextClaim = data.nextClaim ?? 1;
  }
  #changed() { this.room.changed(); }

  act(action, a = {}) {
    switch (action) {
      case 'deal': return this.deal(a.songs, a.playlist);
      case 'call': return this.call(a.id);
      case 'endRound': return this.endRound();
      default: throw new GameError(`Unknown action ${action}`);
    }
  }

  onPlayer(player, msg) {
    switch (msg.t) {
      case 'mark': this.mark(player.id, Number(msg.i)); return undefined;
      case 'singo': return { t: 'singo-result', ...this.claim(player.id) };
      default: return undefined;
    }
  }

  // ---------- the round (driven by the Apple TV) ----------
  deal(songs, playlist) {
    if (!Array.isArray(songs)) fail('Send the songs to deal from');
    const seen = new Set();
    const list = [];
    for (const s of songs) {
      const id = String(s?.id ?? '').slice(0, 80);
      const title = cleanName(s?.title, 80);
      if (!id || !title || seen.has(id)) continue;
      seen.add(id);
      list.push({ id, title, artist: cleanName(s?.artist, 60) || null });
      if (list.length >= 500) break;
    }
    const size = cardSize(list.length);
    if (!size) fail('Singo cards need a playlist of at least 9 songs');
    this.round = {
      n: (this.round?.n ?? 0) + 1, size, playlist: cleanName(playlist, 80) || null,
      songs: Object.fromEntries(list.map((s) => [s.id, { title: s.title, artist: s.artist }])),
      order: list.map((s) => s.id), called: [], status: 'playing',
    };
    this.cards = {};
    this.claims = [];
    for (const p of this.room.players) this.#card(p.id);
    this.#changed();
  }
  call(id) {
    const r = this.round ?? fail('No Singo round is being played');
    const key = String(id ?? '');
    if (!r.songs[key]) fail('That song is not in this round');
    if (r.called.includes(key)) return;
    r.called.push(key);
    this.#changed();
  }
  endRound() {
    if (!this.round) return;
    this.round.status = 'over';
    this.#changed();
  }

  /** A player's card for this round, dealt the first time it is needed (so late joiners get one too). */
  #card(playerId) {
    const r = this.round;
    if (!r) return null;
    const have = this.cards[playerId];
    if (have && have.round === r.n) return have;
    const need = r.size * r.size - (r.size === 5 ? 1 : 0);
    const pool = [...r.order];
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor((this.room.rng ?? Math.random)() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const picked = pool.slice(0, need);
    const squares = r.size === 5 ? [...picked.slice(0, 12), FREE, ...picked.slice(12)] : picked;
    const card = { round: r.n, squares, marked: squares.map((s) => s === FREE) };
    this.cards[playerId] = card;
    return card;
  }

  mark(playerId, i) {
    const r = this.round ?? fail('Wait for the TV to start a round');
    if (r.status !== 'playing') fail('This round is over');
    const card = this.#card(playerId);
    if (!(i >= 0 && i < card.squares.length)) fail('No such square');
    if (card.squares[i] === FREE) return;
    card.marked[i] = !card.marked[i];
    this.#changed();
  }

  /** A "SINGO!": good when a whole line is marked and every song in it has played. */
  claim(playerId) {
    const r = this.round ?? fail('Wait for the TV to start a round');
    if (r.status !== 'playing') fail('This round is over');
    const player = this.room.player(playerId);
    const card = this.#card(playerId);
    const already = this.claims.find((c) => c.playerId === playerId && c.ok);
    if (already) return { ok: true, line: already.line, missing: [], again: true };   // one win a round each
    const called = new Set(r.called);
    const ok = (i) => card.squares[i] === FREE || (card.marked[i] && called.has(card.squares[i]));
    const title = (i) => (card.squares[i] === FREE ? 'Free' : r.songs[card.squares[i]]?.title ?? '?');
    const all = lines(r.size);
    const win = all.find((line) => line.every(ok));
    // Not a Singo: name the songs in the closest marked line that have not played yet, so the player can see why.
    let missing = [];
    if (!win) {
      const marked = all.filter((line) => line.every((i) => card.marked[i]));
      const best = (marked.length ? marked : all).map((line) => line.filter((i) => !ok(i))).sort((a, b) => a.length - b.length)[0] ?? [];
      missing = best.map(title);
    }
    const entry = { n: this.nextClaim++, playerId, name: player.name, color: player.color, ok: !!win, line: win ? win.map(title) : [], squares: win ?? [], missing, at: this.room.now() };
    this.claims.push(entry);
    if (this.claims.length > 30) this.claims.shift();
    if (win) player.score += 1;   // the room's score: rounds won
    this.#changed();
    return { ok: entry.ok, line: entry.line, missing: entry.missing, marked: !!card.marked.some((m, i) => m && card.squares[i] !== FREE) };
  }

  // ---------- views ----------
  #roundView() {
    const r = this.round;
    if (!r) return null;
    return { n: r.n, size: r.size, playlist: r.playlist, status: r.status, songs: r.order.length, calledCount: r.called.length };
  }
  publicView() {
    const winners = this.claims.filter((c) => c.ok);
    return {
      game: GAME, scoreFormat: 'points', lobbyTitle: 'Singo Night', status: this.round ? this.round.status : 'waiting',
      round: this.#roundView(),
      // The newest claims, for the TV's banner: { n, playerId, name, color, ok, line, missing }.
      claims: this.claims.slice(-6).map(({ at, squares, ...c }) => c),
      winners: winners.map((c) => ({ playerId: c.playerId, name: c.name, color: c.color })),
    };
  }
  hostView() { return this.publicView(); }
  playerView(player) {
    const v = this.publicView();
    const r = this.round;
    const card = r ? this.#card(player.id) : null;
    if (card) {
      v.card = card.squares.map((id, i) => (id === FREE
        ? { free: true, marked: true }
        : { id, title: r.songs[id]?.title ?? '?', artist: r.songs[id]?.artist ?? null, marked: card.marked[i] }));
      // Songs played so far, newest first: the phone shows them so nobody has to ask what was just on.
      v.called = [...r.called].reverse().slice(0, 60).map((id) => ({ id, title: r.songs[id]?.title ?? '?', artist: r.songs[id]?.artist ?? null }));
      const mine = this.claims.filter((c) => c.playerId === player.id && c.ok);
      v.won = mine.length > 0;
      v.winLine = mine.length ? (this.claims.filter((c) => c.playerId === player.id && c.ok).at(-1).squares ?? []) : [];
    }
    return v;
  }
}

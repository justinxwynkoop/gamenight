// The Pie Chase board: a wheel. A six-sided hub in the middle, six spokes of five spaces running out from it, and a
// ring of 42 spaces around the outside. Where each spoke meets the ring is a category headquarters (six of them, one
// per category, seven steps apart on the ring). Between two headquarters the ring has six spaces: four category
// spaces and two Roll Again spaces. So the board has 73 spaces in all: the hub, 30 spoke spaces and 42 ring spaces,
// with 6 headquarters and 12 Roll Again spaces among them.
//
// Every spoke has five different categories on it (never its own headquarters' colour), and at each distance from
// the hub the six spokes show all six categories, so a first roll of 1 to 5 can reach any category and a 6 reaches a
// headquarters. Next to each other, two spaces never share a colour.
//
// Space ids: 'H' (the hub), 's<k>-<i>' (spoke k = 0..5, i = 1..5 counting out from the hub) and 'r<n>' (ring, n =
// 0..41, headquarters k at n = 7k). Coordinates are for drawing: the hub at (0, 0), the ring on a circle of radius 1,
// headquarters 0 at the top and the ring numbered clockwise on screen (y grows downwards).

export const CATEGORY_COUNT = 6;
export const RING = 42;
export const SPOKE = 5;
const STEP = RING / CATEGORY_COUNT; // 7: ring spaces from one headquarters to the next

/** Ring spaces after headquarters k, in order: a category (by offset from k) or null for Roll Again. */
const RING_PATTERN = [2, null, 4, 3, null, 5];
/** Spoke k's spaces, from the hub out: category offsets from k (never 0, which is the headquarters' own colour). */
const SPOKE_PATTERN = [5, 2, 4, 1, 3];

const HUB_R = 0.17;
const round = (n) => Math.round(n * 10000) / 10000;

function build() {
  const spaces = [];
  const add = (s) => { spaces.push(s); return s; };
  add({ id: 'H', kind: 'hub', cat: null, x: 0, y: 0 });
  for (let k = 0; k < CATEGORY_COUNT; k++) {
    const a = (-90 + k * 60) * Math.PI / 180;
    for (let i = 1; i <= SPOKE; i++) {
      const r = HUB_R + (i * (1 - HUB_R)) / (SPOKE + 1);
      add({ id: `s${k}-${i}`, kind: 'cat', cat: (k + SPOKE_PATTERN[i - 1]) % CATEGORY_COUNT, x: round(Math.cos(a) * r), y: round(Math.sin(a) * r) });
    }
  }
  for (let n = 0; n < RING; n++) {
    const a = (-90 + (n * 360) / RING) * Math.PI / 180;
    const k = Math.floor(n / STEP);
    const off = n % STEP;
    const at = { x: round(Math.cos(a)), y: round(Math.sin(a)) };
    if (off === 0) add({ id: `r${n}`, kind: 'hq', cat: k, ...at });
    else {
      const c = RING_PATTERN[off - 1];
      add(c === null ? { id: `r${n}`, kind: 'again', cat: null, ...at } : { id: `r${n}`, kind: 'cat', cat: (k + c) % CATEGORY_COUNT, ...at });
    }
  }
  const links = new Map(spaces.map((s) => [s.id, []]));
  const link = (a, b) => { links.get(a).push(b); links.get(b).push(a); };
  for (let k = 0; k < CATEGORY_COUNT; k++) {
    link('H', `s${k}-1`);
    for (let i = 1; i < SPOKE; i++) link(`s${k}-${i}`, `s${k}-${i + 1}`);
    link(`s${k}-${SPOKE}`, `r${k * STEP}`);
  }
  for (let n = 0; n < RING; n++) link(`r${n}`, `r${(n + 1) % RING}`);
  return { spaces, links };
}

const BOARD = build();
export const SPACES = BOARD.spaces;
const BY_ID = new Map(SPACES.map((s) => [s.id, s]));
export const HUB = 'H';
export const space = (id) => BY_ID.get(id) ?? null;
export const neighbours = (id) => BOARD.links.get(id) ?? [];
/** The headquarters of category k. */
export const hqOf = (k) => `r${k * STEP}`;

/**
 * Where a token on `from` can end up with a roll of `steps`: every move of exactly that many spaces that never turns
 * back on itself (it may not go forward and back along the ring or a spoke in one move), turning wherever the board
 * allows it (at a headquarters, and in the hub, which it may also cross). Returns a Map: end space id -> one path to it
 * (the spaces passed through, ending on the end space, not including `from`).
 */
export function destinations(from, steps) {
  const out = new Map();
  const walk = (at, prev, left, path) => {
    if (left === 0) { if (!out.has(at)) out.set(at, path); return; }
    for (const next of neighbours(at)) {
      if (next === prev) continue;
      walk(next, at, left - 1, [...path, next]);
    }
  };
  if (BY_ID.has(from) && steps > 0) walk(from, null, steps, []);
  return out;
}

/** The fewest spaces from one space to another (to say how far a token is from the hub). */
export function distance(from, to) {
  if (from === to) return 0;
  const seen = new Set([from]);
  let frontier = [from];
  for (let d = 1; frontier.length; d++) {
    const next = [];
    for (const at of frontier) {
      for (const n of neighbours(at)) {
        if (n === to) return d;
        if (!seen.has(n)) { seen.add(n); next.push(n); }
      }
    }
    frontier = next;
  }
  return Infinity;
}

// Builds a Jeopardy question set at random from the public clue dataset
// (https://github.com/jwolle1/jeopardy_clue_dataset, a tab-separated file).
//
// The dataset is NOT part of this repository and must not be added to it: it lives on the Pi in
// data/clues/ (git-ignored) and is fetched with scripts/get-clues.sh. This file only holds the code.
//
// The dataset has no difficulty rating for a clue or a category. What it does have, and what this uses:
//   * the position in a category (the $ ladder: the top clue is the easy one, the bottom the hard one),
//   * the round the category came from (Jeopardy! or Double Jeopardy!),
//   * where the game came from: a normal episode, a Kids/Teen game, or a tournament / special event,
//   * the air date, and whether the six categories all came from one real episode.
import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateSet } from './game.js';

export const SOURCES = {
  everyday: 'Regular episodes',
  kids: 'Kids and Teen games',
  special: 'Tournaments and special events',
};
const ROWS = 5;
const COLS = 6;

/** Which kind of game a clue came from, from the dataset's "notes" column (empty for a normal episode). */
export const sourceOf = (notes) => (!notes ? 'everyday' : /\b(kids|teen)\b/i.test(notes) ? 'kids' : 'special');

// Clues that only make sense with a picture, a clip or a sound are dropped (the dataset already removes most).
const MEDIA = /\b(seen here|shown here|heard here|this clip|video|audio|pictured|shown above|seen at right|in this photo|in this picture|on the screen)\b/i;
// A modest "not for the little ones" filter; the host also sees every clue before it is read out.
const ADULT = /\b(sex|sexy|sexual|sexually|porn\w*|nude|nudity|naked|strippers?|strip club|erotic\w*|prostitut\w*|orgasm\w*|condoms?|genitals?|rape[sd]?|raping|cocaine|heroin|marijuana|meth|suicide|lynch\w*|genocide|aroused|lust\w*|booze|drunk|hooker)\b/i;

const clean = (s) => String(s).replace(/\\(['"])/g, '$1').replace(/&amp;/g, '&').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
// Substrings of the big file keep the whole file alive in memory; copying the few we keep lets it be freed.
const own = (s) => Buffer.from(s, 'utf8').toString('utf8');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Parse the whole file into complete categories (exactly five clues) and Final Jeopardy clues. */
export async function parseDataset(text, { onYield = () => new Promise((r) => setImmediate(r)) } = {}) {
  const lines = text.split('\n');
  const header = (lines.shift() ?? '').replace(/\r$/, '').split('\t');
  const col = Object.fromEntries(header.map((name, i) => [name, i]));
  for (const need of ['round', 'clue_value', 'daily_double_value', 'category', 'answer', 'question', 'air_date', 'notes']) {
    if (!(need in col)) throw new Error(`The clue file is missing the "${need}" column`);
  }
  const groups = new Map();   // "date|round|category" -> category
  const finals = new Map();   // date -> final clue
  for (let i = 0; i < lines.length; i++) {
    if (i % 4000 === 3999) await onYield();   // let the server keep serving buzzes while a big file loads
    const f = lines[i].split('\t');
    if (f.length <= col.notes) continue;
    const round = f[col.round];
    if (round !== '1' && round !== '2' && round !== '3') continue;
    const date = f[col.air_date];
    // The dataset calls the clue the "answer" and what contestants say the "question".
    const clue = clean(f[col.answer]);
    const answer = clean(f[col.question]);
    if (!clue || !answer || MEDIA.test(clue)) continue;
    const source = sourceOf(f[col.notes].trim());
    if (round === '3') {
      finals.set(date, { category: clean(f[col.category]), clue, answer: cap(answer), source, year: Number(date.slice(0, 4)), date });
      continue;
    }
    const key = `${date}|${round}|${f[col.category]}`;
    let cat = groups.get(key);
    if (!cat) groups.set(key, (cat = { date, year: Number(date.slice(0, 4)), round: Number(round), source, name: clean(f[col.category]), clues: [] }));
    cat.clues.push({ value: Number(f[col.clue_value]), clue, answer: cap(answer), dd: Number(f[col.daily_double_value]) > 0 });
  }
  const categories = [];
  let n = 0;
  for (const cat of groups.values()) {
    if (++n % 4000 === 0) await onYield();
    if (cat.clues.length !== ROWS || !cat.name || cat.name.length > 40) continue;
    cat.clues.sort((a, b) => a.value - b.value);
    if (new Set(cat.clues.map((c) => c.value)).size !== ROWS) continue;   // a clean five-step ladder
    cat.name = own(cat.name);
    for (const q of cat.clues) { q.clue = own(q.clue); q.answer = own(q.answer); }
    cat.adult = ADULT.test(cat.name) || cat.clues.some((c) => ADULT.test(c.clue) || ADULT.test(c.answer));
    categories.push(cat);
  }
  for (const f of finals.values()) { f.category = own(f.category); f.clue = own(f.clue); f.answer = own(f.answer); }
  for (const f of finals.values()) f.adult = ADULT.test(f.category) || ADULT.test(f.clue) || ADULT.test(f.answer);
  return { categories, finals };
}

const pick = (list, rng) => list[Math.floor(rng() * list.length)];
function shuffled(list, rng) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const monthDay = (date) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/**
 * Make one board.
 *   source   everyday | kids | special
 *   since    earliest year to draw from
 *   round    1 (Jeopardy! categories) or 2 (Double Jeopardy! categories). Our game doubles round 2's values itself,
 *            so either way the clues are laid out $200 to $1,000 from easiest to hardest.
 *   mode     'mix' (six categories from six different episodes) or 'episode' (all six from one real episode)
 *   date     with mode 'episode': use this episode (so round 2 can come from the same show as round 1)
 *   bothRounds  with mode 'episode': only pick an episode that has a full board in the other round too, so a
 *            two-round game can use one show for both
 *   family   leave out anything the "not for little ones" filter catches (default on)
 *   avoid    category names to leave out (e.g. already on the other round's board)
 */
export function makeBoard(index, { source = 'everyday', since = 2001, round = 1, mode = 'mix', date = null, bothRounds = false, family = true, avoid = [] } = {}, rng = Math.random) {
  if (!SOURCES[source]) throw new Error('Unknown source');
  const skip = new Set(avoid.map((n) => String(n).toLowerCase()));
  const ok = (c) => c.source === source && c.year >= since && !(family && c.adult) && !skip.has(c.name.toLowerCase());
  const pool = index.categories.filter((c) => c.round === round && ok(c));
  const finalOk = (f) => f.source === source && f.year >= since && !(family && f.adult);

  let chosen; let final; let usedDate = null; let title;
  if (mode === 'episode') {
    const byDate = new Map();
    for (const c of pool) { if (!byDate.has(c.date)) byDate.set(c.date, []); byDate.get(c.date).push(c); }
    let otherDates = null;
    if (bothRounds && !date) {
      const counts = new Map();
      for (const c of index.categories) if (c.round !== round && ok(c)) counts.set(c.date, (counts.get(c.date) ?? 0) + 1);
      otherDates = new Set([...counts].filter(([, n]) => n === COLS).map(([d]) => d));
    }
    const whole = [...byDate.entries()].filter(([d, cs]) => cs.length === COLS && (index.finals.get(d) ? finalOk(index.finals.get(d)) : false) && (!otherDates || otherDates.has(d)));
    const wanted = date ? whole.find(([d]) => d === date) : null;
    if (date && !wanted) throw new Error('That episode is not available for this round');
    if (!whole.length) throw new Error('No complete episodes match those choices');
    const [d, cs] = wanted ?? pick(whole, rng);
    usedDate = d; chosen = cs; final = index.finals.get(d);
    title = `Episode of ${monthDay(d)}`;
  } else {
    const seenDates = new Set(); const seenNames = new Set(); chosen = [];
    for (const c of shuffled(pool, rng)) {
      if (seenDates.has(c.date) || seenNames.has(c.name.toLowerCase())) continue;
      seenDates.add(c.date); seenNames.add(c.name.toLowerCase()); chosen.push(c);
      if (chosen.length === COLS) break;
    }
    if (chosen.length < COLS) throw new Error('Not enough categories match those choices');
    const finals = [...index.finals.values()].filter(finalOk);
    if (!finals.length) throw new Error('No Final Jeopardy clues match those choices');
    final = pick(finals, rng);
    title = `Random mix · ${SOURCES[source]}`;
  }
  // Daily Doubles: keep the real ones only when they are exactly what the round needs; otherwise let the game place them.
  const want = round === 2 ? 2 : 1;
  const real = chosen.flatMap((c) => c.clues.filter((q) => q.dd));
  const keepFlags = mode === 'episode' && real.length === want && new Set(chosen.filter((c) => c.clues.some((q) => q.dd)).map((c) => c.name)).size === want;

  const set = {
    title: title.slice(0, 80),
    categories: chosen.map((c) => ({
      name: c.name,
      clues: c.clues.map((q, i) => ({ value: (i + 1) * 200, clue: q.clue, answer: q.answer, ...(keepFlags && q.dd && i > 0 ? { dailyDouble: true } : {}) })),
    })),
    final: { category: final.category.slice(0, 40), clue: final.clue, answer: final.answer },
  };
  validateSet(set);
  return { set, date: usedDate };
}

// ---------- finding the file, and keeping it loaded for a while ----------
export function datasetPath(dataDir, env = process.env) {
  if (env.CLUE_DATASET) return existsSync(env.CLUE_DATASET) ? env.CLUE_DATASET : null;
  const dir = path.join(dataDir, 'clues');
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith('.tsv'));
  const best = files.find((f) => /combined/i.test(f)) ?? files[0];
  return best ? path.join(dir, best) : null;
}

/** A source of random boards for one data folder. The parsed file is dropped after a while without use (it is big). */
export function createRandomBoards({ dataDir, keepMs = 10 * 60 * 1000, rng = Math.random, env = process.env } = {}) {
  let loaded = null;   // Promise of the index
  let timer = null;
  const touch = () => { clearTimeout(timer); timer = setTimeout(() => { loaded = null; }, keepMs); timer.unref?.(); };
  return {
    available: () => !!datasetPath(dataDir, env),
    status() {
      const file = datasetPath(dataDir, env);
      return { available: !!file, loaded: !!loaded, sources: SOURCES, help: 'Run scripts/get-clues.sh on the Pi to download the clue file (it stays on the Pi).' };
    },
    async make(options = {}) {
      const file = datasetPath(dataDir, env);
      if (!file) throw Object.assign(new Error('The clue file is not installed on this Pi yet'), { code: 'no-dataset' });
      loaded ??= readFile(file, 'utf8').then(parseDataset).catch((e) => { loaded = null; throw e; });
      const index = await loaded;
      touch();
      return makeBoard(index, options, rng);
    },
  };
}

// Lenient answer checking, so a typo on a phone does not ruin the fun. Ported from the Buzzworthy game
// (github.com/JasonWynkoop1/buzzworthy). Pure functions: nothing here touches the room.

const NUM_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const SCALES = { hundred: 100, thousand: 1000, million: 1000000 };

/** "twenty one" is 21, "one hundred" is 100, "nineteen eighty four" is 1984: runs of number words become one number. */
function numberWords(words) {
  const out = [];
  let total = 0; let cur = 0; let inRun = false;
  const flush = () => { if (inRun) out.push(String(total + cur)); total = 0; cur = 0; inRun = false; };
  for (const w of words) {
    if (w in NUM_WORDS) {
      const n = NUM_WORDS[w];
      // A tens word after a teen or tens ("nineteen eighty", "twenty twenty") reads like a year.
      if (inRun && n >= 10 && cur >= 10 && cur < 100) cur = cur * 100 + n;
      else if (inRun && n < 10 && cur % 10 !== 0 && cur < 100) { flush(); cur = n; inRun = true; }
      else cur += n;
      inRun = true;
    } else if (w in SCALES && inRun) {
      if (SCALES[w] === 100) cur = (cur || 1) * 100;
      else { total += (cur || 1) * SCALES[w]; cur = 0; }
    } else if (w === 'and' && inRun) {
      // "one hundred and five"
    } else { flush(); out.push(w); }
  }
  flush();
  return out;
}

export function norm(s) {
  s = String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Drop question phrasing like "what is", "who are", "whats".
  s = s.replace(/^(what|who|where|when|which|whats|whos|wheres)( (is|are|was|were|s))?\s+/, '');
  s = s.replace(/^(a|an|the)\s+/, '');
  s = numberWords(s.split(' ')).map((w) => ABBREV[w] ?? ROMAN[w] ?? w).join(' ');
  // An abbreviation can stand for several words.
  s = s.replace(/\s+/g, ' ');
  return s.trim();
}

// Roman numerals of two or more letters (Henry VIII, World War II) read as the number; a lone I, V or X is left alone.
const ROMAN = { ii: '2', iii: '3', iv: '4', vi: '6', vii: '7', viii: '8', ix: '9', xi: '11', xii: '12', xiii: '13', xiv: '14', xv: '15', xvi: '16', xx: '20' };
// Short forms people type on a phone, read the same as the long form on both sides ("mt everest", "st louis").
const ABBREV = { wwii: 'world war 2', ww2: 'world war 2', wwi: 'world war 1', ww1: 'world war 1', abe: 'abraham', fdr: 'franklin roosevelt', jfk: 'john kennedy', mlk: 'martin luther king', mt: 'mount', mtn: 'mountain', st: 'saint', ste: 'sainte', ft: 'fort', dr: 'doctor', jr: 'junior', sr: 'senior', mr: 'mister', mrs: 'missus', pt: 'point', pres: 'president', gen: 'general', capt: 'captain', usa: 'united states', us: 'united states', uk: 'united kingdom', nyc: 'new york city' };

// Words a place name can do without: "the Pacific" for the Pacific Ocean, "Everest" for Mount Everest.
const PLACE_WORDS = new Set(['ocean', 'sea', 'river', 'lake', 'mount', 'mountain', 'mountains', 'island', 'islands', 'desert', 'bay', 'gulf', 'falls', 'peninsula', 'strait', 'national', 'park']);
// Words that may sit around a right answer ("the planet Mars", "it's Paris").
const FILLER = new Set(['the', 'a', 'an', 'of', 'is', 'its', 'it', 's', 'planet', 'river', 'mount', 'lake', 'ocean', 'sea', 'island', 'islands', 'mountain', 'mountains', 'desert', 'city', 'state', 'country', 'saint', 'sir', 'doctor', 'king', 'queen', 'president', 'captain', 'general', 'lord', 'lady', 'mister', 'missus', 'miss', 'answer', 'my', 'i', 'think', 'say', 'guess']);
// Words that turn one answer into several, or into its opposite: "Paris or London", "not Mars".
const HEDGES = new Set(['or', 'and', 'not', 'no', 'nor', 'either', 'maybe', 'neither']);
/** Extra words around a right answer are fine, but not a list of guesses. Only filler ("the planet Mars", "it's Paris"),
 *  or when the clue asks for a person, one other word in front of it (a first name: "Abraham Lincoln" for Lincoln). */
function fairExtras(g, n, opts = {}) {
  const padded = ' ' + g + ' ';
  const at = padded.indexOf(' ' + n + ' ');
  const before = padded.slice(0, at).split(' ').filter(Boolean);
  const after = padded.slice(at + n.length + 2).split(' ').filter(Boolean);
  const extra = [...before, ...after];
  if (extra.some((w) => HEDGES.has(w) || hasDigit(w))) return false;
  const odd = extra.filter((w) => !FILLER.has(w));
  if (!odd.length) return g.length <= n.length + 14;
  return !!opts.person && odd.length === 1 && before.includes(odd[0]) && !after.some((w) => !FILLER.has(w)) && g.length <= n.length + 14;
}
const withoutPlaceWords = (s) => s.split(' ').filter((w) => !PLACE_WORDS.has(w)).join(' ');

/** Edit distance counting a swap of two neighbouring letters as one edit. */
function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev2 = null;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
    }
    prev2 = prev; prev = cur;
  }
  return prev[n];
}

/**
 * How careless a typist may be with one word of this length (the answer's word):
 *   up to 4 letters: not at all (one letter off is usually a different word: "cat" is not "car")
 *   5 letters:       a letter too many or too few ("Pariss", "Pars"), but never a different letter or a swap ("Pluto" is not "Plato", "pairs" is not "Paris")
 *   6 and 7:         the same, and two neighbouring letters swapped ("Saturn" and "Staurn")
 *   8 to 11:         any one slip ("Basketball" is not "Baseball": that is two)
 *   12 and over:     two slips, and one more for every six letters after that
 */
function slipsOk(a, b) {
  if (a === b) return true;
  const len = Math.max(a.length, b.length);
  if (a[0] !== b[0] || len <= 4) return false;   // nobody mistypes the first letter; short words must be right
  const d = lev(a, b);
  if (len <= 7) return a.length !== b.length ? d === 1 : len >= 6 && d === 1 && swapped(a, b);
  if (len <= 11) return d <= 1;
  return d <= (len <= 16 ? 2 : Math.floor(len / 6));
}
/** The same letters but for one neighbouring pair that is the other way round. */
function swapped(a, b) {
  if (a.length !== b.length) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return i < a.length - 1 && a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
}

/** Dog and dogs, wolf and wolves, city and cities: the plural is the same word. */
function stem(w) {
  if (w.length >= 5 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length >= 5 && w.endsWith('ves')) return w.slice(0, -3) + 'f';
  if (w.length >= 5 && w.endsWith('es') && /(s|x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.length >= 4 && w.endsWith('s') && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}
const sameWord = (g, a) => g === a || stem(g) === stem(a) || slipsOk(g, a);
const hasDigit = (w) => /\d/.test(w);

/** Two lists of words, the same words one for one. Numbers must be exactly right. */
function sameWords(gt, nt) {
  if (gt.length !== nt.length) return false;
  return gt.every((w, i) => (hasDigit(w) || hasDigit(nt[i]) ? w === nt[i] : sameWord(w, nt[i])));
}

function matchOne(g, ans, opts = {}) {
  const n = norm(ans);
  if (!g || !n) return false;
  if (g === n) return true;
  const gt = g.split(' '), nt = n.split(' ');
  const gs = g.replace(/ /g, ''), ns = n.replace(/ /g, '');
  // Spaces are not what matters ("newyork" for "new york") unless there are numbers, which must match word for word.
  if (!gt.some(hasDigit) && !nt.some(hasDigit) && gs === ns) return true;
  if (sameWords(gt, nt)) return true;
  // One word run together or split apart with a slip in it ("southafrca"): only one slip, and never with numbers.
  if (gt.length !== nt.length && !gt.some(hasDigit) && !nt.some(hasDigit) && gs.length >= 8 && gs[0] === ns[0] && lev(gs, ns) <= 1) return true;
  // Extra words around the right answer ("the planet mars"), but not a second guess.
  if ((' ' + g + ' ').includes(' ' + n + ' ') && fairExtras(g, n, opts)) return true;
  // A place without "Ocean", "Mount", "River"... ("pacific", "everest"), but never the generic word alone.
  const gp = withoutPlaceWords(g), np = withoutPlaceWords(n);
  if (gp && np && np !== n && gp.replace(/ /g, '').length >= 4 && sameWords(gp.split(' '), np.split(' '))) return true;
  return false;
}

/** A person's last name on its own ("Lincoln" for Abraham Lincoln), as the show allows: just that one word. */
function surname(g, ans) {
  const words = norm(ans).split(' ').filter((w) => !['junior', 'senior', 'ii', 'iii', 'iv'].includes(w));
  if (words.length < 2 || words.length > 4) return false;
  const last = words.at(-1);
  if (last.length < 4 || /\d/.test(last)) return false;
  return !g.includes(' ') && sameWord(g, last);
}

/** Does the clue ask for a person ("this president", "He wrote...")? Then a last name alone is enough. */
export function asksForPerson(clue) {
  return /\b(he|she|his|her|him|who)\b/i.test(String(clue || ''))
    || /\bth(is|ese)\s+(\w+\s+)?(man|woman|person|people|author|writer|novelist|poet|playwright|president|first lady|actor|actress|singer|rapper|artist|painter|sculptor|composer|scientist|physicist|chemist|inventor|explorer|astronaut|king|queen|emperor|empress|pharaoh|general|leader|director|athlete|player|pitcher|quarterback|coach|chef|comedian|host|philosopher|saint|pope|prophet|founder|aviator|naturalist|mathematician|economist|senator|governor|mayor|dictator|prime minister)s?\b/i.test(String(clue || ''));
}

/**
 * Is what the player typed (`given`) one of the accepted answers?
 * opts.person  the clue asks for a person, so a last name alone counts (see asksForPerson)
 */
export function judge(given, answers, opts = {}) {
  const g = norm(given);
  if (!g) return false;
  const list = answers.filter(Boolean);
  return list.some((a) => matchOne(g, a, opts)) || (!!opts.person && list.some((a) => surname(g, a)));
}

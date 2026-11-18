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
  s = numberWords(s.split(' ')).map((w) => ABBREV[w] ?? w).join(' ');
  return s.trim();
}

// Short forms people type on a phone, read the same as the long form on both sides ("mt everest", "st louis").
const ABBREV = { mt: 'mount', mtn: 'mountain', st: 'saint', ste: 'sainte', ft: 'fort', dr: 'doctor', jr: 'junior', sr: 'senior', mr: 'mister', mrs: 'missus', pt: 'point', pres: 'president', gen: 'general', capt: 'captain', usa: 'united states', us: 'united states', uk: 'united kingdom', nyc: 'new york city' };

// Words a place name can do without: "the Pacific" for the Pacific Ocean, "Everest" for Mount Everest.
const PLACE_WORDS = new Set(['ocean', 'sea', 'river', 'lake', 'mount', 'mountain', 'mountains', 'island', 'islands', 'desert', 'bay', 'gulf', 'falls', 'peninsula', 'strait', 'national', 'park']);
// Words that may sit around a right answer ("the planet Mars", "it's Paris").
const FILLER = new Set(['the', 'a', 'an', 'of', 'is', 'its', 'it', 's', 'planet', 'river', 'mount', 'lake', 'ocean', 'sea', 'island', 'islands', 'mountain', 'mountains', 'desert', 'city', 'state', 'country', 'saint', 'sir', 'doctor', 'king', 'queen', 'president', 'captain', 'general', 'lord', 'lady', 'mister', 'missus', 'miss', 'answer', 'my', 'i', 'think', 'say', 'guess']);
// Words that turn one answer into several, or into its opposite: "Paris or London", "not Mars".
const HEDGES = new Set(['or', 'and', 'not', 'no', 'nor', 'either', 'maybe', 'neither']);
/** Extra words around a right answer are fine, but not a list of guesses. */
function fairExtras(g, n) {
  const at = (' ' + g + ' ').indexOf(' ' + n + ' ');
  const extra = ((' ' + g + ' ').slice(0, at) + ' ' + (' ' + g + ' ').slice(at + n.length + 2)).split(' ').filter(Boolean);
  if (extra.some((w) => HEDGES.has(w))) return false;
  const odd = extra.filter((w) => !FILLER.has(w));
  return odd.length <= 1 && g.length <= n.length + 14;
}
const withoutPlaceWords = (s) => s.split(' ').filter((w) => !PLACE_WORDS.has(w)).join(' ');

function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

function tolerance(len) {
  // Short words must be spelled right: one letter off is usually a different word ("Plato" is not "Pluto").
  if (len <= 5) return 0;
  if (len <= 7) return 1;
  if (len <= 11) return 2;
  return Math.floor(len / 5);
}

function matchOne(g, ans) {
  const n = norm(ans);
  if (!g || !n) return false;
  if (g === n) return true;
  const gs = g.replace(/ /g, ''), ns = n.replace(/ /g, '');
  if (gs === ns) return true;
  // Pure numbers must match exactly.
  if (/^\d+$/.test(ns) || /^\d+$/.test(gs)) return gs === ns;
  if (lev(gs, ns) <= tolerance(ns.length)) return true;
  // Extra words around the right answer ("the planet mars").
  if ((' ' + g + ' ').includes(' ' + n + ' ') && fairExtras(g, n)) return true;
  // A place without "Ocean", "Mount", "River"... ("pacific", "everest"), but never the generic word alone.
  const gp = withoutPlaceWords(g).replace(/ /g, ''), np = withoutPlaceWords(n).replace(/ /g, '');
  if (gp && np && np !== ns && gp.length >= 4 && (gp === np || lev(gp, np) <= tolerance(np.length))) return true;
  return false;
}

/** A person's last name on its own ("Lincoln" for Abraham Lincoln), as the show allows. */
function surname(g, ans) {
  const words = norm(ans).split(' ').filter((w) => !['junior', 'senior', 'ii', 'iii', 'iv'].includes(w));
  if (words.length < 2 || words.length > 4) return false;
  const last = words.at(-1);
  if (last.length < 4 || /^\d+$/.test(last)) return false;
  const gs = g.replace(/ /g, '');
  return gs === last || lev(gs, last) <= tolerance(last.length);
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
  return list.some((a) => matchOne(g, a)) || (!!opts.person && list.some((a) => surname(g, a)));
}

// Lenient answer checking, so a typo on a phone does not ruin the fun. Ported from the Buzzworthy game
// (github.com/JasonWynkoop1/buzzworthy). Pure functions: nothing here touches the room.

const NUM_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100,
};

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
  s = s.split(' ').map((w) => (w in NUM_WORDS ? String(NUM_WORDS[w]) : w)).join(' ');
  return s.trim();
}

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
  if (len <= 4) return 0;
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
  if ((' ' + g + ' ').includes(' ' + n + ' ') && g.length <= n.length + 14) return true;
  return false;
}

/** Is what the player typed (`given`) one of the accepted answers? */
export function judge(given, answers) {
  const g = norm(given);
  if (!g) return false;
  return answers.filter(Boolean).some((a) => matchOne(g, a));
}

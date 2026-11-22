// A short note on what a category is asking for, for the host to read out when a category's name is not clear.
// Shipped packs and your own boards carry their own note ("about"); real-show categories use the show's own
// explanation when it gave one. Otherwise a few well-known kinds of category name are explained here.

const MAX = 200;

/** Tidies a note: one line, at most 200 characters. */
export function cleanAbout(s) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > MAX ? `${t.slice(0, MAX - 1).trimEnd()}…` : t;
}

/**
 * The show's own explanation of a category, from the archive's comments column, e.g.
 * '(Mayim: Each response has four letters; the second is "R" and the fourth is "M".)'. Returns '' for comments
 * that only introduce a presenter or a recording, which say nothing about what to answer.
 */
export function showComment(raw) {
  let t = String(raw ?? '').trim();
  if (!t) return '';
  t = t.replace(/^\(\s*/, '').replace(/\s*\)\s*$/, '');
  t = t.replace(/^[A-Z][\w.'-]*(?:\s+[A-Z][\w.'-]*){0,2}:\s*/, '');   // "Alex:", "Ken Jennings:", "Hana Ali:"
  if (/\b(present(s|ed)?|recited|sung|sings|perform(s|ed)?|video|clue crew|I'm\b|I am\b|join(s|ed)? us|courtesy of|brought to you)\b/i.test(t)) return '';
  return cleanAbout(t);
}

const words = { 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten' };

/** A note for a category name we recognise, or '' when we cannot tell. */
export function explainCategory(name) {
  const n = String(name ?? '').replace(/\s+/g, ' ').trim();
  const u = n.toUpperCase();
  if (!n) return '';
  if (/BEFORE (&|AND) AFTER/.test(u)) return 'Two things joined by a word they share, like "Wheel of Fortune" + "fortune cookie" = "Wheel of Fortune cookie".';
  if (/RHYME TIME/.test(u)) return 'Every answer is two words that rhyme, like "fat cat".';
  if (/POTENT POTABLES/.test(u)) return 'Grown-up drinks: wine, beer, spirits and cocktails.';
  if (/STUPID ANSWERS/.test(u)) return 'The answer is given away in the clue itself.';
  if (/ANAGRAM/.test(u)) return 'Unscramble the letters given in the clue to get the answer.';
  if (/HOMOPHONE/.test(u)) return 'Words that sound alike but are spelled differently, like "pair" and "pear".';
  if (/PALINDROME/.test(u)) return 'Every answer reads the same backwards and forwards, like "racecar".';
  if (/^ALSO AN? /.test(u)) return `Every answer is also ${n.replace(/^also\s+/i, '').toLowerCase()}.`;
  const cross = u.match(/CROSSWORD CLUES? "([^"]+)"/);
  if (cross) return `Clues written like a crossword's, and every answer starts with "${cross[1]}".`;
  const letters = u.match(/\b(\d+|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN)-LETTER WORDS?\b/);
  if (letters) { const k = Number(letters[1]); return `Every answer is a word with ${Number.isFinite(k) ? (words[k] ?? k) : letters[1].toLowerCase()} letters.`; }
  if (/_{2,}|\.{3}|…/.test(n)) return 'Fill in the blank in the clue.';
  const quoted = n.match(/"([^"]+)"/);
  if (quoted) return `Every answer has "${quoted[1]}" in it.`;
  return '';
}

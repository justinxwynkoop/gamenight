import test from 'node:test';
import assert from 'node:assert/strict';
import { showComment, explainCategory, cleanAbout } from '../games/jeopardy/about.js';
import { HOUSE_PACKS } from '../games/jeopardy/packs/index.js';
import { parseArchive } from '../games/jeopardy/archive.js';

test('the show\'s own category notes are kept, without the speaker; presenter intros are not', () => {
  assert.equal(showComment('(Mayim: Each response has four letters; the second is "R" and the fourth is "M".)'), 'Each response has four letters; the second is "R" and the fourth is "M".');
  assert.equal(showComment('(Ken Jennings: Name the artist.)'), 'Name the artist.');
  assert.equal(showComment("(Hana Ali: I'm Hana Ali with clues about my father.)"), '');
  assert.equal(showComment('(Mayim: And these are presented by the news team at ABC7.)'), '');
  assert.equal(showComment(''), '');
});

test('well-known kinds of category name get a note', () => {
  assert.match(explainCategory('BEFORE & AFTER'), /share/);
  assert.match(explainCategory('RHYME TIME'), /rhyme/);
  assert.match(explainCategory('5-LETTER WORDS'), /five letters/);
  assert.match(explainCategory('CROSSWORD CLUES "B"'), /starts with "B"/);
  assert.match(explainCategory('"EZ" GEOGRAPHY'), /"EZ"/);
  assert.equal(explainCategory('WORLD HISTORY'), '');
  assert.equal(cleanAbout('x'.repeat(300)).length, 200);
});

test('every category in the shipped question sets has a note for the host', () => {
  for (const p of HOUSE_PACKS) for (const c of p.data.categories) assert.ok(c.about && c.about.length <= 200, `${p.id}: ${c.name}`);
});

test('a real-show category keeps the show\'s note, and one introducing a presenter is dropped', () => {
  const head = 'round\tclue_value\tdaily_double_value\tcategory\tcomments\tanswer\tquestion\tair_date\tnotes';
  const rows = [];
  const col = (cat, comment, date) => [200, 400, 600, 800, 1000].forEach((v, i) => rows.push(['1', v, 0, cat, i === 0 ? comment : '', `Clue ${cat} ${v}`, `ans${i}`, date, ''].join('\t')));
  col('IN- IS OUT WORDS', '(Mayim: "In" has been removed from the start of each correct response.)', '2021-10-01');
  col('CLUE CREW WORDS', '(Sarah: I\'m here with the Clue Crew; this is presented by NASA.)', '2021-10-02');
  for (let i = 0; i < 14; i++) col(`WORDS ${i}`, '', `2021-11-${String(i + 1).padStart(2, '0')}`);
  const cats = parseArchive([head, ...rows].join('\n'), 38).flatMap((p) => p.categories);
  const inOut = cats.find((c) => c.name === 'IN- IS OUT WORDS');
  assert.equal(inOut?.about, '"In" has been removed from the start of each correct response.');
  assert.equal(inOut.clues.length, 5);
  assert.ok(!cats.some((c) => c.name === 'CLUE CREW WORDS'));
});

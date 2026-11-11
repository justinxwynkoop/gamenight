import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateSet } from '../games/jeopardy/game.js';

// The question sets that ship with the repo. (Sets you write yourself live in the same folder but are
// not listed here, so they never fail these tests.)
const SHIPPED = [
  'family-night', 'animal-kingdom', 'movies-and-cartoons', 'around-the-usa', 'science-lab', 'food-and-cooking',
  'sports-night', 'world-geography', 'history-highlights', 'music-and-pop-culture', 'holidays-and-seasons',
];
const load = (id) => JSON.parse(readFileSync(new URL(`../data/jeopardy/${id}.json`, import.meta.url), 'utf8'));

for (const id of SHIPPED) {
  test(`question set ${id} is valid and well formed`, () => {
    const set = load(id);
    assert.equal(validateSet(set), true);
    assert.equal(set.categories.length, 6);
    const seenClues = new Set();
    for (const cat of set.categories) {
      assert.equal(cat.clues.length, 5, `${cat.name} needs five clues`);
      assert.deepEqual(cat.clues.map((c) => c.value), [200, 400, 600, 800, 1000], `${cat.name} values`);
      const answers = cat.clues.map((c) => c.answer.trim().toLowerCase());
      assert.equal(new Set(answers).size, 5, `${cat.name} repeats an answer`);
      for (const c of cat.clues) {
        assert.ok(c.clue.length <= 200, `clue too long to read on a TV: ${c.clue}`);
        assert.ok(c.answer.length <= 60, `answer too long: ${c.answer}`);
        assert.ok(!seenClues.has(c.clue), `repeated clue: ${c.clue}`);
        seenClues.add(c.clue);
      }
    }
    assert.ok(set.final.clue.length <= 200);
    assert.ok(set.title.length <= 80);
  });
}

test('every shipped set has its own title', () => {
  const titles = SHIPPED.map((id) => load(id).title);
  assert.equal(new Set(titles).size, SHIPPED.length);
});

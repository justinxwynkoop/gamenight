// Survey data -> Family Feud sets. These tests use a few made-up lines in ProtoQA's format, never the real data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tidyQuestion, tidyAnswer, toQuestion, makeSets } from '../games/feud/survey.js';
import { validateSet } from '../games/feud/game.js';

const line = (question, answers) => ({
  question: { original: question },
  answers: { clusters: Object.fromEntries(answers.map(([text, count], i) => [`q.${i}`, { count, answers: [text] }])) },
});
const sample = (n) => line(`Name Something You Find In Kitchen Number ${n}.`, [['sink', 40], ['fridge', 25], ['stove', 15], ['spoon', 10], ['table', 6], ['cat', 4]]);

test('a Title Case question becomes a sentence', () => {
  assert.equal(tidyQuestion('At The Beach, Name Something That Might Protect You From Sun. '), 'At the beach, name something that might protect you from sun.');
  assert.equal(tidyQuestion('name something i like at Christmas'), 'Name something I like at Christmas');
  assert.equal(tidyQuestion('Name a thing that is already a normal sentence.'), 'Name a thing that is already a normal sentence.');
  assert.equal(tidyAnswer('  sun hat '), 'Sun hat');
});

test('a survey line becomes a question with ranked answers', () => {
  const q = toQuestion(sample(1));
  assert.equal(q.question, 'Name something you find in kitchen number 1.');
  assert.deepEqual(q.answers.map((a) => a.text), ['Sink', 'Fridge', 'Stove', 'Spoon', 'Table', 'Cat']);
  assert.deepEqual(q.answers.map((a) => a.points), [40, 25, 15, 10, 6, 4]);
});

test('questions that will not do are left out', () => {
  assert.equal(toQuestion(line('Name something short.', [['a', 5], ['b', 4]])), null, 'too few answers');
  assert.equal(toQuestion(line('Movie studio.', [['a', 5], ['b', 4], ['c', 3]])), null, 'not a question');
  assert.equal(toQuestion(line('Finish this sentence: I love ___.', [['a', 5], ['b', 4], ['c', 3]])), null, 'fill in the blank');
  assert.equal(toQuestion(line(`Name ${'something really long '.repeat(8)}`, [['a', 5], ['b', 4], ['c', 3]])), null, 'too long for a TV');
  assert.equal(toQuestion(line('Name something you do on a first date.', [['a', 5], ['b', 4], ['c', 3]])), null, 'family filter');
  assert.ok(toQuestion(line('Name something you do on a first date.', [['a', 5], ['b', 4], ['c', 3]]), { family: false }));
  assert.equal(toQuestion(line('Name a fruit.', [['apple', 5], ['kiss', 4], ['pear', 3], ['plum', 2]])).answers.length, 3, 'an unsuitable answer is dropped, not the question');
});

test('duplicates are merged, very long answers dropped, at most eight answers kept', () => {
  const q = toQuestion(line('Name a color.', [['red', 30], ['Red', 20], ['blue', 10], ['green', 9], ['x'.repeat(50), 8], ['yellow', 7], ['pink', 6], ['black', 5], ['white', 4], ['gray', 3], ['tan', 2]]));
  assert.deepEqual(q.answers.map((a) => a.text), ['Red', 'Blue', 'Green', 'Yellow', 'Pink', 'Black', 'White', 'Gray']);
});

test('sets are valid, ten questions each, no question twice, and repeatable with a seed', () => {
  const lines = Array.from({ length: 60 }, (_, i) => sample(i));
  const a = makeSets(lines, { sets: 4, seed: 5 });
  assert.equal(a.length, 4);
  for (const { id, set } of a) {
    assert.match(id, /^protoqa-\d{3}$/);
    assert.equal(validateSet(set), true);
    assert.equal(set.rounds.length, 5);
    assert.equal(set.fastMoney.length, 5);
  }
  const all = a.flatMap(({ set }) => [...set.rounds, ...set.fastMoney].map((q) => q.question));
  assert.equal(new Set(all).size, all.length);
  assert.deepEqual(makeSets(lines, { sets: 4, seed: 5 }), a);
  assert.notDeepEqual(makeSets(lines, { sets: 4, seed: 6 }).map((s) => s.set.rounds[0].question), a.map((s) => s.set.rounds[0].question));
});

test('it makes fewer sets when there are not enough questions, and none from nothing', () => {
  assert.equal(makeSets(Array.from({ length: 15 }, (_, i) => sample(i)), { sets: 10 }).length, 1);
  assert.equal(makeSets([], { sets: 3 }).length, 0);
});

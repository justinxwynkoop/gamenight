import test from 'node:test';
import assert from 'node:assert/strict';
import { spokenCommand, nextUnanswered, speechProblem } from '../public/games/feud/speech.js';

test('saying or typing "skip" is a skip; an answer that merely contains the word is not', () => {
  for (const t of ['skip', 'Skip.', ' SKIP IT ', 'Skip this one!', 'pass', 'next question', "I don't know", 'no idea']) assert.equal(spokenCommand(t), 'skip', t);
  for (const t of ['skip rope', 'a skip', 'pass the salt', 'apple', '', null, undefined]) assert.equal(spokenCommand(t), null, String(t));
});

test('after a question the form goes to the next empty one, then back round to the skipped ones', () => {
  assert.equal(nextUnanswered(['a', '', '', '', ''], 0), 1);
  assert.equal(nextUnanswered(['a', 'b', 'c', 'd', ''], 3), 4);
  assert.equal(nextUnanswered(['', 'b', 'c', 'd', 'e'], 4), 0, 'wraps round to a skipped question');
  assert.equal(nextUnanswered(['a', '', 'c', '', 'e'], 4), 1, 'the first skipped one, then the next');
  assert.equal(nextUnanswered(['a', 'b', 'c', 'd', 'e'], 2), -1, 'everything answered');
  assert.equal(nextUnanswered(['a', '  ', 'c'], 0), 1, 'blank spaces do not count as an answer');
});

test('speech errors become something a player can act on', () => {
  assert.match(speechProblem('not-allowed'), /keyboard/);
  assert.match(speechProblem('network'), /internet/);
  assert.match(speechProblem('no-speech'), /Try again/);
  assert.equal(speechProblem('aborted'), '');
  assert.match(speechProblem('something-new'), /keyboard/);
});

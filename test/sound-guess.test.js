import test from 'node:test';
import assert from 'node:assert/strict';
import { guessSounds, guessGame } from '../public/sound-guess.js';
import { SOUND_NAMES } from '../engine/sounds.js';

const guess = (names) => Object.fromEntries(guessSounds(names, SOUND_NAMES).map((g) => [g.file, g]));

test('the games are told from the file name, however it is spelled', () => {
  assert.equal(guessGame('jeopardy_main_theme.mp3'), 'jeopardy');
  assert.equal(guessGame('family_fued_main_theme.mp3'), 'feud');
  assert.equal(guessGame('famiy_fued_fast_money.mp3'), 'feud');
  assert.equal(guessGame('familyfeudbuzzer.mp3'), 'feud');
  assert.equal(guessGame('Spy Night lobby.m4a'), 'spynight');
  assert.equal(guessGame('lobby.mp3'), 'shared');
});

test('the family’s Jeopardy and Family Feud files land on the right sounds', () => {
  const g = guess([
    'jeopardy_main_theme.mp3', 'jeopardy_board_fill.mp3', 'jeopardy_daily_double.mp3', 'jeopardy_times_up.mp3',
    'family_fued_main_theme.mp3', 'family_fued_correct_answer.mp3', 'family_fued_wrong_answer.mp3', 'family_fued_buzzer_press.mp3',
    'famiy_fued_fast_money_answer_fill_in.mp3', 'familyfeudfastmoney.mp3', 'familyfuedintro.mp3',
  ]);
  const at = (f) => `${g[f].game}/${g[f].name}`;
  assert.equal(at('jeopardy_main_theme.mp3'), 'jeopardy/lobby');
  assert.equal(at('jeopardy_board_fill.mp3'), 'jeopardy/board');
  assert.equal(at('jeopardy_daily_double.mp3'), 'jeopardy/dd');
  assert.equal(at('jeopardy_times_up.mp3'), 'jeopardy/timeup');
  assert.equal(at('family_fued_main_theme.mp3'), 'feud/lobby');
  assert.equal(at('family_fued_correct_answer.mp3'), 'feud/ding');
  assert.equal(at('family_fued_wrong_answer.mp3'), 'feud/strike');
  assert.equal(at('family_fued_buzzer_press.mp3'), 'feud/faceoff');
  assert.equal(at('famiy_fued_fast_money_answer_fill_in.mp3'), 'feud/fmpoints');
  assert.equal(at('familyfeudfastmoney.mp3'), 'feud/fastmoney');
  assert.equal(at('familyfuedintro.mp3'), 'feud/roundstart');
});

test('two files for the same sound: the first keeps it, the other is left for the host', () => {
  const g = guess(['family_fued_buzzer_press.mp3', 'familyfeudbuzzer.mp3']);
  const kept = Object.values(g).filter((x) => x.name === 'faceoff');
  const left = Object.values(g).filter((x) => x.name === null);
  assert.equal(kept.length, 1);
  assert.equal(left.length, 1);
  assert.equal(left[0].duplicateOf, kept[0].file);
});

test('a sound the game does not have is not guessed, and a file with no clue is left for the host', () => {
  const g = guess(['jeopardy_strike.mp3', 'my song.mp3']);
  assert.equal(g['jeopardy_strike.mp3'].name, null);   // Jeopardy has no strike
  assert.equal(g['my song.mp3'].name, null);
  assert.equal(g['my song.mp3'].game, 'shared');
});

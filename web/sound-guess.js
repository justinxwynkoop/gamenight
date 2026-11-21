// Guesses which game and sound a file is for from its name, so a whole folder of the family's own files can be added at
// once ("family_feud_wrong_answer.mp3" is Family Feud's strike). The host sees the guesses and can change any of them.
// Pure (no page needed), so it can be tested on its own.

/** Rules for each game, tried in order against the file name with everything but letters and digits removed. */
const RULES = {
  jeopardy: [
    ['dailydouble', 'dd'], ['doublejeopardy', 'roundstart'], ['finaljeopardy', 'think'], ['thinkmusic', 'think'], ['think', 'think'],
    ['boardfill', 'board'], ['board', 'board'], ['timesup', 'timeup'], ['timeup', 'timeup'], ['timeout', 'timeup'],
    ['maintheme', 'lobby'], ['theme', 'lobby'], ['lobby', 'lobby'], ['menu', 'lobby'], ['intro', 'roundstart'],
    ['incorrect', 'wrong'], ['wrong', 'wrong'], ['correct', 'correct'], ['rightanswer', 'correct'],
    ['buzz', 'buzz'], ['reveal', 'reveal'], ['applause', 'applause'], ['fanfare', 'fanfare'], ['final', 'final'],
  ],
  feud: [
    ['fastmoneyanswer', 'fmpoints'], ['fastmoneyfill', 'fmpoints'], ['fillin', 'fmpoints'], ['fmpoints', 'fmpoints'], ['zero', 'zero'],
    ['fastmoney', 'fastmoney'], ['strikeout', 'strikeout'], ['maintheme', 'lobby'], ['theme', 'lobby'], ['lobby', 'lobby'],
    ['intro', 'roundstart'], ['roundstart', 'roundstart'], ['winner', 'winner'], ['fanfare', 'winner'],
    ['wronganswer', 'strike'], ['incorrect', 'strike'], ['wrong', 'strike'], ['strike', 'strike'],
    ['correctanswer', 'ding'], ['correct', 'ding'], ['ding', 'ding'], ['survey', 'ding'],
    ['buzzer', 'faceoff'], ['buzz', 'faceoff'], ['faceoff', 'faceoff'],
  ],
  spynight: [
    ['maintheme', 'lobby'], ['theme', 'lobby'], ['lobby', 'lobby'], ['deal', 'roundstart'], ['intro', 'roundstart'],
    ['approve', 'correct'], ['reject', 'wrong'], ['success', 'ding'], ['fail', 'strike'], ['mission', 'lock'],
    ['resistancewin', 'fanfare'], ['spieswin', 'winner'], ['winner', 'winner'], ['fanfare', 'fanfare'],
  ],
  shared: [
    ['maintheme', 'lobby'], ['theme', 'lobby'], ['lobby', 'lobby'], ['think', 'think'], ['timesup', 'timeup'], ['timeup', 'timeup'],
    ['wrong', 'wrong'], ['correct', 'correct'], ['fanfare', 'fanfare'], ['buzz', 'buzz'],
  ],
};

const compact = (s) => s.toLowerCase().replace(/\.[a-z0-9]{2,4}$/, '').replace(/[^a-z0-9]/g, '');

/** The game a file name points at: the show it is named for, or 'shared' for a sound every game may use. */
export function guessGame(fileName) {
  const c = compact(fileName);
  if (c.includes('jeopardy')) return 'jeopardy';
  if (c.includes('feud') || c.includes('fued') || c.includes('familyfe')) return 'feud';
  if (c.includes('spynight') || c.includes('spy')) return 'spynight';
  return 'shared';
}

/**
 * Guesses for these file names: [{ file, game, name }]. `name` is null where nothing fits (the host picks, or skips it).
 * `known` is the list of sounds a game may have ({ name, games }), and a guess is only kept if the game has that sound.
 * When two files get the same guess the first keeps it and the later ones are left for the host to place (`duplicateOf`).
 */
export function guessSounds(fileNames, known) {
  const taken = new Map();
  return [...fileNames].sort((a, b) => a.localeCompare(b)).map((file) => {
    const game = guessGame(file);
    const c = compact(file);
    const hit = (RULES[game] ?? []).find(([word]) => c.includes(word));
    let name = hit ? hit[1] : null;
    if (name && !known.some((k) => k.name === name && k.games.includes(game))) name = null;
    const key = `${game}/${name}`;
    const out = { file, game, name };
    if (name && taken.has(key)) { out.name = null; out.duplicateOf = taken.get(key); }
    else if (name) taken.set(key, file);
    return out;
  });
}

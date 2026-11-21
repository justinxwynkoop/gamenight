// The family's own sounds, sent from the host page to the TV and kept there (see docs/CUSTOM-FILES.md). Nothing here
// touches files: whoever hosts the engine (the Apple TV app) passes in a `sounds` object that does the keeping.
//
//   sounds.save({ game, name, ext, index, total, data })   one piece (base64) of a file; true once the last piece arrived
//   sounds.list()                                          [{ game, name, ext, bytes }]
//   sounds.remove(game, name)
import { GameError } from '../lib.js';

/** 'shared' is used by every game; a game's own file wins over a shared one of the same name. */
export const SOUND_GAMES = [
  { id: 'shared', label: 'Every game' },
  { id: 'jeopardy', label: 'Jeopardy' },
  { id: 'feud', label: 'Family Feud' },
];

/** The sounds the TV knows how to use (the same names as the Apple TV app's SoundCue, plus the two music tracks). */
export const SOUND_NAMES = [
  { name: 'lobby', label: 'Lobby music (loops while players join)', games: ['shared', 'jeopardy', 'feud'] },
  { name: 'think', label: 'Final Jeopardy thinking music', games: ['shared', 'jeopardy'] },
  { name: 'open', label: 'Buzzers open', games: ['shared', 'jeopardy', 'feud'] },
  { name: 'buzz', label: 'Someone buzzes in', games: ['shared', 'jeopardy'] },
  { name: 'correct', label: 'Right answer', games: ['shared', 'jeopardy', 'feud'] },
  { name: 'wrong', label: 'Wrong answer', games: ['shared', 'jeopardy'] },
  { name: 'timeup', label: "Time's up", games: ['shared', 'jeopardy', 'feud'] },
  { name: 'tick', label: 'Countdown tick (last five seconds)', games: ['shared', 'jeopardy', 'feud'] },
  { name: 'reveal', label: 'Answer shown, nobody got it', games: ['shared', 'jeopardy'] },
  { name: 'dd', label: 'Daily Double', games: ['shared', 'jeopardy'] },
  { name: 'final', label: 'Final Jeopardy begins', games: ['shared', 'jeopardy'] },
  { name: 'fanfare', label: 'The winner', games: ['shared', 'jeopardy'] },
  { name: 'pick', label: 'A clue is picked', games: ['jeopardy'] },
  { name: 'board', label: 'The board fills in', games: ['jeopardy'] },
  { name: 'lock', label: 'A Final Jeopardy wager or answer locks in', games: ['jeopardy'] },
  { name: 'bet', label: 'A Daily Double wager is placed', games: ['jeopardy'] },
  { name: 'join', label: 'A player joins', games: ['jeopardy'] },
  { name: 'applause', label: 'End of a round, and the winner', games: ['jeopardy'] },
  { name: 'roundstart', label: 'A new round begins', games: ['jeopardy', 'feud'] },
  { name: 'ding', label: 'A survey answer flips over', games: ['feud'] },
  { name: 'strike', label: 'A strike (the big X)', games: ['feud'] },
  { name: 'strikeout', label: 'The third strike', games: ['feud'] },
  { name: 'faceoff', label: 'A face-off player buzzes in', games: ['feud'] },
  { name: 'winner', label: 'The winning jingle', games: ['feud'] },
  { name: 'zero', label: 'A Fast Money answer worth nothing', games: ['feud'] },
  { name: 'fmpoints', label: 'Fast Money points are shown', games: ['feud'] },
  { name: 'fastmoney', label: 'Fast Money is about to begin', games: ['feud'] },
];

export const SOUND_EXTENSIONS = ['mp3', 'm4a', 'wav'];
/** A piece of a file: at most this many base64 characters (about 120 KB of audio). */
export const MAX_PIECE = 170000;
/** A file is at most this many pieces (so about 7 MB: plenty for a theme tune). */
export const MAX_PIECES = 64;

function check(args) {
  const game = String(args.game ?? '');
  const name = String(args.name ?? '');
  if (!SOUND_GAMES.some((g) => g.id === game)) throw new GameError('Choose Every game, Jeopardy or Family Feud');
  if (!SOUND_NAMES.some((n) => n.name === name && n.games.includes(game))) throw new GameError(`${game} has no sound called "${name}"`);
  return { game, name };
}

/** The host's calls about sounds, as rpc operations. `sounds` is null where the engine cannot keep files (the website TV). */
export function soundOps(sounds) {
  return {
    listSounds() {
      return { available: !!sounds, files: sounds ? sounds.list() : [], games: SOUND_GAMES, names: SOUND_NAMES, extensions: SOUND_EXTENSIONS };
    },
    putSound(args) {
      if (!sounds) throw new GameError('This TV cannot keep your own sounds');
      const { game, name } = check(args);
      const ext = String(args.ext ?? '').toLowerCase();
      if (!SOUND_EXTENSIONS.includes(ext)) throw new GameError('The Apple TV plays .mp3, .m4a and .wav files');
      const index = Number(args.index);
      const total = Number(args.total);
      if (!Number.isInteger(total) || total < 1 || total > MAX_PIECES) throw new GameError('That file is too big (the limit is about 7 MB)');
      if (!Number.isInteger(index) || index < 0 || index >= total) throw new GameError('Bad piece number');
      const data = String(args.data ?? '');
      if (!data || data.length > MAX_PIECE || /[^A-Za-z0-9+/=]/.test(data)) throw new GameError('Bad piece of the file');
      return { ok: true, done: !!sounds.save({ game, name, ext, index, total, data }) };
    },
    deleteSound(args) {
      if (!sounds) throw new GameError('This TV cannot keep your own sounds');
      const { game, name } = check(args);
      sounds.remove(game, name);
      return { ok: true };
    },
  };
}

import { GuysVsGalsGame, validateSet, NAME } from './game.js';

export default {
  id: 'guysvsgals',
  name: NAME,
  description: 'The battle of the sexes, tug-of-war style: the Guys answer gal stuff, the Gals answer guy stuff. Pull the trophy to your side with trivia, picture questions and charades. First to three trophies wins. Or play the classic pawn race, with wild cards and prisoners.',
  // Always two teams: the Guys and the Gals.
  // picksSides: players choose the Guys or the Gals themselves (nothing shuffles them). noScoreEdit: the score is trophies or pawns, not a number to fix.
  needs: { teams: 2, picksSides: true, noScoreEdit: true },
  validateContent: validateSet,
  create: (room) => new GuysVsGalsGame(room),
};

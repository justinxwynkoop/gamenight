import { GuysVsGalsGame, validateSet, NAME } from './game.js';

export default {
  id: 'guysvsgals',
  name: NAME,
  description: 'The battle of the sexes, tug-of-war style: the Guys answer gal stuff, the Gals answer guy stuff. Pull the trophy to your side through five decks (facts, stuff, pictures, guess-my-life and charades). First to three trophies wins. Or play the classic pawn race, with wild cards and prisoners.',
  // Always two teams: the Guys and the Gals.
  needs: { teams: 2 },
  validateContent: validateSet,
  create: (room) => new GuysVsGalsGame(room),
};

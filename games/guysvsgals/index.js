import { GuysVsGalsGame, validateSet, NAME } from './game.js';

export default {
  id: 'guysvsgals',
  name: NAME,
  description: 'The battle of the sexes: the Guys answer questions about gal stuff, the Gals about guy stuff. Vote on your phones, race to the finish, and survive the Lightning Rounds.',
  // Always two teams: the Guys and the Gals.
  needs: { teams: 2 },
  validateContent: validateSet,
  create: (room) => new GuysVsGalsGame(room),
};

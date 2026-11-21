import { SpyNightGame, MAX_PLAYERS } from './game.js';
import { fail } from '../../lib.js';

export default {
  id: 'spynight',
  name: 'Spy Night',
  description: 'A game of secret roles. Most of you are the Resistance, a few are Spies. Your phone tells you which you are; the Spies know each other.',
  // Played by individuals, five to ten of them, each on their own phone. Nothing to load: no question sets.
  needs: { individuals: true },
  maxPlayers: MAX_PLAYERS,
  validateContent: () => fail('Spy Night has no question sets'),
  create: (room) => new SpyNightGame(room),
};

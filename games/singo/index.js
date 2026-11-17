import { SingoGame } from './game.js';
import { fail } from '../../lib.js';

export default {
  id: 'singo',
  name: 'Singo Night',
  description: 'Bingo with songs. The Apple TV plays clips from an Apple Music playlist; everyone marks song titles on a card on their phone.',
  // Played by individuals. The music comes from Apple Music on the Apple TV, so only the Apple TV app starts it.
  needs: { individuals: true },
  appOnly: true,
  validateContent: () => fail('Singo Night has no question sets: its songs come from Apple Music'),
  create: (room) => new SingoGame(room),
};

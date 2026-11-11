import { FeudGame, validateSet } from './game.js';

export default {
  id: 'feud',
  name: 'Family Feud',
  description: 'Two teams guess the most popular survey answers. Face-off, strikes, steals and Fast Money.',
  needs: { teams: 2 },
  validateContent: validateSet,
  create: (room) => new FeudGame(room),
};

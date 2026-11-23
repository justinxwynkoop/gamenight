import { PieChaseGame, validateSet, NAME, MAX_UNITS } from './game.js';

export default {
  id: 'piechase',
  name: NAME,
  description: 'The wedge-collecting trivia board game. Roll, move round the wheel, answer questions in six categories, win a wedge at each headquarters, then race back to the hub to win.',
  // Two to six players or teams; each player or team needs a phone to roll and move.
  maxUnits: MAX_UNITS,
  validateContent: validateSet,
  create: (room) => new PieChaseGame(room),
};

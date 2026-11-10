import { JeopardyGame, validateSet } from './game.js';

export default {
  id: 'jeopardy',
  name: 'Jeopardy',
  description: 'A 6×5 board of clues, Daily Doubles and Final Jeopardy. Buzz in to answer.',
  validateContent: validateSet,
  create: (room) => new JeopardyGame(room),
};

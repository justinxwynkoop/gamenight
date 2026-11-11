import { JeopardyGame, validateSet } from './game.js';
import { createRandomBoards } from './clues.js';

export default {
  id: 'jeopardy',
  name: 'Jeopardy',
  description: 'A 6×5 board of clues, Daily Doubles and Final Jeopardy. Buzz in to answer.',
  validateContent: validateSet,
  create: (room) => new JeopardyGame(room),
  // A source of random boards built from the clue file kept in <data>/clues (see clues.js).
  randomBoards: (dataDir) => createRandomBoards({ dataDir }),
};

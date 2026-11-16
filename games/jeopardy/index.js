import { JeopardyGame, validateSet, MAX_PLAYERS } from './game.js';

export default {
  id: 'jeopardy',
  name: 'Jeopardy',
  description: 'A 6×5 board of clues, Daily Doubles and Final Jeopardy. Buzz in, type your answer, beat the clock.',
  // Played by individuals only (up to 8), never in teams.
  needs: { individuals: true },
  maxPlayers: MAX_PLAYERS,
  validateContent: validateSet,
  create: (room) => new JeopardyGame(room),
};

import { FeudGame, validateSet } from './game.js';
import { createRandomSurvey } from './survey.js';

export default {
  id: 'feud',
  name: 'Family Feud',
  description: 'Two teams guess the most popular survey answers. Face-off, strikes, steals and Fast Money.',
  needs: { teams: 2 },
  validateContent: validateSet,
  create: (room) => new FeudGame(room),
  // A source of random boards built from the survey data in <data>/surveys (see survey.js).
  randomBoards: (dataDir) => createRandomSurvey({ dataDir }),
};

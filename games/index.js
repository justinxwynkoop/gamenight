// Every game the room can run. To add one: create games/<id>/ with an index.js
// that exports the module described in room.js, add its pages under
// public/games/<id>/ (tv.js, host.js, player.js, editor.js), and list it here.
import jeopardy from './jeopardy/index.js';
import feud from './feud/index.js';

export const GAMES = Object.fromEntries([jeopardy, feud].map((g) => [g.id, g]));

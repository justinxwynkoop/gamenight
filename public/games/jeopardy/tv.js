// Jeopardy no longer has a web TV page: the board, clue and Final screens live in the Apple TV app (and its sounds
// and music too). A Raspberry Pi in server mode still runs the room for Family Feud; if someone starts Jeopardy
// there, this is all the TV browser shows. The host and phones keep working, so the game can still be played.
import { h } from '../../common.js';

export function render() {
  return h('div', { class: 'lobby' },
    h('div', {},
      h('h1', {}, 'Jeopardy is on the Apple TV'),
      h('p', {}, 'The Jeopardy board is shown by the Game Night app on Apple TV.'),
      h('p', {}, 'Open the Jeopardy tile there to play. Family Feud can still be shown from this page.')));
}

// Singo Night plays music from Apple Music, so only the Apple TV app shows it. A browser TV just says so.
import { h } from '../../common.js';

export function render() {
  return h('div', { class: 'lobby' }, h('h1', {}, 'Singo Night'), h('p', {}, 'Singo Night plays on the Apple TV app.'));
}

// Singo Night on the host page. The round runs on the Apple TV (it plays the music), so there is little to do here:
// who has joined, and who has won.
import { h } from '../../common.js';
import { card, eyebrow } from '../../ui.js';

export function render(raw) {
  const g = raw.game;
  const r = g.round;
  const winners = g.winners ?? [];
  return {
    title: 'Singo Night',
    sub: r ? `Round ${r.n} · ${r.calledCount} of ${r.songs} songs played` : 'Waiting for the Apple TV',
    body: [
      card(eyebrow('How it works'), h('p', { class: 'dim' }, 'Singo Night runs on the Apple TV: pick a playlist there and start a round. Everyone who joined gets a bingo card of song titles on their phone, taps the songs they hear, and presses SINGO! for a full line. The TV checks it.')),
      card(eyebrow('Winners this round'), winners.length ? h('div', { class: 'list' }, winners.map((w) => h('div', { class: 'rowi' }, h('div', { class: 'grow t' }, w.name)))) : h('p', { class: 'dim' }, 'No Singo yet.')),
    ],
    dock: null, settings: [], danger: [],
  };
}

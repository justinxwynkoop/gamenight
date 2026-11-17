// Singo Night on a phone: a bingo card of song titles. Tap a square when you hear that song, and press SINGO! when a
// row, column or diagonal is marked. The Apple TV plays the music and checks the claim against the songs it has played.
import { h } from '../../common.js';

export function mount(container, { send, flash }) {
  let view = null;
  let key = '';
  let grid; let head; let claimBtn; let calledBox; let wonBox;

  function build() {
    head = h('div', { class: 'sg-head' });
    wonBox = h('div', { class: 'sg-won hidden' });
    grid = h('div', { class: 'sg-card' });
    grid.addEventListener('click', (e) => {
      const cell = e.target.closest('.sg-cell');
      if (!cell || cell.classList.contains('free') || view?.game?.round?.status !== 'playing') return;
      cell.classList.toggle('on');   // feels instant; the next update confirms it
      navigator.vibrate?.(15);
      send({ t: 'mark', i: Number(cell.dataset.i) });
    });
    claimBtn = h('button', { type: 'button', class: 'sg-claim', onclick: () => send({ t: 'singo' }) }, 'SINGO!');
    calledBox = h('details', { class: 'card sg-called' });
    return h('div', { class: 'sg' }, head, wonBox, grid, claimBtn, calledBox);
  }

  function waiting(text) {
    return h('div', { class: 'card sg-wait' }, h('div', { class: 'sg-logo' }, '🎵'), h('h2', {}, 'Singo Night'), h('p', {}, text));
  }

  function refresh() {
    const v = view;
    if (!v?.room?.me) return;
    const g = v.game;
    if (!g.card) {
      const k = `wait-${g.status}`;
      if (key !== k) { key = k; container.replaceChildren(waiting(g.status === 'waiting' ? 'Your card arrives when the TV starts a round. Get ready to listen!' : 'Waiting for the next round.')); }
      return;
    }
    const size = g.round.size;
    const k = `card-${g.round.n}`;
    if (key !== k) { key = k; container.replaceChildren(build()); }
    const over = g.round.status !== 'playing';
    head.replaceChildren(
      h('div', { class: 'sg-title' }, g.round.playlist ?? 'Singo Night'),
      h('div', { class: 'tag' }, over ? 'Round over' : `${g.round.calledCount} of ${g.round.songs} songs played · tap a song when you hear it`));
    grid.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
    grid.classList.toggle(`s${size}`, true);
    const win = new Set(g.winLine ?? []);
    grid.replaceChildren(...g.card.map((c, i) => h('button', {
      type: 'button', class: `sg-cell ${c.free ? 'free' : ''} ${c.marked ? 'on' : ''} ${win.has(i) ? 'win' : ''}`, 'data-i': String(i),
      'aria-pressed': String(!!c.marked), 'aria-label': c.free ? 'Free square' : `${c.title}${c.artist ? `, ${c.artist}` : ''}`,
    }, c.free ? h('span', { class: 't' }, '★ FREE') : [h('span', { class: 't' }, c.title), c.artist && h('span', { class: 'a' }, c.artist)])));
    claimBtn.disabled = over || !!g.won;
    claimBtn.textContent = g.won ? 'YOU GOT SINGO!' : 'SINGO!';
    wonBox.classList.toggle('hidden', !g.won && !(g.winners?.length));
    wonBox.replaceChildren(g.won ? '🎉 You got Singo! Take a bow.' : g.winners?.length ? `🏆 Singo for ${g.winners.map((w) => w.name).join(', ')}! Keep going for the next line.` : '');
    const called = g.called ?? [];
    const open = calledBox.open;
    calledBox.replaceChildren(h('summary', {}, `Songs played (${called.length})`),
      called.length ? h('ol', { class: 'sg-list', reversed: true }, called.map((s) => h('li', {}, h('b', {}, s.title), s.artist ? ` · ${s.artist}` : ''))) : h('p', { class: 'tag' }, 'Nothing yet.'));
    calledBox.open = open;
  }

  return {
    update(v) { view = v; refresh(); },
    onMessage(m) {
      if (m.t !== 'singo-result') return;
      if (m.ok) { navigator.vibrate?.([80, 60, 160]); if (!m.again) flash('SINGO! It counts. Look at the TV!', 'ok'); }
      else if (!m.marked) flash('Tap the songs you hear first, then press SINGO! when a line is full.');
      else flash(m.missing?.length ? `Not yet: ${m.missing.slice(0, 2).join(', ')}${m.missing.length > 2 ? '…' : ''} ${m.missing.length === 1 ? 'hasn’t' : 'haven’t'} played.` : 'Not a full line yet.');
    },
    destroy() {},
  };
}

// Family Feud on a phone: the face-off buzzer, and the Fast Money answer form.
// The page (play.js) handles joining and the header; this fills the rest.
import { h, ink } from '../../common.js';
import { buildFastMoneyForm } from './fmform.js';

export function mount(container, { send, flash }) {
  let view = null;
  let receivedAt = 0;
  let screenKey = '';
  let buzzBtn; let statusLine; let peek; let clockEl; let fmBox = null;
  let quiet = 0;   // answers sent along the way: the server's "saved" replies for these are not shown

  function buildBuzz() {
    buzzBtn = h('button', { class: 'buzz', type: 'button' }, 'WAIT');
    buzzBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); if (view?.room?.me) send({ t: 'buzz' }); });
    statusLine = h('div', { class: 'status-line' });
    peek = h('div', { class: 'card clue-peek hidden' });
    return h('div', { style: { display: 'contents' } }, buzzBtn, statusLine, peek, h('div', { class: 'card', id: 'fd-board' }));
  }

  const unit = (v, id) => v.room.units.find((u) => u.id === id);

  function myState(v) {
    const me = v.room.me;
    const g = v.game;
    const mine = me && unit(v, me.unitId);
    if (!me?.unitId) return { label: 'NO TEAM', cls: 'out', line: 'Ask the host to put you on a team.' };
    if (g.status === 'lobby') return { label: 'WAIT', cls: 'out', line: g.title ? `${g.title} starts soon` : 'Waiting for the host' };
    if (g.status === 'done') return { label: 'DONE', cls: 'out', line: 'Thanks for playing!' };
    const r = g.round;
    if (!r) return { label: 'WAIT', cls: 'out', line: '' };
    const f = r.faceoff;
    const iAmRep = f.reps.some((p) => p.playerId === me.id);
    if (r.step === 'faceoff') {
      if (!iAmRep) return { label: 'WATCH', cls: 'out', line: f.reps.length ? `Face-off: ${f.reps.map((p) => p.name).join(' vs ')}` : 'Face-off!' };
      if (f.open) return { label: 'BUZZ', cls: 'live', line: 'You’re up for the face-off. Go!', color: mine.color };
      if (f.turn === me.unitId) return { label: 'YOU!', cls: 'won', line: 'Answer out loud!', color: mine.color };
      if (f.turn) return { label: 'WAIT', cls: 'out', line: `${unit(v, f.turn)?.name ?? 'The other team'} is answering` };
      return { label: 'READY', cls: 'out', line: 'You’re up for the face-off. Wait for the host to open buzzers.', color: mine.color };
    }
    if (r.step === 'choose') return { label: f.winner === me.unitId ? 'YOU WON' : 'WAIT', cls: f.winner === me.unitId ? 'won' : 'out', line: f.winner === me.unitId ? 'Your team won the face-off. Play or pass?' : `${unit(v, f.winner)?.name} won the face-off`, color: f.winner === me.unitId ? mine.color : null };
    if (r.step === 'play') {
      const ours = r.control === me.unitId;
      return { label: ours ? 'YOUR TEAM' : 'WAIT', cls: ours ? 'won' : 'out', line: ours ? `Talk it over, then answer out loud · ${3 - r.strikes} strikes left` : `${unit(v, r.control)?.name} is playing`, color: ours ? mine.color : null };
    }
    if (r.step === 'steal') {
      const ours = r.control === me.unitId;
      return { label: ours ? 'STEAL!' : 'WAIT', cls: ours ? 'live' : 'out', line: ours ? 'One guess to steal it!' : `${unit(v, r.control)?.name} is trying to steal`, color: ours ? mine.color : null };
    }
    const won = r.result?.winner === me.unitId;
    return { label: won ? '✔' : '—', cls: won ? 'won' : 'out', line: `${unit(v, r.result?.winner)?.name} won ${r.result?.awarded ?? 0} points`, color: won ? mine.color : null };
  }

  function updateBuzz(v) {
    const s = myState(v);
    buzzBtn.textContent = s.label;
    buzzBtn.className = `buzz ${s.cls}`;
    buzzBtn.style.background = s.color ?? '';
    buzzBtn.style.color = s.color ? ink(s.color) : '';
    statusLine.textContent = s.line ?? '';
    const r = v.game.round;
    if (r) {
      peek.classList.remove('hidden');
      peek.replaceChildren(h('div', { class: 'tag' }, `Round ${r.number}${r.multiplier > 1 ? ` · ×${r.multiplier}` : ''} · ${r.pot} on the board`), r.question);
    } else peek.classList.add('hidden');
    const board = container.querySelector('#fd-board');
    if (board) {
      const sorted = [...v.room.units].sort((a, b) => b.score - a.score);
      board.replaceChildren(h('h2', {}, 'Scores'), h('div', { class: 'list' }, sorted.map((u) => h('div', { class: `item ${u.id === v.room.me.unitId ? 'me' : ''}` },
        h('span', { class: 'swatch', style: { background: u.color } }), h('span', { class: 'nm' }, u.id === v.room.me.unitId ? `${u.name} (you)` : u.name), h('span', { class: 'pts' }, String(u.score))))));
    }
  }

  // ---------- Fast Money ----------
  function fmScreen(v) {
    const f = v.game.fm;
    const me = v.room.me;
    const slot = f.players[0].id === me.id && f.step === 'p1' ? 'p1' : f.players[1].id === me.id && f.step === 'p2' ? 'p2' : null;
    if (!slot) {
      fmBox = null;
      const playing = f.players.some((p) => p.id === me.id);
      const line = f.step === 'pick' || f.step === 'team' ? 'Fast Money is about to start.'
        : playing ? (f.step === 'reveal' || f.step === 'results' ? 'Eyes on the TV for the reveal!' : 'Wait for your turn. Don’t listen to your partner’s answers!')
          : `${f.players.find((p) => (p.slot === 'p1' ? f.step === 'p1' : f.step === 'p2'))?.name ?? 'Two players'} are playing Fast Money. Watch the TV!`;
      return { key: `fm-wait-${f.step}`, node: h('div', { class: 'card' }, h('h2', {}, 'Fast Money'), h('p', {}, line)) };
    }
    const key = `fm-${slot}`;
    if (fmBox?.key === key) { fmBox.form.setNote(f.submitted[slot] ? 'Answers sent. You can change them until time is up.' : ''); return { key, node: fmBox.node }; }
    clockEl = h('div', { class: 'status-line' });
    // One question at a time, with a microphone, Skip, and a way back to skipped questions (see fmform.js).
    const form = buildFastMoneyForm(f.rows.map((row) => row.question), { send: (m) => { quiet += 1; send(m); } });
    const node = h('div', { class: 'card' }, h('h2', {}, 'Fast Money — you’re up!'), clockEl, form.node);
    fmBox = { key, node, form, auto: () => form.auto() };
    return { key, node };
  }

  function tickClock() {
    const f = view?.game?.fm;
    if (!f || !fmBox || !clockEl?.isConnected) return;
    const tm = f.timer;
    if (!tm) { clockEl.textContent = ''; return; }
    if (tm.timedOut) { clockEl.textContent = 'Time’s up!'; fmBox.auto(); return; }
    const left = Math.max(0, Math.ceil((tm.leftMs - (performance.now() - receivedAt)) / 1000));
    clockEl.textContent = `${left}s left`;
    if (left <= 0) fmBox.auto();
  }

  function refresh() {
    if (!view) return;
    const v = view;
    if (!v.room.me) return;
    const g = v.game;
    if (g.status === 'fastmoney' && g.fm) {
      const res = fmScreen(v);
      if (screenKey !== res.key) { screenKey = res.key; container.replaceChildren(res.node); }
      tickClock();
      return;
    }
    if (screenKey !== 'game') {
      fmBox = null;
    }
    if (screenKey !== 'game') { screenKey = 'game'; container.replaceChildren(buildBuzz()); }
    updateBuzz(v);
  }

  const timer = setInterval(() => { if (view?.game?.fm?.timer) tickClock(); }, 250);

  return {
    update(v) { view = v; receivedAt = performance.now(); refresh(); },
    onMessage(m) {
      if (m.t === 'buzz-result') { if (m.ok) navigator.vibrate?.(60); else if (m.reason === 'not-your-turn') flash('Only the two face-off players buzz.'); }
      else if (m.t === 'ack') { if (quiet > 0) quiet -= 1; else flash('Answers saved'); }
    },
    destroy() { clearInterval(timer); },
  };
}

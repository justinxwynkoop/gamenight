// Jeopardy on a phone: the buzz button and the Final Jeopardy forms.
// The page (play.js) handles joining and the header; this fills the rest.
import { h, money, ink, unitById } from '../../common.js';
import { flat } from './flat.js';

export function mount(container, { send, flash }) {
  let view = null;
  let screenKey = '';
  let penaltyUntil = 0;
  let buzzBtn; let statusLine; let peek;

  function buildGame() {
    buzzBtn = h('button', { class: 'buzz', type: 'button' }, 'WAIT');
    buzzBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); if (view?.room?.me) send({ t: 'buzz' }); });
    statusLine = h('div', { class: 'status-line' });
    peek = h('div', { class: 'card clue-peek hidden' });
    return h('div', { style: { display: 'contents' } }, buzzBtn, statusLine, peek);
  }

  function onBuzzResult(r) {
    if (r.ok) { navigator.vibrate?.(60); return; }
    if (r.reason === 'penalty') { penaltyUntil = performance.now() + r.retryMs; setTimeout(refresh, r.retryMs + 20); navigator.vibrate?.([40, 40, 40]); }
    if (r.reason === 'early') { penaltyUntil = 0; navigator.vibrate?.([40, 40, 40]); }
    refresh();
  }

  /** What the buzz button should say and look like. */
  function myState(v) {
    const uid = v.me.unitId; const cl = v.clue;
    const mine = unitById(v, uid);
    if (!uid) return { label: 'NO TEAM', cls: 'out', line: 'Ask the host to put you on a team.' };
    if (v.status === 'lobby') return { label: 'WAIT', cls: 'out', line: v.title ? `${v.title} starts soon` : 'Waiting for the host' };
    if (v.status === 'done') return { label: 'DONE', cls: 'out', line: 'Thanks for playing!' };
    if (v.status === 'board' || !cl) {
      const ctl = v.control === uid;
      return { label: 'WAIT', cls: 'out', line: ctl ? 'You have control — pick a square!' : v.control ? `${unitById(v, v.control)?.name ?? ''} picks next` : 'Waiting for a square' };
    }
    if (cl.dd) return { label: 'DAILY DOUBLE', cls: 'out', line: cl.ddUnit === uid ? 'That’s you — tell the host your wager.' : `${unitById(v, cl.ddUnit)?.name ?? 'Someone'} is playing it` };
    if (cl.step === 'revealed') {
      if (cl.correct === uid) return { label: '✔', cls: 'won', line: `Correct! ${money(cl.value)}`, color: mine.color };
      return { label: '—', cls: 'out', line: cl.answer ? `Answer: ${cl.answer}` : '' };
    }
    if (cl.step === 'answering') {
      if (cl.buzzedBy === uid) return { label: 'YOU!', cls: 'won', line: 'You buzzed first — answer out loud', color: mine.color };
      return { label: 'LOCKED', cls: 'out', line: `${unitById(v, cl.buzzedBy)?.name ?? 'Someone'} is answering` };
    }
    if (cl.lockedOut.includes(uid)) return { label: 'OUT', cls: 'out', line: 'You answered wrong — locked out for this clue' };
    if (cl.step === 'open') {
      if (performance.now() < penaltyUntil) return { label: 'TOO EARLY', cls: 'bad', line: 'Wait a moment…' };
      return { label: 'BUZZ', cls: 'live', line: 'Go!', color: mine.color };
    }
    return { label: 'READY', cls: 'out', line: 'Wait for the host to open buzzers', color: null };
  }

  function updateBuzz(v) {
    const s = myState(v);
    buzzBtn.textContent = s.label;
    buzzBtn.className = `buzz ${s.cls}`;
    buzzBtn.style.background = s.color ?? '';
    buzzBtn.style.color = s.color ? ink(s.color) : '';
    statusLine.textContent = s.line ?? '';
    const cl = v.clue;
    if (cl?.text && cl.step !== 'revealed') {
      peek.classList.remove('hidden');
      peek.replaceChildren(h('div', { class: 'tag' }, `${cl.category} · ${cl.dd ? 'Daily Double' : money(cl.value)}`), cl.text);
    } else peek.classList.add('hidden');
  }

  function finalScreen(v) {
    const f = v.final;
    const mine = f.finalists.find((x) => x.id === v.me.unitId);
    const key = `final-${f.step}-${mine ? 'in' : 'out'}`;
    if (!mine) {
      return { key: 'final-out', node: h('div', { class: 'card' }, h('h2', {}, 'Final Jeopardy'),
        h('p', {}, 'Only players with a positive score play the final round. Watch the TV!')) };
    }
    if (f.step === 'wager') {
      const max = Math.max(0, unitById(v, v.me.unitId)?.score ?? 0);
      const input = h('input', { type: 'number', inputMode: 'numeric', min: 0, max, placeholder: `0 – ${max}` });
      return { key, node: h('div', { class: 'card' }, h('h2', {}, `Final Jeopardy · ${f.category}`),
        h('label', {}, `Your wager (up to ${money(max)})`), input,
        mine.wagered && h('p', { class: 'tag' }, 'Wager locked in. You can change it until the host moves on.'),
        h('button', { class: 'btn primary', style: { width: '100%', marginTop: '12px' }, onclick: () => send({ t: 'final-wager', amount: Number(input.value || 0) }) }, 'Lock in wager')) };
    }
    if (f.step === 'clue') {
      const input = h('textarea', { maxLength: 200, placeholder: 'Your answer' });
      return { key, node: h('div', { class: 'card' }, h('h2', {}, f.category), h('p', { class: 'clue-peek' }, f.text),
        h('label', {}, 'Your answer'), input,
        mine.answered && h('p', { class: 'tag' }, 'Answer saved. You can change it until time is up.'),
        h('button', { class: 'btn primary', style: { width: '100%', marginTop: '12px' }, onclick: () => send({ t: 'final-answer', text: input.value }) }, 'Submit answer')) };
    }
    return { key, node: h('div', { class: 'card' }, h('h2', {}, 'Final Jeopardy'), h('p', {}, 'Eyes on the TV for the reveal!')) };
  }

  function refresh() {
    if (!view) return;
    const v = flat(view);
    if (!v.me) return;
    if (v.status === 'final' && v.final) {
      const res = finalScreen(v);
      if (screenKey !== res.key) { screenKey = res.key; container.replaceChildren(res.node); }
      return;
    }
    if (screenKey !== 'game') { screenKey = 'game'; container.replaceChildren(buildGame()); }
    updateBuzz(v);
  }

  // While buzzers are open, re-check once a moment so a "too early" penalty clears itself.
  const timer = setInterval(() => { if (penaltyUntil && view?.game?.clue?.step === 'open') refresh(); }, 250);

  return {
    update(v) { view = v; refresh(); },
    onMessage(m) {
      if (m.t === 'buzz-result') onBuzzResult(m);
      else if (m.t === 'ack') flash(m.what === 'wager' ? 'Wager locked in' : 'Answer saved');
    },
    destroy() { clearInterval(timer); },
  };
}

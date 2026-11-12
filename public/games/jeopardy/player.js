// Jeopardy on a phone: the buzz button and the Final Jeopardy forms.
// The page (play.js) handles joining and the header; this fills the rest.
import { h, money, ink, unitById } from '../../common.js';
import { flat } from './flat.js';

export function mount(container, { send, flash }) {
  let view = null;
  let receivedAt = 0;   // when the last state arrived, so a countdown can be drawn from it
  let screenKey = '';
  let penaltyUntil = 0;
  let buzzBtn; let statusLine; let peek; let boardEl; let boardKey = '';

  function buildGame() {
    buzzBtn = h('button', { class: 'buzz', type: 'button' }, 'WAIT');
    buzzBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); if (view?.room?.me) send({ t: 'buzz' }); });
    statusLine = h('div', { class: 'status-line' });
    peek = h('div', { class: 'card clue-peek hidden' });
    boardEl = h('div', { class: 'phone-board hidden' });
    boardKey = '';
    return h('div', { style: { display: 'contents' } }, boardEl, buzzBtn, statusLine, peek);
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
      if (cl.buzzedBy === uid) {
        const tm = cl.timer;
        const left = tm && !tm.timedOut ? Math.max(0, Math.ceil((tm.leftMs - (performance.now() - receivedAt)) / 1000)) : null;
        const line = tm?.timedOut ? 'Time’s up!' : left !== null ? `You buzzed first — answer out loud · ${left}s` : 'You buzzed first — answer out loud';
        return { label: 'YOU!', cls: 'won', line, color: mine.color };
      }
      return { label: 'LOCKED', cls: 'out', line: `${unitById(v, cl.buzzedBy)?.name ?? 'Someone'} is answering` };
    }
    if (cl.lockedOut.includes(uid)) return { label: 'OUT', cls: 'out', line: 'You answered wrong — locked out for this clue' };
    if (cl.step === 'open') {
      const tm = cl.timer;
      if (tm?.timedOut) return { label: 'TIME’S UP', cls: 'out', line: 'Nobody buzzed in' };
      if (performance.now() < penaltyUntil) return { label: 'TOO EARLY', cls: 'bad', line: 'Wait a moment…' };
      const left = tm ? Math.max(0, Math.ceil((tm.leftMs - (performance.now() - receivedAt)) / 1000)) : null;
      return { label: 'BUZZ', cls: 'live', line: left !== null ? `Go! · ${left}s` : 'Go!', color: mine.color };
    }
    return { label: 'READY', cls: 'out', line: 'Wait for the host to open buzzers', color: null };
  }

  /** Between clues the phone shows the board (what is left to pick) instead of a button that only says WAIT. */
  function updateBoard(v) {
    const between = v.board?.length && v.categories?.length && v.status !== 'lobby' && v.status !== 'done' && (v.status === 'board' || !v.clue);
    buzzBtn.style.display = between ? 'none' : '';
    boardEl.classList.toggle('hidden', !between);
    if (!between) return;
    const key = JSON.stringify([v.categories, v.board.map((col) => col.map((c) => (c.used ? 0 : c.value))), v.control === v.me.unitId]);
    if (key === boardKey) return;
    boardKey = key;
    const rows = v.board[0].length;
    const cells = v.categories.map((name) => h('div', { class: 'pb-cat' }, name));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < v.categories.length; c++) {
        const cell = v.board[c][r];
        cells.push(h('div', { class: `pb-cell ${cell.used ? 'used' : ''}` }, cell.used ? '' : money(cell.value)));
      }
    }
    boardEl.style.setProperty('--cols', String(v.categories.length));
    boardEl.classList.toggle('mine', v.control === v.me.unitId);
    boardEl.replaceChildren(...cells);
  }

  function updateBuzz(v) {
    updateBoard(v);
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

  /** Everyone's score, highest first, so a wager can be judged against the rest. Your own row is marked. */
  function scoreboard(v) {
    const sorted = [...v.units].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    const inFinal = new Set(v.final.finalists.map((x) => x.id));
    return h('div', { class: 'card' }, h('h2', {}, 'Scores'),
      h('div', { class: 'list' }, sorted.map((u) => h('div', { class: `item ${u.id === v.me.unitId ? 'me' : ''}` },
        h('span', { class: 'swatch', style: { background: u.color } }),
        h('span', { class: 'nm' }, u.id === v.me.unitId ? `${u.name} (you)` : u.name),
        !inFinal.has(u.id) && h('span', { class: 'tag' }, 'sitting out'),
        h('span', { class: 'pts' }, money(u.score))))));
  }

  /** A Final Jeopardy screen: whatever the step needs, with everyone's scores underneath. */
  function withScores(v, node) {
    return h('div', { style: { display: 'contents' } }, node, scoreboard(v));
  }

  function finalScreen(v) {
    const f = v.final;
    const mine = f.finalists.find((x) => x.id === v.me.unitId);
    const key = `final-${f.step}-${mine ? 'in' : 'out'}`;
    if (!mine) {
      return { key: 'final-out', node: withScores(v, h('div', { class: 'card' }, h('h2', {}, 'Final Jeopardy'),
        h('p', {}, 'Only players with a positive score play the final round. Watch the TV!'))) };
    }
    if (f.step === 'wager') {
      const max = Math.max(0, unitById(v, v.me.unitId)?.score ?? 0);
      const input = h('input', { type: 'number', inputMode: 'numeric', min: 0, max, placeholder: `0 – ${max}` });
      return { key, node: withScores(v, h('div', { class: 'card' }, h('h2', {}, `Final Jeopardy · ${f.category}`),
        h('label', {}, `Your wager (up to ${money(max)})`), input,
        mine.wagered && h('p', { class: 'tag' }, 'Wager locked in. You can change it until the host moves on.'),
        h('button', { class: 'btn primary', style: { width: '100%', marginTop: '12px' }, onclick: () => send({ t: 'final-wager', amount: Number(input.value || 0) }) }, 'Lock in wager'))) };
    }
    if (f.step === 'clue') {
      const input = h('textarea', { maxLength: 200, placeholder: 'Your answer' });
      return { key, node: withScores(v, h('div', { class: 'card' }, h('h2', {}, f.category), h('p', { class: 'clue-peek' }, f.text),
        h('label', {}, 'Your answer'), input,
        mine.answered && h('p', { class: 'tag' }, 'Answer saved. You can change it until time is up.'),
        h('button', { class: 'btn primary', style: { width: '100%', marginTop: '12px' }, onclick: () => send({ t: 'final-answer', text: input.value }) }, 'Submit answer'))) };
    }
    return { key, node: withScores(v, h('div', { class: 'card' }, h('h2', {}, 'Final Jeopardy'), h('p', {}, 'Eyes on the TV for the reveal!'))) };
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
  const timer = setInterval(() => {
    const clue = view?.game?.clue;
    if ((penaltyUntil && clue?.step === 'open') || (clue?.timer && !clue.timer.timedOut && (clue.step === 'open' || clue.step === 'answering'))) refresh();
  }, 250);

  return {
    update(v) { view = v; receivedAt = performance.now(); refresh(); },
    onMessage(m) {
      if (m.t === 'buzz-result') onBuzzResult(m);
      else if (m.t === 'ack') flash(m.what === 'wager' ? 'Wager locked in' : 'Answer saved');
    },
    destroy() { clearInterval(timer); },
  };
}

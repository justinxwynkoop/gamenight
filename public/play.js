import { h, money, ink, COLORS, connect, store, unitById } from './common.js';

const screen = document.getElementById('screen');
const you = document.getElementById('you');
const scoreEl = document.getElementById('score');
const offline = document.getElementById('offline');

let view = null;
let needJoin = false;
let screenKey = '';
let penaltyUntil = 0;
let buzzBtn; let statusLine; let peek;
let joinError = '';
let form = { name: store('gn-name') ?? '', color: store('gn-color') ?? '', teamId: '' };

const net = connect({
  hello: () => ({ t: 'hello', role: 'player', token: store('gn-token') }),
  onStatus: (up) => offline.classList.toggle('hidden', up),
  onState: (v) => { view = v; if (v.me) needJoin = false; update(); },
  onMessage: (m) => {
    if (m.t === 'need-join') { needJoin = true; update(); }
    else if (m.t === 'joined') { store('gn-token', m.token); needJoin = false; joinError = ''; }
    else if (m.t === 'error') { if (needJoin) { joinError = m.message; update(true); } else flash(m.message); }
    else if (m.t === 'ack') flash(m.what === 'wager' ? 'Wager locked in' : 'Answer saved');
    else if (m.t === 'buzz-result') onBuzzResult(m);
  },
});

function flash(text) {
  const t = h('div', { class: 'toast' }, text);
  document.body.append(t);
  setTimeout(() => t.remove(), 2500);
}

function onBuzzResult(r) {
  if (r.ok) { navigator.vibrate?.(60); return; }
  if (r.reason === 'penalty') { penaltyUntil = performance.now() + r.retryMs; setTimeout(update, r.retryMs + 20); navigator.vibrate?.([40, 40, 40]); }
  if (r.reason === 'early') { penaltyUntil = 0; navigator.vibrate?.([40, 40, 40]); }
  update();
}

// ---------- join ----------
function joinScreen() {
  const teams = view.mode === 'teams';
  const nameIn = h('input', { value: form.name, maxLength: 20, placeholder: 'Your name', autocomplete: 'off', oninput: (e) => { form.name = e.target.value; } });
  const colorBtns = COLORS.map((c) => h('button', {
    type: 'button', class: form.color === c ? 'sel' : '', style: { background: c }, 'aria-label': c,
    onclick: () => { form.color = c; update(true); },
  }));
  const teamBtns = teams ? view.teams.map((t) => h('button', {
    type: 'button', class: `btn ${form.teamId === t.id ? 'sel' : ''}`, style: { borderLeftColor: t.color },
    onclick: () => { form.teamId = t.id; update(true); },
  }, t.name)) : [];
  return h('div', { class: 'card' },
    h('h2', {}, view.title ?? 'Join the game'),
    h('label', {}, 'Name'), nameIn,
    !teams && [h('label', {}, 'Colour'), h('div', { class: 'colors' }, colorBtns)],
    teams && [h('label', {}, 'Team'), h('div', { class: 'teams' }, teamBtns)],
    joinError && h('div', { class: 'err' }, joinError),
    h('button', {
      class: 'btn primary', style: { width: '100%', marginTop: '16px' }, onclick: () => {
        store('gn-name', form.name); if (form.color) store('gn-color', form.color);
        joinError = '';
        net.send({ t: 'join', name: form.name, color: form.color || undefined, teamId: form.teamId || undefined });
      },
    }, 'Join'));
}

// ---------- game ----------
function buildGame() {
  buzzBtn = h('button', { class: 'buzz', type: 'button' }, 'WAIT');
  buzzBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); press(); });
  statusLine = h('div', { class: 'status-line' });
  peek = h('div', { class: 'card clue-peek hidden' });
  return h('div', { style: { display: 'contents' } }, buzzBtn, statusLine, peek);
}
function press() {
  if (!view?.me) return;
  net.send({ t: 'buzz' });
}

function finalFor(v) {
  const f = v.final; const me = v.me;
  if (!f || !me?.unitId) return null;
  return f.finalists.find((x) => x.id === me.unitId) ?? null;
}

function myState(v) {
  // Returns {key, label, cls, line, color}
  const me = v.me; const uid = me.unitId; const cl = v.clue;
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
  // reading
  return { label: 'READY', cls: 'out', line: 'Wait for the host to open buzzers', color: null };
}

function updateHeader() {
  const v = view; const me = v.me;
  const mine = unitById(v, me.unitId);
  you.replaceChildren(h('span', { class: 'swatch', style: { background: mine?.color ?? me.color } }), ' ', me.name);
  if (v.mode === 'teams' && mine) you.append(h('span', { class: 'tag' }, ` · ${mine.name}`));
  scoreEl.textContent = mine ? money(mine.score) : '';
}

function updateBuzz() {
  const v = view;
  const s = myState(v);
  buzzBtn.textContent = s.label;
  buzzBtn.className = `buzz ${s.cls}`;
  buzzBtn.style.background = s.color ?? '';
  buzzBtn.style.color = s.color ? ink(s.color) : '';
  statusLine.textContent = s.line ?? '';
  const cl = v.clue;
  if (cl?.text && cl.step !== 'revealed') { peek.classList.remove('hidden'); peek.replaceChildren(h('div', { class: 'tag' }, `${cl.category} · ${cl.dd ? 'Daily Double' : money(cl.value)}`), cl.text); }
  else peek.classList.add('hidden');
}

function finalScreen() {
  const v = view; const f = v.final; const mine = finalFor(v);
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
      h('button', { class: 'btn primary', style: { width: '100%', marginTop: '12px' }, onclick: () => { net.send({ t: 'final-wager', amount: Number(input.value || 0) }); } }, 'Lock in wager')) };
  }
  if (f.step === 'clue') {
    const input = h('textarea', { maxLength: 200, placeholder: 'Your answer' });
    return { key, node: h('div', { class: 'card' }, h('h2', {}, f.category), h('p', { class: 'clue-peek' }, f.text),
      h('label', {}, 'Your answer'), input,
      mine.answered && h('p', { class: 'tag' }, 'Answer saved. You can change it until time is up.'),
      h('button', { class: 'btn primary', style: { width: '100%', marginTop: '12px' }, onclick: () => { net.send({ t: 'final-answer', text: input.value }); } }, 'Submit answer')) };
  }
  return { key, node: h('div', { class: 'card' }, h('h2', {}, 'Final Jeopardy'), h('p', {}, 'Eyes on the TV for the reveal!')) };
}

function update(force = false) {
  if (!view) return;
  const wantJoin = needJoin || !view.me;
  if (wantJoin) {
    if (screenKey !== 'join' || force) { screenKey = 'join'; screen.replaceChildren(joinScreen()); }
    you.textContent = 'Game Night'; scoreEl.textContent = '';
    return;
  }
  updateHeader();
  if (view.status === 'final' && view.final) {
    const res = finalScreen();
    if (screenKey !== res.key) { screenKey = res.key; screen.replaceChildren(res.node); }
    return;
  }
  if (screenKey !== 'game') { screenKey = 'game'; screen.replaceChildren(buildGame()); }
  updateBuzz();
}
setInterval(() => { if (view?.me && view.clue?.step === 'open' && penaltyUntil) update(); }, 250);

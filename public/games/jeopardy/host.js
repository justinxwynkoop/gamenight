// Jeopardy on the host's phone: setup, the board, each clue, Final Jeopardy.
// The page (host.js) adds the game picker, players and teams, and scores.
import { h, money, unitById } from '../../common.js';
import { flat } from './flat.js';

let view = null;   // flat view for this render
let act = () => {};
let sets = [];

const sw = (c) => h('span', { class: 'swatch', style: { background: c } });
const nameOf = (id) => unitById(view, id)?.name ?? '?';

// A live countdown label: the server sends the time left when something changes and we count down from there.
let ticking = null; // { leftMs, at, el }
setInterval(() => {
  if (ticking?.el.isConnected) ticking.el.textContent = `${Math.max(0, Math.ceil((ticking.leftMs - (performance.now() - ticking.at)) / 1000))}s`;
}, 250);
/** A pill showing the time left (or TIME'S UP) for a timer from the view, or nothing without one. */
function timerPill(timer) {
  ticking = null;
  if (!timer) return null;
  if (timer.timedOut) return h('span', { class: 'pill', style: { background: '#b91c1c' } }, 'TIME’S UP');
  const el = h('span', { class: 'pill live' }, `${Math.ceil(timer.leftMs / 1000)}s`);
  ticking = { leftMs: timer.leftMs, at: performance.now(), el };
  return el;
}

/** Returns { label, toolbar, cards } for the page to lay out. */
export function render(rawView, ctx) {
  view = flat(rawView);
  act = ctx.act;
  sets = ctx.sets;
  const v = view;
  const label = { lobby: 'Lobby', board: 'Board', clue: 'Clue', final: 'Final Jeopardy', done: 'Finished' }[v.status];
  const toolbar = [
    (v.status === 'board' || v.status === 'done') && h('button', { class: 'btn small', onclick: () => act('setView', { view: v.view === 'leaderboard' ? 'board' : 'leaderboard' }) },
      v.view === 'leaderboard' ? 'TV: show board' : 'TV: show leaderboard'),
    v.status !== 'lobby' && h('button', { class: 'btn small bad', onclick: () => { if (confirm('End the game and reset scores?')) act('endGame'); } }, 'End game'),
  ];
  return {
    label: v.title ? `${v.title} · ${label}` : label,
    toolbar,
    cards: [
      v.status === 'lobby' && setupCard(v),
      v.status === 'board' && boardCard(v),
      v.status === 'clue' && v.clue && clueCard(v),
      v.status === 'final' && v.final && finalCard(v),
      v.status === 'done' && h('div', { class: 'card' }, h('h2', {}, 'Game over'),
        h('p', {}, 'Everyone is back in the lobby when you start a new game. Scores reset, players stay.'),
        h('button', { class: 'btn primary', onclick: () => act('endGame') }, 'Back to lobby')),
    ],
  };
}

// ---------- setup (lobby) ----------
function setupCard(v) {
  const setSel = h('select', { onchange: (e) => act('chooseSet', { id: e.target.value }) },
    !v.setId && h('option', { value: '' }, '— choose a question set —'),
    sets.map((s) => h('option', { value: s.id, selected: s.id === v.setId }, s.title)));
  const pen = h('input', { type: 'number', min: 0, max: 5000, step: 100, value: v.settings.penaltyMs, style: { width: '110px' }, 'data-k': 'pen' });
  const fin = h('input', { type: 'number', min: 0, max: 300, value: v.settings.finalSeconds, style: { width: '80px' }, 'data-k': 'fin' });
  return h('div', { class: 'card' }, h('h2', {}, 'Jeopardy setup'),
    h('label', {}, 'Question set'), setSel,
    h('label', {}, 'Early buzz penalty'),
    h('div', { class: 'row' },
      h('label', { class: 'row', style: { margin: 0, color: 'inherit' } }, h('input', { type: 'checkbox', checked: v.settings.earlyPenalty, style: { width: '22px', minHeight: '22px' }, onchange: (e) => act('setSettings', { earlyPenalty: e.target.checked }) }), 'Lock out early buzzers for'),
      pen, h('span', { class: 'tag' }, 'ms'), h('button', { class: 'btn small', onclick: () => act('setSettings', { penaltyMs: pen.value }) }, 'Save')),
    h('label', {}, 'Time to answer after a buzz'),
    h('div', { class: 'row' }, [5, 10].map((n) => h('button', {
      class: `btn ${v.settings.answerSeconds === n ? 'primary' : ''}`, onclick: () => act('setSettings', { answerSeconds: n }),
    }, `${n} seconds`))),
    h('label', {}, 'Final Jeopardy time (seconds, 0 = no timer)'),
    h('div', { class: 'row' }, fin,
      h('button', { class: 'btn small', onclick: () => act('setSettings', { finalSeconds: fin.value }) }, 'Save'),
      h('label', { class: 'row', style: { margin: 0, color: 'inherit' } }, h('input', { type: 'checkbox', checked: v.settings.autoWrong, style: { width: '22px', minHeight: '22px' }, onchange: (e) => act('setSettings', { autoWrong: e.target.checked }) }), 'Time-out counts as wrong')),
    h('div', { class: 'row', style: { marginTop: '16px' } },
      h('button', { class: 'btn ok grow', disabled: !v.setId || !v.units.length, onclick: () => act('startGame') },
        v.units.length ? `Start game (${v.units.length} ${v.mode === 'teams' ? 'teams' : 'players'})` : 'Waiting for players…')));
}

// ---------- board ----------
function boardCard(v) {
  const cells = v.categories.map((n) => h('div', { class: 'c' }, n));
  for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) {
    const cell = v.board[c][r];
    cells.push(h('button', { class: `${cell.used ? 'used' : ''} ${v.dailyDoubles.includes(`${c},${r}`) ? 'dd' : ''}`, disabled: cell.used, onclick: () => act('select', { c, r }) }, money(cell.value)));
  }
  const ctl = v.control ? nameOf(v.control) : null;
  return h('div', { class: 'card' }, h('h2', {}, `Pick a square${ctl ? ` · ${ctl} has control` : ''}`),
    h('div', { class: 'mini-board' }, cells),
    h('div', { class: 'row', style: { marginTop: '12px' } },
      h('button', { class: `btn ${v.boardCleared ? 'primary' : ''}`, onclick: () => { if (v.boardCleared || confirm('The board is not finished. Start Final Jeopardy anyway?')) act('startFinal'); } }, 'Start Final Jeopardy'),
      h('button', { class: 'btn', onclick: () => { if (confirm('Skip Final Jeopardy and show the winner?')) act('finishGame'); } }, 'Skip final, show winner'),
      h('span', { class: 'tag' }, '★ = Daily Double (host only)')));
}

// ---------- clue ----------
function clueCard(v) {
  const cl = v.clue;
  const units = v.units;
  const give = h('select', { onchange: (e) => { if (e.target.value) act('awardBuzz', { id: e.target.value }); }, style: { width: 'auto' } },
    h('option', { value: '' }, 'Give buzz to…'), units.map((u) => h('option', { value: u.id }, u.name)));
  const body = [h('div', { class: 'tag' }, `${cl.category} · ${cl.dd ? 'Daily Double' : money(cl.value)}`),
    h('div', { class: 'hostclue' }, cl.text), h('div', { class: 'hostans' }, `Answer: ${cl.answer}`)];

  if (cl.step === 'wager') {
    const max = Math.max(unitById(v, cl.ddUnit)?.score ?? 0, 1000);
    const wager = h('input', { type: 'number', inputMode: 'numeric', min: 0, max, placeholder: `Wager (max ${money(max)})`, 'data-k': 'ddw', style: { width: '200px' } });
    const who = h('select', { onchange: (e) => act('setDailyDoubleUnit', { id: e.target.value }) },
      !cl.ddUnit && h('option', { value: '' }, '— who is playing? —'),
      units.map((u) => h('option', { value: u.id, selected: u.id === cl.ddUnit }, u.name)));
    body.push(h('h2', { style: { marginTop: '14px' } }, 'Daily Double — the clue is hidden on the TV until the wager is in'),
      who, h('div', { class: 'row', style: { marginTop: '8px' } }, wager,
        h('button', { class: 'btn primary', disabled: !cl.ddUnit, onclick: () => act('setDailyDoubleWager', { amount: wager.value }) }, 'Set wager & show clue')));
  } else if (cl.step === 'reading') {
    body.push(h('div', { class: 'row', style: { marginTop: '14px' } },
      h('button', { class: 'btn primary grow', onclick: () => act('openBuzzers') }, 'Open buzzers'), give,
      h('button', { class: 'btn', onclick: () => act('reveal') }, 'Skip / reveal')));
  } else if (cl.step === 'open') {
    body.push(h('p', { class: 'tag' }, 'Buzzers are live…'),
      h('div', { class: 'row' }, give, h('button', { class: 'btn', onclick: () => act('reveal') }, 'Nobody — reveal answer')));
  } else if (cl.step === 'answering') {
    const u = unitById(v, cl.buzzedBy);
    body.push(h('div', { class: 'item', style: { marginTop: '12px', fontSize: '1.2rem' } }, sw(u?.color ?? '#fff'), h('span', { class: 'nm' }, `${u?.name ?? '?'} is answering`), cl.dd && h('span', { class: 'pill' }, `wager ${money(cl.wager)}`), timerPill(cl.timer),
        h('button', { class: 'btn small', onclick: () => act('restartTimer') }, 'Restart timer')),
      h('div', { class: 'row', style: { marginTop: '10px' } },
        h('button', { class: 'btn ok grow', onclick: () => act('correct') }, `✔ Correct (+${money(cl.value)})`),
        h('button', { class: 'btn bad grow', onclick: () => act('wrong') }, `✘ Wrong (−${money(cl.value)})`)),
      h('div', { class: 'row', style: { marginTop: '8px' } },
        !cl.dd && h('button', { class: 'btn small', onclick: () => act('reopen') }, 'Re-open buzzers (no penalty)'),
        h('button', { class: 'btn small', onclick: () => act('reveal') }, 'Reveal, no score')));
  } else if (cl.step === 'revealed') {
    body.push(h('div', { class: 'row', style: { marginTop: '14px' } },
      h('span', { class: 'tag grow' }, cl.correct ? `${nameOf(cl.correct)} got it` : 'No score'),
      h('button', { class: 'btn primary', onclick: () => act('closeClue') }, 'Back to board')));
  }
  if (cl.lockedOut.length) body.push(h('p', { class: 'tag' }, `Locked out: ${cl.lockedOut.map(nameOf).join(', ')}`));
  return h('div', { class: 'card' }, body);
}

// ---------- final ----------
function finalCard(v) {
  const f = v.final;
  const head = h('div', {}, h('h2', {}, `Final Jeopardy · ${f.category}`), h('div', { class: 'hostclue' }, f.text), h('div', { class: 'hostans' }, `Answer: ${f.answer}`));
  const rows = f.finalists.map((fu) => {
    const u = unitById(v, fu.id);
    const item = h('div', { class: 'item' }, sw(u.color), h('span', { class: 'nm' }, u.name), h('span', { class: 'tag' }, `score ${money(u.score)}`));
    if (f.step === 'wager') {
      const inp = h('input', { type: 'number', min: 0, max: u.score, placeholder: fu.wager !== null ? String(fu.wager) : 'wager', style: { width: '110px' }, 'data-k': `fw-${u.id}` });
      item.append(h('span', { class: `pill ${fu.wager !== null ? 'live' : ''}` }, fu.wager !== null ? `wagered ${money(fu.wager)}` : 'waiting'), inp,
        h('button', { class: 'btn small', onclick: () => act('setFinalWager', { id: u.id, amount: inp.value }) }, 'Set'));
    } else if (f.step === 'clue') {
      item.append(h('span', { class: 'pill' }, `wager ${money(fu.wager ?? 0)}`), h('span', { class: `pill ${fu.answer ? 'live' : ''}` }, fu.answer ? `“${fu.answer}”` : 'no answer yet'));
    } else {
      item.append(h('span', { class: 'pill' }, `wager ${money(fu.wager ?? 0)}`), h('span', { class: 'nm' }, `“${fu.answer || '—'}”`));
      if (fu.result === null) item.append(h('button', { class: 'btn small ok', onclick: () => act('finalJudge', { id: u.id, ok: true }) }, '✔'), h('button', { class: 'btn small bad', onclick: () => act('finalJudge', { id: u.id, ok: false }) }, '✘'));
      else item.append(h('span', { class: 'pill' }, fu.result ? 'correct' : 'wrong'));
    }
    return item;
  });
  const next = f.step === 'wager' ? h('button', { class: 'btn primary', onclick: () => act('finalNext') }, 'Show clue on TV')
    : f.step === 'clue' ? [timerPill(f.timer), h('button', { class: 'btn small', onclick: () => act('restartTimer') }, 'Restart timer'), h('button', { class: 'btn primary', onclick: () => act('finalNext') }, 'Time’s up — start judging')]
      : f.step === 'judge' ? h('button', { class: 'btn', onclick: () => act('finishFinal') }, 'Skip the rest, show results')
        : h('button', { class: 'btn primary', onclick: () => act('finishGame') }, 'Show winner');
  return h('div', { class: 'card' }, head, h('div', { class: 'list', style: { marginTop: '12px' } }, rows), h('div', { class: 'row', style: { marginTop: '12px' } }, next));
}


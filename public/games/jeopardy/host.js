// Jeopardy on the host's phone, tablet or laptop. The page (host.js) provides the app frame and the Players,
// Scores and Settings tabs; this module supplies what the Game tab shows (setup, board, a clue, Final Jeopardy,
// the result), the pinned action bar for each, and the game's own timer settings.
import { h, money, unitById } from '../../common.js';
import { icon, button, seg, toggle, dot, pill, card, eyebrow } from '../../ui.js';
import { flat } from './flat.js';

let v = null;          // the flat view for this render
let C = null;          // helpers from the page: act, sets, setInfo, openSheet, confirm, go, ...
let act = () => {};
let boardFilter = '';  // the search box in the "choose a board" sheet

const nameOf = (id) => unitById(v, id)?.name ?? '?';
const topValue = () => Math.max(1000, ...v.board.flat().map((c) => c.value));
const dockRow = (...kids) => h('div', { class: 'dock-row' }, kids.flat().filter(Boolean));

// A live countdown label: the server sends the time left when something changes and we count down from there.
let ticking = null; // { leftMs, at, el }
setInterval(() => {
  if (ticking?.el.isConnected) ticking.el.textContent = `${Math.max(0, Math.ceil((ticking.leftMs - (performance.now() - ticking.at)) / 1000))}s`;
}, 250);
function timerPill(timer) {
  ticking = null;
  if (!timer) return null;
  if (timer.timedOut) return pill('Time’s up', 'bad');
  const el = pill(`${Math.ceil(timer.leftMs / 1000)}s`, 'live');
  ticking = { leftMs: timer.leftMs, at: performance.now(), el };
  return el;
}

/** What the page needs from this game. */
export function render(raw, ctx) {
  v = flat(raw);
  C = ctx;
  act = ctx.act;
  const screen = { lobby: setupView, board: boardView, clue: clueView, final: finalView, done: doneView }[v.status];
  const main = screen ? screen() : { body: [], dock: null };
  return { title: 'Jeopardy!', sub: subtitle(), body: main.body, dock: main.dock, settings: settingsCards(), danger: dangerButtons() };
}

function subtitle() {
  const n = v.players.length;
  switch (v.status) {
    case 'lobby': return `Setting up · ${n} ${n === 1 ? 'player' : 'players'}`;
    case 'board': return `${v.roundTitle}${v.control ? ` · ${nameOf(v.control)} picks` : ''}`;
    case 'clue': return `${v.clue.category} · ${v.clue.dd ? 'Daily Double' : money(v.clue.value)}`;
    case 'final': return 'Final Jeopardy!';
    default: return 'Finished';
  }
}

// ---------- setup (lobby) ----------
function setupView() {
  const two = v.settings.rounds === 2;
  const problems = [];
  if (!v.setId) problems.push('Choose a board for Round 1.');
  if (two && !v.setId2) problems.push('Choose a board for Round 2, or switch to one round.');
  if (!v.players.length) problems.push('Waiting for players to join.');
  const ready = problems.length === 0;
  const last = C.setInfo(two ? v.setId2 : v.setId);
  const teams = v.mode === 'teams';

  const body = [
    card(eyebrow('Format'), h('div', { class: 'card-title' }, 'How many rounds?'),
      seg([{ value: 1, label: '1 round', sub: 'Jeopardy!' }, { value: 2, label: '2 rounds', sub: 'Jeopardy! + Double Jeopardy!' }], v.settings.rounds, (n) => act('setSettings', { rounds: n })),
      h('div', { class: 'flow' },
        flowStep('Round 1', 'Jeopardy!'), icon('chevron', 16),
        two && [flowStep('Round 2', 'Double Jeopardy!'), icon('chevron', 16)],
        flowStep('Final', 'Final Jeopardy!'))),
    boardCard(1),
    two && boardCard(2),
    (v.setId || v.setId2) && h('div', { class: 'note' }, icon('star', 16), h('span', {}, `Final Jeopardy: ${last?.final ?? '…'} · from ${last?.title ?? 'the last board'}`)),
    card(eyebrow('Players'),
      h('div', { class: 'card-title' }, v.players.length ? `${v.players.length} ${v.players.length === 1 ? 'player' : 'players'} · ${teams ? `${v.teams.length} teams` : 'individuals'}` : 'No one yet'),
      h('p', { class: 'dim' }, v.players.length ? 'Teams are picked at random once there are more than five players.' : 'Players scan the QR code on the TV to join.'),
      button({ label: 'Manage players and teams', icon: 'users', onclick: () => C.go('players') })),
    card(eyebrow('Timers'),
      h('p', {}, `Buzz in ${secs(v.settings.buzzSeconds)} · Answer ${secs(v.settings.answerSeconds)} · Final ${secs(v.settings.finalSeconds)}`),
      button({ label: 'Change timers and rules', icon: 'clock', onclick: () => C.go('settings') })),
  ];
  const dock = [
    !ready && h('div', { class: 'dock-note' }, problems[0]),
    button({ label: 'Start game', icon: 'play', kind: ready ? 'ok' : '', size: 'lg', block: true, disabled: !ready, onclick: () => act('startGame') }),
  ];
  return { body, dock };
}

const secs = (n) => (n ? `${n}s` : 'no timer');
const flowStep = (a, b) => h('div', { class: 'flow-step' }, a, h('small', {}, b));

function boardCard(round) {
  const id = round === 1 ? v.setId : v.setId2;
  const info = C.setInfo(id);
  const title = info?.title ?? C.sets.find((s) => s.id === id)?.title;
  return card(
    h('div', { class: 'card-head' }, h('div', {}, eyebrow(`Round ${round}`), h('div', { class: 'card-title' }, round === 1 ? 'Jeopardy!' : 'Double Jeopardy!')),
      round === 2 && pill('worth double')),
    id
      ? [h('div', { class: 'setname' }, title ?? 'Loading…'),
        info && h('div', { class: 'chips' }, info.categories.map((n) => h('span', { class: 'chip' }, n)))]
      : h('p', { class: 'dim' }, 'No board chosen yet.'),
    button({ label: id ? 'Change board' : 'Choose a board', kind: id ? '' : 'primary', icon: id ? 'swap' : 'plus', onclick: () => openBoardSheet(round) }));
}

function openBoardSheet(round) {
  boardFilter = '';
  C.openSheet({
    title: `Board for Round ${round}`,
    build: () => {
      const current = round === 1 ? v.setId : v.setId2;
      const other = round === 1 ? v.setId2 : v.setId;
      const q = boardFilter.trim().toLowerCase();
      const shown = C.sets.filter((s) => !q || s.title.toLowerCase().includes(q));
      const search = h('input', { type: 'search', placeholder: 'Search boards', value: boardFilter, 'data-k': 'boardq', 'aria-label': 'Search boards', oninput: (e) => { boardFilter = e.target.value; C.refresh(); } });
      return [
        C.sets.length > 6 && search,
        shown.length
          ? h('div', { class: 'list' }, shown.map((s) => h('button', {
            type: 'button', class: 'pick', 'aria-pressed': String(s.id === current), disabled: s.id === other,
            onclick: () => { act('chooseSet', { id: s.id, round }); C.closeSheet(); },
          }, h('div', { class: 'grow' }, h('div', { class: 't' }, s.title), s.id === other && h('div', { class: 's dim' }, `Already used for Round ${round === 1 ? 2 : 1}`)),
          s.id === current && icon('check', 20))))
          : h('p', { class: 'dim' }, C.sets.length ? 'No boards match.' : 'No boards yet. Write one in the question editor.'),
      ];
    },
  });
}

// ---------- the board ----------
function boardView() {
  const played = v.board.flat().filter((c) => c.used).length;
  const total = v.board.flat().length || 30;
  const ctl = unitById(v, v.control);
  const two = v.settings.rounds === 2;
  const toSecond = two && v.round === 1;
  const nextLabel = toSecond ? 'Start Double Jeopardy' : 'Start Final Jeopardy';
  const goNext = () => act(toSecond ? 'startRound2' : 'startFinal');

  const cats = v.categories.map((name, c) => h('div', { class: 'bcat' }, h('div', { class: 'bcat-name' }, name),
    h('div', { class: 'bcat-cells' }, v.board[c].map((cell, r) => h('button', {
      type: 'button', class: `cell ${cell.used ? 'used' : ''} ${v.dailyDoubles.includes(`${c},${r}`) ? 'dd' : ''}`,
      disabled: cell.used, 'aria-label': `${name} ${money(cell.value)}${cell.used ? ', played' : ''}`, onclick: () => act('select', { c, r }),
    }, money(cell.value))))));

  const body = [
    card(
      h('div', { class: 'strip' }, pill(v.roundTitle, 'warn'),
        ctl ? h('span', { class: 'picks' }, dot(ctl.color, 14), `${ctl.name} picks`) : h('span', { class: 'dim' }, 'Anyone can pick'),
        h('span', { class: 'dim grow', style: { textAlign: 'right' } }, `${played} of ${total} played`)),
      h('div', { class: 'progress' }, h('i', { style: { width: `${(played / total) * 100}%` } })),
      h('div', { class: 'field' }, h('span', {}, 'The TV is showing'),
        seg([{ value: 'board', label: 'The board' }, { value: 'leaderboard', label: 'Scores' }], v.view, (x) => act('setView', { view: x })))),
    h('div', { class: 'note' }, icon('star', 16), h('span', {}, 'A star marks a Daily Double. Only you can see it.')),
    h('div', { class: 'board' }, cats),
  ];
  if (v.boardCleared) body.push(h('div', { class: 'banner' }, icon('flag', 22), h('div', { class: 'grow' }, 'Every square is played', h('small', {}, toSecond ? 'Time for Double Jeopardy.' : 'Time for Final Jeopardy.'))));

  const dock = [
    button({
      label: nextLabel, icon: 'chevron', kind: v.boardCleared ? 'ok' : 'ghost', size: v.boardCleared ? 'lg' : '', block: true,
      onclick: () => (v.boardCleared ? goNext() : C.confirm({
        title: `${nextLabel}?`, message: `${total - played} squares are still unplayed. Move on anyway?`, confirmLabel: 'Move on', kind: 'primary', onConfirm: goNext,
      })),
    }),
  ];
  return { body, dock };
}

// ---------- a clue ----------
function clueView() {
  const cl = v.clue;
  const order = cl.dd ? ['wager', 'answering', 'revealed'] : ['reading', 'open', 'answering', 'revealed'];
  const labels = { wager: 'Wager', reading: 'Read', open: 'Buzz', answering: 'Answer', revealed: 'Result' };
  const at = order.indexOf(cl.step);
  const tracker = h('div', { class: 'steps', 'aria-label': 'Progress' }, order.map((s, i) => h('span', { class: i < at ? 'done' : i === at ? 'on' : '' }, labels[s])));

  const body = [
    card(tracker,
      h('div', { class: 'meta' }, cl.category, h('span', {}, '·'), cl.dd ? pill('Daily Double', 'warn') : money(cl.value)),
      h('div', { class: 'clue-text' }, cl.text),
      h('div', { class: 'answer' }, h('small', {}, 'Answer'), h('b', {}, cl.answer))),
  ];
  const dock = [];
  const give = button({ label: 'Give buzz to…', icon: 'user', size: 'sm', onclick: openGiveSheet });

  if (cl.step === 'wager') {
    const max = Math.max(unitById(v, cl.ddUnit)?.score ?? 0, topValue());
    const wager = h('input', { type: 'number', inputMode: 'numeric', min: 0, max, placeholder: `Wager, up to ${money(max)}`, 'data-k': 'ddw', 'aria-label': 'Wager' });
    const set = () => act('setDailyDoubleWager', { amount: wager.value });
    body.push(card(eyebrow('Daily Double'), h('div', { class: 'card-title' }, 'Who is playing, and how much?'),
      h('p', { class: 'dim' }, 'The clue stays hidden on the TV until you set the wager.'),
      h('div', { class: 'list' }, v.units.map((u) => h('button', {
        type: 'button', class: 'pick', 'aria-pressed': String(u.id === cl.ddUnit), onclick: () => act('setDailyDoubleUnit', { id: u.id }),
      }, dot(u.color, 18), h('div', { class: 'grow' }, h('div', { class: 't' }, u.name)), h('span', { class: 'dim' }, money(u.score)), u.id === cl.ddUnit && icon('check', 20)))),
      wager,
      h('div', { class: 'chips' },
        h('button', { type: 'button', class: 'chip', onclick: () => { wager.value = max; } }, `All in · ${money(max)}`),
        h('button', { type: 'button', class: 'chip', onclick: () => { wager.value = Math.floor(max / 2 / 100) * 100; } }, 'Half'))));
    dock.push(button({ label: 'Set wager and show clue', icon: 'check', kind: 'ok', size: 'lg', block: true, disabled: !cl.ddUnit, onclick: set }));
  } else if (cl.step === 'reading') {
    dock.push(button({ label: 'Open buzzers', icon: 'play', kind: 'ok', size: 'lg', block: true, onclick: () => act('openBuzzers') }),
      dockRow(give, button({ label: 'Skip and reveal', size: 'sm', onclick: () => act('reveal') })));
  } else if (cl.step === 'open') {
    const late = cl.timer?.timedOut;
    body.push(h('div', { class: 'banner' }, icon('clock', 22), h('div', { class: 'grow' }, late ? 'Time’s up. Nobody buzzed in.' : 'Buzzers are live', h('small', {}, 'First to press answers.')), timerPill(cl.timer)));
    dock.push(button({ label: 'Nobody. Reveal the answer', kind: late ? 'primary' : '', size: late ? 'lg' : '', block: true, onclick: () => act('reveal') }),
      dockRow(give, cl.timer && button({ label: 'Restart timer', icon: 'refresh', size: 'sm', onclick: () => act('restartTimer') })));
  } else if (cl.step === 'answering') {
    const u = unitById(v, cl.buzzedBy);
    body.push(h('div', { class: 'banner', style: { background: u?.color ?? '', color: u ? inkOn(u.color) : '' } }, dot(inkOn(u?.color ?? '#888'), 12),
      h('div', { class: 'grow' }, `${u?.name ?? '?'} is answering`, cl.dd && h('small', {}, `Wager ${money(cl.wager)}`)), timerPill(cl.timer)));
    dock.push(dockRow(
      button({ label: `Correct  +${money(cl.value)}`, icon: 'check', kind: 'ok', size: 'lg', onclick: () => act('correct') }),
      button({ label: `Wrong  −${money(cl.value)}`, icon: 'x', kind: 'bad', size: 'lg', onclick: () => act('wrong') })),
    dockRow(!cl.dd && button({ label: 'Re-open buzzers', size: 'sm', onclick: () => act('reopen') }),
      button({ label: 'Restart timer', icon: 'refresh', size: 'sm', onclick: () => act('restartTimer') }),
      button({ label: 'Reveal, no score', size: 'sm', onclick: () => act('reveal') })));
  } else if (cl.step === 'revealed') {
    const w = unitById(v, cl.correct);
    body.push(h('div', { class: 'banner', style: { background: w ? '#14532d' : '' } }, icon(w ? 'check' : 'x', 22),
      h('div', { class: 'grow' }, w ? `${w.name} got it` : 'No score', w && h('small', {}, `+${money(cl.value)}`))));
    dock.push(button({ label: 'Back to the board', icon: 'chevron', kind: 'primary', size: 'lg', block: true, onclick: () => act('closeClue') }));
  }
  if (cl.lockedOut.length) body.push(h('div', { class: 'note' }, 'Locked out:', h('div', { class: 'chips' }, cl.lockedOut.map((id) => h('span', { class: 'chip lock' }, nameOf(id))))));
  return { body, dock };
}

function inkOn(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.55 ? '#0b1020' : '#ffffff';
}

function openGiveSheet() {
  C.openSheet({
    title: 'Give the buzz to…',
    build: () => h('div', { class: 'list' }, v.units.map((u) => h('button', {
      type: 'button', class: 'pick', onclick: () => { act('awardBuzz', { id: u.id }); C.closeSheet(); },
    }, dot(u.color, 18), h('div', { class: 'grow' }, h('div', { class: 't' }, u.name)), h('span', { class: 'dim' }, money(u.score))))),
  });
}

// ---------- Final Jeopardy ----------
function finalView() {
  const f = v.final;
  const order = ['wager', 'clue', 'judge', 'results'];
  const labels = { wager: 'Wagers', clue: 'Clue', judge: 'Judge', results: 'Results' };
  const at = order.indexOf(f.step);
  const tracker = h('div', { class: 'steps' }, order.map((s, i) => h('span', { class: i < at ? 'done' : i === at ? 'on' : '' }, labels[s])));
  const finalistIds = new Set(f.finalists.map((x) => x.id));
  const out = v.units.filter((u) => !finalistIds.has(u.id));

  const rows = f.finalists.map((fu) => {
    const u = unitById(v, fu.id);
    const left = h('div', { class: 'grow' }, h('div', { class: 't' }, u.name), h('div', { class: 's' }, `Score ${money(u.score)}`));
    if (f.step === 'wager') {
      const inp = h('input', { type: 'number', inputMode: 'numeric', min: 0, max: u.score, placeholder: fu.wager !== null ? String(fu.wager) : 'Wager', 'data-k': `fw-${u.id}`, 'aria-label': `${u.name}'s wager`, style: { width: '110px' } });
      return h('div', { class: 'rowi' }, dot(u.color, 16), left, pill(fu.wager !== null ? `Wagered ${money(fu.wager)}` : fu.wagered ? 'Locked in' : 'Waiting', fu.wagered || fu.wager !== null ? 'ok' : ''), inp,
        button({ label: 'Set', size: 'sm', onclick: () => act('setFinalWager', { id: u.id, amount: inp.value }) }));
    }
    if (f.step === 'clue') {
      return h('div', { class: 'rowi' }, dot(u.color, 16), left, pill(`Wager ${money(fu.wager ?? 0)}`), pill(fu.answer ? `“${fu.answer}”` : 'No answer yet', fu.answer ? 'ok' : ''));
    }
    return h('div', { class: 'rowi' }, dot(u.color, 16),
      h('div', { class: 'grow' }, h('div', { class: 't' }, u.name), h('div', { class: 's' }, `Wagered ${money(fu.wager ?? 0)} · “${fu.answer || '—'}”`)),
      fu.result === null
        ? [button({ icon: 'check', kind: 'ok', size: 'sm', aria: `${u.name} correct`, onclick: () => act('finalJudge', { id: u.id, ok: true }) }),
          button({ icon: 'x', kind: 'bad', size: 'sm', aria: `${u.name} wrong`, onclick: () => act('finalJudge', { id: u.id, ok: false }) })]
        : pill(fu.result ? 'Correct' : 'Wrong', fu.result ? 'ok' : 'bad'));
  });

  const body = [
    card(tracker, h('div', { class: 'meta' }, f.category),
      f.step !== 'wager' && h('div', { class: 'clue-text' }, f.text),
      h('div', { class: 'answer' }, h('small', {}, 'Answer'), h('b', {}, f.answer))),
    card(eyebrow(f.step === 'wager' ? 'Wagers' : f.step === 'clue' ? 'Answers coming in' : f.step === 'judge' ? 'Judging' : 'Final results'), h('div', { class: 'list' }, rows),
      out.length > 0 && h('p', { class: 'dim' }, `Not playing (need a positive score): ${out.map((u) => u.name).join(', ')}`)),
  ];
  const dock = [];
  if (f.step === 'wager') dock.push(button({ label: 'Show the clue on the TV', icon: 'tv', kind: 'ok', size: 'lg', block: true, onclick: () => act('finalNext') }));
  else if (f.step === 'clue') {
    body.splice(1, 0, h('div', { class: 'banner' }, icon('clock', 22), h('div', { class: 'grow' }, 'Players are answering', h('small', {}, 'Answers arrive from their phones.')), timerPill(f.timer)));
    dock.push(button({ label: 'Time’s up. Start judging', icon: 'chevron', kind: 'primary', size: 'lg', block: true, onclick: () => act('finalNext') }),
      button({ label: 'Restart timer', icon: 'refresh', size: 'sm', block: true, onclick: () => act('restartTimer') }));
  } else if (f.step === 'judge') {
    const allJudged = f.finalists.every((x) => x.result !== null);
    dock.push(button({ label: allJudged ? 'Show the results' : 'Skip the rest and show results', icon: 'chevron', kind: allJudged ? 'ok' : 'ghost', size: allJudged ? 'lg' : '', block: true, onclick: () => act('finishFinal') }));
  } else {
    dock.push(button({ label: 'Show the winner', icon: 'award', kind: 'ok', size: 'lg', block: true, onclick: () => act('finishGame') }));
  }
  return { body, dock };
}

// ---------- the end ----------
function doneView() {
  const ranked = [...v.units].sort((a, b) => b.score - a.score);
  const top = ranked[0]?.score;
  const winners = ranked.filter((u) => u.score === top);
  return {
    body: [card(eyebrow('Game over'), h('div', { class: 'card-title' }, winners.length > 1 ? `A tie: ${winners.map((u) => u.name).join(' and ')}` : `${winners[0]?.name ?? 'Nobody'} wins`),
      h('div', { class: 'list' }, ranked.map((u, i) => h('div', { class: 'rowi' }, h('span', { class: 'rank' }, String(i + 1)), dot(u.color, 16), h('div', { class: 'grow t' }, u.name), h('span', { class: `pts ${u.score < 0 ? 'neg' : ''}` }, money(u.score))))),
      h('p', { class: 'dim' }, 'Starting again resets the scores. Everyone stays in the game.'))],
    dock: [button({ label: 'Back to setup', icon: 'refresh', kind: 'primary', size: 'lg', block: true, onclick: () => act('endGame') })],
  };
}

// ---------- Settings tab cards, and the danger zone ----------
function presets(list, value, key) {
  const options = list.map((n) => ({ value: n, label: n ? `${n}s` : 'None' }));
  if (!list.includes(value)) options.push({ value, label: `${value}s` });
  return seg(options, value, (n) => act('setSettings', { [key]: n }));
}

function settingsCards() {
  const s = v.settings;
  const pen = h('input', { type: 'number', inputMode: 'numeric', min: 0, max: 5000, step: 100, value: s.penaltyMs, 'data-k': 'pen', 'aria-label': 'Penalty in milliseconds' });
  return [
    card(eyebrow('Timers'),
      h('label', { class: 'field' }, h('span', {}, 'Time to buzz in after you open buzzers'), presets([5, 10, 15, 0], s.buzzSeconds, 'buzzSeconds')),
      h('label', { class: 'field' }, h('span', {}, 'Time to answer after a buzz'), presets([5, 10, 15], s.answerSeconds, 'answerSeconds'),
        h('span', { class: 's dim' }, `Daily Doubles get double: ${s.answerSeconds ? `${s.answerSeconds * 2}s` : 'no timer'}.`)),
      h('label', { class: 'field' }, h('span', {}, 'Final Jeopardy time'), presets([30, 45, 60, 0], s.finalSeconds, 'finalSeconds')),
      toggle({ label: 'Time-out counts as wrong', sub: 'When the answer timer runs out, score it as wrong automatically', checked: s.autoWrong, onchange: (on) => act('setSettings', { autoWrong: on }) })),
    card(eyebrow('Early buzzes'),
      toggle({ label: 'Lock out early buzzers', sub: 'Pressing before you open buzzers locks that player out for a moment', checked: s.earlyPenalty, onchange: (on) => act('setSettings', { earlyPenalty: on }) }),
      h('div', { class: 'field' }, h('span', {}, 'How long (milliseconds)'), h('div', { class: 'inline' }, pen, button({ label: 'Save', onclick: () => act('setSettings', { penaltyMs: pen.value }) })))),
  ];
}

function dangerButtons() {
  if (v.status === 'lobby') return [];
  return [button({
    label: 'End game and reset scores', icon: 'x', kind: 'bad', block: true,
    onclick: () => C.confirm({ title: 'End the game?', message: 'Scores reset and everyone goes back to setup.', confirmLabel: 'End game', onConfirm: () => act('endGame') }),
  })];
}

// Jeopardy on the host's phone, tablet or laptop. The page (host.js) provides the app frame and the Players, Scores and
// Settings tabs; this module supplies what the Game tab shows, the pinned action bar for each step, and the game's own
// settings. Players answer by typing and the game checks them, so the host mostly watches; with "a host judges out loud"
// switched on the host opens the buzzers, taps the picks and rules on each answer.
import { h, money } from '../../common.js';
import { icon, button, card, eyebrow, pill, timerPill, dot } from '../../ui.js';
import { loadStyles, lobbyControls, judgeControl, answerTimeControl, finalControl, cluePicker } from './setup.js';

let v = null;          // the game's view (with the host's secrets)
let C = null;          // helpers from the page: act, openSheet, confirm, go, ...
let act = () => {};
let lastAct = { key: '', at: 0 };

const nameOf = (id) => v.players.find((p) => p.id === id)?.name ?? '?';
const dockRow = (...kids) => h('div', { class: 'dock-row' }, kids.flat().filter(Boolean));
/** The setup buttons are written for the captain's dark theme, so they sit in a .jp wrapper. */
const jp = (...kids) => h('div', { class: 'jp', style: { display: 'block' } }, kids);

/** Is the game waiting on the host right now? The host page then brings the Game tab up by itself. */
export function needsHost(g) {
  if (g.phase === 'board' && (g.picksAloud ?? g.hostJudges)) return true;
  if (g.hostJudges && ['reading', 'answering', 'dd-wager', 'dd-answer'].includes(g.phase)) return true;
  if (g.phase === 'round-end') return true;
  if (g.phase === 'final-wager' && g.final) {
    const here = g.final.eligible.filter((id) => g.players.find((p) => p.id === id)?.connected);
    return here.every((id) => g.final.wagered.includes(id));
  }
  return false;
}

/** What the page needs from this game. */
export function render(raw, ctx) {
  loadStyles();
  v = raw.game;
  C = ctx;
  // A double tap on the action bar must not do the same thing twice (and skip the next clue with it).
  act = (action, args = {}) => {
    const key = `${action}:${JSON.stringify(args)}:${v.phase}`;
    if (key === lastAct.key && performance.now() - lastAct.at < 900) return;
    lastAct = { key, at: performance.now() };
    ctx.act(action, args);
  };
  const screen = { lobby: lobbyView, 'round-intro': introView, board: boardView, reading: clueView, open: clueView, answering: clueView, ruling: clueView, 'dd-wager': clueView, 'dd-answer': clueView, reveal: clueView, 'round-end': roundEndView, 'final-wager': finalView, 'final-answer': finalView, 'final-reveal': finalView, gameover: doneView }[v.phase];
  const main = screen ? screen() : { body: [], dock: null };
  return { title: 'Jeopardy!', sub: subtitle(), body: main.body, dock: main.dock, settings: settingsCards(), danger: dangerButtons() };
}

function subtitle() {
  const n = v.players.length;
  switch (v.phase) {
    case 'lobby': return `Setting up · ${n} ${n === 1 ? 'player' : 'players'}`;
    case 'board': return `Round ${v.round}${v.controllerId ? ` · ${nameOf(v.controllerId)} picks` : ''}`;
    case 'round-intro': return `Round ${v.round} is starting`;
    case 'reading': case 'open': case 'answering': case 'ruling': case 'reveal': case 'dd-wager': case 'dd-answer':
      return `${v.clue.cat} · ${v.clue.dd ? 'Daily Double' : money(v.clue.value)}`;
    case 'round-end': return `Round ${v.round} finished`;
    case 'gameover': return 'Finished';
    default: return 'Final Jeopardy!';
  }
}

// ---------- the pieces ----------
const answerBox = (a, alt) => h('div', { class: 'answer' }, h('small', {}, 'Answer (only you can see this)'), h('b', {}, a ?? ''),
  alt?.length ? h('small', { style: { color: '#bbf7d0', textTransform: 'none', letterSpacing: '0' } }, `Also accepted: ${alt.join(', ')}`) : null);

function clueCard() {
  const c = v.clue; const s = v.secret;
  return card(
    eyebrow(`${c.cat} · ${c.dd ? `Daily Double${c.wager ? ` · wager ${money(c.wager)}` : ''}` : money(c.value)}`),
    c.media?.kind === 'image' ? h('img', { src: c.media.url, alt: '', style: { display: 'block', maxWidth: '100%', maxHeight: '28vh', margin: '8px auto', borderRadius: '10px' } })
      : c.media ? h('p', { class: 'dim' }, c.media.kind === 'audio' ? '🔊 The TV plays a sound first.' : '🎬 The TV plays a video first.') : null,
    h('div', { class: 'card-title' }, s.q ?? c.q ?? ''),
    answerBox(s.answer, s.alt));
}

/** The clock, counting down by itself between updates. */
const clockPill = () => (v.timer ? timerPill({ ...v.timer, timedOut: v.timer.leftMs <= 0 }) : null);

/** The clue the host has selected (before opening it), for this board only. */
let sel = null; let selFor = '';
function picker() {
  const used = v.board.map((c) => c.clues.map((x) => (x.used ? 1 : 0)).join('')).join('');
  const id = `${v.round}-${used}`;
  if (id !== selFor) { selFor = id; sel = null; }
  return h('div', { class: 'jp', style: { display: 'block' } }, cluePicker(v.board, {
    sel, dd: v.secret?.dd ?? null,
    onSelect: (ci, ri) => { sel = { ci, ri }; act('peek', { ci, ri }); C.refresh(); },
    onOpen: (ci, ri) => act('pick', { ci, ri }),
  }));
}

// ---------- setup ----------
function lobbyView() {
  const problems = [];
  if (!v.players.length) problems.push('Waiting for players to join.');
  if (!v.asWritten && v.categoryCount < 12) problems.push('Switch on topics with at least 12 categories in total.');
  const ready = problems.length === 0;
  const body = [
    card(eyebrow('Players'),
      h('div', { class: 'card-title' }, v.players.length ? `${v.players.length} of ${v.maxPlayers} ${v.players.length === 1 ? 'player' : 'players'}` : 'No one yet'),
      h('p', { class: 'dim' }, v.players.length ? 'Everyone plays on their own. The first to join is the captain and can also set things up from their phone.' : 'Players scan the QR code on the TV to join.'),
      button({ label: 'Manage players', icon: 'users', onclick: () => C.go('players') })),
    card(eyebrow('Questions'), jp(lobbyControls(v, act, { editorHint: 'Tap Write your own board, below.' })),
      h('a', { class: 'b b-block', href: '/editor?game=jeopardy', style: { textDecoration: 'none', marginTop: '10px' } }, icon('edit', 20), h('span', {}, 'Write your own board'))),
  ];
  const dock = [
    !ready && h('div', { class: 'dock-note' }, problems[0]),
    button({ label: 'Start game', icon: 'play', kind: ready ? 'ok' : '', size: 'lg', block: true, disabled: !ready, onclick: () => act('start') }),
  ];
  return { body, dock };
}

// ---------- the board ----------
function boardView() {
  const dd = v.secret?.dd ?? [];
  const ddLeft = v.board.reduce((n, c, ci) => n + c.clues.filter((x, ri) => !x.used && dd[ci]?.[ri]).length, 0);
  const body = [
    card(eyebrow(`Round ${v.round}`),
      h('div', { class: 'card-title' }, `Ask ${nameOf(v.controllerId)} for a pick`),
      h('p', { class: 'dim' }, `They say a category and a value out loud. Choose it here (the TV lights it up), then open it.${ddLeft ? ` Values with a white ring are Daily Doubles (${ddLeft} left; only you can see them).` : ''}`),
      picker()),
  ];
  const dock = [dockRow(button({ label: 'End the round now', size: 'sm', onclick: () => C.confirm({ title: 'End this round?', message: 'Remaining clues are skipped.', confirmLabel: 'End round', onConfirm: () => act('endRound') }) }),
    button({ label: 'End the game', size: 'sm', onclick: confirmEndGame }))];
  return { body, dock };
}

// ---------- the round's opening titles ----------
function introView() {
  return {
    body: [card(eyebrow(`Round ${v.round}`), h('div', { class: 'card-title' }, 'The TV is showing tonight’s categories'),
      h('p', { class: 'dim' }, `${nameOf(v.controllerId)} picks first. The board comes up by itself in a few seconds.`))],
    dock: [button({ label: 'Skip to the board', icon: 'chevron', kind: 'primary', size: 'lg', block: true, onclick: () => act('advance') })],
  };
}

// ---------- a clue ----------
/** Seconds to the thousandth: 0.312s. */
const secs = (ms) => `${(Math.round(ms) / 1000).toFixed(3)}s`;

/** Who buzzed in first, large, then everyone's time in order (the host opened the buzzers and wants to see it at a glance). */
function buzzCard(c) {
  const list = c?.buzzes ?? [];
  const winner = c?.buzzedId ? list.filter((b) => b.pid === c.buzzedId).pop() ?? list[0] : list[0];
  if (!winner) return null;
  const color = v.players.find((p) => p.id === winner.pid)?.color ?? '#ffd23f';
  const best = list[0].ms;
  return card(
    h('div', { class: 'jp-first', style: { '--c': color } }, h('small', {}, 'Buzzed in first'), h('b', {}, nameOf(winner.pid)), h('span', {}, secs(winner.ms))),
    list.length > 1 && h('div', { class: 'list' }, list.map((b, i) => h('div', { class: 'rowi' },
      h('span', { class: 'rank' }, String(i + 1)), dot(v.players.find((p) => p.id === b.pid)?.color ?? '#fff', 16),
      h('div', { class: 'grow t' }, nameOf(b.pid)), h('span', { class: 's' }, i ? `+${secs(b.ms - best)}` : ''), h('span', { class: 'pts' }, secs(b.ms))))));
}

function clueView() {
  const ph = v.phase; const c = v.clue;
  const body = [clueCard()];
  const dock = [];
  const flip = v.lastResult && ph === 'reveal' ? button({ label: 'Flip the ruling', size: 'sm', onclick: () => act('override') }) : null;
  if (ph === 'reading') {
    body.push(card(eyebrow('Reading'), h('p', { class: 'dim' }, v.hostJudges ? 'Read the clue out loud, then open the buzzers.' : 'The buzzers open by themselves once the clue has been read.')));
    dock.push(button({ label: 'Open buzzers', icon: 'play', kind: 'ok', size: 'lg', block: true, onclick: () => act('openNow') }), dockRow(button({ label: 'Skip this clue', size: 'sm', onclick: () => act('skip') })));
  } else if (ph === 'open') {
    const r = v.lastResult;
    body.unshift(buzzCard(c));   // the first opening's order stays up while the buzzers reopen after a miss
    body.push(card(eyebrow('Buzzers open'), clockPill(), h('p', { class: 'dim' }, r && !r.correct ? `${nameOf(r.pid)} missed. Others can buzz in.` : 'Waiting for someone to buzz in…')));
    dock.push(button({ label: 'Nobody. Show the answer', size: 'lg', block: true, onclick: () => act('skip') }));
  } else if (ph === 'answering' || ph === 'dd-answer') {
    const who = ph === 'answering' ? c.buzzedId : v.controllerId;
    if (ph === 'answering') body.unshift(buzzCard(c));   // above the clue: who has it, at a glance
    body.push(card(eyebrow('Answering'), h('div', { class: 'card-title' }, `${nameOf(who)} is answering`), clockPill(),
      h('p', { class: 'dim' }, v.hostJudges ? 'Listen to the answer, then rule on it below.' : 'They type their answer and the game checks it. You can rule on it yourself below at any time.')));
    // Always there, whether the host judges out loud or the game checks typed answers: the host has the last word.
    dock.push(dockRow(button({ label: 'Correct', icon: 'check', kind: 'ok', size: 'lg', onclick: () => act('judge', { correct: true }) }), button({ label: 'Wrong', icon: 'x', kind: 'bad', size: 'lg', onclick: () => act('judge', { correct: false }) })));
    dock.push(dockRow(button({ label: 'Skip this clue', size: 'sm', onclick: () => act('skip') })));
  } else if (ph === 'ruling') {
    const r = v.lastResult;
    body.unshift(buzzCard(c));
    body.push(card(eyebrow('Ruling'), h('div', { class: 'card-title' }, r ? `${nameOf(r.pid)} said “${r.answer || '…'}”` : '…'),
      r && pill(r.correct ? 'right' : 'wrong', r.correct ? 'ok' : 'bad'), h('p', { class: 'dim' }, 'Shown on the TV for a moment. Flip it if the game got it wrong.')));
    dock.push(dockRow(button({ label: 'Flip the ruling', size: 'sm', onclick: () => act('override') }), button({ label: 'Skip this clue', size: 'sm', onclick: () => act('skip') })));
  } else if (ph === 'dd-wager') {
    // The player bets on their phone, or says it out loud and the host types it in here.
    const who = v.players.find((p) => p.id === v.controllerId);
    const max = Math.max(who?.score ?? 0, 1000 * v.round);
    const input = h('input', { type: 'number', inputMode: 'numeric', min: 0, max, placeholder: `$0 to ${money(max)}`, 'data-k': 'dd-wager', 'aria-label': 'Their bet', style: { width: '100%', fontSize: '20px', padding: '10px', marginTop: '8px' } });
    const place = (n) => { const w = Math.round(Number(n)); if (!Number.isFinite(w)) { C.flash?.('Type an amount', true); return; } act('ddWager', { amount: Math.max(0, Math.min(max, w)) }); };
    body.push(card(eyebrow('Daily Double'),
      h('div', { class: 'card-title' }, `${nameOf(v.controllerId)} is betting`),
      h('p', { class: 'dim' }, `They can bet on their phone, from $0 to ${money(max)}, or tell you and you put it in here. Don’t read the clue until the bet is in.`),
      input,
      dockRow(button({ label: '$0', size: 'sm', onclick: () => place(0) }), button({ label: 'Half', size: 'sm', onclick: () => place(Math.round(max / 2 / 100) * 100) }), button({ label: `All in (${money(max)})`, size: 'sm', onclick: () => place(max) }))));
    dock.push(button({ label: 'Place this bet', icon: 'check', kind: 'ok', size: 'lg', block: true, onclick: () => place(input.value === '' ? NaN : input.value) }),
      dockRow(button({ label: 'Skip this clue', size: 'sm', onclick: () => act('skip') })));
  } else if (ph === 'reveal') {
    const r = v.lastResult;
    body.unshift(buzzCard(c));
    body.push(card(eyebrow('Result'), h('div', { class: 'card-title' }, r ? `${nameOf(r.pid)} ${r.correct ? 'got it' : 'missed it'}` : 'Nobody got it'),
      h('p', { class: 'dim' }, 'Back to the board in a moment.')));
    dock.push(button({ label: 'Back to the board', icon: 'chevron', kind: 'primary', size: 'lg', block: true, onclick: () => act('advance') }), dockRow(flip));
  }
  return { body: body.filter(Boolean), dock };
}

function roundEndView() {
  const ranked = [...v.players].sort((a, b) => b.score - a.score);
  return {
    body: [card(eyebrow(`Round ${v.round} finished`), h('div', { class: 'list' }, ranked.map((p, i) => h('div', { class: 'rowi' }, h('span', { class: 'rank' }, String(i + 1)), h('div', { class: 'grow t' }, p.name), h('span', { class: 'pts' }, money(p.score))))))],
    dock: [button({ label: v.round < v.rounds ? 'Start the next round' : 'On to Final Jeopardy', icon: 'chevron', kind: 'primary', size: 'lg', block: true, onclick: () => act('advance') })],
  };
}

// ---------- Final Jeopardy ----------
function finalView() {
  const f = v.final; const s = v.secret; const ph = v.phase;
  const body = [];
  if (ph === 'final-wager') {
    body.push(card(eyebrow('Final Jeopardy'), h('div', { class: 'card-title' }, f.category),
      h('p', { class: 'dim' }, 'Players are wagering on their phones.'),
      h('div', { class: 'list' }, f.eligible.map((id) => h('div', { class: 'rowi' }, h('div', { class: 'grow t' }, nameOf(id)), pill(f.wagered.includes(id) ? 'locked in' : 'thinking…', f.wagered.includes(id) ? 'ok' : '')))),
      answerBox(s.finalAnswer)));
  } else if (ph === 'final-answer') {
    const got = s.finalAnswers ?? {};
    body.push(card(eyebrow(`Final Jeopardy · ${f.category}`), h('div', { class: 'card-title' }, f.q), clockPill(), answerBox(s.finalAnswer),
      h('div', { class: 'list' }, f.eligible.map((id) => h('div', { class: 'rowi' }, h('div', { class: 'grow t' }, nameOf(id)), h('span', { class: 's' }, id in got ? `🔒 ${got[id] || '(blank)'}` : 'typing…'))))));
  } else {
    body.push(card(eyebrow('Final Jeopardy results'), h('p', { class: 'dim' }, `The answer: ${f.answer ?? s.finalAnswer}. Typed answers are checked automatically. Flip one if it was judged wrong.`),
      h('div', { class: 'list' }, f.reveals.map((r) => h('div', { class: 'rowi' }, h('div', { class: 'grow' }, h('div', { class: 't' }, nameOf(r.id)), h('div', { class: 's' }, `“${r.answer}” · bet ${money(r.wager)}`)),
        pill(r.correct ? 'right' : 'wrong', r.correct ? 'ok' : 'bad'), button({ label: 'Flip', size: 'sm', onclick: () => act('finalOverride', { pid: r.id }) }))))));
  }
  const dock = [];
  // Moving on before everyone has locked in skips them, so it asks first.
  const early = (missing, title, message, label) => (missing ? () => C.confirm({ title, message, confirmLabel: label, onConfirm: () => act('advance') }) : () => act('advance'));
  if (ph === 'final-wager') {
    // Only when everyone who is here has locked in a wager (a player who has gone away does not hold the game up).
    const waiting = f.eligible.filter((id) => !f.wagered.includes(id) && v.players.find((p) => p.id === id)?.connected);
    dock.push(waiting.length ? h('div', { class: 'dock-note' }, `Waiting for ${waiting.map(nameOf).join(', ')} to lock in a wager`) : null,
      button({ label: waiting.length ? `${f.wagered.length} of ${f.eligible.length} locked in` : 'Everyone is locked in. Show the clue', icon: 'tv', kind: 'ok', size: 'lg', block: true, disabled: waiting.length > 0, onclick: () => act('advance') }));
  }
  if (ph === 'final-answer') dock.push(button({ label: 'Time’s up. Reveal the answers', icon: 'chevron', kind: 'primary', size: 'lg', block: true, onclick: early(f.answered.length < f.eligible.length, 'Reveal now?', 'Not everyone has locked in an answer. Anything they typed still counts.', 'Reveal') }));
  if (ph === 'final-reveal') dock.push(button({ label: 'Next reveal', icon: 'chevron', kind: 'primary', size: 'lg', block: true, onclick: () => act('advance') }));
  return { body, dock: dock.filter(Boolean) };
}

function doneView() {
  const ranked = [...v.players].sort((a, b) => b.score - a.score);
  return {
    body: [
      card(eyebrow('Final scores'), h('div', { class: 'list' }, ranked.map((p, i) => h('div', { class: 'rowi' }, h('span', { class: 'rank' }, String(i + 1)), h('div', { class: 'grow t' }, p.name), h('span', { class: 'pts' }, money(p.score)))))),
      v.awards?.length ? card(eyebrow('Awards'), h('div', { class: 'list' }, v.awards.map((a) => h('div', { class: 'rowi' }, h('div', { class: 'grow' }, h('div', { class: 't' }, a.title), h('div', { class: 's' }, `${nameOf(a.pid)} · ${a.detail}`)))))) : null,
      f_final(),
    ].filter(Boolean),
    dock: [button({ label: 'Play again', icon: 'refresh', kind: 'primary', size: 'lg', block: true, onclick: () => act('playAgain') })],
  };
}
/** Final Jeopardy's answers stay on the host page after the game ends, so a ruling can still be flipped. */
const f_final = () => (v.final ? card(eyebrow('Final Jeopardy'), h('p', { class: 'dim' }, `${v.final.category}: ${v.final.answer ?? ''}`),
  v.final.reveals.length ? h('div', { class: 'list' }, v.final.reveals.map((r) => h('div', { class: 'rowi' }, h('div', { class: 'grow' }, h('div', { class: 't' }, nameOf(r.id)), h('div', { class: 's' }, `“${r.answer}” · bet ${money(r.wager)}`)),
    pill(r.correct ? 'right' : 'wrong', r.correct ? 'ok' : 'bad'), button({ label: 'Flip', size: 'sm', onclick: () => act('finalOverride', { pid: r.id }) })))) : null) : null);

// ---------- Settings tab cards, and the danger zone ----------
function settingsCards() {
  const lobby = v.phase === 'lobby';
  return [card(eyebrow('How answers work'),
    lobby ? jp(judgeControl(v, act), v.hostJudges && answerTimeControl(v, act))
      : h('p', { class: 'dim' }, v.hostJudges ? 'A host judges spoken answers. This can only be changed before the game starts.' : 'Players type their answers and the game checks them. This can only be changed before the game starts.'),
    h('p', { class: 'dim' }, v.readsAloud ? 'The TV reads each clue out loud; the buzzers open when it finishes,' : 'Buzzers open a few seconds after the clue appears, stay open for seven seconds, and a wrong answer opens them again for everyone who has not tried.')),
  lobby && v.hall?.games > 0 && card(eyebrow('Family scoreboard'),
    h('p', { class: 'dim' }, `${v.hall.games} game${v.hall.games === 1 ? '' : 's'} on this TV. ` + (v.hall.players.filter((e) => e.wins).map((e) => `${e.name}: ${e.wins}`).join(', ') || 'No champion yet.')),
    button({ label: 'Clear the scoreboard', size: 'sm', onclick: () => C.confirm({ title: 'Clear the family scoreboard?', message: 'Every win and game on this TV is forgotten.', confirmLabel: 'Clear', onConfirm: () => act('resetHall') }) })),
  card(eyebrow('Final Jeopardy'), !(v.phase.startsWith('final') || v.phase === 'gameover')
    ? jp(finalControl(v, act))
    : h('p', { class: 'dim' }, v.finalForAll ? 'Everyone plays Final Jeopardy.' : 'Only players with money play Final Jeopardy.'))].filter(Boolean);
}

const confirmEndGame = () => C.confirm({ title: 'End the game?', message: 'Scores are reset and everyone goes back to the lobby. Players stay in the room.', confirmLabel: 'End game', onConfirm: () => act('endGame') });
function dangerButtons() {
  if (v.phase === 'lobby') return [];
  return [button({ label: 'End the game', icon: 'flag', kind: 'bad', block: true, onclick: () => C.confirm({ title: 'End the game?', message: 'Scores are reset and everyone goes back to the lobby. Players stay in the room.', confirmLabel: 'End game', onConfirm: () => act('endGame') }) })];
}

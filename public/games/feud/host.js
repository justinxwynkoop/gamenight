// Family Feud on the host's phone, tablet or laptop. The page (host.js) provides the app frame and the
// Players, Scores and Settings tabs; this module supplies the Game tab (setup, the face-off, the board,
// the steal, round end, Fast Money, the result), the pinned action bar for each, and the game's rules.
import { h } from '../../common.js';
import { icon, button, seg, toggle, dot, pill, card, eyebrow, timerPill } from '../../ui.js';

let g = null;     // the game's view
let room = null;  // the room's view (teams, players)
let C = null;     // helpers from the page: act, sets, setInfo, openSheet, confirm, go, ...
let act = () => {};

const unit = (id) => room.units.find((u) => u.id === id) ?? null;
const nameOf = (id) => unit(id)?.name ?? '?';
const other = (id) => room.units.find((u) => u.id !== id) ?? null;
const dockRow = (...kids) => h('div', { class: 'dock-row' }, kids.flat().filter(Boolean));
const playerName = (id) => room.players.find((p) => p.id === id)?.name ?? '—';
const teamBadge = (id, size = 14) => dot(unit(id)?.color ?? '#888', size);

/** What the page needs from this game. */
export function render(raw, ctx) {
  g = raw.game;
  room = raw.room;
  C = ctx;
  act = ctx.act;
  const screen = { lobby: setupView, round: roundView, fastmoney: fastMoneyView, done: doneView }[g.status];
  const main = screen ? screen() : { body: [], dock: null };
  return { title: 'Family Feud', sub: subtitle(), body: main.body, dock: main.dock, settings: settingsCards(), danger: dangerButtons() };
}

function subtitle() {
  switch (g.status) {
    case 'lobby': return `Setting up · ${room.players.length} ${room.players.length === 1 ? 'player' : 'players'}`;
    case 'round': return `Round ${g.round.number} of ${g.rounds}${g.round.multiplier > 1 ? ` · ×${g.round.multiplier}` : ''}`;
    case 'fastmoney': return 'Fast Money';
    default: return 'Finished';
  }
}

// ---------- setup ----------
function setupView() {
  const [a, b] = room.units;
  const info = C.setInfo(g.setId);
  const problems = [];
  if (!g.setId) problems.push('Choose a question set.');
  if (room.units.length < 2 || room.units.some((u) => u.members < 1)) problems.push('Each team needs at least one player.');
  const ready = problems.length === 0;
  const s = g.settings;
  const fmOk = info ? info.fastMoney : false;

  const teamCard = (u) => h('div', { class: 'teamcard', style: { '--c': u.color } },
    h('div', { class: 'head' }, dot(u.color, 14), u.name, h('span', { class: 'dim' }, `· ${u.members} ${u.members === 1 ? 'player' : 'players'}`)),
    u.memberNames?.length ? h('div', { class: 'chips' }, u.memberNames.map((n) => h('span', { class: 'chip' }, n))) : h('p', { class: 'dim' }, 'No one yet'));

  const body = [
    card(
      h('div', { class: 'card-head' }, h('div', {}, eyebrow('Question set'), h('div', { class: 'card-title' }, info?.title ?? (g.setId ? 'Loading…' : 'None chosen'))),
        info?.rounds && pill(`${info.rounds} rounds${info.fastMoney ? ' + Fast Money' : ''}`)),
      info?.questions?.length && h('div', { class: 'chips' }, info.questions.slice(0, 3).map((q) => h('span', { class: 'chip' }, q.replace(/^Name /, '')))),
      button({ label: g.setId ? 'Change set' : 'Choose a set', icon: g.setId ? 'swap' : 'plus', kind: g.setId ? '' : 'primary', onclick: openSetSheet })),
    card(eyebrow('Teams'),
      h('p', { class: 'dim' }, 'Family Feud is always two teams. Players are dealt onto them at random; you can move anyone.'),
      h('div', { class: 'list' }, a && teamCard(a), b && teamCard(b)),
      button({ label: 'Manage players and teams', icon: 'users', onclick: () => C.go('players') })),
    card(eyebrow('Rules'),
      h('div', { class: 'field' }, h('span', {}, 'First team to reach'), seg([200, 300, 400, 500].map((n) => ({ value: n, label: `${n}` })), s.targetScore, (n) => act('setSettings', { targetScore: n }))),
      toggle({ label: 'Bigger rounds at the end', sub: 'Rounds 4 and 5 are worth double and triple', checked: s.multipliers, onchange: (on) => act('setSettings', { multipliers: on }) }),
      toggle({ label: 'Play Fast Money', sub: fmOk || !g.setId ? 'The winning team plays the bonus round' : 'This set has no Fast Money questions', checked: s.fastMoney && (fmOk || !g.setId), onchange: (on) => act('setSettings', { fastMoney: on }) })),
  ];
  const dock = [
    !ready && h('div', { class: 'dock-note' }, problems[0]),
    button({ label: 'Start game', icon: 'play', kind: ready ? 'ok' : '', size: 'lg', block: true, disabled: !ready, onclick: () => act('startGame') }),
  ];
  return { body, dock };
}

function openSetSheet() {
  C.openSheet({
    title: 'Question set',
    build: () => (C.sets.length
      ? h('div', { class: 'list' }, C.sets.map((x) => h('button', {
        type: 'button', class: 'pick', 'aria-pressed': String(x.id === g.setId),
        onclick: () => { act('chooseSet', { id: x.id }); C.closeSheet(); },
      }, h('div', { class: 'grow' }, h('div', { class: 't' }, x.title)), x.id === g.setId && icon('check', 20))))
      : h('p', { class: 'dim' }, 'No question sets yet. Write one in the question editor.')),
  });
}

// ---------- a round ----------
const STEPS = [['faceoff', 'Face-off'], ['play', 'Play'], ['roundEnd', 'Result']];
const stepIndex = (step) => (step === 'choose' ? 0 : step === 'steal' ? 1 : Math.max(0, STEPS.findIndex(([k]) => k === step)));

function scoreStrip(r) {
  return h('div', { class: 'fd-teams' }, room.units.map((u) => h('div', { class: `fd-team ${r.control === u.id ? 'on' : ''}`, style: { '--c': u.color } },
    h('div', { class: 'n' }, dot(u.color, 12), u.name),
    h('div', { class: 'pts' }, String(u.score)),
    r.control === u.id && h('div', { class: 's' }, r.step === 'steal' ? 'stealing' : 'playing'))));
}
const strikeBoxes = (r) => h('div', { class: 'fd-strikes', 'aria-label': `${r.strikes} of ${r.maxStrikes} strikes` },
  Array.from({ length: r.maxStrikes }, (_, i) => h('span', { class: i < r.strikes ? 'x on' : 'x' }, '✕')));

function roundView() {
  const r = g.round;
  const at = stepIndex(r.step);
  const tapOk = r.step === 'play' || r.step === 'steal' || (r.step === 'faceoff' && !!r.faceoff.turn);
  const tracker = h('div', { class: 'steps', 'aria-label': 'Progress' }, STEPS.map(([, label], i) => h('span', { class: i < at ? 'done' : i === at ? 'on' : '' }, label)));

  const body = [
    scoreStrip(r),
    card(tracker,
      h('div', { class: 'meta' }, `Round ${r.number} of ${g.rounds}`, r.multiplier > 1 && pill(`×${r.multiplier}`, 'warn'), h('span', { class: 'grow' }), `Pot ${r.pot}`, r.multiplier > 1 && h('span', { class: 'dim' }, `= ${r.pot * r.multiplier}`)),
      h('div', { class: 'clue-text' }, r.question),
      strikeBoxes(r)),
  ];
  body.push(...stepBanner(r));
  body.push(h('div', { class: 'fd-answers' }, r.answers.map((a, i) => h('button', {
    type: 'button', class: `fd-ans ${a.revealed ? 'up' : ''} ${a.late ? 'late' : ''}`, disabled: a.revealed || a.late || !tapOk,
    'aria-label': `${a.text}, ${a.points} points${a.revealed ? ', already up' : ''}`, onclick: () => act('answer', { index: i }),
  }, h('span', { class: 'n' }, String(a.n)), h('span', { class: 't' }, a.text), h('span', { class: 'p' }, String(a.points)), a.revealed && icon('check', 18)))));
  if (tapOk) body.push(h('div', { class: 'note' }, icon('star', 16), h('span', {}, 'Tap the answer they gave. It flips on the TV.')));
  if (r.step !== 'roundEnd') {
    body.push(button({
      label: 'End the rounds early', kind: 'ghost', size: 'sm', block: true,
      onclick: () => C.confirm({ title: 'End the rounds?', message: 'The game moves on to Fast Money (or the winner) now.', confirmLabel: 'End the rounds', kind: 'primary', onConfirm: () => act('endRounds') }),
    }));
  }
  return { body, dock: roundDock(r) };
}

function stepBanner(r) {
  const f = r.faceoff;
  if (r.step === 'faceoff') {
    const reps = h('div', { class: 'list' }, f.reps.map((p) => h('div', { class: 'rowi' }, teamBadge(p.unitId, 16),
      h('div', { class: 'grow' }, h('div', { class: 't' }, p.name ?? 'No one'), h('div', { class: 's' }, `${nameOf(p.unitId)} · steps up`)),
      button({ label: 'Change', size: 'sm', onclick: () => openRepSheet(p.unitId) }))));
    const out = [];
    if (f.open) out.push(h('div', { class: 'banner' }, icon('clock', 22), h('div', { class: 'grow' }, 'Buzzers are live', h('small', {}, 'First of the two players to press goes first.'))));
    else if (f.turn) {
      const rep = f.reps.find((p) => p.unitId === f.turn);
      out.push(h('div', { class: 'banner', style: { background: unit(f.turn)?.color } }, teamBadge(f.turn, 14), h('div', { class: 'grow' }, `${rep?.name ?? nameOf(f.turn)} is answering`, h('small', {}, nameOf(f.turn)))));
    } else if (f.attempts.length >= 2) out.push(h('div', { class: 'banner' }, icon('x', 22), h('div', { class: 'grow' }, 'Both missed', h('small', {}, 'Replay the face-off, or pick a winner.'))));
    else out.push(h('div', { class: 'note' }, icon('user', 16), h('span', {}, 'One player from each team comes up. Read the question, then open the buzzers.')));
    return [...out, reps];
  }
  if (r.step === 'choose') {
    return [h('div', { class: 'banner', style: { background: unit(f.winner)?.color } }, teamBadge(f.winner, 14), h('div', { class: 'grow' }, `${nameOf(f.winner)} won the face-off`, h('small', {}, 'Do they play, or pass to the other team?')))];
  }
  if (r.step === 'play' || r.step === 'steal') {
    const u = unit(r.control);
    const steal = r.step === 'steal';
    return [h('div', { class: 'banner', style: { background: u?.color } }, teamBadge(r.control, 14),
      h('div', { class: 'grow' }, steal ? `Steal! ${u?.name} gets one guess` : `${u?.name} is playing`, h('small', {}, steal ? `If they get it they take ${r.pot} points` : `${3 - r.strikes} strikes left`)))];
  }
  if (r.step === 'roundEnd') {
    const w = unit(r.result?.winner);
    return [h('div', { class: 'banner', style: { background: w?.color } }, icon('award', 24),
      h('div', { class: 'grow' }, `${w?.name ?? '?'} wins ${r.result?.awarded ?? 0} points`, r.multiplier > 1 && h('small', {}, `${r.pot} × ${r.multiplier}`)))];
  }
  return [];
}

function openRepSheet(unitId) {
  C.openSheet({
    title: `Who steps up for ${nameOf(unitId)}?`,
    build: () => h('div', { class: 'list' }, room.players.filter((p) => p.teamId === unitId).map((p) => h('button', {
      type: 'button', class: 'pick', 'aria-pressed': String(g.round?.faceoff.reps.find((x) => x.unitId === unitId)?.playerId === p.id),
      onclick: () => { act('setRep', { unitId, playerId: p.id }); C.closeSheet(); },
    }, dot(p.color, 18), h('div', { class: 'grow' }, h('div', { class: 't' }, p.name)), p.connected ? h('span', { class: 'dim' }, 'online') : h('span', { class: 'dim' }, 'offline')))),
  });
}

function lastRound(r) {
  const top = Math.max(...room.units.map((u) => u.score));
  return r.number >= g.rounds || top >= g.settings.targetScore;
}

function roundDock(r) {
  const f = r.faceoff;
  const undo = button({ label: 'Undo', icon: 'refresh', size: 'sm', disabled: !g.canUndo, onclick: () => act('undo') });
  const [a, b] = room.units;
  if (r.step === 'faceoff') {
    if (f.open) {
      return [h('div', { class: 'dock-note' }, 'Waiting for a press…'),
        dockRow(...room.units.map((u) => button({ label: `${u.name} first`, onclick: () => act('awardBuzz', { id: u.id }) })))];
    }
    if (f.turn) return [button({ label: 'Not on the board', icon: 'x', kind: 'bad', size: 'lg', block: true, onclick: () => act('miss') }), dockRow(undo)];
    if (f.attempts.length >= 2) {
      return [button({ label: 'Replay the face-off', icon: 'refresh', kind: 'primary', size: 'lg', block: true, onclick: () => act('replayFaceoff') }),
        dockRow(...room.units.map((u) => button({ label: `${u.name} wins it`, size: 'sm', onclick: () => act('faceoffWin', { id: u.id }) })), undo)];
    }
    return [button({ label: 'Open buzzers', icon: 'play', kind: 'ok', size: 'lg', block: true, onclick: () => act('openBuzzers') }),
      dockRow(a && button({ label: `${a.name} starts`, size: 'sm', onclick: () => act('awardBuzz', { id: a.id }) }), b && button({ label: `${b.name} starts`, size: 'sm', onclick: () => act('awardBuzz', { id: b.id }) }), undo)];
  }
  if (r.step === 'choose') {
    const w = unit(f.winner);
    return [dockRow(button({ label: `${w?.name} plays`, icon: 'play', kind: 'ok', size: 'lg', onclick: () => act('choose', { play: true }) }),
      button({ label: `Pass to ${other(f.winner)?.name}`, size: 'lg', onclick: () => act('choose', { play: false }) })), dockRow(undo)];
  }
  if (r.step === 'play' || r.step === 'steal') {
    return [button({ label: r.step === 'steal' ? 'Steal failed' : `Strike ${r.strikes + 1}`, icon: 'x', kind: 'bad', size: 'lg', block: true, onclick: () => act('miss') }), dockRow(undo)];
  }
  const finishing = lastRound(r);
  const fm = g.settings.fastMoney && g.hasFastMoney;
  return [button({
    label: finishing ? (fm ? 'On to Fast Money' : 'Finish the game') : 'Next round', icon: 'chevron', kind: 'primary', size: 'lg', block: true, onclick: () => act('nextRound'),
  }), dockRow(button({ label: 'Show the other answers', size: 'sm', disabled: r.answers.every((x) => x.revealed || x.late), onclick: () => act('revealRest') }), undo)];
}

// ---------- Fast Money ----------
const FM_STEPS = [['pick', 'Players'], ['p1', 'Player 1'], ['p2', 'Player 2'], ['reveal', 'Reveal'], ['results', 'Result']];

function fastMoneyView() {
  const fm = g.fm;
  const at = Math.max(0, FM_STEPS.findIndex(([k]) => k === (fm.step === 'team' ? 'pick' : fm.step)));
  const tracker = h('div', { class: 'steps' }, FM_STEPS.map(([, label], i) => h('span', { class: i < at ? 'done' : i === at ? 'on' : '' }, label)));
  const team = unit(fm.team);
  const head = card(tracker, h('div', { class: 'meta' }, 'Fast Money', team && [h('span', {}, '·'), teamBadge(fm.team, 12), team.name]),
    h('p', { class: 'dim' }, `Two players answer five questions each. Reach ${fm.goal} points to win.`));

  if (fm.step === 'team') {
    return {
      body: [head, card(eyebrow('Tied'), h('div', { class: 'card-title' }, 'Which team plays Fast Money?'),
        h('div', { class: 'list' }, room.units.map((u) => h('button', { type: 'button', class: 'pick', onclick: () => act('fmTeam', { id: u.id }) }, dot(u.color, 18), h('div', { class: 'grow t' }, u.name), h('span', { class: 'dim' }, String(u.score))))))],
      dock: null,
    };
  }
  if (fm.step === 'pick') return fmPick(fm, head);
  if (fm.step === 'p1' || fm.step === 'p2') return fmAnswering(fm, head);
  return fmReveal(fm, head);
}

function memberList(slotIndex, fm) {
  const members = room.players.filter((p) => p.teamId === fm.team);
  return members.map((p) => h('button', {
    type: 'button', class: 'pick', 'aria-pressed': String(fm.players[slotIndex].id === p.id),
    onclick: () => { const ids = fm.players.map((x) => x.id); ids[slotIndex] = p.id; act('fmPlayers', { ids }); },
  }, dot(p.color, 18), h('div', { class: 'grow' }, h('div', { class: 't' }, p.name)), fm.players[slotIndex].id === p.id && icon('check', 20)));
}
function fmPick(fm, head) {
  const ready = fm.players.every((p) => p.id);
  return {
    body: [head,
      card(eyebrow('Player 1'), h('div', { class: 'list' }, memberList(0, fm))),
      card(eyebrow('Player 2'), h('p', { class: 'dim' }, 'Player 2 should not hear Player 1’s answers. Send them out of the room, or have them look away.'), h('div', { class: 'list' }, memberList(1, fm)))],
    dock: [button({ label: 'Start Fast Money', icon: 'play', kind: 'ok', size: 'lg', block: true, disabled: !ready, onclick: () => act('fmStart') })],
  };
}

function fmAnswering(fm, head) {
  const slot = fm.step;
  const who = fm.players[slot === 'p1' ? 0 : 1];
  const inputs = fm.rows.map((row) => h('input', {
    type: 'text', placeholder: row.question, 'data-k': `fm-${slot}-${row.q}`, value: row[slot].typed ?? '', maxLength: 40, 'aria-label': `Answer to: ${row.question}`, autocomplete: 'off',
  }));
  const save = () => act('fmSetAnswers', { slot, answers: inputs.map((i) => i.value) });
  return {
    body: [head,
      h('div', { class: 'banner' }, icon('clock', 22), h('div', { class: 'grow' }, `${who.name ?? 'Player'} is answering`, h('small', {}, fm.submitted[slot] ? 'Answers received from their phone.' : 'They type on their phone. Or enter what they say below.')), timerPill(fm.timer)),
      card(eyebrow('Questions'), h('div', { class: 'list' }, fm.rows.map((row, i) => h('div', { class: 'field' }, h('span', {}, `${i + 1}. ${row.question}`), inputs[i]))),
        button({ label: 'Save these answers', icon: 'check', onclick: save }))],
    dock: [button({ label: slot === 'p1' ? 'Time’s up. Player 2 is next' : 'Time’s up. Reveal the answers', icon: 'chevron', kind: 'primary', size: 'lg', block: true, onclick: () => { save(); act('fmNext'); } }),
      button({ label: 'Restart the timer', icon: 'refresh', size: 'sm', block: true, onclick: () => act('fmRestartTimer') })],
  };
}

function openJudgeSheet(row, slot) {
  C.openSheet({
    title: `${row.question}`,
    build: () => {
      const r = g.fm.rows[row.q];
      const cell = r[slot];
      const sg = cell.suggest;
      const pick = (points, label) => { act('fmJudge', { slot, q: row.q, points, label }); C.closeSheet(); };
      return [
        h('p', { class: 'dim' }, `${g.fm.players[slot === 'p1' ? 0 : 1].name ?? 'Player'} said: “${cell.typed || '—'}”`),
        h('div', { class: 'list' },
          r[slot].choices.map((c, i) => h('button', { type: 'button', class: 'pick', 'aria-pressed': String(sg?.index === i && !sg.dup), onclick: () => pick(c.points, c.text) },
            h('span', { class: 'rank' }, String(i + 1)), h('div', { class: 'grow t' }, c.text), h('span', { class: 'pts' }, String(c.points)))),
          h('button', { type: 'button', class: 'pick', 'aria-pressed': String(!!sg?.dup), onclick: () => pick(0, sg?.dup ? 'Repeated answer' : null) }, icon('x', 18), h('div', { class: 'grow t' }, sg?.dup ? 'Repeated Player 1’s answer' : 'Not on the board'), h('span', { class: 'pts' }, '0'))),
      ];
    },
  });
}

function fmReveal(fm, head) {
  const names = fm.players.map((p) => p.name ?? 'Player');
  const done = fm.rows.reduce((n, r) => n + (r.p1.judged ? 1 : 0) + (r.p2.judged ? 1 : 0), 0);
  const slotRow = (row, slot, who) => {
    const c = row[slot];
    if (c.judged) {
      return h('div', { class: 'rowi' }, icon(c.points > 0 ? 'check' : 'x', 18), h('div', { class: 'grow' }, h('div', { class: 't' }, who), h('div', { class: 's' }, `“${c.typed || '—'}”${c.label ? ` → ${c.label}` : ''}`)),
        h('span', { class: 'pts' }, String(c.points)), button({ label: 'Change', size: 'sm', onclick: () => openJudgeSheet(row, slot) }));
    }
    const sg = c.suggest;
    const accept = sg && (sg.index !== -1 || sg.dup)
      ? button({ label: sg.dup ? 'Repeat (0)' : `${sg.label} (+${sg.points})`, kind: 'primary', size: 'sm', onclick: () => act('fmJudge', { slot, q: row.q, points: sg.points, label: sg.dup ? 'Repeated answer' : sg.label }) })
      : null;
    return h('div', { class: 'rowi' }, icon('clock', 18), h('div', { class: 'grow' }, h('div', { class: 't' }, who), h('div', { class: 's' }, `“${c.typed || '—'}”`)),
      accept, button({ label: 'Score…', size: 'sm', onclick: () => openJudgeSheet(row, slot) }));
  };
  const body = [head,
    ...fm.rows.map((row) => card(eyebrow(`Question ${row.q + 1}`), h('div', { class: 'card-title' }, row.question), slotRow(row, 'p1', names[0]), slotRow(row, 'p2', names[1]))),
    card(eyebrow('Total'), h('div', { class: 'fd-total' }, h('b', {}, String(fm.totals.total)), h('span', { class: 'dim' }, ` of ${fm.goal}`)),
      h('div', { class: 'progress' }, h('i', { style: { width: `${Math.min(100, (fm.totals.total / fm.goal) * 100)}%` } })),
      fm.step === 'results' && h('div', { class: 'banner', style: { background: fm.won ? '#14532d' : '' } }, icon(fm.won ? 'award' : 'flag', 22), h('div', { class: 'grow' }, fm.won ? 'They did it!' : 'So close', h('small', {}, fm.won ? `${fm.totals.total} points` : `${fm.goal - fm.totals.total} short`))))];
  return {
    body,
    dock: [fm.step === 'results'
      ? button({ label: 'Show the winner', icon: 'award', kind: 'ok', size: 'lg', block: true, onclick: () => act('finishGame') })
      : h('div', { class: 'dock-note' }, `${done} of 10 answers scored`)],
  };
}

// ---------- the end ----------
function doneView() {
  const ranked = [...room.units].sort((a, b) => b.score - a.score);
  const tie = ranked[0] && ranked[1] && ranked[0].score === ranked[1].score;
  const fm = g.result?.fastMoney;
  return {
    body: [card(eyebrow('Game over'), h('div', { class: 'card-title' }, tie ? 'A tie!' : `${ranked[0]?.name ?? 'Nobody'} wins`),
      h('div', { class: 'list' }, ranked.map((u, i) => h('div', { class: 'rowi' }, h('span', { class: 'rank' }, String(i + 1)), dot(u.color, 16), h('div', { class: 'grow t' }, u.name), h('span', { class: 'pts' }, String(u.score))))),
      fm?.played && h('div', { class: 'banner', style: { background: fm.won ? '#14532d' : '' } }, icon(fm.won ? 'award' : 'flag', 22), h('div', { class: 'grow' }, `Fast Money: ${fm.total} of ${fm.goal}`, h('small', {}, `${nameOf(fm.team)} ${fm.won ? 'won the bonus round' : 'fell short'}`))),
      h('p', { class: 'dim' }, 'Starting again resets the scores. Everyone stays in the game.'))],
    dock: [button({ label: 'Back to setup', icon: 'refresh', kind: 'primary', size: 'lg', block: true, onclick: () => act('endGame') })],
  };
}

// ---------- Settings tab cards, and the danger zone ----------
function settingsCards() {
  const s = g.settings;
  const presets = (list, value, key, fmt = (n) => `${n}`) => {
    const options = list.map((n) => ({ value: n, label: fmt(n) }));
    if (!list.includes(value)) options.push({ value, label: fmt(value) });
    return seg(options, value, (n) => act('setSettings', { [key]: n }));
  };
  return [
    card(eyebrow('Rules'),
      h('div', { class: 'field' }, h('span', {}, 'First team to reach (points)'), presets([200, 300, 400, 500], s.targetScore, 'targetScore')),
      toggle({ label: 'Bigger rounds at the end', sub: 'Round 4 is worth double and round 5 triple', checked: s.multipliers, onchange: (on) => act('setSettings', { multipliers: on }) })),
    card(eyebrow('Fast Money'),
      toggle({ label: 'Play Fast Money', sub: 'The leading team plays the bonus round', checked: s.fastMoney, onchange: (on) => act('setSettings', { fastMoney: on }) }),
      h('div', { class: 'field' }, h('span', {}, 'Points to win'), presets([100, 150, 200, 250], s.fastMoneyGoal, 'fastMoneyGoal')),
      h('div', { class: 'field' }, h('span', {}, 'Player 1’s time'), presets([15, 20, 25, 30], s.fastMoneySeconds1, 'fastMoneySeconds1', (n) => `${n}s`)),
      h('div', { class: 'field' }, h('span', {}, 'Player 2’s time'), presets([20, 25, 30, 35], s.fastMoneySeconds2, 'fastMoneySeconds2', (n) => `${n}s`))),
  ];
}

function dangerButtons() {
  if (g.status === 'lobby') return [];
  return [button({
    label: 'End game and reset scores', icon: 'x', kind: 'bad', block: true,
    onclick: () => C.confirm({ title: 'End the game?', message: 'Scores reset and everyone goes back to setup.', confirmLabel: 'End game', onConfirm: () => act('endGame') }),
  })];
}

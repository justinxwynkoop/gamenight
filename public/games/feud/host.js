// Family Feud on the host's phone, tablet or laptop. The page (host.js) provides the app frame and the
// Players, Scores and Settings tabs; this module supplies the Game tab (setup, the face-off, the board,
// the steal, round end, Fast Money, the result), the pinned action bar for each, and the game's rules.
import { h, apiFetch } from '../../common.js';
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
    case 'round': return `${g.round.sudden ? 'Sudden death' : `Round ${g.round.number} of ${g.rounds}`}${g.round.multiplier > 1 ? ` · ×${g.round.multiplier}` : ''}`;
    case 'fastmoney': return 'Fast Money';
    default: return 'Finished';
  }
}

// ---------- a random board (built on a home server from the survey data; see games/feud/survey.js) ----------
const rand = { family: true, busy: false, error: '', info: undefined };
const api = (method, body) => apiFetch('/api/games/feud/random', { method, headers: { 'x-host-pin': C.pin(), 'content-type': 'application/json' }, body: body && JSON.stringify(body) });

/** Whether the survey data is installed on the server (asked once, and again on "Check again"). */
function loadRandomInfo(force = false) {
  if (!force && rand.info !== undefined) return;
  rand.info = null;
  api('GET').then((r) => (r.ok ? r.json() : null)).then((j) => { rand.info = j ?? { available: false }; C.refresh(); }).catch(() => { rand.info = { available: false }; C.refresh(); });
}

async function roll() {
  rand.busy = true; rand.error = ''; C.refresh();
  try {
    const res = await api('POST', { family: rand.family });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error ?? 'Could not build a board');
    act('chooseSet', { id: j.id });
    C.reloadSets?.();
  } catch (e) {
    rand.error = e.message;
  } finally {
    rand.busy = false; C.refresh();
  }
}

function randomCard() {
  // Random boards are built by a home server (server mode); the online site has none to ask.
  if (globalThis.GN_RELAY) return null;
  loadRandomInfo();
  if (rand.info === undefined || rand.info === null) return card(eyebrow('Random board'), h('p', { class: 'dim' }, 'Checking…'));
  if (!rand.info.available) {
    return card(eyebrow('Random board'), h('div', { class: 'card-title' }, 'Not set up on this server yet'),
      h('p', { class: 'dim' }, 'Download the public survey questions once, on the server computer, and the host screen can build a fresh board whenever you like. It also makes 20 ready-to-pick sets. The data stays on that computer.'),
      h('div', { class: 'answer' }, h('small', {}, 'On the server computer, in the gamenight folder'), h('b', {}, './scripts/get-feud-sets.sh')),
      button({ label: 'Check again', icon: 'refresh', onclick: () => loadRandomInfo(true) }));
  }
  return card(eyebrow('Random board'), h('div', { class: 'card-title' }, 'Build a fresh board'),
    h('p', { class: 'dim' }, 'Five rounds and five Fast Money questions, picked at random from thousands of real surveys.'),
    toggle({ label: 'Keep it family-friendly', sub: 'Leaves out dating, drinking, politics and similar topics', checked: rand.family, onchange: (on) => { rand.family = on; C.refresh(); } }),
    rand.error && h('p', { class: 'pill bad', role: 'alert' }, rand.error),
    button({ label: rand.busy ? 'Building…' : 'Build a random board', icon: 'shuffle', kind: 'primary', block: true, disabled: rand.busy, onclick: roll }));
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
    randomCard(),
    card(eyebrow('Teams'),
      h('p', { class: 'dim' }, 'Family Feud is always two teams. Players are dealt onto them at random; you can move anyone.'),
      h('div', { class: 'list' }, a && teamCard(a), b && teamCard(b)),
      button({ label: 'Manage players and teams', icon: 'users', onclick: () => C.go('players') })),
    card(eyebrow('Who checks answers'),
      toggle({ label: 'Players type answers on their phones', sub: 'The survey checks each one and the game runs itself, so nobody has to host. You can still tap answers here to correct it.', checked: !!s.typed, onchange: (on) => act('setSettings', { typed: on }) })),
    card(eyebrow('Rules'),
      h('div', { class: 'field' }, h('span', {}, 'First team to reach'), seg([200, 300, 400, 500].map((n) => ({ value: n, label: `${n}` })), s.targetScore, (n) => act('setSettings', { targetScore: n }))),
      toggle({ label: 'Bigger rounds at the end', sub: 'Rounds 4 and 5 are worth double and triple', checked: s.multipliers, onchange: (on) => act('setSettings', { multipliers: on }) }),
      toggle({ label: 'Play Fast Money', sub: fmOk || !g.setId ? 'The winning team plays a bonus round for the jackpot (a tie: it decides the winner)' : 'This set has no Fast Money questions', checked: s.fastMoney && (fmOk || !g.setId), onchange: (on) => act('setSettings', { fastMoney: on }) })),
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
    r.control === u.id && h('div', { class: 's' }, r.step === 'steal' ? 'stealing' : r.step === 'roundEnd' ? 'won the round' : 'playing'))));
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
      h('div', { class: 'meta' }, r.sudden ? `Sudden death${r.sudden.n > 1 ? ` ${r.sudden.n}` : ''}` : `Round ${r.number} of ${g.rounds}`, r.multiplier > 1 && pill(`×${r.multiplier}`, 'warn'), h('span', { class: 'grow' }), `Pot ${r.pot}`, r.multiplier > 1 && h('span', { class: 'dim' }, `= ${r.pot * r.multiplier}`)),
      h('div', { class: 'clue-text' }, r.question),
      strikeBoxes(r)),
  ];
  body.push(...stepBanner(r));
  body.push(h('div', { class: 'fd-answers' }, r.answers.map((a, i) => h('button', {
    type: 'button', class: `fd-ans ${a.revealed ? 'up' : ''} ${a.late ? 'late' : ''}`, disabled: a.revealed || a.late || !tapOk,
    'aria-label': `${a.text}, ${a.points} points${a.revealed ? ', already up' : ''}`, onclick: () => act('answer', { index: i }),
  }, h('span', { class: 'n' }, String(a.n)), h('span', { class: 't' }, a.text), h('span', { class: 'p' }, String(a.points)), a.revealed && icon('check', 18)))));
  if (r.said) body.push(h('div', { class: 'note' }, icon(r.said.index === -1 ? 'x' : 'check', 16), h('span', {}, `${r.said.name} typed “${r.said.text}”${r.said.index === -1 ? ': not on the board' : ''}`)));
  if (tapOk) body.push(h('div', { class: 'note' }, icon('star', 16), h('span', {}, g.settings.typed ? 'Players type their answers. Tap one here only to correct the survey.' : 'Tap the answer they gave. It flips on the TV.')));
  if (r.step !== 'roundEnd') {
    body.push(button({
      label: 'End the rounds early', kind: 'ghost', size: 'sm', block: true,
      onclick: () => C.confirm({ title: 'End the rounds?', message: 'The game moves on to Fast Money (or the winner) now.', confirmLabel: 'End the rounds', kind: 'primary', onConfirm: () => act('endRounds') }),
    }));
  }
  return { body, dock: roundDock(r) };
}

/** Who buzzed in the face-off, fastest first, to the thousandth of a second. */
function buzzTimes(f) {
  if (!f.buzzes?.length) return null;
  const best = f.buzzes[0].ms;
  return h('div', { class: 'list' }, f.buzzes.map((b, i) => h('div', { class: 'rowi' }, h('span', { class: 'tag' }, String(i + 1)), teamBadge(b.unitId, 16),
    h('div', { class: 'grow t' }, b.name ?? nameOf(b.unitId)), h('b', {}, `${(b.ms / 1000).toFixed(3)}s`), h('span', { class: 'dim' }, i ? `+${((b.ms - best) / 1000).toFixed(3)}` : 'first'))));
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
      out.push(h('div', { class: 'banner', style: { background: unit(f.turn)?.color } }, teamBadge(f.turn, 14), h('div', { class: 'grow' }, `${rep?.name ?? nameOf(f.turn)} is answering`,
        h('small', {}, f.followup ? `Both missed, so next in line on ${nameOf(f.turn)} answers. The first answer on the board wins it.` : nameOf(f.turn)))));
    } else if (f.attempts.length >= 2) out.push(h('div', { class: 'banner' }, icon('x', 22), h('div', { class: 'grow' }, 'Everyone missed', h('small', {}, r.sudden ? 'Replay the face-off.' : 'Replay the face-off, or pick a winner.'))));
    else out.push(h('div', { class: 'note' }, icon('user', 16), h('span', {}, 'One player from each team comes up. Read the question, then open the buzzers.')));
    if (r.sudden) out.unshift(h('div', { class: 'banner', style: { background: '#7c2d12' } }, icon('flag', 22), h('div', { class: 'grow' }, `Sudden death: the winning answer is worth ×${r.sudden.mult}`, h('small', {}, 'Nobody has reached the winning score. The face-off decides it: tap the answer they give.'))));
    return [...out, buzzTimes(f), reps];
  }
  if (r.step === 'choose') {
    return [h('div', { class: 'banner', style: { background: unit(f.winner)?.color } }, teamBadge(f.winner, 14), h('div', { class: 'grow' }, `${nameOf(f.winner)} won the face-off`, h('small', {}, 'Do they play, or pass to the other team?')))];
  }
  if (r.step === 'play' || r.step === 'steal') {
    const u = unit(r.control);
    const steal = r.step === 'steal';
    return [h('div', { class: 'banner', style: { background: u?.color } }, teamBadge(r.control, 14),
      h('div', { class: 'grow' }, steal ? `Steal! ${u?.name} gets one guess` : `${u?.name} is playing`, h('small', {}, steal ? `If they get it they take ${r.pot} points` : `${3 - r.strikes} strikes left`)),
      timerPill(r.timer)),
      // Who on the team is up, so the host does not have to guess.
      r.up && h('div', { class: 'banner up', style: { background: '#0e1540', border: `3px solid ${unit(r.control)?.color ?? '#fff'}` } }, icon('user', 22),
        h('div', { class: 'grow' }, `${r.up.name} is up`, h('small', {}, steal ? 'The team talks it over; they say it' : 'Next in line on the team')))];
  }
  if (r.step === 'roundEnd') {
    const w = unit(r.result?.winner);
    return [h('div', { class: 'banner', style: { background: w?.color } }, icon('award', 24),
      h('div', { class: 'grow' }, `${w?.name ?? '?'} wins ${r.result?.awarded ?? 0} points`, r.multiplier > 1 && h('small', {}, `${r.pot} × ${r.multiplier}${r.sudden ? ' (sudden death)' : ''}`)))];
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

/** What the "next" button does after a round: 'next' round, 'sudden' death, or 'finish' (Fast Money or the winner). */
function nextStep(r) {
  const top = Math.max(...room.units.map((u) => u.score));
  if (top >= g.settings.targetScore) return 'finish';
  if (r.sudden || r.number >= g.rounds) return g.settings.suddenDeath === false ? 'finish' : 'sudden';
  return 'next';
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
        dockRow(...(r.sudden ? [] : room.units.map((u) => button({ label: `${u.name} wins it`, size: 'sm', onclick: () => act('faceoffWin', { id: u.id }) }))), undo)];
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
    return [button({ label: r.step === 'steal' ? 'Wrong: show the X (steal failed)' : `Strike ${r.strikes + 1}`, icon: 'x', kind: 'bad', size: 'lg', block: true, onclick: () => act('miss') }),
      dockRow(button({ label: r.timer && !r.timer.timedOut ? `Restart the ${g.settings.answerSeconds ?? 10}s clock` : `Start the ${g.settings.answerSeconds ?? 10}s clock`, icon: 'clock', size: 'sm', onclick: () => act('startAnswerTimer') }), undo)];
  }
  const next = nextStep(r);
  const fm = g.settings.fastMoney && g.hasFastMoney;
  return [button({
    label: next === 'sudden' ? 'Sudden death: one more face-off' : next === 'finish' ? (fm ? 'On to Fast Money' : 'Finish the game') : 'Next round', icon: 'chevron', kind: 'primary', size: 'lg', block: true, onclick: () => act('nextRound'),
  }), dockRow(button({ label: 'Show the other answers', size: 'sm', disabled: r.answers.every((x) => x.revealed || x.late), onclick: () => act('revealRest') }), undo)];
}

// ---------- Fast Money ----------
const FM_STEPS = [['pick', 'Players'], ['p1', 'Player 1'], ['reveal1', 'Reveal'], ['p2', 'Player 2'], ['reveal2', 'Reveal'], ['results', 'Result']];
/** Where Fast Money is, as one of FM_STEPS: the reveal comes twice (Player 1's answers, then Player 2's). */
const fmStepKey = (fm) => (fm.step === 'team' ? 'pick' : fm.step === 'reveal' ? (fm.part === 'p1' ? 'reveal1' : 'reveal2') : fm.step);

function fastMoneyView() {
  const fm = g.fm;
  const at = Math.max(0, FM_STEPS.findIndex(([k]) => k === fmStepKey(fm)));
  const tracker = h('div', { class: 'steps' }, FM_STEPS.map(([, label], i) => h('span', { class: i < at ? 'done' : i === at ? 'on' : '' }, label)));
  const team = unit(fm.team);
  const bonus = fm.stakes !== 'tiebreak';
  const champ = unit(g.champion);
  const head = card(tracker, h('div', { class: 'meta' }, bonus ? 'Bonus round: Fast Money' : 'Tiebreaker: Fast Money', team && [h('span', {}, '·'), teamBadge(fm.team, 12), team.name]),
    bonus && champ && h('div', { class: 'banner', style: { background: '#14532d' } }, icon('award', 22), h('div', { class: 'grow' }, `${champ.name} won the game`, h('small', {}, 'Fast Money is their bonus round. It cannot change who won.'))),
    h('p', { class: 'dim' }, bonus
      ? `Two players answer five questions each. ${fm.goal} points wins the jackpot.`
      : `The teams are tied, so Fast Money decides it. ${fm.goal} points wins the game for the team that plays; fall short and the other team wins.`));

  if (fm.step === 'team') {
    return {
      body: [head, card(eyebrow('Tied'), h('div', { class: 'card-title' }, 'Which team plays Fast Money?'), h('p', { class: 'dim' }, 'Toss a coin, or let the team with the faster face-off buzz play.'),
        h('div', { class: 'list' }, room.units.map((u) => h('button', { type: 'button', class: 'pick', onclick: () => act('fmTeam', { id: u.id }) }, dot(u.color, 18), h('div', { class: 'grow t' }, u.name), h('span', { class: 'dim' }, String(u.score))))))],
      dock: null,
    };
  }
  if (fm.step === 'pick') return fmPick(fm, head);
  if (fm.step === 'p1' || fm.step === 'p2') return fmAnswering(fm, head);
  return fmReveal(fm, head);
}

/** The team's players, to pick one of them for this slot. Picking the player who is in the other slot swaps the two. */
function memberList(slotIndex, fm, after = null) {
  const members = room.players.filter((p) => p.teamId === fm.team);
  const other = 1 - slotIndex;
  return members.map((p) => h('button', {
    type: 'button', class: 'pick', 'aria-pressed': String(fm.players[slotIndex].id === p.id),
    onclick: () => {
      const ids = fm.players.map((x) => x.id);
      if (ids[other] === p.id) ids[other] = ids[slotIndex];   // already the other player: swap
      ids[slotIndex] = p.id;
      act('fmPlayers', { ids });
      after?.();
    },
  }, dot(p.color, 18), h('div', { class: 'grow' }, h('div', { class: 't' }, p.name), fm.players[other].id === p.id && h('div', { class: 's' }, `Player ${other + 1}: tap to swap`)),
  p.connected === false && h('span', { class: 'dim' }, 'offline'), fm.players[slotIndex].id === p.id && icon('check', 20)));
}
/** Change who is playing the slot that is up now (the host can swap a player who is not there). */
function openChangePlayerSheet(slotIndex) {
  C.openSheet({ title: `Who is Player ${slotIndex + 1}?`, build: () => h('div', { class: 'list' }, memberList(slotIndex, g.fm, () => C.closeSheet())) });
}
function fmPick(fm, head) {
  const members = room.players.filter((p) => p.teamId === fm.team);
  const ready = fm.players.every((p) => p.id) && (members.length < 2 || fm.players[0].id !== fm.players[1].id);
  return {
    body: [head,
      card(eyebrow('Choose the two players'), h('p', { class: 'dim' }, `${unit(fm.team)?.name ?? 'The team'}: pick who plays Fast Money. Tap a name to choose them for that slot.`)),
      card(eyebrow('Player 1'), h('div', { class: 'list' }, memberList(0, fm))),
      card(eyebrow('Player 2'), h('p', { class: 'dim' }, 'Player 2 waits out of the room (or with headphones on, facing away) until Player 1’s answers have been revealed and hidden. Then they are called back in.'), h('div', { class: 'list' }, memberList(1, fm)))],
    dock: [button({ label: 'Start Fast Money', icon: 'play', kind: 'ok', size: 'lg', block: true, disabled: !ready, onclick: () => act('fmStart') }),
      fm.stakes !== 'tiebreak' && button({ label: 'Skip the bonus round', size: 'sm', block: true, onclick: () => act('finishGame') })],
  };
}

function fmAnswering(fm, head) {
  const slot = fm.step;
  const who = fm.players[slot === 'p1' ? 0 : 1];
  const save = () => act('fmSetAnswers', { slot, answers: inputs.map((i) => i.value) });
  const inputs = fm.rows.map((row, i) => h('input', {
    type: 'text', placeholder: 'Type what they say', 'data-k': `fm-${slot}-${row.q}`, value: row[slot].typed ?? '', maxLength: 40, 'aria-label': `Answer to: ${row.question}`, autocomplete: 'off', enterKeyHint: 'next',
    onchange: save,   // saved as you go, on Enter or when you move to the next box
    onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); inputs[i + 1]?.focus(); } },
  }));
  // A one-tap way in: the survey answers, as buttons. Tap the one they said, or type something else. (Player 2 cannot repeat Player 1.)
  const chips = (row) => {
    const taken = slot === 'p2' ? row.p1.suggest?.index ?? -1 : -1;
    return h('div', { class: 'fd-chips' }, row[slot].choices.map((c, i) => h('button', {
      type: 'button', class: `chip ${i === taken ? 'taken' : ''}`, disabled: i === taken, 'aria-label': i === taken ? `${c.text}: Player 1 already said it` : c.text,
      onclick: () => { inputs[row.q].value = c.text; save(); },
    }, h('span', { class: 'n' }, String(i + 1)), c.text)));
  };
  const dup = (row) => slot === 'p2' && fm.rejected?.includes(row.q) && h('div', { class: 'fd-dup', role: 'alert' }, icon('x', 16), h('span', {}, 'Player 1 already said that. Ask for a different answer.'));
  return {
    body: [head,
      h('div', { class: 'banner' }, icon('clock', 22), h('div', { class: 'grow' }, `${who.name ?? 'Player'} is answering`, h('small', {}, fm.submitted[slot] ? 'Answers received from their phone.' : 'They type on their phone, or tap or type what they say below.')), timerPill(fm.timer)),
      slot === 'p2' && card(eyebrow(`${fm.players[0].name ?? 'Player 1'} scored`), h('div', { class: 'fd-total' }, h('b', {}, String(fm.totals.p1)), h('span', { class: 'dim' }, ' points. Their answers are hidden on the TV.'))),
      ...fm.rows.map((row, i) => card(eyebrow(`Question ${i + 1}`), h('div', { class: 'card-title' }, row.question), inputs[i], dup(row), chips(row))),
      card(button({ label: 'Save these answers', icon: 'check', onclick: save }))].filter(Boolean),
    dock: [button({ label: slot === 'p1' ? 'Time’s up. Reveal Player 1’s answers' : 'Time’s up. Reveal Player 2’s answers', icon: 'chevron', kind: 'primary', size: 'lg', block: true, onclick: () => { save(); act('fmNext'); } }),
      dockRow(button({ label: 'Restart the timer', icon: 'refresh', size: 'sm', onclick: () => act('fmRestartTimer') }),
        button({ label: `Change ${slot === 'p1' ? 'Player 1' : 'Player 2'}`, icon: 'swap', size: 'sm', onclick: () => openChangePlayerSheet(slot === 'p1' ? 0 : 1) }))],
  };
}

function openJudgeSheet(row, slot) {
  C.openSheet({
    title: `${row.question}`,
    build: () => {
      const r = g.fm.rows[row.q];
      const cell = r[slot];
      const sg = cell.suggest;
      const pick = (points, label) => { act('fmShowPoints', { slot, q: row.q, points, label }); C.closeSheet(); };
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

/** Where a player's answer landed on the survey list (1 is the top answer), or null: from the match we suggest, or what was scored. */
function rankOf(row, slot) {
  const c = row[slot];
  if (c.judged) { const i = c.label ? c.choices.findIndex((x) => x.text === c.label) : -1; return i === -1 ? null : i + 1; }
  return c.suggest && c.suggest.index !== -1 && !c.suggest.dup ? c.suggest.rank : null;
}

function fmReveal(fm, head) {
  const names = fm.players.map((p) => p.name ?? 'Player');
  // Each answer is revealed in two taps, as on the show: what the player said (the TV types it out), then "survey says" and the points.
  const slotRow = (row, slot, who) => {
    const c = row[slot];
    const rank = rankOf(row, slot);
    const sg = c.suggest;
    if (c.judged) {
      const text = c.typed ? `“${c.typed}”` : 'no answer';
      return h('div', { class: 'fd-judge done' },
        h('div', { class: 'who' }, icon(c.points > 0 ? 'check' : 'x', 18), h('div', { class: 'grow' }, h('div', { class: 't' }, who), h('div', { class: 's' }, `${text}${rank ? ` → #${rank} ${c.label}` : ''}`)), h('span', { class: 'pts' }, String(c.points))),
        h('div', { class: 'btns' }, button({ label: 'Change', size: 'sm', onclick: () => openJudgeSheet(row, slot) })));
    }
    const hint = sg?.dup ? 'repeats Player 1' : sg && sg.index !== -1 ? `→ #${sg.rank} ${sg.label}` : c.blank ? '' : 'not on the board';
    if (c.shown === 0) {
      return h('div', { class: 'fd-judge' },
        h('div', { class: 'who' }, icon('clock', 18), h('div', { class: 'grow' }, h('div', { class: 't' }, who), h('div', { class: 's' }, c.blank ? 'no answer' : `“${c.typed}” ${hint}`))),
        h('div', { class: 'btns' }, button({ label: c.blank ? 'Reveal (no answer · 0)' : 'Reveal what they said', icon: 'play', kind: 'primary', onclick: () => act('fmShowAnswer', { slot, q: row.q }) })));
    }
    const label = sg?.dup ? 'Survey says… Repeat · 0' : sg && sg.index !== -1 ? `Survey says… #${sg.rank} ${sg.label} · +${sg.points}` : 'Survey says… not on the board · 0';
    return h('div', { class: 'fd-judge' },
      h('div', { class: 'who' }, icon('star', 18), h('div', { class: 'grow' }, h('div', { class: 't' }, who), h('div', { class: 's' }, `“${c.typed}” is up on the TV`))),
      h('div', { class: 'btns' },
        button({ label, kind: 'ok', onclick: () => act('fmShowPoints', { slot, q: row.q }) }),
        button({ label: 'Other…', size: 'sm', onclick: () => openJudgeSheet(row, slot) })));
  };
  // The survey answers for a question, with a tag where each player's answer landed, so the rank is visible at a glance.
  const survey = (row) => h('div', { class: 'fd-ref' }, row.p1.choices.map((ch, i) => h('div', { class: `r ${[1, 2].some((k) => rankOf(row, `p${k}`) === i + 1) ? 'hit' : ''}` },
    h('span', { class: 'n' }, String(i + 1)), h('span', { class: 't' }, ch.text), h('span', { class: 'p' }, String(ch.points)),
    ['p1', 'p2'].map((slot, k) => rankOf(row, slot) === i + 1 && h('span', { class: `tag ${slot}` }, names[k])))));
  // Player 1's answers are revealed first (Player 2 is still out of the room), then hidden; Player 2's come after they have played.
  const slots = fm.step === 'results' || fm.part === 'all' ? ['p1', 'p2'] : [fm.part];
  const left = slots.length * 5 - slots.reduce((n, sl) => n + fm.rows.filter((r) => r[sl].judged).length, 0);
  const body = [head,
    fm.part === 'p1' && fm.step === 'reveal' && h('div', { class: 'banner' }, icon('tv', 22), h('div', { class: 'grow' }, `Revealing ${names[0]}’s answers`, h('small', {}, `${names[1]} stays out of the room. When these are all up, hide them and bring ${names[1]} in.`))),
    ...fm.rows.map((row) => card(eyebrow(`Question ${row.q + 1}`), h('div', { class: 'card-title' }, row.question), survey(row), ...slots.map((sl) => slotRow(row, sl, names[sl === 'p1' ? 0 : 1])))),
    card(eyebrow('Total'), h('div', { class: 'fd-total' }, h('b', {}, String(fm.totals.total)), h('span', { class: 'dim' }, ` of ${fm.goal}`)),
      h('div', { class: 'dim' }, `${names[0]} ${fm.totals.p1} · ${names[1]} ${fm.totals.p2}`),
      h('div', { class: 'progress' }, h('i', { style: { width: `${Math.min(100, (fm.totals.total / fm.goal) * 100)}%` } })),
      fm.step === 'results' && h('div', { class: 'banner', style: { background: fm.won ? '#14532d' : '' } }, icon(fm.won ? 'award' : 'flag', 22), h('div', { class: 'grow' }, fm.won ? (fm.stakes === 'tiebreak' ? `${unit(fm.team)?.name} win the tiebreaker!` : 'Jackpot!') : (fm.stakes === 'tiebreak' ? `${nameOf(g.champion)} win the tiebreaker` : 'So close'), h('small', {}, fm.won ? `${fm.totals.total} points` : `${fm.goal - fm.totals.total} short`))))].filter(Boolean);
  const next = fm.part === 'p1' && fm.partDone
    ? button({ label: `Hide the answers. ${names[1]} is next`, icon: 'chevron', kind: 'primary', size: 'lg', block: true, onclick: () => act('fmNext') })
    : button({ label: 'Reveal the next answer', icon: 'play', kind: 'primary', size: 'lg', block: true, onclick: () => act('fmRevealNext') });
  return {
    body,
    dock: fm.step === 'results'
      ? [button({ label: 'Show the winner', icon: 'award', kind: 'ok', size: 'lg', block: true, onclick: () => act('finishGame') })]
      : [next, h('div', { class: 'dock-note' }, fm.part === 'p1' && fm.partDone ? `${names[0]} scored ${fm.totals.p1}. That stays on the TV.` : `${left} answer${left === 1 ? '' : 's'} left to reveal`)],
  };
}

// ---------- the end ----------
function doneView() {
  const champ = unit(g.result?.champion ?? g.champion);
  const ranked = [...room.units].sort((a, b) => (b.id === champ?.id) - (a.id === champ?.id) || b.score - a.score);
  const fm = g.result?.fastMoney;
  return {
    body: [card(eyebrow('Game over'), h('div', { class: 'card-title' }, champ ? `${champ.name} win the game` : 'A tie!'),
      h('div', { class: 'list' }, ranked.map((u, i) => h('div', { class: 'rowi' }, h('span', { class: 'rank' }, String(i + 1)), dot(u.color, 16), h('div', { class: 'grow t' }, u.name), h('span', { class: 'pts' }, String(u.score))))),
      fm?.played && h('div', { class: 'banner', style: { background: fm.won ? '#14532d' : '' } }, icon(fm.won ? 'award' : 'flag', 22), h('div', { class: 'grow' }, `Fast Money: ${fm.total} of ${fm.goal}`, h('small', {}, fm.stakes === 'tiebreak' ? `${nameOf(fm.team)} ${fm.won ? 'broke the tie' : 'fell short, so the tie went the other way'}` : `${nameOf(fm.team)} ${fm.won ? 'won the jackpot' : 'fell short of the jackpot'}`))),
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
    card(eyebrow('Answers'),
      toggle({ label: 'Players type answers on their phones', sub: 'The survey checks them; no host needed', checked: !!s.typed, onchange: (on) => act('setSettings', { typed: on }) })),
    card(eyebrow('Rules'),
      h('div', { class: 'field' }, h('span', {}, 'First team to reach (points)'), presets([200, 300, 400, 500], s.targetScore, 'targetScore')),
      toggle({ label: 'Bigger rounds at the end', sub: 'Round 4 is worth double and round 5 triple', checked: s.multipliers, onchange: (on) => act('setSettings', { multipliers: on }) }),
      toggle({ label: 'Sudden death', sub: 'If nobody has the winning score after the last round, face-offs worth 5× or 10× until a team gets there', checked: s.suddenDeath !== false, onchange: (on) => act('setSettings', { suddenDeath: on }) }),
      h('div', { class: 'field' }, h('span', {}, 'Answer clock (you start it when a player is up)'), presets([5, 10, 15, 20, 30], s.answerSeconds ?? 10, 'answerSeconds', (n) => `${n}s`))),
    card(eyebrow('Fast Money'),
      toggle({ label: 'Play Fast Money', sub: 'The winning team plays a bonus round for the jackpot (a tie: it decides the winner)', checked: s.fastMoney, onchange: (on) => act('setSettings', { fastMoney: on }) }),
      h('div', { class: 'field' }, h('span', {}, 'Points to win'), presets([100, 150, 200, 250], s.fastMoneyGoal, 'fastMoneyGoal')),
      h('p', { class: 'dim' }, 'Longer times suit players typing on a phone; shorter ones suit answers said out loud.'),
      h('div', { class: 'field' }, h('span', {}, 'Player 1’s time'), presets([20, 30, 40, 60], s.fastMoneySeconds1, 'fastMoneySeconds1', (n) => `${n}s`)),
      h('div', { class: 'field' }, h('span', {}, 'Player 2’s time'), presets([25, 35, 45, 65], s.fastMoneySeconds2, 'fastMoneySeconds2', (n) => `${n}s`))),
  ];
}

function dangerButtons() {
  if (g.status === 'lobby') return [];
  return [button({
    label: 'End game and reset scores', icon: 'x', kind: 'bad', block: true,
    onclick: () => C.confirm({ title: 'End the game?', message: 'Scores reset and everyone goes back to setup.', confirmLabel: 'End game', onConfirm: () => act('endGame') }),
  })];
}

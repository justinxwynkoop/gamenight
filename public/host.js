import { h, money, connect, store, unitById } from './common.js';

const app = document.getElementById('app');
const offline = document.getElementById('offline');
let view = null;
let pin = store('gn-pin') ?? '';
let authed = false;
let loginError = '';
let sets = [];
let net;
let playersOpen = null; // remembers the Players panel across re-renders

function start() {
  net?.close();
  authed = false;
  net = connect({
    hello: () => ({ t: 'hello', role: 'host', pin }),
    onStatus: (up) => offline.classList.toggle('hidden', up),
    onState: (v) => { view = v; authed = true; loginError = ''; if (!sets.length) loadSets(); render(); },
    onMessage: (m) => {
      if (m.t === 'bad-pin') { authed = false; loginError = pin ? 'Wrong PIN' : ''; store('gn-pin', null); render(); }
      else if (m.t === 'error') flash(m.message);
    },
  });
}
async function loadSets() {
  try {
    const r = await fetch('/api/sets', { headers: { 'x-host-pin': pin } });
    if (r.ok) { sets = await r.json(); render(); }
  } catch { /* offline */ }
}
function flash(text) {
  const t = h('div', { class: 'toast' }, text);
  document.body.append(t);
  setTimeout(() => t.remove(), 3000);
}
const act = (a, args) => net.act(a, args);

// Re-rendering replaces the DOM; keep whatever the host was typing.
function render() {
  const ae = document.activeElement;
  const k = ae?.dataset?.k;
  const keep = k ? { k, value: ae.value, s: ae.selectionStart, e: ae.selectionEnd } : null;
  app.replaceChildren(authed && view ? main() : login());
  if (keep) {
    const el = app.querySelector(`[data-k="${keep.k}"]`);
    if (el) { el.value = keep.value; el.focus(); try { el.setSelectionRange(keep.s, keep.e); } catch { /* not text */ } }
  }
}

function login() {
  const input = h('input', { type: 'password', inputMode: 'numeric', placeholder: 'Host PIN', autocomplete: 'off', 'data-k': 'pin' });
  const go = () => { pin = input.value.trim(); store('gn-pin', pin); loginError = ''; start(); };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  return h('div', { class: 'login' }, h('h1', {}, 'Host'), h('p', { class: 'tag' }, 'The PIN is printed when the server starts.'),
    input, loginError && h('div', { class: 'err' }, loginError), h('button', { class: 'btn primary', style: { width: '100%', marginTop: '12px' }, onclick: go }, 'Enter'));
}

const sw = (c) => h('span', { class: 'swatch', style: { background: c } });
const nameOf = (id) => unitById(view, id)?.name ?? '?';

function main() {
  const v = view;
  return h('div', { class: 'wrap' }, topBar(v),
    v.status === 'lobby' && lobby(v),
    v.status === 'board' && boardCard(v),
    v.status === 'clue' && v.clue && clueCard(v),
    v.status === 'final' && v.final && finalCard(v),
    v.status === 'done' && h('div', { class: 'card' }, h('h2', {}, 'Game over'),
      h('p', {}, 'Everyone is back in the lobby when you start a new game. Scores reset, players stay.'),
      h('button', { class: 'btn primary', onclick: () => act('endGame') }, 'Back to lobby')),
    v.status !== 'lobby' && scoresCard(v),
    playersCard(v));
}

function topBar(v) {
  const label = { lobby: 'Lobby', board: 'Board', clue: 'Clue', final: 'Final Jeopardy', done: 'Finished' }[v.status];
  return h('div', { class: 'card bar' },
    h('div', {}, h('strong', {}, v.title ?? 'Game Night'), h('span', { class: 'tag' }, `  ·  ${label}`)),
    h('div', { class: 'row' },
      (v.status === 'board' || v.status === 'done') && h('button', { class: 'btn small', onclick: () => act('setView', { view: v.view === 'leaderboard' ? 'board' : 'leaderboard' }) },
        v.view === 'leaderboard' ? 'TV: show board' : 'TV: show leaderboard'),
      v.status !== 'lobby' && h('button', { class: 'btn small bad', onclick: () => { if (confirm('End the game and reset scores?')) act('endGame'); } }, 'End game'),
      h('a', { class: 'btn small', href: '/editor', style: { textDecoration: 'none' } }, 'Question editor')));
}

// ---------- lobby ----------
function lobby(v) {
  const setSel = h('select', { onchange: (e) => act('chooseSet', { id: e.target.value }) },
    !v.setId && h('option', { value: '' }, '— choose a question set —'),
    sets.map((s) => h('option', { value: s.id, selected: s.id === v.setId }, s.title)));
  const teamName = h('input', { placeholder: 'New team name', maxLength: 20, 'data-k': 'team' });
  const pen = h('input', { type: 'number', min: 0, max: 5000, step: 100, value: v.settings.penaltyMs, style: { width: '110px' }, 'data-k': 'pen' });
  return h('div', { class: 'card' }, h('h2', {}, 'Setup'),
    h('label', {}, 'Question set'), setSel,
    h('label', {}, 'Mode'),
    h('div', { class: 'row' },
      ['players', 'teams'].map((m) => h('button', { class: `btn ${v.mode === m ? 'primary' : ''}`, onclick: () => act('setMode', { mode: m }) }, m === 'players' ? 'Individual players' : 'Teams'))),
    v.mode === 'teams' && [h('label', {}, 'Teams'),
      h('div', { class: 'list' }, v.teams.map((t) => h('div', { class: 'item' }, sw(t.color), h('span', { class: 'nm' }, t.name),
        h('span', { class: 'tag' }, `${unitById(v, t.id)?.members ?? 0} players`),
        h('button', { class: 'btn small', onclick: () => act('removeTeam', { id: t.id }) }, 'Remove')))),
      h('div', { class: 'row', style: { marginTop: '8px' } }, h('div', { class: 'grow' }, teamName),
        h('button', { class: 'btn', onclick: () => { act('addTeam', { name: teamName.value }); teamName.value = ''; } }, 'Add team'))],
    h('label', {}, 'Early buzz penalty'),
    h('div', { class: 'row' },
      h('label', { class: 'row', style: { margin: 0, color: 'inherit' } }, h('input', { type: 'checkbox', checked: v.settings.earlyPenalty, style: { width: '22px', minHeight: '22px' }, onchange: (e) => act('setSettings', { earlyPenalty: e.target.checked }) }), 'Lock out early buzzers for'),
      pen, h('span', { class: 'tag' }, 'ms'), h('button', { class: 'btn small', onclick: () => act('setSettings', { penaltyMs: pen.value }) }, 'Save')),
    h('div', { class: 'row', style: { marginTop: '16px' } },
      h('button', { class: 'btn ok grow', disabled: !v.setId || !v.units.length, onclick: () => act('startGame') },
        v.units.length ? `Start game (${v.units.length} ${v.mode === 'teams' ? 'teams' : 'players'})` : 'Waiting for players…'),
      h('button', { class: 'btn small', onclick: () => { if (confirm('Remove all players and teams?')) act('clearRoster'); } }, 'Clear players')));
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
    body.push(h('div', { class: 'item', style: { marginTop: '12px', fontSize: '1.2rem' } }, sw(u?.color ?? '#fff'), h('span', { class: 'nm' }, `${u?.name ?? '?'} is answering`), cl.dd && h('span', { class: 'pill' }, `wager ${money(cl.wager)}`)),
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
    : f.step === 'clue' ? h('button', { class: 'btn primary', onclick: () => act('finalNext') }, 'Time’s up — start judging')
      : f.step === 'judge' ? h('button', { class: 'btn', onclick: () => act('finishFinal') }, 'Skip the rest, show results')
        : h('button', { class: 'btn primary', onclick: () => act('finishGame') }, 'Show winner');
  return h('div', { class: 'card' }, head, h('div', { class: 'list', style: { marginTop: '12px' } }, rows), h('div', { class: 'row', style: { marginTop: '12px' } }, next));
}

// ---------- scores & players ----------
function scoresCard(v) {
  const sorted = [...v.units].sort((a, b) => b.score - a.score);
  return h('div', { class: 'card' }, h('h2', {}, 'Scores'), h('div', { class: 'list' }, sorted.map((u) => h('div', { class: 'item' },
    sw(u.color), h('span', { class: 'nm' }, u.name), h('span', { class: 'pts' }, money(u.score)),
    h('button', { class: 'btn small', onclick: () => { const n = prompt(`Adjust ${u.name}'s score by (use a minus to subtract):`, '100'); if (n !== null && n !== '') act('adjustScore', { id: u.id, delta: n }); } }, '±'),
    h('button', { class: 'btn small', onclick: () => { const n = prompt(`Set ${u.name}'s score to:`, String(u.score)); if (n !== null && n !== '') act('adjustScore', { id: u.id, set: n }); } }, 'Set'),
    h('button', { class: 'btn small', onclick: () => { const n = prompt('Rename to:', u.name); if (n) act('renameUnit', { id: u.id, name: n }); } }, 'Rename')))));
}

function playersCard(v) {
  const teams = v.mode === 'teams';
  return h('details', { class: 'card', open: playersOpen ?? v.status === 'lobby', ontoggle: (e) => { playersOpen = e.target.open; } }, h('summary', {}, `Players (${v.players.length})`),
    h('div', { class: 'list', style: { marginTop: '8px' } }, v.players.length ? v.players.map((p) => h('div', { class: 'item' },
      sw(p.color), h('span', { class: 'nm' }, p.name), p.kind === 'buzzer' && h('span', { class: 'pill' }, 'buzzer'),
      h('span', { class: `pill ${p.connected ? 'live' : ''}` }, p.connected ? 'online' : 'offline'),
      teams && h('select', { style: { width: 'auto', minHeight: '34px' }, onchange: (e) => act('setPlayerTeam', { playerId: p.id, teamId: e.target.value }) },
        h('option', { value: '' }, 'No team'), v.teams.map((t) => h('option', { value: t.id, selected: t.id === p.teamId }, t.name))),
      !teams && v.status === 'lobby' && h('button', { class: 'btn small', onclick: () => { const n = prompt('Rename to:', p.name); if (n) act('renameUnit', { id: p.id, name: n }); } }, 'Rename'),
      h('button', { class: 'btn small bad', onclick: () => { if (confirm(`Remove ${p.name}?`)) act('removePlayer', { id: p.id }); } }, 'Remove'))) : h('p', { class: 'tag' }, 'Nobody yet. Players scan the QR code on the TV.')));
}

start();
render();

// The host page. It owns the login, the game picker, players and teams, and
// scores. Everything about the game itself comes from the active game's module
// (/games/<id>/host.js), which returns the cards to show.
import { h, money, connect, store } from './common.js';

const app = document.getElementById('app');
const offline = document.getElementById('offline');
let view = null;          // { room, game }
let pin = store('gn-pin') ?? '';
let authed = false;
let loginError = '';
let sets = [];            // question sets for the active game
let setsFor = null;
let net;
let playersOpen = null;   // remembers the Players panel across re-renders
const modules = {};       // id -> module, once loaded
const loading = {};

function start() {
  net?.close();
  authed = false;
  net = connect({
    hello: () => ({ t: 'hello', role: 'host', pin }),
    onStatus: (up) => offline.classList.toggle('hidden', up),
    onState: (v) => { view = v; authed = true; loginError = ''; ensureGame(); render(); },
    onMessage: (m) => {
      if (m.t === 'bad-pin') { authed = false; loginError = pin ? 'Wrong PIN' : ''; store('gn-pin', null); render(); }
      else if (m.t === 'error') flash(m.message);
    },
  });
}

/** Load the active game's page module and its question sets the first time they're needed. */
function ensureGame() {
  const id = view?.room.gameId;
  if (!id) return;
  if (!modules[id] && !loading[id]) {
    loading[id] = import(`/games/${id}/host.js`).then((m) => { modules[id] = m; render(); }).catch((e) => { console.error(e); flash('Could not load this game'); });
  }
  if (setsFor !== id) { setsFor = id; loadSets(id); }
}
async function loadSets(id) {
  try {
    const r = await fetch(`/api/games/${id}/sets`, { headers: { 'x-host-pin': pin } });
    if (r.ok && setsFor === id) { sets = await r.json(); render(); }
  } catch { /* offline */ }
}
function flash(text) {
  const t = h('div', { class: 'toast' }, text);
  document.body.append(t);
  setTimeout(() => t.remove(), 3000);
}
const act = (a, args) => net.act(a, args);

// Every update redraws the page, which would wipe a half-typed number (a player joining is enough).
// So remember what was typed into any field marked data-k, and put it back after each redraw. Pressing
// a button (Save, Add, Set...) ends the edit: the next redraw shows what the server now has.
const drafts = {};
app.addEventListener('input', (e) => { const k = e.target.dataset?.k; if (k) drafts[k] = e.target.value; });
app.addEventListener('click', (e) => { if (e.target.closest('button')) for (const k of Object.keys(drafts)) delete drafts[k]; }, true);

function render() {
  const ae = document.activeElement;
  const k = ae?.dataset?.k;
  const keep = k ? { k, value: ae.value, s: ae.selectionStart, e: ae.selectionEnd } : null;
  app.replaceChildren(authed && view ? main() : login());
  for (const el of app.querySelectorAll('[data-k]')) if (el.dataset.k in drafts) el.value = drafts[el.dataset.k];
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

function main() {
  const { room } = view;
  const mod = room.gameId ? modules[room.gameId] : null;
  const game = mod ? mod.render(view, { act, sets, flash }) : null;
  const gameName = room.games.find((g) => g.id === room.gameId)?.name;
  const lobby = !room.inProgress;
  return h('div', { class: 'wrap' },
    topBar(gameName, game),
    lobby && room.games.length > 1 && gamePicker(),
    room.gameId && !mod && h('div', { class: 'card' }, 'Loading…'),
    game?.cards,
    lobby && rosterCard(),
    room.inProgress && scoresCard(),
    playersCard(),
    soundCard());
}

function topBar(gameName, game) {
  return h('div', { class: 'card bar' },
    h('div', {}, h('strong', {}, gameName ?? 'Game Night'), game?.label && h('span', { class: 'tag' }, `  ·  ${game.label}`)),
    h('div', { class: 'row' }, game?.toolbar,
      h('a', { class: 'btn small', href: `/editor${view.room.gameId ? `?game=${view.room.gameId}` : ''}`, style: { textDecoration: 'none' } }, 'Question editor')));
}

function gamePicker() {
  const { room } = view;
  return h('div', { class: 'card' }, h('h2', {}, 'Game'),
    h('div', { class: 'list' }, room.games.map((g) => h('button', {
      class: `btn ${g.id === room.gameId ? 'primary' : ''}`, style: { textAlign: 'left' }, onclick: () => act('chooseGame', { id: g.id }),
    }, h('strong', {}, g.name), h('div', { class: 'tag' }, g.description)))));
}

// ---------- players & teams ----------
function rosterCard() {
  const { room } = view;
  const teamName = h('input', { placeholder: 'New team name', maxLength: 20, 'data-k': 'team' });
  return h('div', { class: 'card' }, h('h2', {}, 'Players & teams'),
    h('div', { class: 'row' },
      ['players', 'teams'].map((m) => h('button', { class: `btn ${room.mode === m ? 'primary' : ''}`, onclick: () => act('setMode', { mode: m }) }, m === 'players' ? 'Individual players' : 'Teams')),
      h('button', { class: 'btn small', style: { marginLeft: 'auto' }, onclick: () => { if (confirm('Remove all players and teams?')) act('clearRoster'); } }, 'Clear players')),
    room.mode === 'teams' && [
      h('div', { class: 'list', style: { marginTop: '10px' } }, room.teams.map((t) => h('div', { class: 'item' }, sw(t.color), h('span', { class: 'nm' }, t.name),
        h('span', { class: 'tag' }, `${room.units.find((u) => u.id === t.id)?.members ?? 0} players`),
        h('button', { class: 'btn small', onclick: () => act('removeTeam', { id: t.id }) }, 'Remove')))),
      h('div', { class: 'row', style: { marginTop: '8px' } }, h('div', { class: 'grow' }, teamName),
        h('button', { class: 'btn', onclick: () => { act('addTeam', { name: teamName.value }); teamName.value = ''; } }, 'Add team'))]);
}

function soundCard() {
  const { settings } = view.room;
  const vol = h('input', { type: 'range', min: 0, max: 100, step: 5, value: settings.volume, style: { flex: '1 1 160px', minHeight: '30px' }, 'data-k': 'vol',
    onchange: (e) => act('setRoomSettings', { volume: e.target.value }) });
  return h('div', { class: 'card' }, h('h2', {}, 'Sound (plays on the TV)'),
    h('div', { class: 'row' },
      h('label', { class: 'row', style: { margin: 0, color: 'inherit' } }, h('input', { type: 'checkbox', checked: settings.sound, style: { width: '22px', minHeight: '22px' }, onchange: (e) => act('setRoomSettings', { sound: e.target.checked }) }), 'Sound on'),
      vol, h('button', { class: 'btn small', onclick: () => act('testSound') }, 'Test on TV')));
}

function scoresCard() {
  const { room } = view;
  const sorted = [...room.units].sort((a, b) => b.score - a.score);
  return h('div', { class: 'card' }, h('h2', {}, 'Scores'), h('div', { class: 'list' }, sorted.map((u) => h('div', { class: 'item' },
    sw(u.color), h('span', { class: 'nm' }, u.name), h('span', { class: 'pts' }, money(u.score)),
    h('button', { class: 'btn small', onclick: () => { const n = prompt(`Adjust ${u.name}'s score by (use a minus to subtract):`, '100'); if (n !== null && n !== '') act('adjustScore', { id: u.id, delta: n }); } }, '±'),
    h('button', { class: 'btn small', onclick: () => { const n = prompt(`Set ${u.name}'s score to:`, String(u.score)); if (n !== null && n !== '') act('adjustScore', { id: u.id, set: n }); } }, 'Set'),
    h('button', { class: 'btn small', onclick: () => { const n = prompt('Rename to:', u.name); if (n) act('renameUnit', { id: u.id, name: n }); } }, 'Rename')))));
}

function playersCard() {
  const { room } = view;
  const teams = room.mode === 'teams';
  return h('details', { class: 'card', open: playersOpen ?? !room.inProgress, ontoggle: (e) => { playersOpen = e.target.open; } }, h('summary', {}, `Players (${room.players.length})`),
    h('div', { class: 'list', style: { marginTop: '8px' } }, room.players.length ? room.players.map((p) => h('div', { class: 'item' },
      sw(p.color), h('span', { class: 'nm' }, p.name), p.kind === 'buzzer' && h('span', { class: 'pill' }, 'buzzer'),
      h('span', { class: `pill ${p.connected ? 'live' : ''}` }, p.connected ? 'online' : 'offline'),
      teams && h('select', { style: { width: 'auto', minHeight: '34px' }, onchange: (e) => act('setPlayerTeam', { playerId: p.id, teamId: e.target.value }) },
        h('option', { value: '' }, 'No team'), room.teams.map((t) => h('option', { value: t.id, selected: t.id === p.teamId }, t.name))),
      !teams && !room.inProgress && h('button', { class: 'btn small', onclick: () => { const n = prompt('Rename to:', p.name); if (n) act('renameUnit', { id: p.id, name: n }); } }, 'Rename'),
      h('button', { class: 'btn small bad', onclick: () => { if (confirm(`Remove ${p.name}?`)) act('removePlayer', { id: p.id }); } }, 'Remove'))) : h('p', { class: 'tag' }, 'Nobody yet. Players scan the QR code on the TV.')));
}

start();
render();

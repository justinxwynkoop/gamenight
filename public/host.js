// The host page: sign-in, the app frame (top bar, tabs, pinned action bar, slide-up sheets) and the screens
// every game shares: Players, Scores and Settings. What the Game tab shows, and the game's own settings,
// come from the active game's module (/games/<id>/host.js).
import { h, money, scoreText, connect, store, unitById, apiFetch } from './common.js';
import { icon, button, seg, toggle, dot, pill, card, eyebrow } from './ui.js';

const app = document.getElementById('app');
const offline = document.getElementById('offline');
let view = null;          // { room, game }
let pin = store('gn-pin') ?? '';
let authed = false;
let loginError = '';
let sets = [];            // question sets for the active game: [{ id, title }]
let setsFor = null;
let net;
const modules = {};       // game id -> its host module, once loaded
const loading = {};
const setInfos = {};      // set id -> { title, categories, final } (fetched when a board is shown)
const ui = { tab: store('gn-host-tab') || 'game', sheet: null };
let renderedTab = null;
let renderedScreen = null; // the game screen (lobby, board, clue...) last drawn; a new one starts at the top

const TABS = [
  { id: 'game', label: 'Game', icon: 'grid' },
  { id: 'players', label: 'Players', icon: 'users' },
  { id: 'scores', label: 'Scores', icon: 'award' },
  { id: 'settings', label: 'Settings', icon: 'sliders' },
];

// ---------- connection ----------
function start() {
  net?.close();
  authed = false;
  net = connect({
    hello: () => ({ t: 'hello', role: 'host', pin }),
    onStatus: (up) => offline.classList.toggle('hidden', up),
    onState: (v) => { view = v; authed = true; loginError = ''; ensureGame(); render(); },
    onMessage: (m) => {
      if (m.t === 'bad-pin') { authed = false; loginError = pin ? 'Wrong PIN' : ''; store('gn-pin', null); render(); }
      else if (m.t === 'error') flash(m.message, true);
    },
  });
}
const act = (a, args) => net.act(a, args);

/** Load the active game's page module and its question sets the first time they're needed. */
function ensureGame() {
  const id = view?.room.gameId;
  if (!id) return;
  if (!modules[id] && !loading[id]) {
    loading[id] = import(`/games/${id}/host.js`).then((m) => { modules[id] = m; render(); }).catch((e) => { console.error(e); flash('Could not load this game', true); });
  }
  if (setsFor !== id) { setsFor = id; loadSets(id); }
}
async function loadSets(id) {
  try {
    const r = await apiFetch(`/api/games/${id}/sets`, { headers: { 'x-host-pin': pin } });
    if (r.ok && setsFor === id) { sets = await r.json(); render(); }
  } catch { /* offline */ }
}
/** A question set's title and what is in it (categories and Final for Jeopardy; round questions and Fast Money for Feud), or null until it has loaded. */
function setInfo(id) {
  if (!id || !view?.room.gameId) return null;
  const hit = setInfos[id];
  if (hit === 'loading') return null;
  if (hit) return hit;
  setInfos[id] = 'loading';
  apiFetch(`/api/games/${view.room.gameId}/sets/${id}`, { headers: { 'x-host-pin': pin } })
    .then((r) => (r.ok ? r.json() : null))
    .then((s) => { setInfos[id] = s ? { title: s.title, categories: (s.categories ?? []).map((c) => c.name), final: s.final?.category ?? null, rounds: s.rounds?.length ?? null, questions: (s.rounds ?? []).map((r) => r.question), fastMoney: !!s.fastMoney?.length } : { title: id, categories: [], final: null, rounds: null, questions: [], fastMoney: false }; render(); })
    .catch(() => { delete setInfos[id]; });
  return null;
}

function flash(text, isError = false) {
  const t = h('div', { class: `toast ${isError ? 'err' : ''}`, role: 'status' }, text);
  document.body.append(t);
  setTimeout(() => t.remove(), 3200);
}

// ---------- sheets (slide-up panels, instead of the browser's pop-up boxes) ----------
function openSheet(sheet) { ui.sheet = sheet; render(); }
function closeSheet() { ui.sheet = null; render(); }
function confirmSheet({ title, message, confirmLabel = 'Yes', kind = 'bad', onConfirm }) {
  openSheet({
    title,
    build: () => [message && h('p', { class: 'dim' }, message),
      h('div', { class: 'dock-row' },
        button({ label: 'Cancel', onclick: closeSheet }),
        button({ label: confirmLabel, kind, onclick: () => { closeSheet(); onConfirm(); } }))],
  });
}
function goTab(tab) { ui.tab = tab; store('gn-host-tab', tab); ui.sheet = null; render(); }

function makeCtx() {
  return { act, sets, flash, setInfo, openSheet, closeSheet, confirm: confirmSheet, go: goTab, refresh: render, pin: () => pin, reloadSets: () => view?.room.gameId && loadSets(view.room.gameId) };
}

// ---------- drawing ----------
// Every update redraws the page, which would wipe a half-typed number (a player joining is enough).
// So remember what was typed into any field marked data-k, and put it back after each redraw.
const drafts = {};
app.addEventListener('input', (e) => { const k = e.target.dataset?.k; if (k) drafts[k] = e.target.value; });
app.addEventListener('click', (e) => { if (e.target.closest('button')) for (const k of Object.keys(drafts)) delete drafts[k]; }, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ui.sheet) closeSheet(); });

function render() {
  const ae = document.activeElement;
  const k = ae?.dataset?.k;
  const keep = k ? { k, value: ae.value, s: ae.selectionStart, e: ae.selectionEnd } : null;
  const main = app.querySelector('.main');
  const screenKey = `${view?.room?.gameId}/${view?.game?.status ?? view?.status}/${view?.game?.clue ? 'c' : ''}`;
  const mainTop = main && renderedTab === ui.tab && renderedScreen === screenKey ? main.scrollTop : 0;
  const sheetBody = app.querySelector('.sheet-body');
  const sheetTop = sheetBody?.scrollTop ?? 0;

  app.replaceChildren(authed && view ? shell() : login());
  renderedTab = ui.tab;
  renderedScreen = screenKey;

  const m2 = app.querySelector('.main'); if (m2) m2.scrollTop = mainTop;
  const s2 = app.querySelector('.sheet-body'); if (s2) s2.scrollTop = sheetTop;
  for (const el of app.querySelectorAll('[data-k]')) if (el.dataset.k in drafts) el.value = drafts[el.dataset.k];
  if (keep) {
    const el = app.querySelector(`[data-k="${keep.k}"]`);
    if (el) { el.value = keep.value; el.focus(); try { el.setSelectionRange(keep.s, keep.e); } catch { /* not text */ } }
  }
}

function login() {
  const input = h('input', { type: 'password', inputMode: 'numeric', placeholder: 'Host PIN', autocomplete: 'off', 'data-k': 'pin', 'aria-label': 'Host PIN' });
  const go = () => { pin = input.value.trim(); store('gn-pin', pin); loginError = ''; start(); };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  return h('div', { class: 'signin' }, card(
    h('h1', {}, 'Game Night host'),
    h('p', { class: 'dim' }, 'Enter the host PIN. The server prints it when it starts.'),
    input,
    loginError && h('p', { class: 'pill bad', role: 'alert' }, loginError),
    button({ label: 'Enter', kind: 'primary', size: 'lg', block: true, onclick: go })));
}

function shell() {
  const { room } = view;
  const mod = room.gameId ? modules[room.gameId] : null;
  const ctx = makeCtx();
  const game = mod ? mod.render(view, ctx) : null;
  let body; let dock = null;
  if (ui.tab === 'game') ({ body, dock } = gameTab(game, mod));
  else if (ui.tab === 'players') body = playersTab();
  else if (ui.tab === 'scores') body = scoresTab();
  else body = settingsTab(game);
  return h('div', { class: 'shell' },
    topBar(game),
    tabsNav(),
    h('main', { class: 'main' }, h('div', { class: 'content' }, body)),
    h('div', { class: `dock ${dock ? '' : 'hidden'}` }, h('div', { class: 'dock-inner' }, dock)),
    ui.sheet && sheetEl());
}

function topBar(game) {
  const { room } = view;
  const gameName = room.games.find((g) => g.id === room.gameId)?.name;
  const online = room.players.filter((p) => p.connected).length;
  return h('header', { class: 'top' },
    h('div', { class: 'grow' }, h('div', { class: 'top-title' }, game?.title ?? gameName ?? 'Game Night'),
      h('div', { class: 'top-sub' }, game?.sub ?? 'Pick a game')),
    pill(`${online}/${room.players.length} online`, online === room.players.length && online > 0 ? 'ok' : ''));
}

function tabsNav() {
  const { room } = view;
  const live = view.game && ['clue', 'final'].includes(view.game.status);
  return h('nav', { class: 'tabs', 'aria-label': 'Sections' }, TABS.map((t) => h('button', {
    type: 'button', class: 'tab', 'aria-current': ui.tab === t.id ? 'page' : null, onclick: () => goTab(t.id),
  }, icon(t.icon, 22), h('span', {}, t.label),
  t.id === 'players' && room.players.length > 0 && h('span', { class: 'count' }, String(room.players.length)),
  t.id === 'game' && live && ui.tab !== 'game' && h('span', { class: 'count' }, '!'))));
}

function sheetEl() {
  const s = ui.sheet;
  return h('div', { class: 'scrim', onclick: (e) => { if (e.target === e.currentTarget) closeSheet(); } },
    h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': s.title },
      h('div', { class: 'grab' }),
      h('div', { class: 'sheet-head' }, h('h2', {}, s.title), button({ icon: 'x', kind: 'ghost', size: 'sm', aria: 'Close', onclick: closeSheet })),
      h('div', { class: 'sheet-body' }, s.build())));
}

// ---------- Game tab ----------
function gameTab(game, mod) {
  const { room } = view;
  const lobby = !room.inProgress;
  if (!room.gameId) {
    return { body: [card(eyebrow('Game'), h('div', { class: 'card-title' }, 'What are we playing?'), gamePicker())], dock: null };
  }
  if (!mod || !game) return { body: [card(h('p', { class: 'dim' }, 'Loading…'))], dock: null };
  const body = [];
  if (lobby && room.games.length > 1) body.push(card(eyebrow('Game'), gamePicker()));
  body.push(...[].concat(game.body).filter(Boolean));
  return { body, dock: game.dock };
}

function gamePicker() {
  const { room } = view;
  return h('div', { class: 'list' }, room.games.map((g) => h('button', {
    type: 'button', class: 'pick', 'aria-pressed': String(g.id === room.gameId), disabled: room.inProgress && g.id !== room.gameId,
    onclick: () => act('chooseGame', { id: g.id }),
  }, h('div', { class: 'grow' }, h('div', { class: 't' }, g.name), h('div', { class: 's dim' }, g.description)),
  g.id === room.gameId && icon('check', 20))));
}

// ---------- Players tab ----------
function playersTab() {
  const { room } = view;
  const lobby = !room.inProgress;
  const teams = room.mode === 'teams';
  const count = room.players.length;
  const teamOf = (p) => room.teams.find((t) => t.id === p.teamId);
  const cards = [];

  const how = room.fixedTeams ? [
    eyebrow('How to play'),
    h('div', { class: 'card-title' }, `${room.fixedTeams} teams`),
    h('p', { class: 'dim' }, `${room.games.find((x) => x.id === room.gameId)?.name ?? 'This game'} is always played by ${room.fixedTeams} teams. Players are dealt onto them at random.`),
    lobby && button({ label: 'Shuffle teams', icon: 'shuffle', onclick: () => act('shuffleTeams') }),
  ] : [
    eyebrow('How to play'),
    h('div', { class: 'card-title' }, teams ? `${room.teams.length} teams` : 'Individual players'),
    seg([{ value: 'auto', label: 'Auto' }, { value: 'players', label: 'Individuals' }, { value: 'teams', label: 'Teams' }],
      room.modeSetting, (m) => act('setMode', { mode: m })),
    h('p', { class: 'dim' }, room.modeSetting === 'auto'
      ? `Auto: up to ${room.individualMax} players play on their own. With more, everyone is put on a random team.`
      : 'You chose this. Switch to Auto to let the game decide from the number of players.'),
  ];
  if (teams && !room.fixedTeams) {
    how.push(
      seg([{ value: 2, label: '2 teams', sub: 'Red, Blue' }, { value: 4, label: '4 teams', sub: '+ Green, Yellow' }], room.teams.length,
        (c) => act('setTeamCount', { count: c })),
      count > 2 * room.teamSize && h('p', { class: 'dim' }, `More than ${2 * room.teamSize} players, so there are four teams.`),
      button({ label: 'Shuffle teams', icon: 'shuffle', onclick: () => act('shuffleTeams') }));
  }
  if (!lobby) how.push(h('p', { class: 'dim' }, 'Teams can only be changed before the game starts. You can still move a player below.'));
  cards.push(card(...how));

  if (teams) {
    cards.push(card(eyebrow('Teams'), h('div', { class: 'list' }, room.units.map((u) => h('div', { class: 'teamcard', style: { '--c': u.color } },
      h('div', { class: 'head' }, dot(u.color, 16), u.name, h('span', { class: 'dim' }, `· ${u.members}`)),
      u.memberNames?.length ? h('div', { class: 'chips' }, u.memberNames.map((n) => h('span', { class: 'chip' }, n))) : h('div', { class: 'dim' }, 'No players yet'))))));
  }

  cards.push(card(eyebrow(`Players (${count})`), count
    ? h('div', { class: 'list' }, room.players.map((p) => {
      const t = teamOf(p);
      return h('div', { class: 'rowi' }, dot(t?.color ?? p.color, 16),
        h('div', { class: 'grow' }, h('div', { class: 't' }, p.name),
          h('div', { class: 's' }, [t?.name, p.kind === 'buzzer' && 'buzzer', p.connected ? 'online' : 'offline'].filter(Boolean).join(' · '))),
        teams && button({ label: 'Team', icon: 'swap', kind: 'ghost', size: 'sm', onclick: () => openTeamSheet(p) }),
        !teams && lobby && button({ icon: 'edit', kind: 'ghost', size: 'sm', aria: `Rename ${p.name}`, onclick: () => openRenameSheet(p.id, p.name) }),
        button({ icon: 'trash', kind: 'ghost', size: 'sm', aria: `Remove ${p.name}`, onclick: () => confirmSheet({ title: `Remove ${p.name}?`, message: 'They can rejoin by scanning the code again.', confirmLabel: 'Remove', onConfirm: () => act('removePlayer', { id: p.id }) }) }));
    }))
    : h('p', { class: 'dim' }, 'Nobody yet. Players scan the QR code on the TV to join.')));
  return cards;
}

function openTeamSheet(p) {
  openSheet({
    title: `Move ${p.name} to…`,
    build: () => h('div', { class: 'list' }, view.room.units.map((u) => h('button', {
      type: 'button', class: 'pick', 'aria-pressed': String(u.id === p.teamId), onclick: () => { act('setPlayerTeam', { playerId: p.id, teamId: u.id }); closeSheet(); },
    }, dot(u.color, 18), h('div', { class: 'grow' }, h('div', { class: 't' }, u.name), h('div', { class: 's dim' }, `${u.members} ${u.members === 1 ? 'player' : 'players'}`)), u.id === p.teamId && icon('check', 20)))),
  });
}

function openRenameSheet(id, current) {
  openSheet({
    title: 'Rename',
    build: () => {
      const input = h('input', { value: current, maxLength: 20, 'data-k': 'rename', 'aria-label': 'New name' });
      return [input, button({ label: 'Save name', kind: 'primary', block: true, onclick: () => { act('renameUnit', { id, name: input.value }); closeSheet(); } })];
    },
  });
}

// ---------- Scores tab ----------
function scoresTab() {
  const { room } = view;
  if (!room.units.length) return [card(eyebrow('Scores'), h('p', { class: 'dim' }, 'Scores appear once players have joined.'))];
  const ranked = [...room.units].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return [card(eyebrow('Scores'), h('p', { class: 'dim' }, 'Tap a name to correct a score.'),
    h('div', { class: 'list' }, ranked.map((u, i) => h('button', { type: 'button', class: 'rowi', onclick: () => openScoreSheet(u.id) },
      h('span', { class: 'rank' }, String(i + 1)), dot(u.color, 16),
      h('div', { class: 'grow' }, h('div', { class: 't' }, u.name), u.memberNames?.length && h('div', { class: 's' }, u.memberNames.join(', '))),
      h('span', { class: `pts ${u.score < 0 ? 'neg' : ''}` }, scoreText(view, u.score)), icon('chevron', 18)))))];
}

function openScoreSheet(id) {
  openSheet({
    title: 'Change a score',
    build: () => {
      const u = unitById(view.room, id);
      if (!u) return h('p', { class: 'dim' }, 'That player is gone.');
      const amount = h('input', { type: 'number', inputMode: 'numeric', placeholder: 'Amount', 'data-k': 'adj', 'aria-label': 'Amount' });
      const exact = h('input', { type: 'number', inputMode: 'numeric', placeholder: String(u.score), 'data-k': 'exact', 'aria-label': 'Set score to' });
      const name = h('input', { value: u.name, maxLength: 20, 'data-k': 'uname', 'aria-label': 'Name' });
      const delta = (n) => act('adjustScore', { id, delta: n });
      const pointsGame = view.game?.scoreFormat === 'points';
      return [
        h('div', { class: 'rowi' }, dot(u.color, 18), h('div', { class: 'grow t' }, u.name), h('span', { class: `pts ${u.score < 0 ? 'neg' : ''}` }, scoreText(view, u.score))),
        h('div', { class: 'eyebrow' }, 'Quick change'),
        h('div', { class: 'dock-row' }, (pointsGame ? [-50, -20, -10] : [-500, -200, -100]).map((n) => button({ label: scoreText(view, n).replace('-', '−'), kind: 'bad', size: 'sm', onclick: () => delta(n) }))),
        h('div', { class: 'dock-row' }, (pointsGame ? [10, 20, 50] : [100, 200, 500]).map((n) => button({ label: `+${scoreText(view, n)}`, kind: 'ok', size: 'sm', onclick: () => delta(n) }))),
        h('div', { class: 'eyebrow' }, 'Another amount'),
        h('div', { class: 'inline' }, amount,
          button({ label: 'Add', kind: 'ok', onclick: () => { if (amount.value) delta(Number(amount.value)); } }),
          button({ label: 'Take', kind: 'bad', onclick: () => { if (amount.value) delta(-Math.abs(Number(amount.value))); } })),
        h('div', { class: 'eyebrow' }, 'Set to exactly'),
        h('div', { class: 'inline' }, exact, button({ label: 'Set', onclick: () => { if (exact.value !== '') act('adjustScore', { id, set: exact.value }); } })),
        h('div', { class: 'eyebrow' }, 'Rename'),
        h('div', { class: 'inline' }, name, button({ label: 'Save', onclick: () => act('renameUnit', { id, name: name.value }) })),
      ];
    },
  });
}

// ---------- Settings tab ----------
function settingsTab(game) {
  const { room } = view;
  const lobby = !room.inProgress;
  const { settings } = room;
  const vol = h('input', {
    type: 'range', min: 0, max: 100, step: 5, value: settings.volume, 'data-k': 'vol', 'aria-label': 'Volume',
    onchange: (e) => act('setRoomSettings', { volume: e.target.value }),
  });
  const cards = [...[].concat(game?.settings ?? []).filter(Boolean)];
  cards.push(card(eyebrow('Sound on the TV'),
    toggle({ label: 'Sound effects', sub: 'Buzzers, right and wrong answers, countdown ticks', checked: settings.sound, onchange: (on) => act('setRoomSettings', { sound: on }) }),
    h('label', { class: 'field' }, h('span', {}, `Volume ${settings.volume}%`), vol),
    button({ label: 'Play a test sound on the TV', icon: 'volume', onclick: () => act('testSound') })));
  cards.push(card(eyebrow('Questions'), h('p', { class: 'dim' }, 'Write your own boards, or edit the ones that came with the game.'),
    h('a', { class: 'b b-block', href: `/editor${room.gameId ? `?game=${room.gameId}` : ''}`, style: { textDecoration: 'none' } }, icon('edit', 20), h('span', {}, 'Open the question editor'))));
  if (lobby && room.games.length > 1) cards.push(card(eyebrow('Game'), gamePicker()));
  const danger = [].concat(game?.danger ?? []).filter(Boolean);
  if (lobby && room.players.length) {
    danger.push(button({ label: 'Remove all players', icon: 'trash', kind: 'bad', block: true, onclick: () => confirmSheet({ title: 'Remove all players?', message: 'Everyone will need to scan the code and join again.', confirmLabel: 'Remove all', onConfirm: () => act('clearRoster') }) }));
  }
  if (danger.length) cards.push(card(eyebrow('Danger zone'), ...danger));
  return cards;
}

start();
render();

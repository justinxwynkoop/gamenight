// The phone page. It owns joining and the header (name, score), and hands the
// rest of the screen to the active game's module (/games/<id>/player.js).
import { h, money, ink, COLORS, connect, store, unitById } from './common.js';

const screen = document.getElementById('screen');
const you = document.getElementById('you');
const scoreEl = document.getElementById('score');
const teamEl = document.getElementById('team');
const offline = document.getElementById('offline');

let view = null;
let needJoin = false;
let joinError = '';
let shown = '';        // 'join' | 'waiting' | 'game'
let gameId = null;
let instance = null;
const modules = {};
const load = (id) => (modules[id] ??= import(`/games/${id}/player.js`));
const form = { name: store('gn-name') ?? '', color: store('gn-color') ?? '' };

const net = connect({
  hello: () => ({ t: 'hello', role: 'player', token: store('gn-token') }),
  onStatus: (up) => offline.classList.toggle('hidden', up),
  onState: (v) => { view = v; if (v.room.me) needJoin = false; update(); },
  onMessage: (m) => {
    if (m.t === 'need-join') { needJoin = true; update(); }
    else if (m.t === 'joined') { store('gn-token', m.token); needJoin = false; joinError = ''; }
    else if (m.t === 'error') { if (needJoin) { joinError = m.message; update(true); } else flash(m.message); }
    else instance?.onMessage?.(m);
  },
});

function flash(text) {
  const t = h('div', { class: 'toast' }, text);
  document.body.append(t);
  setTimeout(() => t.remove(), 2500);
}

function joinScreen() {
  const teams = view.room.mode === 'teams';
  const nameIn = h('input', { value: form.name, maxLength: 20, placeholder: 'Your name', autocomplete: 'off', oninput: (e) => { form.name = e.target.value; } });
  const colorBtns = COLORS.map((c) => h('button', {
    type: 'button', class: form.color === c ? 'sel' : '', style: { background: c }, 'aria-label': c,
    onclick: () => { form.color = c; update(true); },
  }));
  return h('div', { class: 'card' },
    h('h2', {}, view.game?.lobbyTitle ?? 'Join the game'),
    h('label', {}, 'Name'), nameIn,
    !teams && [h('label', {}, 'Colour'), h('div', { class: 'colors' }, colorBtns)],
    teams && h('p', { class: 'tag' }, 'You’ll be put on a team. Your team’s colour lights up on this screen.'),
    joinError && h('div', { class: 'err' }, joinError),
    h('button', {
      class: 'btn primary', style: { width: '100%', marginTop: '16px' }, onclick: () => {
        store('gn-name', form.name); if (form.color) store('gn-color', form.color);
        joinError = '';
        net.send({ t: 'join', name: form.name, color: form.color || undefined });
      },
    }, 'Join'));
}

function updateHeader() {
  const me = view.room.me;
  const mine = unitById(view.room, me.unitId);
  you.replaceChildren(h('span', { class: 'swatch', style: { background: mine?.color ?? me.color } }), ' ', me.name);
  if (view.room.mode === 'teams' && mine) you.append(h('span', { class: 'tag' }, ` · ${mine.name}`));
  scoreEl.textContent = mine ? money(mine.score) : '';
  showTeam(view.room.mode === 'teams' ? mine : null);
}

/** In team play the whole screen takes on your team's colour: a frame round the edge and a banner under the header. */
function showTeam(team) {
  if (!team) {
    teamEl.className = 'team-banner hidden';
    document.body.style.removeProperty('--team');
    return;
  }
  teamEl.className = 'team-banner';
  teamEl.style.background = team.color;
  teamEl.style.color = ink(team.color);
  teamEl.replaceChildren(h('strong', {}, `${team.name.toUpperCase()} TEAM`),
    team.memberNames?.length ? h('span', {}, team.memberNames.join(' · ')) : null);
  document.body.style.setProperty('--team', team.color);
}

function dropGame() { instance?.destroy?.(); instance = null; gameId = null; }

async function showGame(id) {
  if (gameId === id && instance) { instance.update(view); return; }
  if (gameId === id) return; // still loading
  dropGame();
  gameId = id;
  const mod = await load(id);
  if (gameId !== id) return; // the host switched games while this one loaded
  const box = h('div', { style: { display: 'contents' } });
  screen.replaceChildren(box);
  instance = mod.mount(box, { send: net.send, flash });
  instance.update(view);
}

function update(force = false) {
  if (!view) return;
  if (needJoin || !view.room.me) {
    if (shown !== 'join' || force) { shown = 'join'; dropGame(); screen.replaceChildren(joinScreen()); }
    you.textContent = 'Game Night'; scoreEl.textContent = '';
    showTeam(null);
    return;
  }
  if (shown === 'join') { shown = ''; screen.replaceChildren(); }
  updateHeader();
  if (!view.game) {
    if (shown !== 'waiting') { shown = 'waiting'; dropGame(); screen.replaceChildren(h('div', { class: 'card' }, h('h2', {}, 'You’re in!'), h('p', {}, 'Waiting for the host to pick a game.'))); }
    return;
  }
  shown = 'game';
  showGame(view.game.game).catch((e) => { console.error(e); flash('Could not load this game'); });
}
